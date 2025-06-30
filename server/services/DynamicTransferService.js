// services/DynamicTransferService.js
const logger = require("./logger");
const ConnectionService = require("./ConnectionCentralService");
const { SqlService } = require("./SqlService");
const TransferMapping = require("../models/transferMappingModel");
const TaskExecution = require("../models/taskExecutionModel");
const TaskTracker = require("./TaskTracker");
const TransferTask = require("../models/transferTaks");
const ConsecutiveService = require("./ConsecutiveService");
const BonificationService = require("./BonificationService");

class DynamicTransferService {
  constructor() {
    this.bonificationService = new BonificationService({ debug: true });
  }

  /**
   * 🟢 NUEVO: Procesa bonificaciones usando el servicio especializado
   */
  async processBonifications(sourceData, mapping) {
    if (!Array.isArray(sourceData)) {
      logger.warn(
        `processBonifications: sourceData no es un array, recibido: ${typeof sourceData}`
      );
      return Array.isArray(sourceData) ? sourceData : [];
    }

    if (!mapping.hasBonificationProcessing || !mapping.bonificationConfig) {
      return sourceData;
    }

    logger.info(
      `🎁 Delegando procesamiento de bonificaciones al BonificationService`
    );

    try {
      const config = mapping.bonificationConfig;
      const documentIds = [
        ...new Set(sourceData.map((record) => record[config.orderField])),
      ];

      logger.info(
        `🎯 Procesando bonificaciones para ${documentIds.length} documentos únicos con ${sourceData.length} registros totales`
      );

      const processedData = await this.processBonificationsWithLoadedData(
        sourceData,
        mapping
      );

      return processedData;
    } catch (error) {
      logger.error(
        `❌ Error en procesamiento de bonificaciones: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * 🟢 NUEVO: Procesa bonificaciones con datos ya cargados
   */
  async processBonificationsWithLoadedData(sourceData, mapping) {
    const config = mapping.bonificationConfig;

    const validation = BonificationService.validateBonificationConfig(mapping);
    if (!validation.valid) {
      throw new Error(
        `Configuración de bonificaciones inválida: ${validation.errors.join(
          ", "
        )}`
      );
    }

    logger.info(`🎯 Procesando bonificaciones con datos pre-cargados:`, {
      sourceTable: config.sourceTable,
      orderField: config.orderField,
      totalRecords: sourceData.length,
    });

    const groupedData = this.bonificationService.groupDataByField(
      sourceData,
      config.orderField
    );
    const processedData = [];
    let bonificationsProcessed = 0;
    let regularArticlesProcessed = 0;

    for (const [groupKey, records] of groupedData) {
      logger.debug(
        `📦 Procesando grupo ${config.orderField}=${groupKey} con ${records.length} registros`
      );

      const processedOrder = await this.bonificationService.processSingleOrder(
        records,
        config,
        groupKey
      );
      processedData.push(...processedOrder);

      const orderBonifications = processedOrder.filter(
        (r) =>
          r[config.bonificationIndicatorField] ===
          config.bonificationIndicatorValue
      ).length;
      const orderRegulars = processedOrder.length - orderBonifications;

      bonificationsProcessed += orderBonifications;
      regularArticlesProcessed += orderRegulars;
    }

    logger.info(`✅ Procesamiento de bonificaciones completado:`, {
      totalRecords: processedData.length,
      regularArticles: regularArticlesProcessed,
      bonifications: bonificationsProcessed,
      groups: groupedData.size,
    });

    return processedData;
  }

  /**
   * Obtiene una configuración de mapeo por ID
   */
  async getMapping(mappingId) {
    try {
      const mapping = await TransferMapping.findById(mappingId);
      if (!mapping) {
        throw new Error(`Configuración de mapeo ${mappingId} no encontrada`);
      }
      return mapping;
    } catch (error) {
      logger.error(`Error al obtener configuración: ${error.message}`);
      throw error;
    }
  }

  /**
   * 🟢 MODIFICADO: Obtener datos de origen para documentos específicos
   */
  async getSourceDataForDocuments(documentIds, mapping, connection) {
    try {
      logger.info(`📥 Obteniendo datos para ${documentIds.length} documentos`);

      if (!Array.isArray(documentIds)) {
        logger.warn(
          `getSourceDataForDocuments: documentIds no es un array, recibido: ${typeof documentIds}`
        );
        documentIds = [documentIds];
      }

      if (mapping.hasBonificationProcessing && mapping.bonificationConfig) {
        logger.info(
          `🎁 Usando BonificationService para obtener datos con bonificaciones`
        );
        return await this.bonificationService.processBonificationsUnified(
          documentIds,
          mapping,
          connection
        );
      }

      if (!mapping.tableConfigs || !Array.isArray(mapping.tableConfigs)) {
        logger.error(
          `getSourceDataForDocuments: tableConfigs no está configurado correctamente`
        );
        return [];
      }

      const mainTableConfig = mapping.tableConfigs.find(
        (tc) => !tc.isDetailTable
      );
      let sourceTable = "FAC_ENC_PED";
      let orderField = "NUM_PED";
      let lineField = "NUM_LN";

      if (mainTableConfig && mainTableConfig.sourceTable) {
        sourceTable = mainTableConfig.sourceTable;
      }

      if (mapping.bonificationConfig) {
        orderField = mapping.bonificationConfig.orderField || "NUM_PED";
        lineField = mapping.bonificationConfig.lineOrderField || "NUM_LN";
      }

      const inClause = documentIds.map((_, index) => `@doc${index}`).join(", ");
      const parameters = {};
      documentIds.forEach((id, index) => {
        parameters[`doc${index}`] = id;
      });

      const query = `
        SELECT *
        FROM ${sourceTable}
        WHERE ${orderField} IN (${inClause})
        ORDER BY ${orderField}, ${lineField}
      `;

      const result = await SqlService.query(connection, query, parameters);
      return result.recordset || [];
    } catch (error) {
      logger.error(`❌ Error obteniendo datos de origen: ${error.message}`);
      throw error;
    }
  }

  /**
   * Procesa documentos según una configuración de mapeo - MÉTODO PRINCIPAL
   */
  async processDocuments(documentIds, mappingId, signal = null) {
    const localAbortController = !signal ? new AbortController() : null;
    signal = signal || localAbortController.signal;

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

    let useCentralizedConsecutives = false;
    let centralizedConsecutiveId = null;

    try {
      // 1. Obtener configuración de mapeo
      mapping = await this.getMapping(mappingId);
      logger.info(
        `Procesando ${documentIds.length} documentos con configuración: ${mapping.name}`
      );

      // 2. Establecer conexiones
      sourceConnection = await ConnectionService.getConnection(
        mapping.sourceServer
      );
      targetConnection = await ConnectionService.getConnection(
        mapping.targetServer
      );

      // 3. Crear registro de ejecución
      const execution = new TaskExecution({
        taskId: mapping.taskId,
        startTime: new Date(),
        status: "running",
        totalRecords: documentIds.length,
      });
      await execution.save();
      executionId = execution._id;

      // 4. Configurar consecutivos centralizados si está habilitado
      if (
        mapping.consecutiveConfig &&
        mapping.consecutiveConfig.enabled &&
        mapping.consecutiveConfig.useCentralizedService
      ) {
        useCentralizedConsecutives = true;
        const consecutiveResult = await ConsecutiveService.getConsecutiveId(
          mapping.consecutiveConfig.pattern || "DEFAULT_PATTERN"
        );
        centralizedConsecutiveId = consecutiveResult.id;
        logger.info(
          `Consecutivos centralizados habilitados: ${centralizedConsecutiveId}`
        );
      }

      // 5. Procesar documentos
      const results = {
        processed: 0,
        failed: 0,
        skipped: 0,
        byType: {},
        details: [],
        consecutivesUsed: [],
      };

      const successfulDocuments = [];
      const failedDocuments = [];
      let hasErrors = false;

      // Procesamiento con bonificaciones unificado
      if (mapping.hasBonificationProcessing && mapping.bonificationConfig) {
        logger.info(
          `🎁 Procesamiento unificado de bonificaciones habilitado para ${documentIds.length} documentos`
        );

        try {
          const unifiedProcessedData =
            await this.bonificationService.processBonificationsUnified(
              documentIds,
              mapping,
              sourceConnection
            );

          for (let i = 0; i < documentIds.length; i++) {
            if (signal.aborted) {
              clearTimeout(timeoutId);
              throw new Error("Tarea cancelada por el usuario");
            }

            const documentId = documentIds[i];
            let currentConsecutive = null;

            try {
              // Generación de consecutivos
              if (
                mapping.consecutiveConfig &&
                mapping.consecutiveConfig.enabled
              ) {
                if (useCentralizedConsecutives) {
                  try {
                    const reservation =
                      await ConsecutiveService.reserveConsecutiveValues(
                        centralizedConsecutiveId,
                        1,
                        { segment: null },
                        { id: mapping._id.toString(), name: "mapping" }
                      );

                    currentConsecutive = {
                      value: reservation.values[0].numeric,
                      formatted: reservation.values[0].formatted,
                    };

                    results.consecutivesUsed.push(currentConsecutive.formatted);
                  } catch (consecutiveError) {
                    logger.error(
                      `Error reservando consecutivo centralizado: ${consecutiveError.message}`
                    );
                    currentConsecutive = null;
                  }
                } else {
                  const consecutive = await this.generateConsecutive(
                    mapping.consecutiveConfig,
                    targetConnection
                  );
                  if (consecutive.success) {
                    currentConsecutive = consecutive;
                    results.consecutivesUsed.push(consecutive.formatted);
                  }
                }
              }

              // Filtrar datos para este documento específico
              const documentData = unifiedProcessedData.filter(
                (record) =>
                  record[mapping.bonificationConfig.orderField] === documentId
              );

              if (documentData.length === 0) {
                logger.warn(
                  `No se encontraron datos procesados para documento ${documentId}`
                );
                results.skipped++;
                continue;
              }

              const processingResult = await this.processSingleDocumentSimple(
                documentId,
                mapping,
                sourceConnection,
                targetConnection,
                currentConsecutive,
                documentData
              );

              if (processingResult.success) {
                results.processed++;
                successfulDocuments.push(documentId);

                if (processingResult.documentType !== "unknown") {
                  results.byType[processingResult.documentType] =
                    (results.byType[processingResult.documentType] || 0) + 1;
                }

                results.details.push({
                  documentId,
                  success: true,
                  message: processingResult.message,
                  documentType: processingResult.documentType,
                  consecutiveUsed: processingResult.consecutiveUsed,
                  consecutiveValue: processingResult.consecutiveValue,
                  processedTables: processingResult.processedTables || [],
                });

                if (mapping.markProcessedStrategy === "individual") {
                  try {
                    await this.markDocumentAsProcessed(
                      documentId,
                      mapping,
                      sourceConnection
                    );
                  } catch (markError) {
                    logger.warn(
                      `Error marcando documento ${documentId}: ${markError.message}`
                    );
                  }
                }
              } else {
                results.failed++;
                failedDocuments.push(documentId);
                hasErrors = true;

                results.details.push({
                  documentId,
                  success: false,
                  message: processingResult.message,
                  error: processingResult.error,
                });
              }

              logger.info(
                `📄 Documento ${documentId}: ${
                  processingResult.success ? "Éxito" : "Error"
                }`
              );
            } catch (docError) {
              if (signal?.aborted) {
                throw new Error("Tarea cancelada por el usuario");
              }

              failedDocuments.push(documentId);
              logger.error(
                `Error procesando documento ${documentId}: ${docError.message}`
              );
              results.failed++;
              results.details.push({
                documentId,
                success: false,
                error: docError.message,
                errorDetails: docError.stack,
              });
            }
          }
        } catch (bonifError) {
          logger.error(
            `❌ Error en procesamiento unificado de bonificaciones: ${bonifError.message}`
          );
          throw bonifError;
        }
      } else {
        // Procesamiento individual estándar
        const individualResults = await this.processDocumentsIndividually(
          documentIds,
          mapping,
          sourceConnection,
          targetConnection,
          useCentralizedConsecutives,
          centralizedConsecutiveId,
          signal
        );

        Object.assign(results, individualResults);
      }

      // Marcado en lotes al final si está configurado así
      if (
        mapping.markProcessedStrategy === "batch" &&
        successfulDocuments.length > 0
      ) {
        logger.info(
          `📦 Iniciando marcado en lotes para ${successfulDocuments.length} documentos exitosos`
        );

        try {
          const markResult = await this.markDocumentsAsProcessed(
            successfulDocuments,
            mapping,
            sourceConnection,
            true
          );

          logger.info(
            `📦 Resultado del marcado en lotes: ${markResult.message}`
          );
          results.markingResult = markResult;

          if (markResult.failed > 0) {
            logger.warn(
              `⚠️ ${markResult.failed} documentos exitosos no se pudieron marcar como procesados`
            );
          }
        } catch (markError) {
          logger.error(`❌ Error en marcado por lotes: ${markError.message}`);
          results.markingError = markError.message;
        }
      }

      // Rollback si está habilitado y hay fallos críticos
      if (
        mapping.markProcessedConfig?.allowRollback &&
        failedDocuments.length > 0 &&
        mapping.markProcessedStrategy === "batch" &&
        successfulDocuments.length > 0
      ) {
        logger.warn(
          `🔄 Rollback habilitado: desmarcando ${successfulDocuments.length} documentos debido a fallos`
        );

        try {
          await this.markDocumentsAsProcessed(
            successfulDocuments,
            mapping,
            sourceConnection,
            false
          );
          logger.info(`🔄 Rollback completado: documentos desmarcados`);
          results.rollbackExecuted = true;
        } catch (rollbackError) {
          logger.error(`❌ Error en rollback: ${rollbackError.message}`);
          results.rollbackError = rollbackError.message;
        }
      }

      // Actualizar registro de ejecución
      const executionTime = Date.now() - startTime;

      let finalStatus = "completed";
      if (results.processed === 0 && results.failed > 0) {
        finalStatus = "failed";
      } else if (results.failed > 0) {
        finalStatus = "partial";
      }

      await TaskExecution.findByIdAndUpdate(executionId, {
        status: finalStatus,
        executionTime,
        totalRecords: documentIds.length,
        successfulRecords: results.processed,
        failedRecords: results.failed,
        details: results,
      });

      await TransferTask.findByIdAndUpdate(mapping.taskId, {
        status: finalStatus,
        progress: 100,
        lastExecutionDate: new Date(),
        lastExecutionResult: {
          success: !hasErrors,
          message: hasErrors
            ? `Procesamiento completado con errores: ${results.processed} éxitos, ${results.failed} fallos`
            : "Procesamiento completado con éxito",
          affectedRecords: results.processed,
          errorDetails: hasErrors
            ? results.details.filter((d) => !d.success)
            : undefined,
        },
      });

      clearTimeout(timeoutId);
      return results;
    } catch (error) {
      clearTimeout(timeoutId);

      logger.error(`Error durante el procesamiento: ${error.message}`);

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
          progress: 0,
          lastExecutionDate: new Date(),
          lastExecutionResult: {
            success: false,
            message: error.message,
          },
        });
      }

      throw error;
    } finally {
      if (sourceConnection) {
        await ConnectionService.releaseConnection(sourceConnection);
      }
      if (targetConnection) {
        await ConnectionService.releaseConnection(targetConnection);
      }
    }
  }

  /**
   * Procesa documentos individualmente
   */
  async processDocumentsIndividually(
    documentIds,
    mapping,
    sourceConnection,
    targetConnection,
    useCentralizedConsecutives,
    centralizedConsecutiveId,
    signal
  ) {
    const results = {
      processed: 0,
      failed: 0,
      skipped: 0,
      byType: {},
      details: [],
      consecutivesUsed: [],
    };

    const successfulDocuments = [];
    const failedDocuments = [];

    for (let i = 0; i < documentIds.length; i++) {
      if (signal.aborted) {
        throw new Error("Tarea cancelada por el usuario");
      }

      const documentId = documentIds[i];
      let currentConsecutive = null;

      try {
        // Generación de consecutivos
        if (mapping.consecutiveConfig && mapping.consecutiveConfig.enabled) {
          if (useCentralizedConsecutives) {
            try {
              const reservation =
                await ConsecutiveService.reserveConsecutiveValues(
                  centralizedConsecutiveId,
                  1,
                  { segment: null },
                  { id: mapping._id.toString(), name: "mapping" }
                );

              currentConsecutive = {
                value: reservation.values[0].numeric,
                formatted: reservation.values[0].formatted,
              };

              results.consecutivesUsed.push(currentConsecutive.formatted);
            } catch (consecutiveError) {
              logger.error(
                `Error reservando consecutivo centralizado: ${consecutiveError.message}`
              );
              currentConsecutive = null;
            }
          } else {
            const consecutive = await this.generateConsecutive(
              mapping.consecutiveConfig,
              targetConnection
            );
            if (consecutive.success) {
              currentConsecutive = consecutive;
              results.consecutivesUsed.push(consecutive.formatted);
            }
          }
        }

        const processingResult = await this.processSingleDocumentSimple(
          documentId,
          mapping,
          sourceConnection,
          targetConnection,
          currentConsecutive
        );

        if (processingResult.success) {
          results.processed++;
          successfulDocuments.push(documentId);

          if (processingResult.documentType !== "unknown") {
            results.byType[processingResult.documentType] =
              (results.byType[processingResult.documentType] || 0) + 1;
          }

          results.details.push({
            documentId,
            success: true,
            message: processingResult.message,
            documentType: processingResult.documentType,
            consecutiveUsed: processingResult.consecutiveUsed,
            consecutiveValue: processingResult.consecutiveValue,
            processedTables: processingResult.processedTables || [],
          });

          if (mapping.markProcessedStrategy === "individual") {
            try {
              await this.markDocumentAsProcessed(
                documentId,
                mapping,
                sourceConnection
              );
            } catch (markError) {
              logger.warn(
                `Error marcando documento ${documentId}: ${markError.message}`
              );
            }
          }
        } else {
          results.failed++;
          failedDocuments.push(documentId);

          results.details.push({
            documentId,
            success: false,
            message: processingResult.message,
            error: processingResult.error,
          });
        }

        logger.info(
          `📄 Documento ${documentId}: ${
            processingResult.success ? "Éxito" : "Error"
          }`
        );
      } catch (docError) {
        if (signal?.aborted) {
          throw new Error("Tarea cancelada por el usuario");
        }

        failedDocuments.push(documentId);
        logger.error(
          `Error procesando documento ${documentId}: ${docError.message}`
        );
        results.failed++;
        results.details.push({
          documentId,
          success: false,
          error: docError.message,
          errorDetails: docError.stack,
        });
      }
    }

    return results;
  }

  /**
   * Procesa un campo individual - MÉTODO UNIFICADO
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

    // Para bonificaciones, campos especiales
    if (mapping.hasBonificationProcessing && mapping.bonificationConfig) {
      const config = mapping.bonificationConfig;
      if (
        fieldMapping.targetField === config.lineNumberField &&
        sourceData[config.lineNumberField]
      ) {
        return {
          value: sourceData[config.lineNumberField],
          isDirectSql: false,
        };
      }
      if (
        fieldMapping.targetField === config.bonificationLineReferenceField &&
        sourceData[config.bonificationLineReferenceField] !== undefined
      ) {
        return {
          value: sourceData[config.bonificationLineReferenceField],
          isDirectSql: false,
        };
      }
    }

    // PRIORIDAD 1: Usar valores obtenidos por lookup si existen
    if (
      fieldMapping.lookupFromTarget &&
      lookupResults[fieldMapping.targetField] !== undefined
    ) {
      value = lookupResults[fieldMapping.targetField];
      logger.debug(
        `Usando valor de lookup para ${fieldMapping.targetField}: ${value}`
      );
      return { value, isDirectSql: false };
    }

    // PRIORIDAD 2: Verificar si el campo es una función SQL nativa
    const defaultValue = fieldMapping.defaultValue;
    const sqlNativeFunctions = [
      "GETDATE()",
      "CURRENT_TIMESTAMP",
      "NEWID()",
      "SYSUTCDATETIME()",
      "SYSDATETIME()",
      "GETUTCDATE()",
      "DAY(",
      "MONTH(",
      "YEAR(",
      "GETDATE",
      "DATEADD",
      "DATEDIFF",
    ];

    const isNativeFunction =
      typeof defaultValue === "string" &&
      sqlNativeFunctions.some((func) =>
        defaultValue.trim().toUpperCase().includes(func)
      );

    if (isNativeFunction) {
      logger.debug(
        `Detectada función SQL nativa para ${fieldMapping.targetField}: ${defaultValue}`
      );
      return { value: defaultValue, isDirectSql: true };
    }

    // PASO 1: Obtener valor del origen o usar valor por defecto
    if (fieldMapping.sourceField) {
      value = sourceData[fieldMapping.sourceField];
      logger.debug(`Valor original de ${fieldMapping.sourceField}: ${value}`);

      // PASO 2: Aplicar eliminación de prefijo específico si está configurado
      if (
        fieldMapping.removePrefix &&
        typeof value === "string" &&
        value.startsWith(fieldMapping.removePrefix)
      ) {
        const originalValue = value;
        value = value.substring(fieldMapping.removePrefix.length);
        logger.debug(
          `Prefijo '${fieldMapping.removePrefix}' eliminado del campo ${fieldMapping.sourceField}: '${originalValue}' → '${value}'`
        );
      }
    } else {
      value = defaultValue === "NULL" ? null : defaultValue;
    }

    // Si el valor es undefined/null pero hay un valor por defecto
    if ((value === undefined || value === null) && defaultValue !== undefined) {
      value = defaultValue === "NULL" ? null : defaultValue;
    }

    // PASO 3: Aplicar mapeo de valores si está configurado
    if (
      value !== null &&
      value !== undefined &&
      fieldMapping.valueMappings &&
      Array.isArray(fieldMapping.valueMappings) &&
      fieldMapping.valueMappings.length > 0
    ) {
      const valueMapping = fieldMapping.valueMappings.find(
        (vm) => vm.sourceValue === value
      );
      if (valueMapping) {
        logger.debug(
          `Mapeo de valor aplicado para ${fieldMapping.targetField}: ${value} → ${valueMapping.targetValue}`
        );
        value = valueMapping.targetValue;
      }
    }

    // PASO 4: Aplicar conversión de unidades si está habilitada
    if (mapping.hasBonificationProcessing && mapping.bonificationConfig) {
      const config = mapping.bonificationConfig;
      if (
        fieldMapping.targetField === config.lineNumberField &&
        sourceData[config.lineNumberField]
      ) {
        return {
          value: sourceData[config.lineNumberField],
          isDirectSql: false,
        };
      }
      if (
        fieldMapping.targetField === config.bonificationLineReferenceField &&
        sourceData[config.bonificationLineReferenceField] !== undefined
      ) {
        return {
          value: sourceData[config.bonificationLineReferenceField],
          isDirectSql: false,
        };
      }
    }

    // PASO 5: Verificar y ajustar longitud de strings
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

    // PASO 6: Asignar consecutivo si corresponde
    if (
      currentConsecutive &&
      mapping.consecutiveConfig &&
      mapping.consecutiveConfig.enabled &&
      this.shouldReceiveConsecutive(
        fieldMapping,
        mapping.consecutiveConfig,
        tableConfig,
        isDetailTable
      )
    ) {
      value = currentConsecutive.formatted;
      logger.debug(
        `Consecutivo asignado para ${fieldMapping.targetField}: ${value}`
      );
    }

    return { value, isDirectSql: false };
  }

  /**
   * Aplica conversión de unidades a un valor específico
   */
  applyUnitConversion(sourceData, fieldMapping, originalValue) {
    try {
      logger.info(
        `🔄 Iniciando conversión para campo: ${fieldMapping.targetField}`
      );

      if (
        !fieldMapping.unitConversion ||
        !fieldMapping.unitConversion.enabled
      ) {
        logger.debug(
          `❌ Conversión no habilitada para ${fieldMapping.targetField}`
        );
        return originalValue;
      }

      const config = fieldMapping.unitConversion;

      if (
        !config.unitMeasureField ||
        !config.conversionFactorField ||
        !config.fromUnit ||
        !config.toUnit
      ) {
        logger.error(
          `⚠️ Configuración de conversión incompleta para ${fieldMapping.targetField}:`,
          {
            unitMeasureField: config.unitMeasureField,
            conversionFactorField: config.conversionFactorField,
            fromUnit: config.fromUnit,
            toUnit: config.toUnit,
            operation: config.operation,
          }
        );
        return originalValue;
      }

      // Buscar los campos con diferentes variaciones de nombres
      let unitMeasureValue = null;
      let conversionFactorValue = null;

      const possibleUnitFields = [
        config.unitMeasureField,
        "Unit_Measure",
        "UNIT_MEASURE",
        "UNI_MED",
        "UNIDAD",
        "TIPO_UNIDAD",
      ];

      const possibleFactorFields = [
        config.conversionFactorField,
        "Factor_Conversion",
        "FACTOR_CONVERSION",
        "CNT_MAX",
        "FACTOR",
        "CONV_FACTOR",
      ];

      for (const fieldName of possibleUnitFields) {
        if (
          sourceData[fieldName] !== undefined &&
          sourceData[fieldName] !== null
        ) {
          unitMeasureValue = sourceData[fieldName];
          break;
        }
      }

      for (const fieldName of possibleFactorFields) {
        if (
          sourceData[fieldName] !== undefined &&
          sourceData[fieldName] !== null
        ) {
          conversionFactorValue = sourceData[fieldName];
          break;
        }
      }

      if (unitMeasureValue === undefined || unitMeasureValue === null) {
        logger.warn(
          `⚠️ Campo de unidad de medida no encontrado en datos de origen`
        );
        return originalValue;
      }

      if (
        conversionFactorValue === undefined ||
        conversionFactorValue === null
      ) {
        logger.warn(
          `⚠️ Campo de factor de conversión no encontrado en datos de origen`
        );
        return originalValue;
      }

      const factor = parseFloat(conversionFactorValue);
      if (isNaN(factor) || factor <= 0) {
        logger.warn(
          `⚠️ Factor de conversión inválido: ${conversionFactorValue}`
        );
        return originalValue;
      }

      const numericValue = parseFloat(originalValue);
      if (isNaN(numericValue)) {
        logger.warn(
          `⚠️ Valor original no numérico: ${originalValue}, manteniéndolo sin cambios`
        );
        return originalValue;
      }

      // Aplicar conversión según operación configurada
      let convertedValue;
      const operation = config.operation || "multiply";

      if (operation === "multiply") {
        convertedValue = numericValue * factor;
      } else if (operation === "divide") {
        if (factor === 0) {
          logger.warn(
            `⚠️ División por cero evitada para campo ${fieldMapping.targetField}`
          );
          return originalValue;
        }
        convertedValue = numericValue / factor;
      } else {
        logger.warn(
          `⚠️ Operación de conversión no reconocida: ${operation}. Usando 'multiply' por defecto`
        );
        convertedValue = numericValue * factor;
      }

      if (config.decimals !== undefined && config.decimals >= 0) {
        convertedValue = parseFloat(convertedValue.toFixed(config.decimals));
      }

      logger.info(
        `✅ Conversión exitosa para ${fieldMapping.targetField}: ${originalValue} → ${convertedValue} (factor: ${factor}, operación: ${operation})`
      );

      return convertedValue;
    } catch (error) {
      logger.error(
        `❌ Error en conversión de unidades para ${fieldMapping.targetField}: ${error.message}`
      );
      return originalValue;
    }
  }

  /**
   * Obtiene la longitud máxima de una columna
   */
  async getColumnMaxLength(
    targetConnection,
    targetTable,
    targetField,
    columnLengthCache
  ) {
    try {
      if (columnLengthCache && columnLengthCache.has(targetField)) {
        return columnLengthCache.get(targetField).maxLength || 0;
      }

      const query = `
        SELECT CHARACTER_MAXIMUM_LENGTH
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = @tableName AND COLUMN_NAME = @columnName
      `;

      const result = await SqlService.query(targetConnection, query, {
        tableName: targetTable,
        columnName: targetField,
      });

      const maxLength = result.recordset?.[0]?.CHARACTER_MAXIMUM_LENGTH || 0;

      if (columnLengthCache) {
        columnLengthCache.set(targetField, { maxLength });
      }

      return maxLength;
    } catch (error) {
      logger.debug(
        `No se pudo obtener longitud para ${targetField}: ${error.message}`
      );
      return 0;
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
          Array.isArray(consecutiveConfig.applyToTables) &&
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
          Array.isArray(consecutiveConfig.applyToTables) &&
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
    if (!Array.isArray(detailTables)) {
      logger.warn(`processDetailTables: detailTables no es un array`);
      return;
    }

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
      // Para bonificaciones, usar todos los datos ya filtrados
      let detailsData;
      if (Array.isArray(sourceData)) {
        // Si sourceData es un array (caso bonificaciones), usar directamente
        detailsData = sourceData;
      } else {
        // Obtener detalles de forma tradicional
        detailsData = await this.getDetailData(
          detailConfig,
          parentTableConfig,
          documentId,
          sourceConnection
        );
      }

      if (!detailsData || detailsData.length === 0) {
        logger.warn(
          `No se encontraron detalles en ${detailConfig.sourceTable} para documento ${documentId}`
        );
        continue;
      }

      logger.info(
        `Procesando ${detailsData.length} registros de detalle en ${detailConfig.name}`
      );

      for (const detailRow of detailsData) {
        await this.processTable(
          detailConfig,
          Array.isArray(sourceData) ? sourceData[0] : sourceData, // Datos del encabezado
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
   * Obtiene los campos requeridos de una configuración de tabla
   */
  getRequiredFieldsFromTableConfig(tableConfig) {
    const requiredFields = new Set();

    if (tableConfig.fieldMappings && Array.isArray(tableConfig.fieldMappings)) {
      tableConfig.fieldMappings.forEach((mapping) => {
        if (mapping.sourceField) {
          requiredFields.add(mapping.sourceField);
        }

        if (mapping.lookupParams && Array.isArray(mapping.lookupParams)) {
          mapping.lookupParams.forEach((param) => {
            if (param.sourceField) {
              requiredFields.add(param.sourceField);
            }
          });
        }
      });
    }

    if (requiredFields.size === 0) {
      return ["*"];
    }

    return Array.from(requiredFields);
  }

  /**
   * Procesa condición de filtro añadiendo alias de tabla
   */
  processFilterCondition(filterCondition, tableAlias) {
    return filterCondition.replace(/\b(\w+)\b/g, (match, field) => {
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
      return match;
    });
  }

  /**
   * Determina el tipo de documento basado en las reglas
   */
  determineDocumentType(documentTypeRules, sourceData) {
    if (!Array.isArray(documentTypeRules)) {
      return "unknown";
    }

    for (const rule of documentTypeRules) {
      const fieldValue = sourceData[rule.sourceField];
      if (rule.sourceValues && rule.sourceValues.includes(fieldValue)) {
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
   * Obtiene el campo de clave primaria del destino
   */
  getTargetPrimaryKeyField(tableConfig) {
    return tableConfig.targetPrimaryKey || tableConfig.primaryKey || "ID";
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

    const dataForProcessing = isDetailTable
      ? { ...sourceData, ...detailRow }
      : sourceData;

    let lookupResults = {};

    const hasLookupFields =
      tableConfig.fieldMappings &&
      Array.isArray(tableConfig.fieldMappings) &&
      tableConfig.fieldMappings.some((fm) => fm.lookupFromTarget);

    if (hasLookupFields) {
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

    if (
      !tableConfig.fieldMappings ||
      !Array.isArray(tableConfig.fieldMappings)
    ) {
      logger.error(
        `processTable: fieldMappings no está configurado para tabla ${tableConfig.name}`
      );
      throw new Error(
        `Configuración de campos faltante para tabla ${tableConfig.name}`
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

      if (!mapping.tableConfigs || !Array.isArray(mapping.tableConfigs)) {
        logger.error(
          `processSingleDocumentSimple: tableConfigs no está configurado correctamente`
        );
        return {
          success: false,
          message: "Configuración de tablas no válida",
          documentType,
          consecutiveUsed: null,
          consecutiveValue: null,
        };
      }

      const mainTables = mapping.tableConfigs
        .filter((tc) => !tc.isDetailTable)
        .sort((a, b) => (a.executionOrder || 0) - (b.executionOrder || 0));

      for (const tableConfig of mainTables) {
        let tableSourceData;
        if (sourceData && sourceData.length > 0) {
          tableSourceData =
            sourceData.find(
              (record) =>
                record[mapping.bonificationConfig?.orderField] === documentId
            ) || sourceData[0];
        } else {
          const allSourceData = await this.getSourceDataForDocuments(
            [documentId],
            mapping,
            sourceConnection
          );
          tableSourceData = allSourceData[0];
        }

        if (!tableSourceData) {
          logger.warn(
            `No se encontraron datos de origen para documento ${documentId} en tabla ${tableConfig.sourceTable}`
          );
          continue;
        }

        documentType = this.determineDocumentType(
          mapping.documentTypeRules || [],
          tableSourceData
        );
        if (documentType !== "unknown") {
          logger.info(`Tipo de documento determinado: ${documentType}`);
        }

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

        const detailTables = mapping.tableConfigs.filter(
          (tc) => tc.isDetailTable && tc.parentTableRef === tableConfig.name
        );

        if (detailTables.length > 0) {
          const detailSourceData =
            sourceData && sourceData.length > 0
              ? sourceData.filter(
                  (record) =>
                    record[mapping.bonificationConfig?.orderField] ===
                    documentId
                )
              : tableSourceData;

          await this.processDetailTables(
            detailTables,
            documentId,
            detailSourceData,
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
      logger.error(
        `Error procesando documento ${documentId}: ${error.message}`
      );
      return {
        success: false,
        message: error.message,
        error: error.stack,
        documentType,
        processedTables,
        consecutiveUsed: null,
        consecutiveValue: null,
      };
    }
  }

  /**
   * Genera un consecutivo según la configuración
   */
  async generateConsecutive(consecutiveConfig, targetConnection) {
    try {
      if (!consecutiveConfig || !consecutiveConfig.enabled) {
        return { success: false };
      }

      // Generar número consecutivo
      const lastValue = consecutiveConfig.lastValue || 0;
      const newValue = lastValue + 1;

      // Formatear según el patrón si existe
      let formattedValue = String(newValue);

      if (consecutiveConfig.pattern) {
        formattedValue = this.formatConsecutive(consecutiveConfig.pattern, {
          PREFIX: consecutiveConfig.prefix || "",
          VALUE: newValue,
          YEAR: new Date().getFullYear(),
          MONTH: String(new Date().getMonth() + 1).padStart(2, "0"),
          DAY: String(new Date().getDate()).padStart(2, "0"),
        });
      } else if (consecutiveConfig.prefix) {
        formattedValue = `${consecutiveConfig.prefix}${newValue}`;
      }

      return {
        success: true,
        value: newValue,
        formatted: formattedValue,
      };
    } catch (error) {
      logger.error(`Error al generar consecutivo: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Formatea un consecutivo según un patrón
   */
  // formatConsecutive(pattern, values) {
  //   let formatted = pattern;

  //   for (const [key, value] of Object.entries(values)) {
  //     const regex = new RegExp(`\\{${key}\\}`, "g");
  //     formatted = formatted.replace(regex, value);
  //   }

  //   return formatted;
  // }

  /**
   * Formatea un consecutivo según el patrón
   * @param {string} pattern - Patrón de formato
   * @param {Object} values - Valores a reemplazar
   * @returns {string} - Consecutivo formateado
   */
  formatConsecutive(pattern, values) {
    let result = pattern;

    // Reemplazar variables simples
    for (const [key, value] of Object.entries(values)) {
      result = result.replace(new RegExp(`{${key}}`, "g"), value);
    }

    // Reemplazar variables con formato (ej: {VALUE:6} -> "000123")
    const formatRegex = /{([A-Z]+):(\d+)}/g;
    const matches = [...pattern.matchAll(formatRegex)];

    for (const match of matches) {
      const [fullMatch, key, digits] = match;
      if (values[key] !== undefined) {
        const paddedValue = String(values[key]).padStart(
          parseInt(digits, 10),
          "0"
        );
        result = result.replace(fullMatch, paddedValue);
      }
    }

    return result;
  }

  /**
   * Actualiza el último consecutivo usado en la configuración
   */
  // async updateLastConsecutive(mappingId, newValue) {
  //   try {
  //     await TransferMapping.findByIdAndUpdate(mappingId, {
  //       "consecutiveConfig.lastValue": newValue,
  //     });
  //     logger.debug(
  //       `Último consecutivo actualizado a ${newValue} para mapeo ${mappingId}`
  //     );
  //   } catch (error) {
  //     logger.error(`Error actualizando último consecutivo: ${error.message}`);
  //   }
  // }

  /**
   * Actualiza el último valor consecutivo en la configuración
   * @param {string} mappingId - ID de la configuración
   * @param {number} lastValue - Último valor usado
   * @returns {Promise<boolean>} - true si se actualizó correctamente
   */
  async updateLastConsecutive(mappingId, lastValue) {
    try {
      const result = await TransferMapping.findOneAndUpdate(
        { _id: mappingId, "consecutiveConfig.lastValue": { $lt: lastValue } },
        { "consecutiveConfig.lastValue": lastValue },
        { new: true }
      );

      if (result) {
        logger.info(
          `Último consecutivo actualizado para ${mappingId}: ${lastValue}`
        );
        return true;
      } else {
        logger.debug(
          `No se actualizó el consecutivo para ${mappingId} porque ya existe un valor igual o mayor`
        );
        return false;
      }
    } catch (error) {
      logger.error(`Error al actualizar último consecutivo: ${error.message}`);
      return false;
    }
  }

  /**
   * Marca un documento como procesado
   */
  async markDocumentAsProcessed(documentId, mapping, sourceConnection) {
    try {
      if (!mapping.markProcessedField) {
        logger.debug(
          `Campo de marcado no configurado, omitiendo marcado para documento ${documentId}`
        );
        return { success: true, message: "Marcado no configurado" };
      }

      const markValue =
        mapping.markProcessedValue !== undefined
          ? mapping.markProcessedValue
          : 1;

      // Determinar la tabla origen principal
      const mainTableConfig = mapping.tableConfigs?.find(
        (tc) => !tc.isDetailTable
      );
      const sourceTable = mainTableConfig?.sourceTable || "FAC_ENC_PED";
      const primaryKey = mainTableConfig?.primaryKey || "NUM_PED";

      const updateQuery = `
        UPDATE ${sourceTable}
        SET ${mapping.markProcessedField} = @markValue
        WHERE ${primaryKey} = @documentId
      `;

      logger.debug(
        `Marcando documento ${documentId} como procesado: ${updateQuery}`
      );

      const result = await SqlService.query(sourceConnection, updateQuery, {
        markValue,
        documentId,
      });

      if (result.rowsAffected?.[0] > 0) {
        logger.info(`✅ Documento ${documentId} marcado como procesado`);
        return {
          success: true,
          message: `Documento ${documentId} marcado como procesado`,
          rowsAffected: result.rowsAffected[0],
        };
      } else {
        logger.warn(
          `⚠️ No se encontró el documento ${documentId} para marcado`
        );
        return {
          success: false,
          message: `Documento ${documentId} no encontrado para marcado`,
        };
      }
    } catch (error) {
      logger.error(
        `❌ Error marcando documento ${documentId}: ${error.message}`
      );
      return {
        success: false,
        message: `Error marcando documento: ${error.message}`,
        error: error.stack,
      };
    }
  }

  /**
   * Marca múltiples documentos como procesados (lote)
   */
  async markDocumentsAsProcessed(
    documentIds,
    mapping,
    sourceConnection,
    markAsProcessed = true
  ) {
    try {
      if (!mapping.markProcessedField) {
        logger.debug(
          `Campo de marcado no configurado, omitiendo marcado en lotes`
        );
        return {
          success: true,
          message: "Marcado no configurado",
          processed: 0,
          failed: 0,
        };
      }

      if (!Array.isArray(documentIds) || documentIds.length === 0) {
        return {
          success: true,
          message: "No hay documentos para marcar",
          processed: 0,
          failed: 0,
        };
      }

      const markValue = markAsProcessed
        ? mapping.markProcessedValue !== undefined
          ? mapping.markProcessedValue
          : 1
        : mapping.markUnprocessedValue !== undefined
        ? mapping.markUnprocessedValue
        : 0;

      const mainTableConfig = mapping.tableConfigs?.find(
        (tc) => !tc.isDetailTable
      );
      const sourceTable = mainTableConfig?.sourceTable || "FAC_ENC_PED";
      const primaryKey = mainTableConfig?.primaryKey || "NUM_PED";

      // Construir consulta con parámetros IN
      const inClause = documentIds.map((_, index) => `@doc${index}`).join(", ");
      const parameters = { markValue };
      documentIds.forEach((id, index) => {
        parameters[`doc${index}`] = id;
      });

      const updateQuery = `
        UPDATE ${sourceTable}
        SET ${mapping.markProcessedField} = @markValue
        WHERE ${primaryKey} IN (${inClause})
      `;

      const action = markAsProcessed ? "procesados" : "no procesados";
      logger.info(
        `📦 Marcando ${documentIds.length} documentos como ${action} en lote`
      );
      logger.debug(`Consulta de marcado: ${updateQuery}`);

      const result = await SqlService.query(
        sourceConnection,
        updateQuery,
        parameters
      );
      const rowsAffected = result.rowsAffected?.[0] || 0;

      logger.info(
        `✅ Marcado en lotes completado: ${rowsAffected}/${documentIds.length} documentos ${action}`
      );

      return {
        success: true,
        message: `${rowsAffected}/${documentIds.length} documentos marcados como ${action}`,
        processed: rowsAffected,
        failed: documentIds.length - rowsAffected,
        totalRequested: documentIds.length,
        markAsProcessed,
      };
    } catch (error) {
      logger.error(`❌ Error en marcado por lotes: ${error.message}`);
      return {
        success: false,
        message: `Error en marcado por lotes: ${error.message}`,
        processed: 0,
        failed: documentIds.length,
        error: error.stack,
      };
    }
  }

  /**
   * Realiza consultas de lookup en la base de datos destino
   */
  async lookupValuesFromTarget(tableConfig, sourceData, targetConnection) {
    try {
      logger.info(
        `Realizando consultas de lookup en base de datos destino para tabla ${tableConfig.name}`
      );

      const lookupResults = {};
      const failedLookups = [];

      if (
        !tableConfig.fieldMappings ||
        !Array.isArray(tableConfig.fieldMappings)
      ) {
        logger.warn(
          `lookupValuesFromTarget: fieldMappings no configurado para tabla ${tableConfig.name}`
        );
        return { results: {}, success: true };
      }

      const lookupFields = tableConfig.fieldMappings.filter(
        (fm) => fm.lookupFromTarget && fm.lookupQuery
      );

      if (lookupFields.length === 0) {
        logger.debug(
          `No se encontraron campos que requieran lookup en tabla ${tableConfig.name}`
        );
        return { results: {}, success: true };
      }

      logger.info(
        `Encontrados ${lookupFields.length} campos con lookupFromTarget para procesar`
      );

      for (const fieldMapping of lookupFields) {
        try {
          let lookupQuery = fieldMapping.lookupQuery;
          logger.debug(
            `Procesando lookup para campo ${fieldMapping.targetField}: ${lookupQuery}`
          );

          const params = {};
          const missingParams = [];

          // Registrar parámetros esperados
          const expectedParams = [];
          const paramRegex = /@(\w+)/g;
          let match;
          while ((match = paramRegex.exec(lookupQuery)) !== null) {
            expectedParams.push(match[1]);
          }

          logger.debug(
            `Parámetros esperados en la consulta: ${expectedParams.join(", ")}`
          );

          // Extraer parámetros de los datos de origen
          if (
            fieldMapping.lookupParams &&
            Array.isArray(fieldMapping.lookupParams) &&
            fieldMapping.lookupParams.length > 0
          ) {
            for (const param of fieldMapping.lookupParams) {
              if (!param.sourceField || !param.paramName) {
                logger.warn(
                  `Parámetro mal configurado para ${fieldMapping.targetField}: sourceField=${param.sourceField}, paramName=${param.paramName}`
                );
                continue;
              }

              const sourceValue = sourceData[param.sourceField];
              if (sourceValue === undefined || sourceValue === null) {
                logger.warn(
                  `Valor faltante en datos de origen para parámetro ${param.paramName}: campo ${param.sourceField} no encontrado o es nulo`
                );
                missingParams.push(param.paramName);
                continue;
              }

              params[param.paramName] = sourceValue;
              logger.debug(
                `Parámetro ${param.paramName} establecido con valor: ${sourceValue}`
              );
            }
          } else {
            // Fallback: usar parámetros esperados directamente de sourceData
            for (const paramName of expectedParams) {
              if (sourceData[paramName] !== undefined) {
                params[paramName] = sourceData[paramName];
                logger.debug(
                  `Parámetro ${paramName} establecido automáticamente con valor: ${sourceData[paramName]}`
                );
              } else {
                missingParams.push(paramName);
              }
            }
          }

          // Validar que todos los parámetros requeridos estén presentes
          if (missingParams.length > 0) {
            const errorMsg = `Parámetros faltantes para lookup de ${
              fieldMapping.targetField
            }: ${missingParams.join(", ")}`;
            logger.error(errorMsg);
            failedLookups.push({
              field: fieldMapping.targetField,
              error: errorMsg,
              missingParams,
            });
            continue;
          }

          // Ejecutar consulta de lookup
          logger.debug(
            `Ejecutando lookup para ${fieldMapping.targetField} con parámetros:`,
            params
          );

          const lookupResult = await SqlService.query(
            targetConnection,
            lookupQuery,
            params
          );

          if (lookupResult.recordset && lookupResult.recordset.length > 0) {
            const firstRecord = lookupResult.recordset[0];

            // Si la consulta devuelve un solo campo, usar ese valor
            const fieldNames = Object.keys(firstRecord);
            if (fieldNames.length === 1) {
              lookupResults[fieldMapping.targetField] =
                firstRecord[fieldNames[0]];
            } else {
              // Si devuelve múltiples campos, buscar uno con el mismo nombre del campo destino
              if (firstRecord[fieldMapping.targetField] !== undefined) {
                lookupResults[fieldMapping.targetField] =
                  firstRecord[fieldMapping.targetField];
              } else {
                // Usar el primer campo disponible
                lookupResults[fieldMapping.targetField] =
                  firstRecord[fieldNames[0]];
              }
            }

            logger.info(
              `✅ Lookup exitoso para ${fieldMapping.targetField}: ${
                lookupResults[fieldMapping.targetField]
              }`
            );
          } else {
            const errorMsg = `Lookup no encontró resultados para ${fieldMapping.targetField}`;
            logger.warn(errorMsg);

            // Decidir si esto es un error crítico o no
            if (fieldMapping.lookupRequired !== false) {
              failedLookups.push({
                field: fieldMapping.targetField,
                error: errorMsg,
                noResults: true,
              });
            } else {
              logger.debug(
                `Lookup opcional para ${fieldMapping.targetField}, continuando sin valor`
              );
            }
          }
        } catch (lookupError) {
          const errorMsg = `Error ejecutando lookup para ${fieldMapping.targetField}: ${lookupError.message}`;
          logger.error(errorMsg);
          failedLookups.push({
            field: fieldMapping.targetField,
            error: errorMsg,
            exception: lookupError.stack,
          });
        }
      }

      // Evaluar si hubo fallos críticos
      const success = failedLookups.length === 0;

      if (success) {
        logger.info(
          `✅ Todos los lookups completados exitosamente para tabla ${tableConfig.name}`
        );
      } else {
        logger.error(
          `❌ Fallos en lookups para tabla ${tableConfig.name}: ${failedLookups.length} campos fallaron`
        );
      }

      return {
        success,
        results: lookupResults,
        failedFields: failedLookups.length > 0 ? failedLookups : undefined,
        error:
          failedLookups.length > 0
            ? `${failedLookups.length} campos de lookup fallaron`
            : undefined,
      };
    } catch (error) {
      logger.error(
        `❌ Error general en lookupValuesFromTarget para tabla ${tableConfig.name}: ${error.message}`
      );
      return {
        success: false,
        results: {},
        error: `Error general en lookup: ${error.message}`,
        exception: error.stack,
      };
    }
  }

  /**
   * Obtiene todas las configuraciones de mapeo
   * @returns {Promise<Array>} - Lista de configuraciones
   */
  static async getMappings() {
    try {
      logger.info("📋 Obteniendo todas las configuraciones de mapeo");
      const mappings = await TransferMapping.find().sort({ name: 1 });
      logger.info(
        `✅ Se encontraron ${mappings.length} configuraciones de mapeo`
      );
      return mappings;
    } catch (error) {
      logger.error(
        `❌ Error al obtener configuraciones de mapeo: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Obtiene una configuración de mapeo por ID
   * @param {string} mappingId - ID de la configuración
   * @returns {Promise<Object>} - Configuración de mapeo
   */
  static async getMappingById(mappingId) {
    try {
      logger.info(`🔍 Obteniendo configuración de mapeo: ${mappingId}`);

      if (!mappingId) {
        throw new Error("Se requiere el ID de la configuración");
      }

      const mapping = await TransferMapping.findById(mappingId);
      if (!mapping) {
        throw new Error(`Configuración de mapeo ${mappingId} no encontrada`);
      }

      logger.info(`✅ Configuración encontrada: ${mapping.name}`);
      return mapping;
    } catch (error) {
      logger.error(
        `❌ Error al obtener configuración de mapeo: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Crea una nueva configuración de mapeo
   * @param {Object} mappingData - Datos de la configuración
   * @returns {Promise<Object>} - Configuración creada
   */
  static async createMapping(mappingData) {
    try {
      logger.info(
        `📝 Creando nueva configuración de mapeo: ${mappingData.name}`
      );

      // Validar datos requeridos
      if (!mappingData || !mappingData.name) {
        throw new Error(
          "Datos de configuración incompletos - se requiere nombre"
        );
      }

      // Crear tarea asociada si no existe
      if (!mappingData.taskId) {
        logger.info("🔧 Creando tarea por defecto para la configuración");

        let defaultQuery = "SELECT 1";

        // Generar consulta más específica si hay configuración de tablas
        if (
          mappingData.tableConfigs &&
          Array.isArray(mappingData.tableConfigs) &&
          mappingData.tableConfigs.length > 0
        ) {
          const mainTable = mappingData.tableConfigs.find(
            (tc) => !tc.isDetailTable
          );
          if (mainTable && mainTable.sourceTable) {
            defaultQuery = `SELECT * FROM ${mainTable.sourceTable}`;
            logger.info(`📋 Consulta generada: ${defaultQuery}`);
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

        const task = new TransferTask(taskData);
        await task.save();

        logger.info(`✅ Tarea por defecto creada: ${task._id}`);
        mappingData.taskId = task._id;
      }

      // Crear configuración de mapeo
      const mapping = new TransferMapping(mappingData);
      await mapping.save();

      logger.info(
        `✅ Configuración de mapeo creada exitosamente: ${mapping._id}`
      );
      return mapping;
    } catch (error) {
      logger.error(
        `❌ Error al crear configuración de mapeo: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Actualiza una configuración de mapeo existente
   * @param {string} mappingId - ID de la configuración
   * @param {Object} mappingData - Datos actualizados
   * @returns {Promise<Object>} - Configuración actualizada
   */
  static async updateMapping(mappingId, mappingData) {
    try {
      logger.info(`📝 Actualizando configuración de mapeo: ${mappingId}`);

      if (!mappingId) {
        throw new Error("Se requiere el ID de la configuración");
      }

      if (!mappingData) {
        throw new Error("No se proporcionaron datos para actualizar");
      }

      // Verificar que la configuración existe
      const existingMapping = await TransferMapping.findById(mappingId);
      if (!existingMapping) {
        throw new Error(`Configuración de mapeo ${mappingId} no encontrada`);
      }

      // Actualizar la tarea asociada si hay cambios en la configuración de tablas
      if (mappingData.tableConfigs && existingMapping.taskId) {
        try {
          const task = await TransferTask.findById(existingMapping.taskId);
          if (task) {
            const mainTable = mappingData.tableConfigs.find(
              (tc) => !tc.isDetailTable
            );
            if (mainTable && mainTable.sourceTable) {
              const newQuery = `SELECT * FROM ${mainTable.sourceTable}`;
              task.query = newQuery;
              await task.save();
              logger.info(
                `🔧 Tarea ${task._id} actualizada automáticamente con nueva consulta: ${newQuery}`
              );
            }
          }
        } catch (taskError) {
          logger.warn(
            `⚠️ Error al actualizar tarea asociada: ${taskError.message}`
          );
        }
      }

      // Crear tarea si no existe
      if (!existingMapping.taskId && !mappingData.taskId) {
        logger.info("🔧 Creando tarea faltante para configuración existente");

        let defaultQuery = "SELECT 1";
        if (
          mappingData.tableConfigs &&
          Array.isArray(mappingData.tableConfigs) &&
          mappingData.tableConfigs.length > 0
        ) {
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
          `✅ Tarea por defecto creada para mapeo existente: ${task._id}`
        );
        mappingData.taskId = task._id;
      }

      // Actualizar la configuración
      const mapping = await TransferMapping.findByIdAndUpdate(
        mappingId,
        mappingData,
        { new: true }
      );

      logger.info(
        `✅ Configuración de mapeo actualizada exitosamente: ${mapping.name}`
      );
      return mapping;
    } catch (error) {
      logger.error(
        `❌ Error al actualizar configuración de mapeo: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Elimina una configuración de mapeo
   * @param {string} mappingId - ID de la configuración
   * @returns {Promise<boolean>} - true si se eliminó correctamente
   */
  static async deleteMapping(mappingId) {
    try {
      logger.info(`🗑️ Eliminando configuración de mapeo: ${mappingId}`);

      if (!mappingId) {
        throw new Error("Se requiere el ID de la configuración");
      }

      // Obtener la configuración antes de eliminarla para limpiar dependencias
      const mapping = await TransferMapping.findById(mappingId);
      if (!mapping) {
        throw new Error(`Configuración de mapeo ${mappingId} no encontrada`);
      }

      // Eliminar tarea asociada si existe
      if (mapping.taskId) {
        try {
          await TransferTask.findByIdAndDelete(mapping.taskId);
          logger.info(`🔧 Tarea asociada eliminada: ${mapping.taskId}`);
        } catch (taskError) {
          logger.warn(
            `⚠️ Error al eliminar tarea asociada: ${taskError.message}`
          );
        }
      }

      // Eliminar configuración de mapeo
      const result = await TransferMapping.findByIdAndDelete(mappingId);
      const success = !!result;

      if (success) {
        logger.info(
          `✅ Configuración de mapeo eliminada exitosamente: ${mapping.name}`
        );
      } else {
        logger.warn(`⚠️ No se pudo eliminar la configuración: ${mappingId}`);
      }

      return success;
    } catch (error) {
      logger.error(
        `❌ Error al eliminar configuración de mapeo: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Obtiene documentos basados en la configuración de mapeo
   * @param {string} mappingId - ID de la configuración
   * @param {number} limit - Límite de documentos (opcional)
   * @param {number} offset - Offset para paginación (opcional)
   * @returns {Promise<Array>} - Lista de documentos
   */
  static async getDocumentsByMapping(mappingId, limit = 100, offset = 0) {
    let sourceConnection = null;

    try {
      logger.info(
        `📄 Obteniendo documentos para mapeo: ${mappingId} (limit: ${limit}, offset: ${offset})`
      );

      if (!mappingId) {
        throw new Error("Se requiere el ID de la configuración");
      }

      // Obtener configuración de mapeo
      const mapping = await TransferMapping.findById(mappingId);
      if (!mapping) {
        throw new Error(`Configuración de mapeo ${mappingId} no encontrada`);
      }

      // Establecer conexión al servidor origen
      sourceConnection = await ConnectionService.getConnection(
        mapping.sourceServer
      );

      // Determinar la tabla principal y el campo primario
      const mainTableConfig = mapping.tableConfigs?.find(
        (tc) => !tc.isDetailTable
      );
      if (!mainTableConfig) {
        throw new Error("No se encontró configuración de tabla principal");
      }

      const sourceTable = mainTableConfig.sourceTable;
      const primaryKey = mainTableConfig.primaryKey || "NUM_PED";

      // Construir consulta con paginación
      let query = `
        SELECT DISTINCT ${primaryKey}
        FROM ${sourceTable}
      `;

      // Agregar filtro si no está marcado como procesado
      if (mapping.markProcessedField) {
        const markValue =
          mapping.markProcessedValue !== undefined
            ? mapping.markProcessedValue
            : 1;
        query += ` WHERE (${mapping.markProcessedField} IS NULL OR ${mapping.markProcessedField} != ${markValue})`;
      }

      // Agregar ordenación y paginación
      query += `
        ORDER BY ${primaryKey}
        OFFSET ${offset} ROWS
        FETCH NEXT ${limit} ROWS ONLY
      `;

      logger.debug(`📋 Ejecutando consulta: ${query}`);

      // Ejecutar consulta
      const result = await SqlService.query(sourceConnection, query);
      const documents = result.recordset || [];

      logger.info(
        `✅ Se encontraron ${documents.length} documentos para el mapeo ${mapping.name}`
      );

      return documents;
    } catch (error) {
      logger.error(`❌ Error al obtener documentos: ${error.message}`);
      throw error;
    } finally {
      if (sourceConnection) {
        await ConnectionService.releaseConnection(sourceConnection);
      }
    }
  }

  /**
   * Valida una configuración de mapeo
   * @param {Object} mappingData - Datos de la configuración
   * @returns {Object} - Resultado de la validación
   */
  static validateMappingConfiguration(mappingData) {
    const errors = [];
    const warnings = [];

    try {
      // Validaciones básicas
      if (!mappingData.name) {
        errors.push("El nombre de la configuración es obligatorio");
      }

      if (!mappingData.sourceServer) {
        errors.push("El servidor de origen es obligatorio");
      }

      if (!mappingData.targetServer) {
        errors.push("El servidor de destino es obligatorio");
      }

      // Validar configuración de tablas
      if (
        !mappingData.tableConfigs ||
        !Array.isArray(mappingData.tableConfigs)
      ) {
        errors.push("Se requiere al menos una configuración de tabla");
      } else {
        const mainTables = mappingData.tableConfigs.filter(
          (tc) => !tc.isDetailTable
        );
        if (mainTables.length === 0) {
          errors.push("Se requiere al menos una tabla principal");
        }

        if (mainTables.length > 1) {
          warnings.push("Se encontraron múltiples tablas principales");
        }

        // Validar cada tabla
        mappingData.tableConfigs.forEach((tableConfig, index) => {
          if (!tableConfig.name) {
            errors.push(`Tabla ${index + 1}: Nombre de tabla requerido`);
          }

          if (!tableConfig.sourceTable) {
            errors.push(`Tabla ${index + 1}: Tabla de origen requerida`);
          }

          if (!tableConfig.targetTable) {
            errors.push(`Tabla ${index + 1}: Tabla de destino requerida`);
          }

          if (
            !tableConfig.fieldMappings ||
            tableConfig.fieldMappings.length === 0
          ) {
            errors.push(
              `Tabla ${index + 1}: Se requiere al menos un mapeo de campo`
            );
          }
        });
      }

      // Validar configuración de bonificaciones si está habilitada
      if (mappingData.hasBonificationProcessing) {
        if (!mappingData.bonificationConfig) {
          errors.push("Configuración de bonificaciones incompleta");
        } else {
          const config = mappingData.bonificationConfig;
          const requiredBonifFields = [
            "sourceTable",
            "bonificationIndicatorField",
            "bonificationIndicatorValue",
            "orderField",
          ];

          requiredBonifFields.forEach((field) => {
            if (!config[field]) {
              errors.push(
                `Configuración de bonificaciones: Campo ${field} requerido`
              );
            }
          });
        }
      }

      const isValid = errors.length === 0;

      logger.info(
        `🔍 Validación de configuración completada: ${
          isValid ? "VÁLIDA" : "INVÁLIDA"
        }`
      );
      if (errors.length > 0) {
        logger.error(`❌ Errores encontrados: ${errors.join(", ")}`);
      }
      if (warnings.length > 0) {
        logger.warn(`⚠️ Advertencias: ${warnings.join(", ")}`);
      }

      return {
        valid: isValid,
        errors,
        warnings,
      };
    } catch (error) {
      logger.error(`❌ Error durante validación: ${error.message}`);
      return {
        valid: false,
        errors: [`Error durante validación: ${error.message}`],
        warnings,
      };
    }
  }

  // ========================================
  // 🔧 MÉTODOS DE UTILIDAD ESTÁTICOS
  // ========================================

  /**
   * Obtiene estadísticas de una configuración de mapeo
   * @param {string} mappingId - ID de la configuración
   * @returns {Promise<Object>} - Estadísticas de la configuración
   */
  static async getMappingStats(mappingId) {
    let sourceConnection = null;

    try {
      const mapping = await TransferMapping.findById(mappingId);
      if (!mapping) {
        throw new Error(`Configuración ${mappingId} no encontrada`);
      }

      sourceConnection = await ConnectionService.getConnection(
        mapping.sourceServer
      );

      const mainTableConfig = mapping.tableConfigs?.find(
        (tc) => !tc.isDetailTable
      );
      if (!mainTableConfig) {
        throw new Error("No se encontró tabla principal");
      }

      const sourceTable = mainTableConfig.sourceTable;
      const primaryKey = mainTableConfig.primaryKey || "NUM_PED";

      // Consultar estadísticas
      const statsQuery = `
        SELECT
          COUNT(*) as totalDocuments,
          COUNT(CASE WHEN ${mapping.markProcessedField} = ${
        mapping.markProcessedValue || 1
      } THEN 1 END) as processedDocuments,
          COUNT(CASE WHEN ${mapping.markProcessedField} IS NULL OR ${
        mapping.markProcessedField
      } != ${mapping.markProcessedValue || 1} THEN 1 END) as pendingDocuments
        FROM ${sourceTable}
      `;

      const result = await SqlService.query(sourceConnection, statsQuery);
      const stats = result.recordset[0];

      return {
        totalDocuments: stats.totalDocuments || 0,
        processedDocuments: stats.processedDocuments || 0,
        pendingDocuments: stats.pendingDocuments || 0,
        processedPercentage:
          stats.totalDocuments > 0
            ? Math.round(
                (stats.processedDocuments / stats.totalDocuments) * 100
              )
            : 0,
      };
    } catch (error) {
      logger.error(`❌ Error obteniendo estadísticas: ${error.message}`);
      throw error;
    } finally {
      if (sourceConnection) {
        await ConnectionService.releaseConnection(sourceConnection);
      }
    }
  }

  /**
   * 🟢 NUEVO: Agrupa datos por un campo específico
   * @param {Array} data - Datos a agrupar
   * @param {string} field - Campo por el cual agrupar
   * @returns {Map} - Map con datos agrupados
   */
  groupByField(data, field) {
    const grouped = new Map();

    data.forEach((record) => {
      const key = record[field];
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(record);
    });

    return grouped;
  }

  /**
   * 🟢 NUEVO: Valida configuración de bonificaciones
   * @param {Object} mapping - Configuración de mapeo
   * @returns {Object} - Resultado de validación
   */
  validateBonificationConfig(mapping) {
    if (!mapping.hasBonificationProcessing) {
      return { valid: true };
    }

    const config = mapping.bonificationConfig;
    const errors = [];

    if (!config.sourceTable) errors.push("Tabla de origen requerida");
    if (!config.bonificationIndicatorField)
      errors.push("Campo indicador requerido");
    if (!config.orderField) errors.push("Campo de agrupación requerido");
    if (!config.regularArticleField)
      errors.push("Campo de artículo regular requerido");
    if (!config.bonificationReferenceField)
      errors.push("Campo de referencia de bonificación requerido");
    if (!config.lineNumberField)
      errors.push("Campo de número de línea requerido");

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  async getSourceDataWithBonifications(documentIds, mapping, connection) {
    try {
      const config = mapping.bonificationConfig;
      logger.info(
        `🎁 Procesando ${documentIds.length} documentos con bonificaciones`
      );

      const placeholders = documentIds
        .map((_, index) => `@doc${index}`)
        .join(", ");
      const params = {};
      documentIds.forEach((id, index) => {
        params[`doc${index}`] = id;
      });

      // ✅ CORREGIDO: Usar NUM_LN (campo origen) en lugar de PEDIDO_LINEA (campo destino)
      const detailQuery = `
      SELECT * FROM ${config.sourceTable}
      WHERE ${config.orderField} IN (${placeholders})
      ORDER BY ${config.orderField}, NUM_LN  -- ✅ NUM_LN existe en FAC_DET_PED
    `;

      const detailResult = await SqlService.query(
        connection,
        detailQuery,
        params
      );
      const allDetails = detailResult.recordset || [];

      logger.info(
        `📦 Obtenidos ${allDetails.length} registros de detalle para procesamiento`
      );

      if (allDetails.length === 0) {
        return [];
      }

      // Procesar cada pedido por separado
      const processedData = [];
      const groupedByOrder = this.groupByField(allDetails, config.orderField);

      for (const [orderNumber, orderDetails] of groupedByOrder) {
        logger.debug(
          `📋 Procesando pedido ${orderNumber} con ${orderDetails.length} líneas`
        );

        // Paso 1: Mapear artículos regulares a sus posiciones finales
        const articleToFinalLineMap = new Map();
        let finalLineCounter = 1;

        // Primer recorrido: asignar líneas finales a artículos regulares
        orderDetails.forEach((detail) => {
          const isBonification =
            detail[config.bonificationIndicatorField] ===
            config.bonificationIndicatorValue;

          if (!isBonification) {
            const articleCode = detail[config.regularArticleField];
            articleToFinalLineMap.set(articleCode, finalLineCounter);
            logger.debug(
              `📍 Artículo regular ${articleCode} → línea final ${finalLineCounter}`
            );
            finalLineCounter++;
          }
        });

        // Segundo recorrido: procesar todos los registros manteniendo orden de NUM_LN
        finalLineCounter = 1;

        orderDetails.forEach((detail) => {
          const isBonification =
            detail[config.bonificationIndicatorField] ===
            config.bonificationIndicatorValue;

          const processedDetail = { ...detail };

          if (isBonification) {
            const referencedArticle = detail[config.bonificationReferenceField];
            const referencedFinalLine =
              articleToFinalLineMap.get(referencedArticle);

            // ✅ Campos calculados para el DESTINO
            processedDetail.CALCULATED_PEDIDO_LINEA = finalLineCounter;
            processedDetail.CALCULATED_PEDIDO_LINEA_BONIF =
              referencedFinalLine || null;
            processedDetail[config.bonificationReferenceField] = null; // Limpiar COD_ART_RFR

            if (!referencedFinalLine) {
              logger.warn(
                `⚠️ Bonificación huérfana en pedido ${orderNumber}: artículo ${referencedArticle} no encontrado`
              );
            } else {
              logger.debug(
                `🎁 Bonificación línea ${finalLineCounter} → referencia línea ${referencedFinalLine}`
              );
            }
          } else {
            processedDetail.CALCULATED_PEDIDO_LINEA = finalLineCounter;
            processedDetail.CALCULATED_PEDIDO_LINEA_BONIF = null;
            logger.debug(
              `✅ Artículo regular línea ${finalLineCounter}: ${
                detail[config.regularArticleField]
              }`
            );
          }

          processedData.push(processedDetail);
          finalLineCounter++;
        });
      }

      logger.info(
        `✅ Procesamiento completado: ${processedData.length} registros con líneas calculadas`
      );
      return processedData;
    } catch (error) {
      logger.error(
        `Error en procesamiento de bonificaciones: ${error.message}`
      );
      throw error;
    }
  }
  /**
   * Verifica si debe aplicarse conversión basado en la unidad de medida - VERSIÓN MEJORADA
   * @param {string} currentUnit - Unidad actual
   * @param {string} fromUnit - Unidad que requiere conversión
   * @returns {boolean}
   */
  shouldApplyUnitConversion(currentUnit, fromUnit) {
    try {
      if (!currentUnit || !fromUnit) {
        logger.debug(
          `❌ Unidades faltantes: actual='${currentUnit}', configurada='${fromUnit}'`
        );
        return false;
      }

      const normalizedCurrent = String(currentUnit).toUpperCase().trim();
      const normalizedFrom = String(fromUnit).toUpperCase().trim();

      logger.debug(
        `🔍 Comparando unidades: '${normalizedCurrent}' vs '${normalizedFrom}'`
      );

      // MEJORA: Más variaciones y mejor cobertura
      const unitVariations = {
        CAJA: [
          "CAJA",
          "CJA",
          "CAJAS",
          "CJ",
          "CAJ",
          "BOX",
          "BOXES",
          "CJTA",
          "CAJITA",
        ],
        UNIDAD: [
          "UNIDAD",
          "UND",
          "UNIDADES",
          "U",
          "UN",
          "UNIT",
          "UNITS",
          "PCS",
          "PIEZAS",
          "PZ",
          "PIEZA",
        ],
        KILO: ["KILO", "KG", "KILOS", "K", "KILOGRAMO", "KILOGRAMOS", "KGR"],
        LITRO: ["LITRO", "LT", "LITROS", "L", "LTR", "LITR"],
        METRO: ["METRO", "M", "METROS", "MTS", "MT"],
        GRAMO: ["GRAMO", "G", "GRAMOS", "GR", "GRM"],
        DOCENA: ["DOCENA", "DOC", "DOCENAS", "DZ"],
        PAR: ["PAR", "PARES", "PR"],
        ROLLO: ["ROLLO", "ROLLOS", "RL", "ROLL"],
        PAQUETE: ["PAQUETE", "PAQUETES", "PAQ", "PACK", "PKG"],
      };

      // Buscar en variaciones predefinidas
      for (const [baseUnit, variations] of Object.entries(unitVariations)) {
        if (variations.includes(normalizedFrom)) {
          const isMatch = variations.includes(normalizedCurrent);
          logger.debug(
            `🔍 Verificación por variaciones '${baseUnit}': ${
              isMatch ? "✅" : "❌"
            }`
          );
          if (isMatch) return true;
        }
      }

      // MEJORA: Comparación de contenido (más flexible)
      if (
        normalizedCurrent.includes(normalizedFrom) ||
        normalizedFrom.includes(normalizedCurrent)
      ) {
        logger.debug(
          `🔍 Verificación por contenido: ✅ (una contiene a la otra)`
        );
        return true;
      }

      // MEJORA: Comparación sin espacios y caracteres especiales
      const cleanCurrent = normalizedCurrent.replace(/[^A-Z0-9]/g, "");
      const cleanFrom = normalizedFrom.replace(/[^A-Z0-9]/g, "");

      if (cleanCurrent === cleanFrom) {
        logger.debug(
          `🔍 Verificación limpia: ✅ ('${cleanCurrent}' === '${cleanFrom}')`
        );
        return true;
      }

      // MEJORA: Verificación de abreviaciones comunes
      const abbreviationMap = {
        CAJA: ["CJ", "CJA", "CAJ"],
        UNIDAD: ["UN", "UND", "U"],
        KILO: ["K", "KG"],
        LITRO: ["L", "LT"],
        METRO: ["M", "MT"],
        GRAMO: ["G", "GR"],
      };

      for (const [full, abbrevs] of Object.entries(abbreviationMap)) {
        if (
          (full === normalizedCurrent && abbrevs.includes(normalizedFrom)) ||
          (full === normalizedFrom && abbrevs.includes(normalizedCurrent)) ||
          (abbrevs.includes(normalizedCurrent) &&
            abbrevs.includes(normalizedFrom))
        ) {
          logger.debug(`🔍 Verificación por abreviación '${full}': ✅`);
          return true;
        }
      }

      // Comparación exacta final
      const exactMatch = normalizedCurrent === normalizedFrom;
      logger.debug(
        `🔍 Verificación exacta: ${
          exactMatch ? "✅" : "❌"
        } ('${normalizedCurrent}' === '${normalizedFrom}')`
      );

      if (!exactMatch) {
        logger.info(
          `❌ Unidad '${currentUnit}' no coincide con patrón '${fromUnit}' para conversión`
        );
        logger.debug(`   Normalizada actual: '${normalizedCurrent}'`);
        logger.debug(`   Normalizada configurada: '${normalizedFrom}'`);
        logger.debug(
          `   Sugerencia: Verifique la configuración de unidades o añada variaciones`
        );
      }

      return exactMatch;
    } catch (error) {
      logger.error(`💥 Error en verificación de unidades: ${error.message}`, {
        currentUnit,
        fromUnit,
        error: error.stack,
      });
      return false;
    }
  }

  /**
   * Obtiene datos de la tabla de origen - VERSIÓN CORREGIDA
   * @private
   */
  async getSourceData(documentId, tableConfig, sourceConnection) {
    if (tableConfig.customQuery) {
      // Usar consulta personalizada si existe
      const query = tableConfig.customQuery.replace(/@documentId/g, documentId);
      logger.debug(`Ejecutando consulta personalizada: ${query}`);
      const result = await SqlService.query(sourceConnection, query);
      return result.recordset[0];
    } else {
      // CAMBIO: Usar la función centralizada para obtener campos requeridos
      const requiredFields = this.getRequiredFieldsFromTableConfig(tableConfig);
      const tableAlias = "t1";

      // Construir la lista de campos con alias de tabla
      const finalSelectFields = requiredFields
        .map((field) => `${tableAlias}.${field}`)
        .join(", ");

      const primaryKey = tableConfig.primaryKey || "NUM_PED";

      const query = `
     SELECT ${finalSelectFields} FROM ${tableConfig.sourceTable} ${tableAlias}
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
   * Maneja errores de procesamiento
   * @private
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
    if (
      error.message &&
      error.message.includes("String or binary data would be truncated")
    ) {
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
    if (
      error.message &&
      error.message.includes("Cannot insert the value NULL into column")
    ) {
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
   * @param {Date|string} dateValue - Valor de fecha a formatear
   * @returns {string|null} - Fecha formateada en formato YYYY-MM-DD o null si es inválida
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
   * @private
   */
  determineErrorCode(error) {
    const message = error.message.toLowerCase();

    if (message.includes("cannot insert the value null into column")) {
      return "NULL_VALUE_ERROR";
    } else if (message.includes("string or binary data would be truncated")) {
      return "TRUNCATION_ERROR";
    } else if (message.includes("connection") || message.includes("timeout")) {
      return "CONNECTION_ERROR";
    } else if (
      message.includes("deadlock") ||
      message.includes("lock request")
    ) {
      return "DEADLOCK_ERROR";
    } else if (message.includes("duplicate key")) {
      return "DUPLICATE_KEY_ERROR";
    } else if (
      message.includes("permission") ||
      message.includes("access denied")
    ) {
      return "PERMISSION_ERROR";
    } else if (
      message.includes("incorrect syntax") ||
      message.includes("syntax error")
    ) {
      return "SQL_SYNTAX_ERROR";
    } else if (
      message.includes("conversion failed") &&
      (message.includes("date") || message.includes("time"))
    ) {
      return "DATE_CONVERSION_ERROR";
    }

    return "GENERAL_ERROR";
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

      // Construir consulta basada en filtros
      let query = `
     SELECT *
     FROM ${mainTable.sourceTable}
     WHERE 1=1
   `;

      const params = {};

      // Aplicar filtros
      if (filters.dateFrom) {
        const dateField = filters.dateField || "FEC_PED";
        query += ` AND ${dateField} >= @dateFrom`;
        params.dateFrom = new Date(filters.dateFrom);
      }

      if (filters.dateTo) {
        const dateField = filters.dateField || "FEC_PED";
        query += ` AND ${dateField} <= @dateTo`;
        params.dateTo = new Date(filters.dateTo);
      }

      if (filters.status && filters.status !== "all") {
        const statusField = filters.statusField || "ESTADO";
        query += ` AND ${statusField} = @status`;
        params.status = filters.status;
      }

      if (filters.warehouse && filters.warehouse !== "all") {
        const warehouseField = filters.warehouseField || "COD_BOD";
        query += ` AND ${warehouseField} = @warehouse`;
        params.warehouse = filters.warehouse;
      }

      // Filtrar documentos procesados
      if (!filters.showProcessed && mapping.markProcessedField) {
        query += ` AND (${mapping.markProcessedField} IS NULL)`;
      }

      // Aplicar condición adicional si existe
      if (mainTable.filterCondition) {
        query += ` AND ${mainTable.filterCondition}`;
      }

      // Ordenar por fecha descendente
      const dateField = filters.dateField || "FEC_PED";
      query += ` ORDER BY ${dateField} DESC`;

      // Ejecutar consulta con límite
      query = `SELECT TOP 500 ${query.substring(query.indexOf("SELECT ") + 7)}`;

      logger.debug(`Consulta final: ${query}`);
      const result = await SqlService.query(connection, query, params);

      logger.info(
        `Documentos obtenidos: ${
          result.recordset ? result.recordset.length : 0
        }`
      );

      return result.recordset || [];
    } catch (error) {
      logger.error(`Error al obtener documentos: ${error.message}`);
      throw error;
    }
  }

  /**
   * NUEVO: Procesa dependencias de foreign key
   * @param {string} documentId - ID del documento
   * @param {Object} mapping - Configuración de mapeo
   * @param {Object} sourceConnection - Conexión origen
   * @param {Object} targetConnection - Conexión destino
   * @param {Object} sourceData - Datos de origen
   */
  async processForeignKeyDependencies(
    documentId,
    mapping,
    sourceConnection,
    targetConnection,
    sourceData
  ) {
    if (
      !mapping.foreignKeyDependencies ||
      mapping.foreignKeyDependencies.length === 0
    ) {
      return;
    }

    // Ordenar dependencias por executionOrder
    const orderedDependencies = [...mapping.foreignKeyDependencies].sort(
      (a, b) => (a.executionOrder || 0) - (b.executionOrder || 0)
    );

    logger.info(
      `Procesando ${orderedDependencies.length} dependencias de FK en orden`
    );

    for (const dependency of orderedDependencies) {
      try {
        logger.info(
          `Procesando dependencia: ${dependency.fieldName} -> ${dependency.dependentTable}`
        );

        // Obtener el valor del campo que causa la dependencia
        const fieldValue = sourceData[dependency.fieldName];

        if (!fieldValue) {
          logger.warn(
            `Campo ${dependency.fieldName} no tiene valor, omitiendo dependencia`
          );
          continue;
        }

        // Verificar si el registro ya existe en la tabla dependiente
        const keyField = dependency.dependentFields.find((f) => f.isKey);
        if (!keyField) {
          throw new Error(
            `No se encontró campo clave para dependencia ${dependency.fieldName}`
          );
        }

        const checkQuery = `SELECT COUNT(*) as count FROM ${dependency.dependentTable} WHERE ${keyField.targetField} = @keyValue`;
        const checkResult = await SqlService.query(
          targetConnection,
          checkQuery,
          { keyValue: fieldValue }
        );
        const exists = checkResult.recordset[0].count > 0;

        if (exists) {
          logger.info(
            `Registro ya existe en ${dependency.dependentTable} para valor ${fieldValue}`
          );
          continue;
        }

        if (dependency.validateOnly) {
          throw new Error(
            `Registro requerido no existe en ${dependency.dependentTable} para valor ${fieldValue}`
          );
        }

        if (dependency.insertIfNotExists) {
          logger.info(
            `Insertando registro en ${dependency.dependentTable} para valor ${fieldValue}`
          );

          // Preparar datos para inserción
          const insertData = {};
          const insertFields = [];
          const insertValues = [];

          for (const field of dependency.dependentFields) {
            let value;

            if (field.sourceField) {
              value = sourceData[field.sourceField];
            } else if (field.defaultValue !== undefined) {
              value = field.defaultValue;
            } else if (field.isKey) {
              value = fieldValue;
            }

            if (value !== undefined) {
              insertData[field.targetField] = value;
              insertFields.push(field.targetField);
              insertValues.push(`@${field.targetField}`);
            }
          }

          if (insertFields.length > 0) {
            const insertQuery = `INSERT INTO ${
              dependency.dependentTable
            } (${insertFields.join(", ")}) VALUES (${insertValues.join(", ")})`;
            await SqlService.query(targetConnection, insertQuery, insertData);
            logger.info(
              `Registro insertado exitosamente en ${dependency.dependentTable}`
            );
          }
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
   * Ordena las tablas según sus dependencias
   */
  getTablesExecutionOrder(tableConfigs) {
    // Separar tablas principales y de detalle
    const mainTables = tableConfigs.filter((tc) => !tc.isDetailTable);
    const detailTables = tableConfigs.filter((tc) => tc.isDetailTable);

    // Ordenar tablas principales por executionOrder
    mainTables.sort(
      (a, b) => (a.executionOrder || 0) - (b.executionOrder || 0)
    );

    // Para cada tabla principal, agregar sus detalles después
    const orderedTables = [];

    for (const mainTable of mainTables) {
      orderedTables.push(mainTable);

      // Agregar tablas de detalle relacionadas
      const relatedDetails = detailTables
        .filter((dt) => dt.parentTableRef === mainTable.name)
        .sort((a, b) => (a.executionOrder || 0) - (b.executionOrder || 0));

      orderedTables.push(...relatedDetails);
    }

    // Agregar detalles huérfanos al final
    const orphanDetails = detailTables.filter(
      (dt) => !mainTables.some((mt) => mt.name === dt.parentTableRef)
    );
    orderedTables.push(...orphanDetails);

    return orderedTables;
  }

  /**
   * Marcado individual - uno por uno
   * @private
   */
  async markIndividualDocuments(documentIds, mapping, connection, shouldMark) {
    let success = 0;
    let failed = 0;
    const details = [];

    for (const documentId of documentIds) {
      try {
        const result = await this.markSingleDocument(
          documentId,
          mapping,
          connection,
          shouldMark
        );
        if (result) {
          success++;
          details.push({ documentId, success: true });
          logger.debug(`✅ Documento ${documentId} marcado individualmente`);
        } else {
          failed++;
          details.push({
            documentId,
            success: false,
            error: "No se encontró el documento",
          });
          logger.warn(`⚠️ Documento ${documentId} no se pudo marcar`);
        }
      } catch (error) {
        failed++;
        details.push({ documentId, success: false, error: error.message });
        logger.error(
          `❌ Error marcando documento ${documentId}: ${error.message}`
        );
      }
    }

    return {
      success,
      failed,
      strategy: "individual",
      total: documentIds.length,
      details,
      message: `Marcado individual: ${success} éxitos, ${failed} fallos`,
    };
  }

  /**
   * Marcado en lotes - todos de una vez
   * @private
   */
  async markBatchDocuments(documentIds, mapping, connection, shouldMark) {
    try {
      const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
      if (!mainTable) {
        return {
          success: 0,
          failed: documentIds.length,
          strategy: "batch",
          error: "No se encontró tabla principal",
        };
      }

      const config = mapping.markProcessedConfig || {};
      const batchSize = config.batchSize || 100;

      let totalSuccess = 0;
      let totalFailed = 0;
      const batchDetails = [];

      // Procesar en lotes del tamaño configurado
      for (let i = 0; i < documentIds.length; i += batchSize) {
        const batch = documentIds.slice(i, i + batchSize);

        try {
          const result = await this.executeBatchUpdate(
            batch,
            mapping,
            connection,
            shouldMark
          );
          totalSuccess += result.success;
          totalFailed += result.failed;
          batchDetails.push({
            batchNumber: Math.floor(i / batchSize) + 1,
            size: batch.length,
            success: result.success,
            failed: result.failed,
          });

          logger.info(
            `📦 Lote ${Math.floor(i / batchSize) + 1}: ${result.success}/${
              batch.length
            } documentos marcados`
          );
        } catch (batchError) {
          totalFailed += batch.length;
          batchDetails.push({
            batchNumber: Math.floor(i / batchSize) + 1,
            size: batch.length,
            success: 0,
            failed: batch.length,
            error: batchError.message,
          });
          logger.error(
            `❌ Error en lote ${Math.floor(i / batchSize) + 1}: ${
              batchError.message
            }`
          );
        }
      }

      return {
        success: totalSuccess,
        failed: totalFailed,
        strategy: "batch",
        total: documentIds.length,
        batchDetails,
        message: `Marcado en lotes: ${totalSuccess} éxitos, ${totalFailed} fallos en ${batchDetails.length} lote(s)`,
      };
    } catch (error) {
      logger.error(`❌ Error general en marcado por lotes: ${error.message}`);
      return {
        success: 0,
        failed: documentIds.length,
        strategy: "batch",
        error: error.message,
        message: `Error en marcado por lotes: ${error.message}`,
      };
    }
  }
  /**
   * Ejecuta la actualización SQL para un lote
   * @private
   */
  async executeBatchUpdate(documentIds, mapping, connection, shouldMark) {
    const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
    const config = mapping.markProcessedConfig || {};
    const primaryKey = mainTable.primaryKey || "NUM_PED";

    // Construir campos a actualizar
    let updateFields = `${mapping.markProcessedField} = @processedValue`;

    if (config.includeTimestamp && config.timestampField) {
      updateFields += `, ${config.timestampField} = GETDATE()`;
    }

    // Crear placeholders para IN clause
    const placeholders = documentIds
      .map((_, index) => `@doc${index}`)
      .join(", ");
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
   * @private
   */
  async markSingleDocument(documentId, mapping, connection, shouldMark) {
    const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
    if (!mainTable) return false;

    const config = mapping.markProcessedConfig || {};
    const primaryKey = mainTable.primaryKey || "NUM_PED";

    // Construir campos a actualizar
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

module.exports = DynamicTransferService;
