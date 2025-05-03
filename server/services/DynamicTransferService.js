const logger = require("./logger");
const ConnectionManager = require("./ConnectionManager");
const { SqlService } = require("./SqlService");
const TransferMapping = require("../models/transferMappingModel");
const TaskExecution = require("../models/taskExecutionModel");
const TaskTracker = require("./TaskTracker");
const TransferTask = require("../models/transferTaks");
const ConsecutiveService = require("./ConsecutiveService");
const mongoose = require("mongoose");

class DynamicTransferService {
  /**
   * Maneja errores durante la verificación de documentos
   */
  async handleVerificationError(error, invalidDocuments, results, documentId) {
    const errorEntry = {
      id: documentId,
      reason: error.message,
      type: "unknown",
      errorDetails: {
        message: error.message,
        stack: error.stack,
        code: error.code || "NO_CODE",
      },
    };

    invalidDocuments.push(errorEntry);
    results.failed++;
    results.details.push({
      documentId,
      success: false,
      error: error.message,
      errorDetails: error.stack,
    });

    if (!results.byType["unknown"]) {
      results.byType["unknown"] = { processed: 0, failed: 0 };
    }
    results.byType["unknown"].failed++;

    logger.error(
      `Error en verificación de documento ${documentId}: ${error.message}`,
      {
        documentId,
        error: error.message,
        stack: error.stack,
      }
    );
  }

  /**
   * Maneja errores durante el procesamiento
   */
  async handleProcessError(
    error,
    signal,
    executionId,
    mapping,
    startTime,
    cancelTaskId,
    mappingId
  ) {
    if (signal?.aborted) {
      logger.info("Tarea cancelada por el usuario");
      await this.cleanupCancelledTask(
        executionId,
        mapping,
        startTime,
        cancelTaskId
      );
      return {
        success: false,
        message: "Tarea cancelada por el usuario",
        executionId,
      };
    }

    logger.error(`Error al procesar documentos: ${error.message}`);
    await this.cleanupFailedTask(
      executionId,
      mapping,
      startTime,
      error,
      cancelTaskId
    );
    throw error;
  }

  async cleanupCancelledTask(executionId, mapping, startTime, cancelTaskId) {
    if (executionId) {
      await TaskExecution.findByIdAndUpdate(executionId, {
        status: "cancelled",
        executionTime: Date.now() - startTime,
        errorMessage: "Cancelada por el usuario",
      });
    }

    if (mapping?.taskId) {
      await TransferTask.findByIdAndUpdate(mapping.taskId, {
        status: "cancelled",
        progress: -1,
        lastExecutionResult: {
          success: false,
          message: "Tarea cancelada por el usuario",
        },
      });
    }

    TaskTracker.completeTask(cancelTaskId, "cancelled");
  }

  async cleanupFailedTask(
    executionId,
    mapping,
    startTime,
    error,
    cancelTaskId
  ) {
    if (executionId) {
      await TaskExecution.findByIdAndUpdate(executionId, {
        status: "failed",
        executionTime: Date.now() - startTime,
        errorMessage: error.message,
      });
    }

    if (mapping?.taskId) {
      await TransferTask.findByIdAndUpdate(mapping.taskId, {
        status: "failed",
        progress: -1,
        lastExecutionResult: {
          success: false,
          message: `Error: ${error.message}`,
          errorDetails: error.stack,
        },
      });
    }

    TaskTracker.completeTask(cancelTaskId, "failed");
  }

