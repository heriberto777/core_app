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

  /**
   * Obtiene el nombre del campo clave en la tabla destino
   * @param {Object} tableConfig - Configuración de la tabla
   * @returns {string} - Nombre del campo clave en la tabla destino
   */
  getTargetPrimaryKeyField(tableConfig) {
    // Si hay targetPrimaryKey definido, usarlo
    if (tableConfig.targetPrimaryKey) {
      return tableConfig.targetPrimaryKey;
    }

    // Buscar el fieldMapping que corresponde a la clave primaria en origen
    const primaryKeyMapping = tableConfig.fieldMappings.find(
      (fm) => fm.sourceField === tableConfig.primaryKey
    );

    // Si existe un mapeo para la clave primaria, usar targetField
    if (primaryKeyMapping) {
      return primaryKeyMapping.targetField;
    }

    // Si no se encuentra, usar targetPrimaryKey o el valor predeterminado
    return tableConfig.targetPrimaryKey || "ID";
  }

  /**
   * Obtiene la longitud máxima de una columna
   * @param {Connection} connection - Conexión a la base de datos
   * @param {string} tableName - Nombre de la tabla
   * @param {string} columnName - Nombre de la columna
   * @param {Map} cache - Cache de longitudes (opcional)
   * @returns {Promise<number>} - Longitud máxima o 0 si no hay límite/información
   */
  async getColumnMaxLength(connection, tableName, columnName, cache = null) {
    // Si se proporciona un cache, verificar si ya tenemos la información
    if (cache && cache instanceof Map) {
      const cacheKey = `${tableName}:${columnName}`;
      if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
      }
    }

    try {
      // Extraer nombre de tabla sin esquema
      const tableNameOnly = tableName.replace(/^.*\.|\[|\]/g, "");

      // Consultar metadata de la columna
      const query = `
      SELECT CHARACTER_MAXIMUM_LENGTH 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = '${tableNameOnly}' 
      AND COLUMN_NAME = '${columnName}'
    `;

      const result = await SqlService.query(connection, query);

      let maxLength = 0;
      if (result.recordset && result.recordset.length > 0) {
        maxLength = result.recordset[0].CHARACTER_MAXIMUM_LENGTH || 0;
      }

      // Guardar en cache si está disponible
      if (cache && cache instanceof Map) {
        const cacheKey = `${tableName}:${columnName}`;
        cache.set(cacheKey, maxLength);
      }

      return maxLength;
    } catch (error) {
      logger.warn(
        `Error al obtener longitud máxima para ${columnName}: ${error.message}`
      );
      return 0; // En caso de error, retornar 0 (no truncar)
    }
  }

  /**
   * Marca un documento como procesado
   * @param {string} documentId - ID del documento
   * @param {Object} mapping - Configuración de mapeo
   * @param {Object} connection - Conexión a servidor
   * @returns {Promise<boolean>} - true si se marcó correctamente
   */
  async markAsProcessed(documentId, mapping, connection) {
    if (!mapping.markProcessedField) return false;

    try {
      // Determinar la tabla principal (primera no detalle)
      const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
      if (!mainTable) return false;

      const query = `
      UPDATE ${mainTable.sourceTable} 
      SET ${mapping.markProcessedField} = @processedValue,
          PROCESSED_DATE = GETDATE()
      WHERE ${mainTable.primaryKey || "NUM_PED"} = @documentId
    `;

      const params = {
        documentId,
        processedValue: mapping.markProcessedValue,
      };

      const result = await SqlService.query(connection, query, params);
      return result.rowsAffected > 0;
    } catch (error) {
      logger.error(
        `Error al marcar documento ${documentId} como procesado: ${error.message}`
      );
      return false;
    }
  }

  /**
   * Obtiene los documentos según los filtros especificados
   * @param {Object} mapping - Configuración de mapeo
   * @param {Object} filters - Filtros para la consulta
   * @param {Object} connection - Conexión a la base de datos
   * @returns {Promise<Array>} - Documentos encontrados
   */
  async getDocuments(mapping, filters, connection) {
    try {
      // Listar tablas disponibles en la base de datos para depuración
      try {
        logger.info("Listando tablas disponibles en la base de datos...");
        const listTablesQuery = `
        SELECT TOP 50 TABLE_SCHEMA, TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        ORDER BY TABLE_SCHEMA, TABLE_NAME
      `;

        const tablesResult = await SqlService.query(
          connection,
          listTablesQuery
        );

        if (tablesResult.recordset && tablesResult.recordset.length > 0) {
          const tables = tablesResult.recordset;
          logger.info(
            `Tablas disponibles: ${tables
              .map((t) => `${t.TABLE_SCHEMA}.${t.TABLE_NAME}`)
              .join(", ")}`
          );
        } else {
          logger.warn("No se encontraron tablas en la base de datos");
        }
      } catch (listError) {
        logger.warn(`Error al listar tablas: ${listError.message}`);
      }

      // Validar que el mapeo sea válido
      if (!mapping) {
        throw new Error("La configuración de mapeo es nula o indefinida");
      }

      if (
        !mapping.tableConfigs ||
        !Array.isArray(mapping.tableConfigs) ||
        mapping.tableConfigs.length === 0
      ) {
        throw new Error(
          "La configuración de mapeo no tiene tablas configuradas"
        );
      }

      // Determinar tabla principal
      const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
      if (!mainTable) {
        throw new Error("No se encontró configuración de tabla principal");
      }

      if (!mainTable.sourceTable) {
        throw new Error(
          "La tabla principal no tiene definido el campo sourceTable"
        );
      }

      logger.info(
        `Obteniendo documentos de ${mainTable.sourceTable} en ${mapping.sourceServer}`
      );

      // Verificar si la tabla existe, manejando correctamente esquemas
      try {
        // Separar esquema y nombre de tabla
        let schema = "dbo"; // Esquema por defecto
        let tableName = mainTable.sourceTable;

        if (tableName.includes(".")) {
          const parts = tableName.split(".");
          schema = parts[0];
          tableName = parts[1];
        }

        logger.info(
          `Verificando existencia de tabla: Esquema=${schema}, Tabla=${tableName}`
        );

        const checkTableQuery = `
        SELECT COUNT(*) AS table_exists 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = '${schema}' AND TABLE_NAME = '${tableName}'
      `;

        const tableCheck = await SqlService.query(connection, checkTableQuery);

        if (
          !tableCheck.recordset ||
          tableCheck.recordset[0].table_exists === 0
        ) {
          // Si no se encuentra, intentar buscar sin distinguir mayúsculas/minúsculas
          const searchTableQuery = `
          SELECT TOP 5 TABLE_SCHEMA, TABLE_NAME 
          FROM INFORMATION_SCHEMA.TABLES 
          WHERE TABLE_NAME LIKE '%${tableName}%'
        `;

          const searchResult = await SqlService.query(
            connection,
            searchTableQuery
          );

          if (searchResult.recordset && searchResult.recordset.length > 0) {
            logger.warn(
              `Tabla '${schema}.${tableName}' no encontrada, pero se encontraron similares: ${searchResult.recordset
                .map((t) => `${t.TABLE_SCHEMA}.${t.TABLE_NAME}`)
                .join(", ")}`
            );
          }

          throw new Error(
            `La tabla '${schema}.${tableName}' no existe en el servidor ${mapping.sourceServer}`
          );
        }

        logger.info(`Tabla ${schema}.${tableName} verificada correctamente`);

        // Obtener todas las columnas de la tabla para validar los campos
        const columnsQuery = `
        SELECT COLUMN_NAME, DATA_TYPE 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = '${schema}' AND TABLE_NAME = '${tableName}'
      `;

        const columnsResult = await SqlService.query(connection, columnsQuery);

        if (!columnsResult.recordset || columnsResult.recordset.length === 0) {
          logger.warn(
            `No se pudieron obtener las columnas de ${schema}.${tableName}`
          );
          throw new Error(
            `No se pudieron obtener las columnas de la tabla ${schema}.${tableName}`
          );
        }

        const availableColumns = columnsResult.recordset.map(
          (c) => c.COLUMN_NAME
        );
        logger.info(
          `Columnas disponibles en ${schema}.${tableName}: ${availableColumns.join(
            ", "
          )}`
        );

        // Guardar el nombre completo de la tabla con esquema para usarlo en la consulta
        const fullTableName = `${schema}.${tableName}`;

        // Construir campos a seleccionar basados en la configuración, validando que existan
        let selectFields = [];

        if (mainTable.fieldMappings && mainTable.fieldMappings.length > 0) {
          for (const mapping of mainTable.fieldMappings) {
            if (mapping.sourceField) {
              // Verificar si la columna existe
              if (availableColumns.includes(mapping.sourceField)) {
                selectFields.push(mapping.sourceField);
              } else {
                logger.warn(
                  `Columna ${mapping.sourceField} no existe en ${fullTableName} y será omitida`
                );
              }
            }
          }
        }

        // Si no hay campos válidos, seleccionar todas las columnas disponibles
        if (selectFields.length === 0) {
          logger.warn(
            `No se encontraron campos válidos para seleccionar, se usarán todas las columnas`
          );
          selectFields = availableColumns;
        }

        const selectFieldsStr = selectFields.join(", ");
        logger.debug(`Campos a seleccionar: ${selectFieldsStr}`);

        // Construir consulta basada en filtros, usando el nombre completo de la tabla
        let query = `
        SELECT ${selectFieldsStr}
        FROM ${fullTableName}
        WHERE 1=1
      `;

        const params = {};

        // Verificar si los campos utilizados en filtros existen
        let dateFieldExists = false;
        let dateField = filters.dateField || "FEC_PED";
        if (availableColumns.includes(dateField)) {
          dateFieldExists = true;
        } else {
          // Buscar campos de fecha alternativos
          const possibleDateFields = [
            "FECHA",
            "DATE",
            "CREATED_DATE",
            "FECHA_CREACION",
            "FECHA_PEDIDO",
          ];
          for (const field of possibleDateFields) {
            if (availableColumns.includes(field)) {
              dateField = field;
              dateFieldExists = true;
              logger.info(
                `Campo de fecha '${
                  filters.dateField || "FEC_PED"
                }' no encontrado, usando '${dateField}' en su lugar`
              );
              break;
            }
          }
        }

        // Aplicar filtros solo si los campos existen
        if (filters.dateFrom && dateFieldExists) {
          query += ` AND ${dateField} >= @dateFrom`;
          params.dateFrom = new Date(filters.dateFrom);
        } else if (filters.dateFrom) {
          logger.warn(
            `No se aplicará filtro de fecha inicial porque no existe un campo de fecha válido`
          );
        }

        if (filters.dateTo && dateFieldExists) {
          query += ` AND ${dateField} <= @dateTo`;
          params.dateTo = new Date(filters.dateTo);
        } else if (filters.dateTo) {
          logger.warn(
            `No se aplicará filtro de fecha final porque no existe un campo de fecha válido`
          );
        }

        // Verificar campo de estado
        if (filters.status && filters.status !== "all") {
          const statusField = filters.statusField || "ESTADO";
          if (availableColumns.includes(statusField)) {
            query += ` AND ${statusField} = @status`;
            params.status = filters.status;
          } else {
            logger.warn(
              `Campo de estado '${statusField}' no existe, filtro de estado no aplicado`
            );
          }
        }

        // Verificar campo de bodega
        if (filters.warehouse && filters.warehouse !== "all") {
          const warehouseField = filters.warehouseField || "COD_BOD";
          if (availableColumns.includes(warehouseField)) {
            query += ` AND ${warehouseField} = @warehouse`;
            params.warehouse = filters.warehouse;
          } else {
            logger.warn(
              `Campo de bodega '${warehouseField}' no existe, filtro de bodega no aplicado`
            );
          }
        }

        // Filtrar documentos procesados solo si el campo existe
        if (!filters.showProcessed && mapping.markProcessedField) {
          if (availableColumns.includes(mapping.markProcessedField)) {
            query += ` AND (${mapping.markProcessedField} IS NULL)`;
          } else {
            logger.warn(
              `Campo de procesado '${mapping.markProcessedField}' no existe, filtro de procesado no aplicado`
            );
          }
        }

        // Aplicar condición adicional si existe
        if (mainTable.filterCondition) {
          // Verificar primero si la condición contiene campos válidos
          // (Esto es más complejo, simplemente advertimos)
          logger.warn(
            `Aplicando condición adicional: ${mainTable.filterCondition} (no se validó si los campos existen)`
          );
          query += ` AND ${mainTable.filterCondition}`;
        }

        // Ordenar por fecha descendente si existe el campo
        if (dateFieldExists) {
          query += ` ORDER BY ${dateField} DESC`;
        } else {
          // Ordenar por la primera columna si no hay campo de fecha
          query += ` ORDER BY ${selectFields[0]} DESC`;
        }

        logger.debug(`Consulta final: ${query}`);
        logger.debug(`Parámetros: ${JSON.stringify(params)}`);

        // Ejecutar consulta con un límite de registros para no sobrecargar
        query = `SELECT TOP 500 ${query.substring(
          query.indexOf("SELECT ") + 7
        )}`;

        try {
          const result = await SqlService.query(connection, query, params);

          logger.info(
            `Documentos obtenidos: ${
              result.recordset ? result.recordset.length : 0
            }`
          );

          return result.recordset || [];
        } catch (queryError) {
          logger.error(`Error al ejecutar consulta SQL: ${queryError.message}`);
          throw new Error(
            `Error en consulta SQL (${fullTableName}): ${queryError.message}`
          );
        }
      } catch (checkError) {
        logger.error(
          `Error al verificar existencia de tabla ${mainTable.sourceTable}:`,
          checkError
        );
        throw new Error(
          `Error al verificar tabla ${mainTable.sourceTable}: ${checkError.message}`
        );
      }
    } catch (error) {
      logger.error(`Error al obtener documentos: ${error.message}`);
      throw error;
    }
  }

  /**
   * Crea una nueva configuración de mapeo
   * @param {Object} mappingData - Datos de la configuración
   * @returns {Promise<Object>} - Configuración creada
   */
  async createMapping(mappingData) {
    try {
      // Si no hay taskId, crear una tarea por defecto
      if (!mappingData.taskId) {
        // Crear tarea básica basada en la configuración del mapeo
        let defaultQuery = "SELECT 1";

        // Intentar construir una consulta basada en la primera tabla principal
        if (mappingData.tableConfigs && mappingData.tableConfigs.length > 0) {
          const mainTable = mappingData.tableConfigs.find(
            (tc) => !tc.isDetailTable
          );
          if (mainTable && mainTable.sourceTable) {
            defaultQuery = `SELECT * FROM ${mainTable.sourceTable}`;
          }
        }

        const taskData = {
          name: `Task_${mappingData.name}`,
          type: "manual",
          active: true,
          transferType: mappingData.transferType || "down",
          query: defaultQuery,
          parameters: [],
          status: "pending",
        };

        // Guardar la tarea
        const task = new TransferTask(taskData);
        await task.save();

        logger.info(`Tarea por defecto creada para mapeo: ${task._id}`);

        // Asignar el ID de la tarea al mapeo
        mappingData.taskId = task._id;
      }

      const mapping = new TransferMapping(mappingData);
      await mapping.save();
      return mapping;
    } catch (error) {
      logger.error(`Error al crear configuración de mapeo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Actualiza una configuración de mapeo existente
   * @param {string} mappingId - ID de la configuración
   * @param {Object} mappingData - Datos actualizados
   * @returns {Promise<Object>} - Configuración actualizada
   */
  async updateMapping(mappingId, mappingData) {
    try {
      // Verificar si existe el mapeo
      const existingMapping = await TransferMapping.findById(mappingId);
      if (!existingMapping) {
        throw new Error(`Configuración de mapeo ${mappingId} no encontrada`);
      }

      // Si hay cambios en las tablas y ya existe un taskId, actualizar la consulta de la tarea
      if (mappingData.tableConfigs && existingMapping.taskId) {
        try {
          const TransferTask = require("../models/transferTaks");
          const task = await TransferTask.findById(existingMapping.taskId);

          if (task) {
            // Actualizar la consulta si cambió la tabla principal
            const mainTable = mappingData.tableConfigs.find(
              (tc) => !tc.isDetailTable
            );
            if (mainTable && mainTable.sourceTable) {
              task.query = `SELECT * FROM ${mainTable.sourceTable}`;
              await task.save();
              logger.info(
                `Tarea ${task._id} actualizada automáticamente con nueva consulta`
              );
            }
          }
        } catch (taskError) {
          logger.warn(
            `Error al actualizar tarea asociada: ${taskError.message}`
          );
          // No detener la operación si falla la actualización de la tarea
        }
      }

      // Si no tiene taskId, crear uno
      if (!existingMapping.taskId && !mappingData.taskId) {
        const TransferTask = require("../models/transferTaks");

        let defaultQuery = "SELECT 1";
        if (mappingData.tableConfigs && mappingData.tableConfigs.length > 0) {
          const mainTable = mappingData.tableConfigs.find(
            (tc) => !tc.isDetailTable
          );
          if (mainTable && mainTable.sourceTable) {
            defaultQuery = `SELECT * FROM ${mainTable.sourceTable}`;
          }
        }

        const taskData = {
          name: `Task_${mappingData.name || existingMapping.name}`,
          type: "manual",
          active: true,
          transferType:
            mappingData.transferType || existingMapping.transferType || "down",
          query: defaultQuery,
          parameters: [],
          status: "pending",
        };

        const task = new TransferTask(taskData);
        await task.save();

        logger.info(
          `Tarea por defecto creada para mapeo existente: ${task._id}`
        );

        // Asignar el ID de la tarea al mapeo
        mappingData.taskId = task._id;
      }

      const mapping = await TransferMapping.findByIdAndUpdate(
        mappingId,
        mappingData,
        { new: true }
      );

      return mapping;
    } catch (error) {
      logger.error(
        `Error al actualizar configuración de mapeo: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Obtiene todas las configuraciones de mapeo
   * @returns {Promise<Array>} - Lista de configuraciones
   */
  async getMappings() {
    try {
      return await TransferMapping.find().sort({ name: 1 });
    } catch (error) {
      logger.error(
        `Error al obtener configuraciones de mapeo: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Obtiene una configuración de mapeo por ID
   * @param {string} mappingId - ID de la configuración
   * @returns {Promise<Object>} - Configuración de mapeo
   */
  async getMappingById(mappingId) {
    try {
      const mapping = await TransferMapping.findById(mappingId);

      if (!mapping) {
        throw new Error(`Configuración de mapeo ${mappingId} no encontrada`);
      }

      return mapping;
    } catch (error) {
      logger.error(`Error al obtener configuración de mapeo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Elimina una configuración de mapeo
   * @param {string} mappingId - ID de la configuración
   * @returns {Promise<boolean>} - true si se eliminó correctamente
   */
  async deleteMapping(mappingId) {
    try {
      const result = await TransferMapping.findByIdAndDelete(mappingId);
      return !!result;
    } catch (error) {
      logger.error(
        `Error al eliminar configuración de mapeo: ${error.message}`
      );
      throw error;
    }
  }

  async establishConnections(mapping) {
    logger.info(
      `Estableciendo conexiones a ${mapping.sourceServer} y ${mapping.targetServer}...`
    );

    try {
      const connections = await Promise.all([
        this.getConnectionWithRetry(mapping.sourceServer),
        this.getConnectionWithRetry(mapping.targetServer),
      ]);

      logger.info("Conexiones establecidas exitosamente");
      return connections;
    } catch (error) {
      logger.error("Error estableciendo conexiones:", error);
      throw new Error(`No se pudo establecer conexiones: ${error.message}`);
    }
  }
}

module.exports = new DynamicTransferService();
