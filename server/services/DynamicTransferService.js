const logger = require("./logger");
const ConnectionService = require("./ConnectionCentralService");
const { SqlService } = require("./SqlService");
const TransferMapping = require("../models/transferMappingModel");
const TaskExecution = require("../models/taskExecutionModel");
const TaskTracker = require("./TaskTracker");
const TransferTask = require("../models/transferTaks");
const ConsecutiveService = require("./ConsecutiveService");
const BonificationProcessor = require("./BonificationService");

class DynamicTransferService {
  /**
   * Crear procesador de bonificaciones bajo demanda
   */
  createBonificationProcessor(mapping) {
    if (!mapping.bonificationProcessor?.enabled) {
      return new BonificationProcessor({ enabled: false });
    }
    return new BonificationProcessor(mapping.bonificationProcessor);
  }

  /**
   * Procesa bonificaciones usando el nuevo sistema
   */
  async processBonifications(sourceData, mapping) {
    // Solo usar el nuevo sistema de bonificaciones
    if (!mapping.bonificationProcessor?.enabled) {
      return sourceData; // Sin procesamiento especial
    }

    logger.info(`🎯 Procesando bonificaciones con nuevo algoritmo`);

    const bonificationProcessor = this.createBonificationProcessor(mapping);
    const result = await bonificationProcessor.processData(sourceData);

    if (result.meta?.hasErrors) {
      logger.warn(
        `⚠️ Procesamiento con errores en grupos: ${result.meta.errorGroups?.join(
          ", "
        )}`
      );
    }

    return result.data;
  }