  /**
   * Procesa un lote de documentos
   */
  async processDocuments(documentIds, mappingId, signal = null) {
    const localAbortController = !signal ? new AbortController() : null;
    signal = signal || localAbortController.signal;
    const cancelTaskId = `dynamic_process_${mappingId}_${Date.now()}`;

    const timeoutId = setTimeout(() => {
      if (localAbortController) {
        logger.warn(`Timeout interno activado para tarea ${mappingId}`);
        localAbortController.abort();
      }
    }, 120000);

    let sourceConnection = null;
    let targetConnection = null;
    let executionId = null;
    let mapping = null;
    const startTime = Date.now();

    try {
      mapping = await TransferMapping.findById(mappingId);
      if (!mapping) {
        clearTimeout(timeoutId);
        throw new Error(`Configuración de mapeo ${mappingId} no encontrada`);
      }

      TaskTracker.registerTask(
        cancelTaskId,
        localAbortController || { abort: () => {} },
        {
          type: "dynamicProcess",
          mappingName: mapping.name,
          documentIds,
        }
      );

      const taskExecution = new TaskExecution({
        taskId: mapping.taskId,
        taskName: mapping.name,
        date: new Date(),
        status: "running",
        details: {
          documentIds,
          mappingId,
        },
      });
      await taskExecution.save();
      executionId = taskExecution._id;

      [sourceConnection, targetConnection] = await this.establishConnections(
        mapping
      );

      // Verificación y procesamiento optimizado para grandes volúmenes
      const { validDocuments, invalidDocuments, results } =
        await this.verifyDocuments(
          documentIds,
          mapping,
          sourceConnection,
          targetConnection
        );

      if (validDocuments.length > 0) {
        if (mapping.consecutiveConfig?.enabled) {
          await this.assignConsecutivesToBatch(validDocuments, mapping);
        }
        await this.processLargeBatch(validDocuments, mapping, results);
      }

      clearTimeout(timeoutId);
      const finalStatus = this.determineFinalStatus(results);

      await this.finalizeExecution(
        executionId,
        mapping,
        startTime,
        documentIds.length,
        results,
        finalStatus
      );

      TaskTracker.completeTask(cancelTaskId, finalStatus);

      return {
        success: true,
        executionId,
        status: finalStatus,
        ...results,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      return await this.handleProcessError(
        error,
        signal,
        executionId,
        mapping,
        startTime,
        cancelTaskId,
        mappingId
      );
    } finally {
      await ConnectionManager.releaseConnection(
        sourceConnection,
        targetConnection
      );
    }
  }

  /**
   * Lógica mejorada para grandes volúmenes
   */
  async processLargeBatch(validDocuments, mapping, results) {
    const BATCH_SIZE = 250; // Tamaño óptimo para transacciones
    const totalBatches = Math.ceil(validDocuments.length / BATCH_SIZE);

    for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
      const batchStart = batchNum * BATCH_SIZE;
      const batchEnd = batchStart + BATCH_SIZE;
      const batch = validDocuments.slice(batchStart, batchEnd);

      let sourceConn = null;
      let targetConn = null;
      let transaction = null;

      try {
        [sourceConn, targetConn] = await this.establishConnections(mapping);
        transaction = await SqlService.beginTransaction(targetConn);

        for (const doc of batch) {
          try {
            await this.processDocumentWithTransaction(
              doc,
              mapping,
              sourceConn,
              targetConn,
              transaction
            );
            results.processed++;
          } catch (docError) {
            results.failed++;
            results.details.push({
              documentId: doc.id,
              success: false,
              error: docError.message,
            });
            logger.error(
              `Error procesando documento ${doc.id}: ${docError.message}`
            );
          }
        }

        await SqlService.commitTransaction(transaction);
      } catch (batchError) {
        if (transaction) await SqlService.rollbackTransaction(transaction);
        logger.error(
          `Error en lote ${batchNum + 1}/${totalBatches}: ${batchError.message}`
        );
        throw batchError;
      } finally {
        await ConnectionManager.releaseConnection(sourceConn, targetConn);
      }
    }
  }

  async processDocumentWithTransaction(
    doc,
    mapping,
    sourceConn,
    targetConn,
    transaction
  ) {
    // Procesar encabezado
    const headerResult = await this.insertHeaderWithConsecutive(
      doc.id,
      mapping,
      sourceConn,
      targetConn,
      doc.consecutive,
      transaction
    );

    // Procesar detalles
    await this.insertDetailsWithConsecutive(
      doc.id,
      mapping,
      sourceConn,
      targetConn,
      doc.consecutive,
      transaction
    );

    // Marcar como procesado si está configurado
    if (mapping.markProcessedField) {
      await this.markAsProcessed(doc.id, mapping, sourceConn);
    }
  }

  /**
   * Asignación optimizada de consecutivos
   */
  async assignConsecutivesToBatch(validDocuments, mapping) {
    try {
      const segmentValue = this.getSegmentValue(mapping);
      const quantity = validDocuments.length;

      // Reservar bloque atómico de consecutivos
      const block = await ConsecutiveService.reserveConsecutiveBlock(
        "mapping",
        mapping._id,
        quantity,
        { segment: segmentValue }
      );

      // Asignar a cada documento
      validDocuments.forEach((doc, index) => {
        const value = block.startValue + index;
        doc.consecutive = {
          value,
          formatted: block.format(value),
          isCentralized: true,
          blockId: block._id,
          segment: segmentValue,
        };
      });

      logger.info(
        `Asignados ${quantity} consecutivos (${block.startValue} a ${block.endValue})`
      );
    } catch (error) {
      logger.error(`Error asignando consecutivos: ${error.message}`);
      throw new Error("No se pudieron asignar los consecutivos");
    }
  }

