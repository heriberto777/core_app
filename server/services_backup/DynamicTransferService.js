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
      if (fieldMapping.targetField === config.lineNumberField && sourceData[config.lineNumberField]) {
        return { value: sourceData[config.lineNumberField], isDirectSql: false };
      }
      if (fieldMapping.targetField === config.bonificationLineReferenceField && sourceData[config.bonificationLineReferenceField] !== undefined) {
        return { value: sourceData[config.bonificationLineReferenceField], isDirectSql: false };
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
    if (fieldMapping.unitConversion && fieldMapping.unitConversion.enabled) {
      const originalValue = value;
      value = this.applyUnitConversion(
        sourceData,
        fieldMapping,
        originalValue
      );
      if (originalValue !== value) {
        logger.debug(
          `Conversión de unidades aplicada para ${fieldMapping.targetField}: ${originalValue} → ${value}`
        );
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

      const maxLength =
        result.recordset?.[0]?.CHARACTER_MAXIMUM_LENGTH || 0;

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
          tableSourceData = sourceData.find(
            (record) => record[mapping.bonificationConfig?.orderField] === documentId
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
          const detailSourceData = sourceData && sourceData.length > 0
            ? sourceData.filter(record => record[mapping.bonificationConfig?.orderField] === documentId)
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
      logger.info(`🔢 Generando consecutivo según configuración`);

      if (!consecutiveConfig || !consecutiveConfig.enabled) {
        logger.warn(`Configuración de consecutivo no habilitada`);
        return { success: false, message: "Consecutivo no habilitado" };
      }

      // Obtener el último consecutivo usado
      let lastValue = 0;
      if (consecutiveConfig.table && consecutiveConfig.field) {
        try {
          const query = `SELECT MAX(CAST(${consecutiveConfig.field} AS INT)) as lastValue FROM ${consecutiveConfig.table}`;
          const result = await SqlService.query(targetConnection, query);
          lastValue = result.recordset?.[0]?.lastValue || 0;
          logger.debug(`Último consecutivo encontrado: ${lastValue}`);
        } catch (error) {
          logger.warn(`Error obteniendo último consecutivo: ${error.message}`);
          lastValue = consecutiveConfig.startValue || 0;
        }
      } else {
        lastValue = consecutiveConfig.lastValue || consecutiveConfig.startValue || 0;
      }

      // Generar nuevo consecutivo
      const newValue = lastValue + 1;
      let formattedValue = String(newValue);

      // Aplicar patrón si existe
      if (consecutiveConfig.pattern) {
        formattedValue = this.formatConsecutive(consecutiveConfig.pattern, {
          PREFIX: consecutiveConfig.prefix || "",
          VALUE: newValue,
          YEAR: new Date().getFullYear(),
          MONTH: String(new Date().getMonth() + 1).padStart(2, '0'),
          DAY: String(new Date().getDate()).padStart(2, '0'),
        });
      } else if (consecutiveConfig.prefix) {
        formattedValue = consecutiveConfig.prefix + String(newValue).padStart(
          consecutiveConfig.padding || 6,
          '0'
        );
      }

      logger.info(`✅ Consecutivo generado: ${formattedValue} (valor: ${newValue})`);

      return {
        success: true,
        value: newValue,
        formatted: formattedValue,
        message: `Consecutivo generado: ${formattedValue}`
      };
    } catch (error) {
      logger.error(`❌ Error generando consecutivo: ${error.message}`);
      return {
        success: false,
        message: `Error generando consecutivo: ${error.message}`,
        error: error.stack
      };
    }
  }

  /**
   * Formatea un consecutivo según un patrón
   */
  formatConsecutive(pattern, values) {
    let formatted = pattern;

    for (const [key, value] of Object.entries(values)) {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      formatted = formatted.replace(regex, value);
    }

    return formatted;
  }

  /**
   * Actualiza el último consecutivo usado en la configuración
   */
  async updateLastConsecutive(mappingId, newValue) {
    try {
      await TransferMapping.findByIdAndUpdate(mappingId, {
        'consecutiveConfig.lastValue': newValue
      });
      logger.debug(`Último consecutivo actualizado a ${newValue} para mapeo ${mappingId}`);
    } catch (error) {
      logger.error(`Error actualizando último consecutivo: ${error.message}`);
    }
  }

  /**
   * Marca un documento como procesado
   */
  async markDocumentAsProcessed(documentId, mapping, sourceConnection) {
    try {
      if (!mapping.markProcessedField) {
        logger.debug(`Campo de marcado no configurado, omitiendo marcado para documento ${documentId}`);
        return { success: true, message: "Marcado no configurado" };
      }

      const markValue = mapping.markProcessedValue !== undefined
        ? mapping.markProcessedValue
        : 1;

      // Determinar la tabla origen principal
      const mainTableConfig = mapping.tableConfigs?.find(tc => !tc.isDetailTable);
      const sourceTable = mainTableConfig?.sourceTable || "FAC_ENC_PED";
      const primaryKey = mainTableConfig?.primaryKey || "NUM_PED";

      const updateQuery = `
        UPDATE ${sourceTable}
        SET ${mapping.markProcessedField} = @markValue
        WHERE ${primaryKey} = @documentId
      `;

      logger.debug(`Marcando documento ${documentId} como procesado: ${updateQuery}`);

      const result = await SqlService.query(sourceConnection, updateQuery, {
        markValue,
        documentId
      });

      if (result.rowsAffected?.[0] > 0) {
        logger.info(`✅ Documento ${documentId} marcado como procesado`);
        return {
          success: true,
          message: `Documento ${documentId} marcado como procesado`,
          rowsAffected: result.rowsAffected[0]
        };
      } else {
        logger.warn(`⚠️ No se encontró el documento ${documentId} para marcado`);
        return {
          success: false,
          message: `Documento ${documentId} no encontrado para marcado`
        };
      }
    } catch (error) {
      logger.error(`❌ Error marcando documento ${documentId}: ${error.message}`);
      return {
        success: false,
        message: `Error marcando documento: ${error.message}`,
        error: error.stack
      };
    }
  }

  /**
   * Marca múltiples documentos como procesados (lote)
   */
  async markDocumentsAsProcessed(documentIds, mapping, sourceConnection, markAsProcessed = true) {
    try {
      if (!mapping.markProcessedField) {
        logger.debug(`Campo de marcado no configurado, omitiendo marcado en lotes`);
        return {
          success: true,
          message: "Marcado no configurado",
          processed: 0,
          failed: 0
        };
      }

      if (!Array.isArray(documentIds) || documentIds.length === 0) {
        return {
          success: true,
          message: "No hay documentos para marcar",
          processed: 0,
          failed: 0
        };
      }

      const markValue = markAsProcessed
        ? (mapping.markProcessedValue !== undefined ? mapping.markProcessedValue : 1)
        : (mapping.markUnprocessedValue !== undefined ? mapping.markUnprocessedValue : 0);

      const mainTableConfig = mapping.tableConfigs?.find(tc => !tc.isDetailTable);
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
      logger.info(`📦 Marcando ${documentIds.length} documentos como ${action} en lote`);
      logger.debug(`Consulta de marcado: ${updateQuery}`);

      const result = await SqlService.query(sourceConnection, updateQuery, parameters);
      const rowsAffected = result.rowsAffected?.[0] || 0;

      logger.info(`✅ Marcado en lotes completado: ${rowsAffected}/${documentIds.length} documentos ${action}`);

      return {
        success: true,
        message: `${rowsAffected}/${documentIds.length} documentos marcados como ${action}`,
        processed: rowsAffected,
        failed: documentIds.length - rowsAffected,
        totalRequested: documentIds.length,
        markAsProcessed
      };
    } catch (error) {
      logger.error(`❌ Error en marcado por lotes: ${error.message}`);
      return {
        success: false,
        message: `Error en marcado por lotes: ${error.message}`,
        processed: 0,
        failed: documentIds.length,
        error: error.stack
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
            const errorMsg = `Parámetros faltantes para lookup de ${fieldMapping.targetField}: ${missingParams.join(", ")}`;
            logger.error(errorMsg);
            failedLookups.push({
              field: fieldMapping.targetField,
              error: errorMsg,
              missingParams
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
              lookupResults[fieldMapping.targetField] = firstRecord[fieldNames[0]];
            } else {
              // Si devuelve múltiples campos, buscar uno con el mismo nombre del campo destino
              if (firstRecord[fieldMapping.targetField] !== undefined) {
                lookupResults[fieldMapping.targetField] = firstRecord[fieldMapping.targetField];
              } else {
                // Usar el primer campo disponible
                lookupResults[fieldMapping.targetField] = firstRecord[fieldNames[0]];
              }
            }

            logger.info(
              `✅ Lookup exitoso para ${fieldMapping.targetField}: ${lookupResults[fieldMapping.targetField]}`
            );
          } else {
            const errorMsg = `Lookup no encontró resultados para ${fieldMapping.targetField}`;
            logger.warn(errorMsg);

            // Decidir si esto es un error crítico o no
            if (fieldMapping.lookupRequired !== false) {
              failedLookups.push({
                field: fieldMapping.targetField,
                error: errorMsg,
                noResults: true
              });
            } else {
              logger.debug(`Lookup opcional para ${fieldMapping.targetField}, continuando sin valor`);
            }
          }
        } catch (lookupError) {
          const errorMsg = `Error ejecutando lookup para ${fieldMapping.targetField}: ${lookupError.message}`;
          logger.error(errorMsg);
          failedLookups.push({
            field: fieldMapping.targetField,
            error: errorMsg,
            exception: lookupError.stack
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
        error: failedLookups.length > 0
          ? `${failedLookups.length} campos de lookup fallaron`
          : undefined
      };
    } catch (error) {
      logger.error(
        `❌ Error general en lookupValuesFromTarget para tabla ${tableConfig.name}: ${error.message}`
      );
      return {
        success: false,
        results: {},
        error: `Error general en lookup: ${error.message}`,
        exception: error.stack
      };
    }
  }
}

module.exports = DynamicTransferService;