  /**
   * Obtener datos con el nuevo procesador de bonificaciones
   */
  async getSourceDataWithNewProcessor(documentIds, mapping, connection) {
    try {
      logger.info(`🎯 Obteniendo datos para procesamiento con nuevo algoritmo`);

      const sourceData = await this.getSourceDataNormal(
        documentIds,
        mapping,
        connection
      );
      if (sourceData.length === 0) return [];

      const bonificationProcessor = this.createBonificationProcessor(mapping);
      const result = await bonificationProcessor.processData(sourceData);

      if (result.meta?.hasErrors) {
        logger.warn(
          `⚠️ Procesamiento con errores en grupos: ${result.meta.errorGroups?.join(
            ", "
          )}`
        );
      }

      logger.info(
        `✅ Nuevo procesador completado: ${result.data.length} registros procesados`
      );
      return result.data;
    } catch (error) {
      logger.error(
        `Error en nuevo procesador de bonificaciones: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Obtener datos sin procesamiento de bonificaciones (método base)
   */
  async getSourceDataNormal(documentIds, mapping, connection) {
    let sourceTable = "FAC_ENC_PED";
    let orderField = "NUM_PED";
    let lineField = "NUM_LN";

    const mainTableConfig = mapping.tableConfigs?.find(
      (tc) => !tc.isDetailTable
    );
    if (mainTableConfig?.sourceTable) {
      sourceTable = mainTableConfig.sourceTable;
    }

    // Si hay procesador de bonificaciones nuevo, usar su configuración
    if (mapping.bonificationProcessor?.enabled) {
      sourceTable = mapping.bonificationProcessor.detailTable;
      orderField = mapping.bonificationProcessor.groupByField;
      lineField = mapping.bonificationProcessor.lineNumberField;
    }

    const placeholders = documentIds
      .map((_, index) => `@doc${index}`)
      .join(", ");
    const params = {};
    documentIds.forEach((id, index) => {
      params[`doc${index}`] = id;
    });

    const query = `
      SELECT * FROM ${sourceTable}
      WHERE ${orderField} IN (${placeholders})
      ORDER BY ${orderField}, ${lineField}
    `;

    const result = await SqlService.query(connection, query, params);
    logger.info(`📥 Obtenidos ${result.recordset?.length || 0} registros base`);

    return result.recordset || [];
  }

  /**
   * Verificar si tabla es compatible con bonificaciones
   */
  isTableCompatibleWithBonifications(tableConfig, mapping) {
    if (!mapping.bonificationProcessor?.enabled) return false;
    return (
      tableConfig.sourceTable === mapping.bonificationProcessor.detailTable
    );
  }

  /**
   * Procesa documentos según una configuración de mapeo
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
    }, 120000); // 2 minutos

    let sourceConnection = null;
    let targetConnection = null;
    let executionId = null;
    let mapping = null;
    const startTime = Date.now();

    let useCentralizedConsecutives = false;
    let centralizedConsecutiveId = null;

    try {
      // 1. Cargar configuración de mapeo
      mapping = await TransferMapping.findById(mappingId);
      if (!mapping) {
        clearTimeout(timeoutId);
        throw new Error(`Configuración de mapeo ${mappingId} no encontrada`);
      }

      // Validar configuración del nuevo procesador de bonificaciones
      if (mapping.bonificationProcessor?.enabled) {
        const bonificationProcessor = this.createBonificationProcessor(mapping);
        logger.info(
          `✅ Nuevo procesador de bonificaciones habilitado para mapping: ${mapping.name}`
        );
      }

      // Asegurar configuración por defecto para mappings existentes
      if (!mapping.markProcessedStrategy) {
        mapping.markProcessedStrategy = "individual";
      }

      if (!mapping.markProcessedConfig) {
        mapping.markProcessedConfig = {
          batchSize: 100,
          includeTimestamp: true,
          timestampField: "LAST_PROCESSED_DATE",
          allowRollback: false,
        };
      }

      // 2. Verificar si se debe usar consecutivos centralizados
      if (mapping.consecutiveConfig && mapping.consecutiveConfig.enabled) {
        try {
          const assignedConsecutives =
            await ConsecutiveService.getConsecutivesByEntity(
              "mapping",
              mappingId
            );

          if (assignedConsecutives && assignedConsecutives.length > 0) {
            useCentralizedConsecutives = true;
            centralizedConsecutiveId = assignedConsecutives[0]._id;
            logger.info(
              `Se usará consecutivo centralizado para mapeo ${mappingId}: ${centralizedConsecutiveId}`
            );
          } else {
            logger.info(
              `No se encontraron consecutivos centralizados asignados a ${mappingId}. Se usará el sistema local.`
            );
          }
        } catch (consecError) {
          logger.warn(
            `Error al verificar consecutivos centralizados: ${consecError.message}. Usando sistema local.`
          );
        }
      }

      // 3. Establecer conexiones
      const sourceConnectionResult =
        await ConnectionService.enhancedRobustConnect(mapping.sourceServer);
      if (!sourceConnectionResult.success) {
        throw new Error(
          `Error al conectar al servidor origen: ${sourceConnectionResult.error?.message}`
        );
      }
      sourceConnection = sourceConnectionResult.connection;

      const targetConnectionResult =
        await ConnectionService.enhancedRobustConnect(mapping.targetServer);
      if (!targetConnectionResult.success) {
        throw new Error(
          `Error al conectar al servidor destino: ${targetConnectionResult.error?.message}`
        );
      }
      targetConnection = targetConnectionResult.connection;

      // 4. Crear ejecución en TaskTracker
      executionId = await TaskTracker.createExecution({
        type: "dynamic_transfer",
        totalDocuments: documentIds.length,
        mappingId: mappingId,
        mappingName: mapping.name,
        details: {
          sourceServer: mapping.sourceServer,
          targetServer: mapping.targetServer,
          documentIds: documentIds.slice(0, 5), // Solo los primeros 5 para evitar logs muy largos
        },
      });

      logger.info(
        `Iniciando procesamiento dinámico de ${documentIds.length} documentos`
      );

      const results = {
        processed: 0,
        failed: 0,
        errors: [],
        details: [],
        byType: {},
      };

      const successfulDocuments = [];
      const failedDocuments = [];

      // 5. Obtener datos de origen con bonificaciones si está habilitado
      let sourceData = null;
      if (mapping.bonificationProcessor?.enabled) {
        try {
          sourceData = await this.getSourceDataWithNewProcessor(
            documentIds,
            mapping,
            sourceConnection
          );
          logger.info(
            `🎯 Datos procesados con bonificaciones: ${sourceData.length} registros`
          );
        } catch (bonificationError) {
          logger.error(
            `Error en procesamiento de bonificaciones: ${bonificationError.message}`
          );
          throw new Error(
            `Error en bonificaciones: ${bonificationError.message}`
          );
        }
      }

      // 6. Procesar cada documento
      for (const documentId of documentIds) {
        if (signal.aborted) {
          logger.warn(`Procesamiento cancelado para documento ${documentId}`);
          break;
        }

        let currentConsecutive = null;

        try {
          // Generar consecutivo si es necesario
          if (mapping.consecutiveConfig && mapping.consecutiveConfig.enabled) {
            if (useCentralizedConsecutives) {
              const reservation = await ConsecutiveService.reserveConsecutive(
                centralizedConsecutiveId
              );
              currentConsecutive = {
                value: reservation.value.numeric,
                formatted: reservation.value.formatted,
                reservationId: reservation.reservationId,
              };
              logger.debug(
                `Consecutivo centralizado reservado: ${currentConsecutive.formatted}`
              );
            } else {
              currentConsecutive = await this.generateNextConsecutive(mapping);
              logger.debug(
                `Consecutivo local generado: ${currentConsecutive.formatted}`
              );
            }
          }

          // Usar datos ya procesados si están disponibles (bonificaciones)
          if (sourceData && mapping.bonificationProcessor?.enabled) {
            sourceData = await this.processBonifications(sourceData, mapping);
            logger.info(
              `🎯 Bonificaciones procesadas: ${sourceData.length} registros finales`
            );
          }

          // Procesar documento
          const docResult = await this.processSingleDocumentSimple(
            documentId,
            mapping,
            sourceConnection,
            targetConnection,
            currentConsecutive,
            sourceData
          );

          // Confirmar o cancelar reserva de consecutivo centralizado
          if (useCentralizedConsecutives && currentConsecutive?.reservationId) {
            if (docResult.success) {
              await ConsecutiveService.commitReservation(
                centralizedConsecutiveId,
                currentConsecutive.reservationId,
                [
                  {
                    numeric: currentConsecutive.value,
                    formatted: currentConsecutive.formatted,
                  },
                ]
              );
              logger.info(
                `Reserva confirmada para documento ${documentId}: ${currentConsecutive.formatted}`
              );
            } else {
              await ConsecutiveService.cancelReservation(
                centralizedConsecutiveId,
                currentConsecutive.reservationId
              );
              logger.info(
                `Reserva cancelada para documento fallido ${documentId}: ${currentConsecutive.formatted}`
              );
            }
          }

          // Recopilar documentos exitosos y fallidos
          if (docResult.success) {
            successfulDocuments.push(documentId);
            results.processed++;

            if (!results.byType[docResult.documentType]) {
              results.byType[docResult.documentType] = {
                count: 0,
                documents: [],
              };
            }
            results.byType[docResult.documentType].count++;
            results.byType[docResult.documentType].documents.push(documentId);

            logger.info(
              `✅ Documento ${documentId} procesado exitosamente (${docResult.documentType})`
            );
          } else {
            failedDocuments.push({
              documentId,
              error: docResult.message || "Error desconocido",
              details: docResult.errorDetails,
            });
            results.failed++;
            results.errors.push({
              documentId,
              error: docResult.message || "Error desconocido",
            });
            logger.error(
              `❌ Error procesando documento ${documentId}: ${docResult.message}`
            );
          }

          results.details.push({
            documentId,
            success: docResult.success,
            message: docResult.message,
            documentType: docResult.documentType,
            consecutiveUsed: docResult.consecutiveUsed,
            errorDetails: docResult.errorDetails,
          });

          // Actualizar progreso en TaskTracker
          await TaskTracker.updateProgress(executionId, {
            processed: results.processed,
            failed: results.failed,
            currentDocument: documentId,
          });
        } catch (docError) {
          logger.error(
            `Error crítico procesando documento ${documentId}: ${docError.message}`
          );

          // Cancelar reserva si hay error crítico
          if (useCentralizedConsecutives && currentConsecutive?.reservationId) {
            try {
              await ConsecutiveService.cancelReservation(
                centralizedConsecutiveId,
                currentConsecutive.reservationId
              );
            } catch (cancelError) {
              logger.error(`Error cancelando reserva: ${cancelError.message}`);
            }
          }

          failedDocuments.push({
            documentId,
            error: docError.message || "Error crítico",
            details: docError.stack,
          });
          results.failed++;
          results.errors.push({
            documentId,
            error: docError.message || "Error crítico",
          });
          results.details.push({
            documentId,
            success: false,
            message: docError.message || "Error crítico",
            documentType: "unknown",
            consecutiveUsed: null,
            errorDetails: docError.stack,
          });
        }
      }

      // 7. Marcar documentos como procesados
      if (successfulDocuments.length > 0 && mapping.markProcessedField) {
        try {
          const markResult = await this.markDocumentsAsProcessed(
            successfulDocuments,
            mapping,
            sourceConnection,
            true
          );
          logger.info(
            `Marcado como procesados: ${markResult.success} documentos, fallos: ${markResult.failed}`
          );
        } catch (markError) {
          logger.error(
            `Error al marcar documentos como procesados: ${markError.message}`
          );
        }
      }

      // 8. Finalizar ejecución
      const endTime = Date.now();
      const duration = endTime - startTime;

      await TaskTracker.completeExecution(executionId, {
        status: results.failed > 0 ? "completed_with_errors" : "completed",
        processed: results.processed,
        failed: results.failed,
        duration: duration,
        details: {
          byType: results.byType,
          errors: results.errors.slice(0, 10), // Limitar errores en logs
        },
      });

      clearTimeout(timeoutId);

      logger.info(
        `Procesamiento completado: ${results.processed} éxitos, ${results.failed} fallos en ${duration}ms`
      );

      return {
        success: true,
        processed: results.processed,
        failed: results.failed,
        errors: results.errors,
        details: results.details,
        byType: results.byType,
        duration: duration,
        executionId: executionId,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (executionId) {
        await TaskTracker.completeExecution(executionId, {
          status: "failed",
          processed: 0,
          failed: documentIds.length,
          duration: Date.now() - startTime,
          error: error.message,
        });
      }

      logger.error(`Error general en procesamiento dinámico: ${error.message}`);
      throw error;
    } finally {
      // Liberar conexiones
      if (sourceConnection) {
        await ConnectionService.releaseConnection(sourceConnection);
      }
      if (targetConnection) {
        await ConnectionService.releaseConnection(targetConnection);
      }
    }
  }

  /**
   * Procesa un único documento según la configuración
   */
  async processSingleDocumentSimple(
    documentId,
    mapping,
    sourceConnection,
    targetConnection,
    currentConsecutive = null,
    sourceData = null
  ) {
    let processedTables = [];
    let documentType = "unknown";

    try {
      logger.info(
        `Procesando documento ${documentId} (modo sin transacciones)`
      );

      const columnLengthCache = new Map();

      // 1. Identificar las tablas principales
      const mainTables = mapping.tableConfigs.filter((tc) => !tc.isDetailTable);

      if (mainTables.length === 0) {
        return {
          success: false,
          message: "No se encontraron configuraciones de tablas principales",
          documentType,
          consecutiveUsed: null,
          consecutiveValue: null,
        };
      }

      const orderedMainTables = [...mainTables].sort(
        (a, b) => (a.executionOrder || 0) - (b.executionOrder || 0)
      );

      logger.info(
        `Procesando ${
          orderedMainTables.length
        } tablas principales en orden: ${orderedMainTables
          .map((t) => t.name)
          .join(" -> ")}`
      );

      // 2. Procesar cada tabla principal
      for (const tableConfig of orderedMainTables) {
        let tableSourceData;

        // Verificar si usar datos procesados de bonificaciones
        if (
          sourceData &&
          mapping.bonificationProcessor?.enabled &&
          this.isTableCompatibleWithBonifications(tableConfig, mapping)
        ) {
          const orderField =
            mapping.bonificationProcessor.groupByField || "NUM_PED";
          tableSourceData = sourceData.find(
            (record) =>
              record.NUM_PED == documentId || record[orderField] == documentId
          );

          logger.info(
            `🎁 Usando datos procesados de bonificaciones para documento ${documentId}`
          );
        } else {
          // Obtener datos normalmente
          try {
            tableSourceData = await this.getSourceData(
              documentId,
              tableConfig,
              sourceConnection
            );

            if (!tableSourceData) {
              logger.warn(
                `No se encontraron datos en ${tableConfig.sourceTable} para documento ${documentId}`
              );
              continue;
            }

            logger.debug(
              `Datos de origen obtenidos: ${JSON.stringify(tableSourceData)}`
            );
          } catch (error) {
            logger.error(
              `Error al obtener datos de origen para documento ${documentId}: ${error.message}`
            );
            throw new Error(
              `Error al obtener datos de origen: ${error.message}`
            );
          }
        }

        // Procesar dependencias de foreign key
        try {
          if (mapping.foreignKeyDependencies?.length > 0) {
            logger.info(
              `Verificando ${mapping.foreignKeyDependencies.length} dependencias de foreign key para documento ${documentId}`
            );
            await this.processForeignKeyDependencies(
              documentId,
              mapping,
              sourceConnection,
              targetConnection,
              tableSourceData
            );
            logger.info(
              `Dependencias de foreign key procesadas exitosamente para documento ${documentId}`
            );
          }
        } catch (depError) {
          logger.error(
            `Error en dependencias de foreign key para documento ${documentId}: ${depError.message}`
          );
          throw new Error(`Error en dependencias: ${depError.message}`);
        }

        // 3. Determinar el tipo de documento
        documentType = this.determineDocumentType(
          mapping.documentTypeRules,
          tableSourceData
        );
        if (documentType !== "unknown") {
          logger.info(`Tipo de documento determinado: ${documentType}`);
        }

        // 4. Verificar si el documento ya existe en destino
        const targetPrimaryKey = this.getTargetPrimaryKeyField(tableConfig);
        const exists = await this.checkDocumentExists(
          documentId,
          tableConfig.targetTable,
          targetPrimaryKey,
          targetConnection
        );

        if (exists) {
          logger.warn(
            `Documento ${documentId} ya existe en tabla ${tableConfig.targetTable}`
          );
          return {
            success: false,
            message: `El documento ya existe en la tabla ${tableConfig.targetTable}`,
            documentType,
            consecutiveUsed: null,
            consecutiveValue: null,
          };
        }

        // 5. Procesar tabla principal
        await this.processTable(
          tableConfig,
          tableSourceData,
          null,
          targetConnection,
          currentConsecutive,
          mapping,
          documentId,
          columnLengthCache,
          false
        );

        logger.info(`✅ INSERCIÓN EXITOSA en ${tableConfig.targetTable}`);
        processedTables.push(tableConfig.name);

        // 6. Procesar tablas de detalle relacionadas
        const detailTables = mapping.tableConfigs.filter(
          (tc) => tc.isDetailTable && tc.parentTableRef === tableConfig.name
        );

        if (detailTables.length > 0) {
          await this.processDetailTables(
            detailTables,
            documentId,
            tableSourceData,
            tableConfig,
            sourceConnection,
            targetConnection,
            currentConsecutive,
            mapping,
            columnLengthCache,
            processedTables
          );
        }
      }

      if (processedTables.length === 0) {
        return {
          success: false,
          message: "No se procesó ninguna tabla para este documento",
          documentType,
          consecutiveUsed: null,
          consecutiveValue: null,
        };
      }

      return {
        success: true,
        message: `Documento procesado correctamente en ${processedTables.join(
          ", "
        )}`,
        documentType,
        processedTables,
        consecutiveUsed: currentConsecutive
          ? currentConsecutive.formatted
          : null,
        consecutiveValue: currentConsecutive ? currentConsecutive.value : null,
      };
    } catch (error) {
      return this.handleProcessingError(
        error,
        documentId,
        currentConsecutive,
        mapping
      );
    }
  }

  /**
   * Obtiene datos de la tabla de origen
   */
  async getSourceData(documentId, tableConfig, sourceConnection) {
    if (tableConfig.customQuery) {
      const query = tableConfig.customQuery.replace(/@documentId/g, documentId);
      logger.debug(`Ejecutando consulta personalizada: ${query}`);
      const result = await SqlService.query(sourceConnection, query);
      return result.recordset[0];
    } else {
      const requiredFields = this.getRequiredFieldsFromTableConfig(tableConfig);
      const tableAlias = "t1";

      const finalSelectFields = requiredFields
        .map((field) => `${tableAlias}.${field}`)
        .join(", ");

      const primaryKey = tableConfig.primaryKey || "NUM_PED";

      const query = `
        SELECT ${finalSelectFields} FROM ${
        tableConfig.sourceTable
      } ${tableAlias}
        WHERE ${tableAlias}.${primaryKey} = @documentId
        ${
          tableConfig.filterCondition
            ? ` AND ${this.processFilterCondition(
                tableConfig.filterCondition,
                tableAlias
              )}`
            : ""
        }
      `;

      logger.debug(`Ejecutando consulta principal: ${query}`);
      const result = await SqlService.query(sourceConnection, query, {
        documentId,
      });

      return result.recordset[0];
    }
  }

  /**
   * Método auxiliar para recopilar todos los campos necesarios de una configuración de tabla
   */
  getRequiredFieldsFromTableConfig(tableConfig) {
    const requiredFields = new Set();

    if (tableConfig.fieldMappings?.length > 0) {
      tableConfig.fieldMappings.forEach((fm) => {
        // Campo de origen mapeado
        if (fm.sourceField) {
          requiredFields.add(fm.sourceField);
        }

        // Campos para conversión de unidades
        if (fm.unitConversion?.enabled) {
          if (fm.unitConversion.unitMeasureField) {
            requiredFields.add(fm.unitConversion.unitMeasureField);
          }
          if (fm.unitConversion.conversionFactorField) {
            requiredFields.add(fm.unitConversion.conversionFactorField);
          }
        }

        // Campos para lookup
        if (fm.lookupFromTarget && fm.lookupParams) {
          fm.lookupParams.forEach((param) => {
            if (param.sourceField) {
              requiredFields.add(param.sourceField);
            }
          });
        }
      });
    }

    // Agregar clave primaria
    const primaryKey = tableConfig.primaryKey || "NUM_PED";
    requiredFields.add(primaryKey);

    return Array.from(requiredFields);
  }

  /**
   * Procesa condición de filtro agregando alias de tabla
   */
  processFilterCondition(filterCondition, tableAlias) {
    return filterCondition.replace(/\b(\w+)\b/g, (m, field) => {
      if (
        !field.includes(".") &&
        !field.match(/^[\d.]+$/) &&
        ![
          "AND",
          "OR",
          "NULL",
          "IS",
          "NOT",
          "IN",
          "LIKE",
          "BETWEEN",
          "TRUE",
          "FALSE",
        ].includes(field.toUpperCase())
      ) {
        return `${tableAlias}.${field}`;
      }
      return m;
    });
  }

  /**
   * Determina el tipo de documento basado en las reglas
   */
  determineDocumentType(documentTypeRules, sourceData) {
    for (const rule of documentTypeRules) {
      const fieldValue = sourceData[rule.sourceField];
      if (rule.sourceValues.includes(fieldValue)) {
        return rule.name;
      }
    }
    return "unknown";
  }

  /**
   * Verifica si el documento ya existe en destino
   */
  async checkDocumentExists(
    documentId,
    targetTable,
    targetPrimaryKey,
    targetConnection
  ) {
    const checkQuery = `SELECT TOP 1 1 FROM ${targetTable} WHERE ${targetPrimaryKey} = @documentId`;
    logger.debug(`Verificando existencia en destino: ${checkQuery}`);
    const checkResult = await SqlService.query(targetConnection, checkQuery, {
      documentId,
    });
    return checkResult.recordset?.length > 0;
  }

  /**
   * Procesa una tabla (principal o detalle) - MÉTODO UNIFICADO
   */
  async processTable(
    tableConfig,
    sourceData,
    detailRow,
    targetConnection,
    currentConsecutive,
    mapping,
    documentId,
    columnLengthCache,
    isDetailTable = false
  ) {
    const targetData = {};
    const targetFields = [];
    const targetValues = [];
    const directSqlFields = new Set();

    // Para detalles, combinar datos del encabezado y detalle
    const dataForProcessing = isDetailTable
      ? { ...sourceData, ...detailRow }
      : sourceData;

    // Realizar consulta de lookup si es necesario
    let lookupResults = {};
    if (tableConfig.fieldMappings.some((fm) => fm.lookupFromTarget)) {
      logger.info(
        `Realizando lookups en BD destino para tabla ${tableConfig.name}`
      );
      const lookupExecution = await this.lookupValuesFromTarget(
        tableConfig,
        dataForProcessing,
        targetConnection
      );

      if (!lookupExecution.success) {
        const failedMsg = lookupExecution.failedFields
          ? lookupExecution.failedFields
              .map((f) => `${f.field}: ${f.error}`)
              .join(", ")
          : lookupExecution.error || "Error desconocido en lookup";

        throw new Error(
          `Falló la validación de lookup para tabla ${tableConfig.name}: ${failedMsg}`
        );
      }

      lookupResults = lookupExecution.results;
      logger.info(
        `Lookup completado exitosamente. Continuando con el procesamiento...`
      );
    }

    // Procesar todos los campos
    for (const fieldMapping of tableConfig.fieldMappings) {
      const processedField = await this.processField(
        fieldMapping,
        dataForProcessing,
        lookupResults,
        currentConsecutive,
        mapping,
        tableConfig,
        isDetailTable,
        targetConnection,
        columnLengthCache
      );

      if (processedField.isDirectSql) {
        targetFields.push(fieldMapping.targetField);
        targetValues.push(processedField.value);
        directSqlFields.add(fieldMapping.targetField);
      } else {
        targetData[fieldMapping.targetField] = processedField.value;
        targetFields.push(fieldMapping.targetField);
        targetValues.push(`@${fieldMapping.targetField}`);
      }

      logger.debug(
        `✅ Campo ${fieldMapping.targetField} preparado para inserción: ${
          processedField.value
        } (tipo: ${typeof processedField.value})`
      );
    }

    // Construir y ejecutar la consulta INSERT
    await this.executeInsert(
      tableConfig.targetTable,
      targetFields,
      targetValues,
      targetData,
      directSqlFields,
      targetConnection
    );
  }

  /**
   * Procesa un campo individual con soporte para campos calculados
   */
  async processField(
    fieldMapping,
    sourceData,
    lookupResults,
    currentConsecutive,
    mapping,
    tableConfig,
    isDetailTable,
    targetConnection,
    columnLengthCache
  ) {
    let value;

    // PASO 1: Obtener valor base
    if (fieldMapping.isCalculatedField && fieldMapping.sqlExpression) {
      // Campo calculado - retornar como SQL directo
      return { value: fieldMapping.sqlExpression, isDirectSql: true };
    } else if (
      fieldMapping.lookupFromTarget &&
      lookupResults[fieldMapping.targetField] !== undefined
    ) {
      // Valor desde lookup
      value = lookupResults[fieldMapping.targetField];
      logger.debug(
        `Valor obtenido desde lookup para ${fieldMapping.targetField}: ${value}`
      );
    } else if (
      fieldMapping.sourceField &&
      sourceData[fieldMapping.sourceField] !== undefined
    ) {
      // Valor desde campo de origen
      value = sourceData[fieldMapping.sourceField];
    } else {
      // Valor por defecto si no hay origen
      const defaultValue = fieldMapping.defaultValue;
      value = defaultValue === "NULL" ? null : defaultValue;
    }

    // Si el valor es undefined/null pero hay un valor por defecto
    if (
      (value === undefined || value === null) &&
      fieldMapping.defaultValue !== undefined
    ) {
      value =
        fieldMapping.defaultValue === "NULL" ? null : fieldMapping.defaultValue;
    }

    // PASO 3: APLICAR CONVERSIÓN DE UNIDADES
    if (fieldMapping.unitConversion?.enabled) {
      logger.info(
        `🔄 Iniciando conversión de unidades para campo: ${fieldMapping.targetField}`
      );
      logger.info(
        `📦 Valor antes de conversión: ${value} (tipo: ${typeof value})`
      );

      const originalValue = value;
      value = this.applyUnitConversion(sourceData, fieldMapping, value);

      if (originalValue !== value) {
        logger.info(
          `🎉 Conversión aplicada exitosamente en ${fieldMapping.targetField}:`
        );
        logger.info(`   📦 Antes: ${originalValue} (${typeof originalValue})`);
        logger.info(`   📊 Después: ${value} (${typeof value})`);
      } else {
        logger.info(
          `ℹ️ No se aplicó conversión en ${fieldMapping.targetField}: ${value}`
        );
      }
    }

    // PASO 4: Formatear fechas si es necesario
    if (
      typeof value !== "number" &&
      (value instanceof Date ||
        (typeof value === "string" &&
          value.includes("T") &&
          !isNaN(new Date(value).getTime())))
    ) {
      logger.debug(`Convirtiendo fecha a formato SQL Server: ${value}`);
      value = this.formatSqlDate(value);
      logger.debug(`Fecha convertida: ${value}`);
    }

    // PASO 5: Aplicar consecutivo si corresponde
    if (currentConsecutive && mapping.consecutiveConfig?.enabled) {
      const shouldReceiveConsecutive = this.shouldReceiveConsecutive(
        fieldMapping,
        mapping.consecutiveConfig,
        tableConfig,
        isDetailTable
      );

      if (shouldReceiveConsecutive) {
        // Solo aplicar consecutivo si no hubo conversión numérica
        if (fieldMapping.unitConversion?.enabled && typeof value === "number") {
          logger.warn(
            `⚠️ No se aplicará consecutivo a ${fieldMapping.targetField} porque se aplicó conversión numérica (valor: ${value})`
          );
        } else {
          value = currentConsecutive.formatted;
          logger.debug(
            `Asignando consecutivo ${currentConsecutive.formatted} a campo ${fieldMapping.targetField} en tabla ${tableConfig.name}`
          );
        }
      }
    }

    // PASO 6: Verificar campos obligatorios
    if (fieldMapping.isRequired && (value === undefined || value === null)) {
      throw new Error(
        `El campo obligatorio '${fieldMapping.targetField}' no tiene valor de origen ni valor por defecto`
      );
    }

    // PASO 7: Aplicar mapeo de valores si existe
    if (
      value !== null &&
      value !== undefined &&
      fieldMapping.valueMappings?.length > 0
    ) {
      const valueMapping = fieldMapping.valueMappings.find(
        (vm) => vm.sourceValue === value
      );
      if (valueMapping) {
        logger.debug(
          `Aplicando mapeo de valor para ${fieldMapping.targetField}: ${value} → ${valueMapping.targetValue}`
        );
        value = valueMapping.targetValue;
      }
    }

    // PASO 8: Verificar y ajustar longitud de strings
    if (typeof value === "string") {
      const maxLength = await this.getColumnMaxLength(
        targetConnection,
        tableConfig.targetTable,
        fieldMapping.targetField,
        columnLengthCache
      );

      if (maxLength > 0 && value.length > maxLength) {
        logger.warn(
          `Truncando valor para campo ${fieldMapping.targetField} de longitud ${value.length} a ${maxLength} caracteres`
        );
        value = value.substring(0, maxLength);
      }
    }

    return { value, isDirectSql: false };
  }

  /**
   * Aplica conversión de unidades a un valor específico
   */
  applyUnitConversion(sourceData, fieldMapping, originalValue) {
    try {
      const config = fieldMapping.unitConversion;

      if (!config || !config.enabled) {
        return originalValue;
      }

      // Validar que el valor original sea numérico
      const numericValue = parseFloat(originalValue);
      if (isNaN(numericValue)) {
        logger.warn(
          `⚠️ Valor no numérico para conversión en ${fieldMapping.targetField}: ${originalValue}`
        );
        return originalValue;
      }

      // Obtener factor de conversión
      let conversionFactor = 1;

      if (
        config.conversionFactorField &&
        sourceData[config.conversionFactorField]
      ) {
        conversionFactor = parseFloat(sourceData[config.conversionFactorField]);
        if (isNaN(conversionFactor) || conversionFactor <= 0) {
          logger.warn(
            `Factor de conversión inválido en ${
              config.conversionFactorField
            }: ${sourceData[config.conversionFactorField]}`
          );
          return originalValue;
        }
      } else if (config.fixedConversionFactor) {
        conversionFactor = config.fixedConversionFactor;
      }

      // Aplicar conversión según la operación
      let convertedValue;
      if (config.operation === "multiply") {
        convertedValue = numericValue * conversionFactor;
      } else if (config.operation === "divide") {
        if (conversionFactor === 0) {
          logger.warn(
            `No se puede dividir por cero en conversión para ${fieldMapping.targetField}`
          );
          return originalValue;
        }
        convertedValue = numericValue / conversionFactor;
      } else {
        logger.warn(
          `Operación de conversión no soportada: ${config.operation}. Debe ser 'multiply' o 'divide'`
        );
        return originalValue;
      }

      // Redondeo para evitar decimales excesivos
      const roundedValue = Math.round(convertedValue * 100) / 100;

      logger.info(`🎉 Conversión completada exitosamente:`);
      logger.info(`   📦 Valor original: ${originalValue} ${config.fromUnit}`);
      logger.info(`   🔄 Factor: ${conversionFactor}`);
      logger.info(`   📊 Valor convertido: ${roundedValue} ${config.toUnit}`);
      logger.info(`   ⚙️ Operación: ${config.operation}`);

      return roundedValue;
    } catch (error) {
      logger.error(
        `💥 Error en conversión de unidades para campo ${fieldMapping.targetField}:`,
        {
          error: error.message,
          stack: error.stack,
          originalValue,
          config: fieldMapping.unitConversion,
        }
      );
      return originalValue;
    }
  }

  /**
   * Verifica si un campo debe recibir el consecutivo
   */
  shouldReceiveConsecutive(
    fieldMapping,
    consecutiveConfig,
    tableConfig,
    isDetailTable
  ) {
    if (isDetailTable) {
      return (
        consecutiveConfig.detailFieldName === fieldMapping.targetField ||
        (consecutiveConfig.applyToTables &&
          consecutiveConfig.applyToTables.some(
            (t) =>
              t.tableName === tableConfig.name &&
              t.fieldName === fieldMapping.targetField
          ))
      );
    } else {
      return (
        consecutiveConfig.fieldName === fieldMapping.targetField ||
        (consecutiveConfig.applyToTables &&
          consecutiveConfig.applyToTables.some(
            (t) =>
              t.tableName === tableConfig.name &&
              t.fieldName === fieldMapping.targetField
          ))
      );
    }
  }

  /**
   * Ejecuta la inserción en la base de datos
   */
  async executeInsert(
    targetTable,
    targetFields,
    targetValues,
    targetData,
    directSqlFields,
    targetConnection
  ) {
    const insertFieldsList = targetFields;
    const insertValuesList = targetFields.map((field, index) => {
      return directSqlFields.has(field) ? targetValues[index] : `@${field}`;
    });

    const insertQuery = `
      INSERT INTO ${targetTable} (${insertFieldsList.join(", ")})
      VALUES (${insertValuesList.join(", ")})
    `;

    logger.debug(`Ejecutando inserción en tabla: ${insertQuery}`);

    // Filtrar los datos para que solo contengan los campos que realmente son parámetros
    const filteredTargetData = {};
    for (const field in targetData) {
      if (!directSqlFields.has(field)) {
        filteredTargetData[field] = targetData[field];
      }
    }

    logger.info(`📊 DATOS FINALES PARA INSERCIÓN en ${targetTable}:`);
    logger.info(`Campos: ${targetFields.join(", ")}`);
    logger.info(`Datos: ${JSON.stringify(filteredTargetData, null, 2)}`);

    await SqlService.query(targetConnection, insertQuery, filteredTargetData);
  }

  /**
   * Procesa las tablas de detalle
   */
  async processDetailTables(
    detailTables,
    documentId,
    sourceData,
    parentTableConfig,
    sourceConnection,
    targetConnection,
    currentConsecutive,
    mapping,
    columnLengthCache,
    processedTables
  ) {
    const orderedDetailTables = [...detailTables].sort(
      (a, b) => (a.executionOrder || 0) - (b.executionOrder || 0)
    );

    logger.info(
      `Procesando ${
        orderedDetailTables.length
      } tablas de detalle en orden: ${orderedDetailTables
        .map((t) => t.name)
        .join(" -> ")}`
    );

    for (const detailConfig of orderedDetailTables) {
      // Obtener detalles
      const detailsData = await this.getDetailData(
        detailConfig,
        parentTableConfig,
        documentId,
        sourceConnection
      );

      if (!detailsData || detailsData.length === 0) {
        logger.warn(
          `No se encontraron detalles en ${detailConfig.sourceTable} para documento ${documentId}`
        );
        continue;
      }

      logger.info(
        `Procesando ${detailsData.length} registros de detalle en ${detailConfig.name}`
      );

      // Insertar detalles
      for (const detailRow of detailsData) {
        await this.processTable(
          detailConfig,
          sourceData,
          detailRow,
          targetConnection,
          currentConsecutive,
          mapping,
          documentId,
          columnLengthCache,
          true // isDetailTable = true
        );

        logger.debug(
          `✅ INSERCIÓN EXITOSA DE DETALLE en ${detailConfig.targetTable}`
        );
      }

      logger.info(
        `Insertados detalles en ${detailConfig.name} sin transacción`
      );
      processedTables.push(detailConfig.name);
    }
  }

  /**
   * Obtiene datos de detalle
   */
  async getDetailData(
    detailConfig,
    parentTableConfig,
    documentId,
    sourceConnection
  ) {
    if (detailConfig.customQuery) {
      const query = detailConfig.customQuery.replace(
        /@documentId/g,
        documentId
      );
      logger.debug(`Ejecutando consulta personalizada para detalles: ${query}`);
      const result = await SqlService.query(sourceConnection, query);
      return result.recordset;
    } else if (detailConfig.useSameSourceTable) {
      return this.getDetailDataFromSameTable(
        detailConfig,
        parentTableConfig,
        documentId,
        sourceConnection
      );
    } else {
      return this.getDetailDataFromOwnTable(
        detailConfig,
        documentId,
        sourceConnection
      );
    }
  }

  /**
   * Obtiene datos de detalle de la misma tabla que el encabezado
   */
  async getDetailDataFromSameTable(
    detailConfig,
    parentTableConfig,
    documentId,
    sourceConnection
  ) {
    const tableAlias = "d1";
    const orderByColumn = detailConfig.orderByColumn || "";

    const requiredFields = this.getRequiredFieldsFromTableConfig(detailConfig);
    const finalSelectFields = requiredFields
      .map((field) => `${tableAlias}.${field}`)
      .join(", ");

    const primaryKey =
      detailConfig.primaryKey || parentTableConfig.primaryKey || "NUM_PED";

    const query = `
      SELECT ${finalSelectFields} FROM ${
      parentTableConfig.sourceTable
    } ${tableAlias}
      WHERE ${tableAlias}.${primaryKey} = @documentId
      ${
        detailConfig.filterCondition
          ? ` AND ${this.processFilterCondition(
              detailConfig.filterCondition,
              tableAlias
            )}`
          : ""
      }
      ${orderByColumn ? ` ORDER BY ${tableAlias}.${orderByColumn}` : ""}
    `;

    logger.debug(`Ejecutando consulta para detalles: ${query}`);
    const result = await SqlService.query(sourceConnection, query, {
      documentId,
    });

    return result.recordset;
  }

  /**
   * Obtiene datos de detalle de su propia tabla
   */
  async getDetailDataFromOwnTable(detailConfig, documentId, sourceConnection) {
    const orderByColumn = detailConfig.orderByColumn || "";
    const requiredFields = this.getRequiredFieldsFromTableConfig(detailConfig);
    const finalSelectFields = requiredFields.join(", ");
    const primaryKey = detailConfig.primaryKey || "NUM_PED";

    const query = `
      SELECT ${finalSelectFields} FROM ${detailConfig.sourceTable}
      WHERE ${primaryKey} = @documentId
      ${
        detailConfig.filterCondition
          ? ` AND ${detailConfig.filterCondition}`
          : ""
      }
      ${orderByColumn ? ` ORDER BY ${orderByColumn}` : ""}
    `;

    logger.debug(`Ejecutando consulta para detalles: ${query}`);
    const result = await SqlService.query(sourceConnection, query, {
      documentId,
    });

    return result.recordset;
  }

  /**
   * Maneja errores de procesamiento
   */
  handleProcessingError(error, documentId, currentConsecutive, mapping) {
    // Error de conexión
    if (
      error.name === "AggregateError" ||
      error.stack?.includes("AggregateError")
    ) {
      logger.error(
        `Error de conexión (AggregateError) para documento ${documentId}:`,
        {
          documentId,
          errorMessage: error.message,
          errorName: error.name,
          errorStack: error.stack,
        }
      );

      return {
        success: false,
        message: `Error de conexión: Se perdió la conexión con la base de datos.`,
        documentType: "unknown",
        errorDetails: JSON.stringify({
          name: error.name,
          message: error.message,
          stack: error.stack,
        }),
        consecutiveUsed: currentConsecutive
          ? currentConsecutive.formatted
          : null,
        consecutiveValue: currentConsecutive ? currentConsecutive.value : null,
        errorCode: "CONNECTION_ERROR",
      };
    }

    // Error de truncado
    if (error.message?.includes("String or binary data would be truncated")) {
      const match = error.message.match(/column '([^']+)'/);
      const columnName = match ? match[1] : "desconocida";
      const detailedMessage = `Error de truncado: El valor es demasiado largo para la columna '${columnName}'. Verifique la longitud máxima permitida.`;

      return {
        success: false,
        message: detailedMessage,
        documentType: "unknown",
        errorDetails: error.stack,
        errorCode: "TRUNCATION_ERROR",
        consecutiveUsed: null,
        consecutiveValue: null,
      };
    }

    // Error de valor NULL
    if (error.message?.includes("Cannot insert the value NULL into column")) {
      const match = error.message.match(/column '([^']+)'/);
      const columnName = match ? match[1] : "desconocida";
      const detailedMessage = `No se puede insertar un valor NULL en la columna '${columnName}' que no permite valores nulos. Configure un valor por defecto válido.`;

      return {
        success: false,
        message: detailedMessage,
        documentType: "unknown",
        errorDetails: error.stack,
        errorCode: "NULL_VALUE_ERROR",
        consecutiveUsed: null,
        consecutiveValue: null,
      };
    }

    // Error general
    logger.error(`Error procesando documento ${documentId}: ${error.message}`, {
      documentId,
      errorStack: error.stack,
    });

    return {
      success: false,
      message: `Error: ${
        error.message || "Error desconocido durante el procesamiento"
      }`,
      documentType: "unknown",
      errorDetails: error.stack || "No hay detalles del error disponibles",
      errorCode: this.determineErrorCode(error),
      consecutiveUsed: null,
      consecutiveValue: null,
    };
  }

  /**
   * Función auxiliar para formatear fechas en formato SQL Server
   */
  formatSqlDate(dateValue) {
    if (!dateValue) return null;

    let date;
    if (dateValue instanceof Date) {
      date = dateValue;
    } else if (typeof dateValue === "string") {
      date = new Date(dateValue);
      if (isNaN(date.getTime())) {
        return null;
      }
    } else {
      return null;
    }

    return date.toISOString().split("T")[0];
  }

  /**
   * Determina el código de error para facilitar manejo en cliente
   */
  determineErrorCode(error) {
    if (error.name === "AggregateError") return "CONNECTION_ERROR";
    if (error.message?.includes("truncated")) return "TRUNCATION_ERROR";
    if (error.message?.includes("NULL")) return "NULL_VALUE_ERROR";
    if (error.message?.includes("duplicate")) return "DUPLICATE_ERROR";
    if (error.message?.includes("foreign key")) return "FOREIGN_KEY_ERROR";
    return "GENERAL_ERROR";
  }

  /**
   * Obtiene el nombre del campo clave en la tabla destino
   */
  getTargetPrimaryKeyField(tableConfig) {
    if (tableConfig.targetPrimaryKey) {
      return tableConfig.targetPrimaryKey;
    }

    const primaryKeyMapping = tableConfig.fieldMappings.find(
      (fm) => fm.sourceField === tableConfig.primaryKey
    );

    if (primaryKeyMapping) {
      return primaryKeyMapping.targetField;
    }

    return tableConfig.targetPrimaryKey || "ID";
  }

  /**
   * Obtiene la longitud máxima de una columna
   */
  async getColumnMaxLength(connection, tableName, columnName, cache = null) {
    if (cache?.has(`${tableName}:${columnName}`)) {
      return cache.get(`${tableName}:${columnName}`);
    }

    try {
      const tableNameOnly = tableName.replace(/^.*\.|\[|\]/g, "");

      const query = `
        SELECT CHARACTER_MAXIMUM_LENGTH
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = '${tableNameOnly}'
        AND COLUMN_NAME = '${columnName}'
      `;

      const result = await SqlService.query(connection, query);

      let maxLength = 0;
      if (result.recordset?.length > 0) {
        maxLength = result.recordset[0].CHARACTER_MAXIMUM_LENGTH || 0;
      }

      if (cache) {
        cache.set(`${tableName}:${columnName}`, maxLength);
      }

      return maxLength;
    } catch (error) {
      logger.warn(
        `Error al obtener longitud máxima para ${columnName}: ${error.message}`
      );
      return 0;
    }
  }

  /**
   * Procesa dependencias de foreign key ANTES de insertar datos principales
   */
  async processForeignKeyDependencies(
    documentId,
    mapping,
    sourceConnection,
    targetConnection,
    sourceData
  ) {
    for (const dependency of mapping.foreignKeyDependencies) {
      try {
        logger.info(`Procesando dependencia FK: ${dependency.fieldName}`);

        // Obtener valor de referencia desde los datos de origen
        const referenceValue = sourceData[dependency.sourceReferenceField];
        if (!referenceValue) {
          logger.warn(
            `Valor de referencia vacío para FK ${dependency.fieldName}`
          );
          continue;
        }

        // Verificar si ya existe en la tabla de referencia
        const checkQuery = `SELECT TOP 1 1 FROM ${dependency.referenceTable} WHERE ${dependency.referenceKeyField} = @referenceValue`;
        const checkResult = await SqlService.query(
          targetConnection,
          checkQuery,
          { referenceValue }
        );

        if (checkResult.recordset?.length === 0) {
          // No existe, necesita ser creado
          logger.info(
            `Creando registro de referencia para FK ${dependency.fieldName}: ${referenceValue}`
          );

          // Construir datos para insertar en tabla de referencia
          const referenceData = {};
          dependency.referenceFieldMappings?.forEach((mapping) => {
            if (
              mapping.sourceField &&
              sourceData[mapping.sourceField] !== undefined
            ) {
              referenceData[mapping.targetField] =
                sourceData[mapping.sourceField];
            } else if (mapping.defaultValue !== undefined) {
              referenceData[mapping.targetField] =
                mapping.defaultValue === "NULL" ? null : mapping.defaultValue;
            }
          });

          // Insertar en tabla de referencia
          const fields = Object.keys(referenceData);
          const values = fields.map((field) => `@${field}`);
          const insertQuery = `INSERT INTO ${
            dependency.referenceTable
          } (${fields.join(", ")}) VALUES (${values.join(", ")})`;

          await SqlService.query(targetConnection, insertQuery, referenceData);
          logger.info(
            `✅ Registro de referencia creado exitosamente para ${dependency.fieldName}`
          );
        } else {
          logger.debug(
            `Registro de referencia ya existe para FK ${dependency.fieldName}: ${referenceValue}`
          );
        }
      } catch (depError) {
        logger.error(
          `Error en dependencia ${dependency.fieldName}: ${depError.message}`
        );
        throw new Error(
          `Error en dependencia FK ${dependency.fieldName}: ${depError.message}`
        );
      }
    }
  }

  /**
   * Ejecuta lookups en la base de datos destino
   */
  async lookupValuesFromTarget(tableConfig, sourceData, targetConnection) {
    const lookupResults = {};
    const failedLookups = [];

    try {
      const lookupMappings = tableConfig.fieldMappings.filter(
        (fm) => fm.lookupFromTarget
      );

      for (const fieldMapping of lookupMappings) {
        try {
          if (!fieldMapping.lookupParams?.length) {
            logger.warn(
              `No hay parámetros de lookup para campo ${fieldMapping.targetField}`
            );
            continue;
          }

          // Construir la consulta de lookup
          const whereConditions = [];
          const params = {};

          fieldMapping.lookupParams.forEach((param, index) => {
            const sourceValue = sourceData[param.sourceField];
            if (sourceValue !== undefined && sourceValue !== null) {
              whereConditions.push(`${param.targetField} = @param${index}`);
              params[`param${index}`] = sourceValue;
            }
          });

          if (whereConditions.length === 0) {
            logger.warn(
              `No hay condiciones válidas para lookup de ${fieldMapping.targetField}`
            );
            continue;
          }

          const lookupQuery = `
            SELECT TOP 1 ${
              fieldMapping.lookupSelectField || fieldMapping.targetField
            }
            FROM ${fieldMapping.lookupTable}
            WHERE ${whereConditions.join(" AND ")}
          `;

          logger.debug(`Ejecutando lookup: ${lookupQuery}`, params);

          const result = await SqlService.query(
            targetConnection,
            lookupQuery,
            params
          );

          if (result.recordset?.length > 0) {
            const lookupValue =
              result.recordset[0][
                fieldMapping.lookupSelectField || fieldMapping.targetField
              ];
            lookupResults[fieldMapping.targetField] = lookupValue;
            logger.debug(
              `✅ Lookup exitoso para ${fieldMapping.targetField}: ${lookupValue}`
            );
          } else {
            // Si es obligatorio, es un error
            if (fieldMapping.lookupRequired) {
              failedLookups.push({
                field: fieldMapping.targetField,
                error: "Valor requerido no encontrado en lookup",
                query: lookupQuery,
                params: params,
              });
              logger.error(
                `❌ Lookup obligatorio falló para ${fieldMapping.targetField}`
              );
            } else {
              logger.warn(
                `⚠️ Lookup opcional sin resultados para ${fieldMapping.targetField}`
              );
            }
          }
        } catch (fieldError) {
          const errorMsg = `Error en lookup para ${fieldMapping.targetField}: ${fieldError.message}`;
          logger.error(errorMsg);

          if (fieldMapping.lookupRequired) {
            failedLookups.push({
              field: fieldMapping.targetField,
              error: errorMsg,
            });
          }
        }
      }

      // Si hay fallos en campos obligatorios, es un error crítico
      const criticalFailures = failedLookups.filter((f) =>
        tableConfig.fieldMappings.find(
          (fm) => fm.targetField === f.field && fm.lookupRequired
        )
      );

      if (criticalFailures.length > 0) {
        return {
          results: lookupResults,
          success: false,
          failedFields: criticalFailures,
        };
      }

      logger.info(
        `Lookup completado. Obtenidos ${
          Object.keys(lookupResults).length
        } valores.`
      );

      return {
        results: lookupResults,
        success: true,
        failedFields: failedLookups,
      };
    } catch (error) {
      logger.error(
        `Error general al ejecutar lookup en destino: ${error.message}`,
        {
          error,
          stack: error.stack,
        }
      );

      return {
        results: {},
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Obtiene documentos según configuración de mapeo con filtros avanzados
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

        if (tablesResult.recordset?.length > 0) {
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

      if (!mapping.tableConfigs?.length) {
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
        let schema = "dbo"; // Esquema por defecto
        let tableName = mainTable.sourceTable;

        if (tableName.includes(".")) {
          const parts = tableName.split(".");
          if (parts.length === 2) {
            schema = parts[0];
            tableName = parts[1];
          }
        }

        // Verificar existencia de tabla
        const tableCheckQuery = `
        SELECT TOP 1 1
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @tableName
      `;

        const tableCheckResult = await SqlService.query(
          connection,
          tableCheckQuery,
          {
            schema: schema,
            tableName: tableName,
          }
        );

        if (!tableCheckResult.recordset?.length) {
          throw new Error(
            `La tabla ${schema}.${tableName} no existe en la base de datos`
          );
        }

        logger.info(`✅ Tabla ${schema}.${tableName} verificada exitosamente`);

        // Construir consulta con filtros
        const fullTableName = `${schema}.${tableName}`;
        let query = `SELECT * FROM ${fullTableName}`;
        const params = {};
        const whereConditions = [];

        // Aplicar filtro de fechas
        if (filters.dateFrom || filters.dateTo) {
          const dateField = filters.dateField || "FECHA";
          if (filters.dateFrom) {
            whereConditions.push(`${dateField} >= @dateFrom`);
            params.dateFrom = filters.dateFrom;
          }
          if (filters.dateTo) {
            whereConditions.push(`${dateField} <= @dateTo`);
            params.dateTo = filters.dateTo;
          }
        }

        // Aplicar filtro de estado procesado
        if (filters.status && filters.status !== "all") {
          const statusField =
            filters.statusField || mapping.markProcessedField || "PROCESADO";

          if (filters.status === "processed") {
            whereConditions.push(`${statusField} = @processedValue`);
            params.processedValue = mapping.markProcessedValue || "S";
          } else if (filters.status === "pending") {
            whereConditions.push(
              `(${statusField} IS NULL OR ${statusField} != @processedValue)`
            );
            params.processedValue = mapping.markProcessedValue || "S";
          }
        }

        // Aplicar filtro de bodega/warehouse
        if (filters.warehouse && filters.warehouse !== "all") {
          const warehouseField = filters.warehouseField || "BODEGA";
          whereConditions.push(`${warehouseField} = @warehouse`);
          params.warehouse = filters.warehouse;
        }

        // Construir WHERE clause
        if (whereConditions.length > 0) {
          query += ` WHERE ${whereConditions.join(" AND ")}`;
        }

        // Agregar ordenamiento
        const primaryKey = mainTable.primaryKey || "NUM_PED";
        query += ` ORDER BY ${primaryKey} DESC`;

        // Aplicar límite si se especifica
        if (filters.limit) {
          const limit = parseInt(filters.limit, 10);
          if (limit > 0) {
            query = `SELECT TOP ${limit} * FROM (${query}) AS limited_results`;
          }
        }

        logger.debug(`Ejecutando consulta de documentos: ${query}`);
        logger.debug(`Parámetros: ${JSON.stringify(params)}`);

        const result = await SqlService.query(connection, query, params);

        logger.info(`Documentos obtenidos: ${result.recordset?.length || 0}`);

        return result.recordset || [];
      } catch (queryError) {
        logger.error(`Error al ejecutar consulta SQL: ${queryError.message}`);
        throw new Error(
          `Error en consulta SQL (${mainTable.sourceTable}): ${queryError.message}`
        );
      }
    } catch (error) {
      logger.error(`Error al obtener documentos: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene documentos según configuración de mapeo
   */
  async getDocumentsByMapping(mappingId, filters = {}) {
    try {
      const mapping = await TransferMapping.findById(mappingId);
      if (!mapping) {
        throw new Error(`Configuración de mapeo ${mappingId} no encontrada`);
      }

      const connectionResult = await ConnectionService.enhancedRobustConnect(
        mapping.sourceServer
      );
      if (!connectionResult.success) {
        throw new Error(
          `Error al conectar al servidor origen: ${connectionResult.error?.message}`
        );
      }

      const connection = connectionResult.connection;

      try {
        const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
        if (!mainTable) {
          throw new Error("No se encontró tabla principal en la configuración");
        }

        // Construir query dinámicamente
        let query = `SELECT * FROM ${mainTable.sourceTable}`;
        const params = {};

        // Aplicar filtros
        const whereConditions = [];

        if (filters.dateFrom || filters.dateTo) {
          const dateField = filters.dateField || "FECHA"; // Campo por defecto
          if (filters.dateFrom) {
            whereConditions.push(`${dateField} >= @dateFrom`);
            params.dateFrom = filters.dateFrom;
          }
          if (filters.dateTo) {
            whereConditions.push(`${dateField} <= @dateTo`);
            params.dateTo = filters.dateTo;
          }
        }

        if (filters.status !== undefined) {
          const statusField = mapping.markProcessedField || "PROCESADO";
          if (filters.status === "processed") {
            whereConditions.push(`${statusField} = @processedValue`);
            params.processedValue = mapping.markProcessedValue || "S";
          } else if (filters.status === "pending") {
            whereConditions.push(
              `(${statusField} IS NULL OR ${statusField} != @processedValue)`
            );
            params.processedValue = mapping.markProcessedValue || "S";
          }
        }

        if (whereConditions.length > 0) {
          query += ` WHERE ${whereConditions.join(" AND ")}`;
        }

        // Agregar ordenamiento
        const primaryKey = mainTable.primaryKey || "NUM_PED";
        query += ` ORDER BY ${primaryKey} DESC`;

        // Aplicar límite si se especifica
        if (filters.limit) {
          query = `SELECT TOP ${parseInt(
            filters.limit
          )} * FROM (${query}) AS limited_results`;
        }

        logger.debug(`Ejecutando consulta de documentos: ${query}`);
        const result = await SqlService.query(connection, query, params);

        return result.recordset || [];
      } finally {
        await ConnectionService.releaseConnection(connection);
      }
    } catch (error) {
      logger.error(`Error al obtener documentos: ${error.message}`);
      throw error;
    }
  }

  /**
   * Crea una nueva configuración de mapeo
   */
  async createMapping(mappingData) {
    try {
      // Si no hay taskId, crear una tarea por defecto
      if (!mappingData.taskId) {
        let defaultQuery = "SELECT 1";

        if (mappingData.tableConfigs?.length > 0) {
          const mainTable = mappingData.tableConfigs.find(
            (tc) => !tc.isDetailTable
          );
          if (mainTable?.sourceTable) {
            defaultQuery = `SELECT * FROM ${mainTable.sourceTable}`;
          }
        }

        const taskData = {
          name: `Task_${mappingData.name}`,
          type: "dynamic",
          query: defaultQuery,
          sourceConnectionId: mappingData.sourceServer,
          targetConnectionId: mappingData.targetServer,
          isActive: true,
        };

        const task = await TransferTask.create(taskData);
        logger.info(`Tarea por defecto creada para mapping: ${task._id}`);
        mappingData.taskId = task._id;
      }

      const mapping = await TransferMapping.create(mappingData);
      return mapping;
    } catch (error) {
      logger.error(`Error al crear configuración de mapeo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Actualiza una configuración de mapeo
   */
  async updateMapping(mappingId, mappingData) {
    try {
      if (!mappingData.taskId) {
        let defaultQuery = "SELECT 1";

        if (mappingData.tableConfigs?.length > 0) {
          const mainTable = mappingData.tableConfigs.find(
            (tc) => !tc.isDetailTable
          );
          if (mainTable?.sourceTable) {
            defaultQuery = `SELECT * FROM ${mainTable.sourceTable}`;
          }
        }

        const taskData = {
          name: `Task_${mappingData.name}`,
          type: "dynamic",
          query: defaultQuery,
          sourceConnectionId: mappingData.sourceServer,
          targetConnectionId: mappingData.targetServer,
          isActive: true,
        };

        const task = await TransferTask.create(taskData);
        logger.info(`Tarea por defecto creada para mapping: ${task._id}`);
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

  /**
   * Genera el siguiente consecutivo para un mapping
   */
  async generateNextConsecutive(mapping) {
    try {
      // Obtener último valor usado
      const lastValue = mapping.consecutiveConfig.lastValue || 0;
      const newValue = lastValue + 1;

      // Actualizar inmediatamente el último valor usado en la configuración
      await this.updateLastConsecutive(mapping._id, newValue);
      logger.info(
        `Consecutivo reservado: ${newValue} para mapeo ${mapping._id}`
      );

      // Formatear según el patrón si existe
      let formattedValue = String(newValue);

      if (mapping.consecutiveConfig.pattern) {
        formattedValue = this.formatConsecutive(
          mapping.consecutiveConfig.pattern,
          {
            PREFIX: mapping.consecutiveConfig.prefix || "",
            VALUE: newValue,
            YEAR: new Date().getFullYear(),
            MONTH: String(new Date().getMonth() + 1).padStart(2, "0"),
            DAY: String(new Date().getDate()).padStart(2, "0"),
          }
        );
      } else if (mapping.consecutiveConfig.prefix) {
        formattedValue = `${mapping.consecutiveConfig.prefix}${newValue}`;
      }

      return {
        value: newValue,
        formatted: formattedValue,
        isCentralized: false,
      };
    } catch (error) {
      logger.error(`Error al generar consecutivo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Actualiza el último consecutivo usado
   */
  async updateLastConsecutive(mappingId, newValue) {
    try {
      await TransferMapping.findByIdAndUpdate(
        mappingId,
        { $set: { "consecutiveConfig.lastValue": newValue } },
        { new: true }
      );
    } catch (error) {
      logger.error(`Error al actualizar último consecutivo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Formatea un consecutivo según el patrón
   */
  formatConsecutive(pattern, values) {
    let formatted = pattern;
    for (const [key, value] of Object.entries(values)) {
      const regex = new RegExp(`{${key}(?::(\\d+))?}`, "g");
      formatted = formatted.replace(regex, (match, padding) => {
        if (padding && !isNaN(value)) {
          return String(value).padStart(parseInt(padding), "0");
        }
        return String(value);
      });
    }
    return formatted;
  }

  /**
   * Obtiene próximo valor consecutivo para un mapping
   */
  async getNextConsecutiveValue(mappingId, segment = null) {
    try {
      const mapping = await TransferMapping.findById(mappingId);
      if (!mapping?.consecutiveConfig?.enabled) {
        throw new Error("Consecutivos no habilitados para este mapping");
      }

      return await this.generateNextConsecutive(mapping);
    } catch (error) {
      logger.error(`Error al obtener siguiente consecutivo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Formatea un valor consecutivo según configuración
   */
  formatConsecutiveValue(value, config) {
    if (config.pattern) {
      return this.formatConsecutive(config.pattern, {
        PREFIX: config.prefix || "",
        VALUE: value,
        YEAR: new Date().getFullYear(),
        MONTH: String(new Date().getMonth() + 1).padStart(2, "0"),
        DAY: String(new Date().getDate()).padStart(2, "0"),
      });
    } else if (config.prefix) {
      return `${config.prefix}${value}`;
    }
    return String(value);
  }

  /**
   * Obtiene datos de origen para procesamiento de documentos
   */
  async getSourceDataForDocuments(documentIds, mapping, sourceConnection) {
    try {
      // Si hay procesador de bonificaciones nuevo, usar ese método
      if (mapping.bonificationProcessor?.enabled) {
        return await this.getSourceDataWithNewProcessor(
          documentIds,
          mapping,
          sourceConnection
        );
      }

      // Usar método normal
      return await this.getSourceDataNormal(
        documentIds,
        mapping,
        sourceConnection
      );
    } catch (error) {
      logger.error(
        `Error al obtener datos de origen para documentos: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Actualiza la configuración de consecutivos de un mapping
   */
  async updateConsecutiveConfig(mappingId, consecutiveConfig) {
    try {
      const mapping = await TransferMapping.findByIdAndUpdate(
        mappingId,
        { consecutiveConfig: consecutiveConfig },
        { new: true }
      );

      if (!mapping) {
        throw new Error(`Configuración de mapeo ${mappingId} no encontrada`);
      }

      logger.info(
        `Configuración de consecutivos actualizada para mapping ${mappingId}`
      );
      return mapping;
    } catch (error) {
      logger.error(
        `Error al actualizar configuración de consecutivos: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Reinicia el consecutivo de un mapping a un valor específico
   */
  async resetConsecutive(mappingId, value = 0) {
    try {
      const initialValue = parseInt(value, 10);

      const mapping = await TransferMapping.findByIdAndUpdate(
        mappingId,
        { "consecutiveConfig.lastValue": initialValue },
        { new: true }
      );

      if (!mapping) {
        throw new Error(`Configuración de mapeo ${mappingId} no encontrada`);
      }

      logger.info(
        `Consecutivo reiniciado a ${initialValue} para mapping ${mappingId}`
      );
      return {
        success: true,
        lastValue: mapping.consecutiveConfig?.lastValue || initialValue,
      };
    } catch (error) {
      logger.error(`Error al reiniciar consecutivo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Marca documentos como procesados según la estrategia configurada
   */
  async markDocumentsAsProcessed(
    documentIds,
    mapping,
    connection,
    shouldMark = true
  ) {
    const docArray = Array.isArray(documentIds) ? documentIds : [documentIds];

    if (docArray.length === 0) {
      return { success: 0, failed: 0 };
    }

    if (!mapping.markProcessedField) {
      logger.warn("No se ha configurado campo de marcado procesado");
      return { success: 0, failed: docArray.length };
    }

    try {
      // Determinar estrategia
      const strategy = mapping.markProcessedStrategy || "individual";
      const config = mapping.markProcessedConfig || {};

      if (strategy === "batch" && docArray.length > 1) {
        return await this.markDocumentsBatch(
          docArray,
          mapping,
          connection,
          shouldMark
        );
      } else {
        // Estrategia individual
        let successCount = 0;
        for (const documentId of docArray) {
          const success = await this.markSingleDocument(
            documentId,
            mapping,
            connection,
            shouldMark
          );
          if (success) successCount++;
        }
        return {
          success: successCount,
          failed: docArray.length - successCount,
        };
      }
    } catch (error) {
      logger.error(
        `Error al marcar documentos como procesados: ${error.message}`
      );
      return { success: 0, failed: docArray.length };
    }
  }

  /**
   * Marca documentos en lote
   */
  async markDocumentsBatch(documentIds, mapping, connection, shouldMark) {
    const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
    if (!mainTable) {
      return { success: 0, failed: documentIds.length };
    }

    const config = mapping.markProcessedConfig || {};
    const primaryKey = mainTable.primaryKey || "NUM_PED";

    const placeholders = documentIds
      .map((_, index) => `@doc${index}`)
      .join(", ");

    let updateFields = `${mapping.markProcessedField} = @processedValue`;

    if (config.includeTimestamp && config.timestampField) {
      updateFields += `, ${config.timestampField} = GETDATE()`;
    }

    const params = {
      processedValue: shouldMark ? mapping.markProcessedValue : null,
    };

    documentIds.forEach((id, index) => {
      params[`doc${index}`] = id;
    });

    const query = `
      UPDATE ${mainTable.sourceTable}
      SET ${updateFields}
      WHERE ${primaryKey} IN (${placeholders})
    `;

    logger.debug(`Ejecutando actualización en lote: ${query}`);

    const result = await SqlService.query(connection, query, params);

    return {
      success: result.rowsAffected || 0,
      failed: documentIds.length - (result.rowsAffected || 0),
    };
  }

  /**
   * Marca un documento individual
   */
  async markSingleDocument(documentId, mapping, connection, shouldMark) {
    const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
    if (!mainTable) return false;

    const config = mapping.markProcessedConfig || {};
    const primaryKey = mainTable.primaryKey || "NUM_PED";

    let updateFields = `${mapping.markProcessedField} = @processedValue`;

    if (config.includeTimestamp && config.timestampField) {
      updateFields += `, ${config.timestampField} = GETDATE()`;
    }

    const query = `
      UPDATE ${mainTable.sourceTable}
      SET ${updateFields}
      WHERE ${primaryKey} = @documentId
    `;

    const params = {
      documentId,
      processedValue: shouldMark ? mapping.markProcessedValue : null,
    };

    const result = await SqlService.query(connection, query, params);
    return result.rowsAffected > 0;
  }
}

module.exports = new DynamicTransferService();