  /**
   * Métodos de inserción con consecutivos
   */
  async insertHeaderWithConsecutive(
    documentId,
    mapping,
    sourceConn,
    targetConn,
    consecutive,
    transaction
  ) {
    const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
    if (!mainTable) throw new Error("No se encontró tabla principal");

    const sourceData = await this.getSourceData(
      documentId,
      mainTable,
      sourceConn
    );
    const targetData = this.applyConsecutiveToFields(
      sourceData,
      mainTable.fieldMappings,
      consecutive,
      mapping.consecutiveConfig.fieldName
    );

    const query = this.buildInsertQuery(mainTable.targetTable, targetData);
    await SqlService.query(targetConn, query, targetData, transaction);
  }

  async insertDetailsWithConsecutive(
    documentId,
    mapping,
    sourceConn,
    targetConn,
    consecutive,
    transaction
  ) {
    const detailTables = mapping.tableConfigs.filter((tc) => tc.isDetailTable);

    for (const tableConfig of detailTables) {
      const details = await this.getSourceDetails(
        documentId,
        tableConfig,
        sourceConn
      );

      for (const detail of details) {
        const detailData = this.applyConsecutiveToFields(
          detail,
          tableConfig.fieldMappings,
          consecutive,
          mapping.consecutiveConfig.detailFieldName ||
            mapping.consecutiveConfig.fieldName
        );

        const query = this.buildInsertQuery(
          tableConfig.targetTable,
          detailData
        );
        await SqlService.query(targetConn, query, detailData, transaction);
      }
    }
  }

  applyConsecutiveToFields(
    sourceData,
    fieldMappings,
    consecutive,
    targetField
  ) {
    const result = {};

    fieldMappings.forEach((mapping) => {
      // Obtener valor base
      result[mapping.targetField] = mapping.sourceField
        ? sourceData[mapping.sourceField]
        : mapping.defaultValue;

      // Aplicar transformaciones
      if (mapping.valueMappings) {
        result[mapping.targetField] = this.applyValueMappings(
          result[mapping.targetField],
          mapping.valueMappings
        );
      }

      // Aplicar consecutivo si corresponde
      if (mapping.targetField === targetField) {
        result[mapping.targetField] = consecutive.formatted;
      }
    });

    return result;
  }

  /**
   * Métodos auxiliares
   */
  buildInsertQuery(tableName, data) {
    const fields = Object.keys(data).join(", ");
    const values = Object.keys(data)
      .map((k) => `@${k}`)
      .join(", ");
    return `INSERT INTO ${tableName} (${fields}) VALUES (${values})`;
  }

  async getSourceData(documentId, tableConfig, connection) {
    const query = tableConfig.customQuery
      ? tableConfig.customQuery.replace(/@documentId/g, documentId)
      : `SELECT * FROM ${tableConfig.sourceTable} WHERE ${tableConfig.primaryKey} = @documentId`;

    const result = await SqlService.query(connection, query, { documentId });
    return result.recordset[0];
  }

  async getSourceDetails(documentId, tableConfig, connection) {
    const query = tableConfig.customQuery
      ? tableConfig.customQuery.replace(/@documentId/g, documentId)
      : `SELECT * FROM ${tableConfig.sourceTable} WHERE ${tableConfig.primaryKey} = @documentId`;

    const result = await SqlService.query(connection, query, { documentId });
    return result.recordset;
  }

  getSegmentValue(mapping) {
    if (!mapping.consecutiveConfig?.segments?.enabled) return null;

    const now = new Date();
    switch (mapping.consecutiveConfig.segments.type) {
      case "year":
        return now.getFullYear().toString();
      case "month":
        return `${now.getFullYear()}${(now.getMonth() + 1)
          .toString()
          .padStart(2, "0")}`;
      default:
        return null;
    }
  }

  determineFinalStatus(results) {
    if (results.failed === 0) return "completed";
    if (results.processed === 0) return "failed";
    return "partial";
  }

  async finalizeExecution(
    executionId,
    mapping,
    startTime,
    totalDocuments,
    results,
    finalStatus
  ) {
    const executionUpdate = {
      status: finalStatus,
      executionTime: Date.now() - startTime,
      totalDocuments,
      documentsProcessed: results.processed,
      documentsFailed: results.failed,
      documentsSkipped: results.skipped,
      details: results.details,
    };

    await TaskExecution.findByIdAndUpdate(executionId, executionUpdate);

    if (mapping?.taskId) {
      await TransferTask.findByIdAndUpdate(mapping.taskId, {
        status: finalStatus === "completed" ? "success" : finalStatus,
        lastExecution: new Date(),
        lastExecutionResult: {
          success: finalStatus === "completed",
          processed: results.processed,
          failed: results.failed,
          skipped: results.skipped,
        },
      });
    }
  }

  async markAsProcessed(documentId, mapping, connection) {
    if (!mapping.markProcessedField) return false;

    const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
    if (!mainTable) return false;

    const query = `
      UPDATE ${mainTable.sourceTable} 
      SET ${mapping.markProcessedField} = @processedValue
      WHERE ${mainTable.primaryKey} = @documentId
    `;

    const result = await SqlService.query(connection, query, {
      documentId,
      processedValue: mapping.markProcessedValue || 1,
    });

    return result.rowsAffected > 0;
  }

  /**
   * Métodos existentes de verificación
   */
  async verifyDocuments(
    documentIds,
    mapping,
    sourceConnection,
    targetConnection
  ) {
    const validDocuments = [];
    const invalidDocuments = [];
    const results = {
      processed: 0,
      failed: 0,
      skipped: 0,
      byType: {},
      details: [],
      consecutivesUsed: [],
    };

    for (const documentId of documentIds) {
      try {
        const canProcess = await this.verifyDocument(
          documentId,
          mapping,
          sourceConnection,
          targetConnection
        );

        if (canProcess.valid) {
          validDocuments.push({
            id: documentId,
            data: canProcess.data,
            type: canProcess.documentType,
          });
        } else {
          invalidDocuments.push({
            id: documentId,
            reason: canProcess.reason,
            type: canProcess.documentType || "unknown",
          });
          this.updateResultsForInvalidDocument(results, canProcess, documentId);
        }
      } catch (error) {
        this.handleVerificationError(
          error,
          invalidDocuments,
          results,
          documentId
        );
      }
    }

    return { validDocuments, invalidDocuments, results };
  }

  async verifyDocument(
    documentId,
    mapping,
    sourceConnection,
    targetConnection
  ) {
    const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
    if (!mainTable) {
      return { valid: false, reason: "No hay tabla principal configurada" };
    }

    // Verificar existencia en origen
    const sourceQuery = `SELECT TOP 1 1 FROM ${mainTable.sourceTable} WHERE ${mainTable.primaryKey} = @documentId`;
    const sourceResult = await SqlService.query(sourceConnection, sourceQuery, {
      documentId,
    });

    if (!sourceResult.recordset || sourceResult.recordset.length === 0) {
      return { valid: false, reason: "Documento no encontrado en origen" };
    }

    // Verificar si ya existe en destino (si no se permite reprocesamiento)
    if (!mapping.allowReprocessing) {
      const targetQuery = `SELECT TOP 1 1 FROM ${
        mainTable.targetTable
      } WHERE ${this.getTargetPrimaryKeyField(mainTable)} = @documentId`;
      const targetResult = await SqlService.query(
        targetConnection,
        targetQuery,
        { documentId }
      );

      if (targetResult.recordset && targetResult.recordset.length > 0) {
        return mapping.skipExisting
          ? {
              valid: false,
              reason: "Documento ya existe en destino",
              skip: true,
            }
          : { valid: true, documentType: "default", updateExisting: true };
      }
    }

    return { valid: true, documentType: "default" };
  }

  getTargetPrimaryKeyField(tableConfig) {
    if (tableConfig.targetPrimaryKey) return tableConfig.targetPrimaryKey;

    const primaryKeyMapping = tableConfig.fieldMappings.find(
      (fm) => fm.sourceField === tableConfig.primaryKey
    );

    return primaryKeyMapping?.targetField || "ID";
  }

  applyValueMappings(value, mappings) {
    if (!value || !mappings) return value;
    const mapping = mappings.find((m) => m.sourceValue === value);
    return mapping ? mapping.targetValue : value;
  }
}

module.exports = new DynamicTransferService();
