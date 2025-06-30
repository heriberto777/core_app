const logger = require("./logger");
const ConnectionService = require("./ConnectionCentralService");
const { SqlService } = require("./SqlService");
const TransferMapping = require("../models/transferMappingModel");
const TaskExecution = require("../models/taskExecutionModel");
const TaskTracker = require("./TaskTracker");
const TransferTask = require("../models/transferTaks");
const ConsecutiveService = require("./ConsecutiveService");
const BonificationService = require("./BonificationService"); // 🟢 NUEVO: Importar servicio especializado

class DynamicTransferService {
  // 🔥 CAMBIO 1: AGREGAR CONSTRUCTOR
  constructor() {
    this.bonificationService = new BonificationService({ debug: true });
  }

  /**
   * 🟢 NUEVO: Procesa bonificaciones usando el servicio especializado
   * @param {Array} sourceData - Datos originales
   * @param {Object} mapping - Configuración de mapeo
   * @returns {Array} - Datos procesados con líneas de bonificación
   */
  async processBonifications(sourceData, mapping) {
    // 🔥 FIX: Validar que sourceData sea un array
    if (!Array.isArray(sourceData)) {
      logger.warn(
        `processBonifications: sourceData no es un array, recibido: ${typeof sourceData}`
      );
      return Array.isArray(sourceData) ? sourceData : [];
    }

    if (!mapping.hasBonificationProcessing || !mapping.bonificationConfig) {
      return sourceData; // Sin procesamiento especial
    }

    // 🟢 DELEGAR AL SERVICIO ESPECIALIZADO: Usar BonificationService para el procesamiento
    logger.info(
      `🎁 Delegando procesamiento de bonificaciones al BonificationService`
    );

    try {
      // El BonificationService espera documentIds, pero aquí tenemos datos ya cargados
      // Extraer los IDs de documentos de los datos existentes
      const config = mapping.bonificationConfig;
      const documentIds = [
        ...new Set(sourceData.map((record) => record[config.orderField])),
      ];

      logger.info(
        `🎯 Procesando bonificaciones para ${documentIds.length} documentos únicos con ${sourceData.length} registros totales`
      );

      // Como ya tenemos los datos, vamos a usar la lógica interna del servicio
      // pero adaptada para trabajar con datos ya cargados
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
   * Adaptación de la lógica del BonificationService para datos pre-cargados
   */
  async processBonificationsWithLoadedData(sourceData, mapping) {
    const config = mapping.bonificationConfig;

    // Validar configuración
    const validation = this.validateBonificationConfig(mapping);
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

    // 🔥 CAMBIO 4: Agrupar por campo de orden
    const groupedData = this.groupByField(sourceData, config.orderField);
    const processedData = [];
    let bonificationsProcessed = 0;
    let regularArticlesProcessed = 0;

    for (const [groupKey, records] of groupedData) {
      logger.debug(
        `📦 Procesando grupo ${config.orderField}=${groupKey} con ${records.length} registros`
      );

      // 🔥 CAMBIO 5: Usar la lógica del BonificationService para procesar un pedido individual
      const processedOrder = await this.processSingleOrder(
        records,
        config,
        groupKey
      );
      processedData.push(...processedOrder);

      // Contar estadísticas
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
   * 🟢 NUEVO: Procesa un pedido individual para bonificaciones
   */
  async processSingleOrder(records, config, groupKey) {
    const lineMapping = new Map(); // Mapear artículos regulares a líneas
    const bonificationQueue = [];
    const processedOrder = [];
    let lineCounter = 1;

    // Primera pasada: procesar artículos regulares
    records.forEach((record) => {
      const isBonification =
        record[config.bonificationIndicatorField] ===
        config.bonificationIndicatorValue;

      if (!isBonification) {
        // Artículo regular
        const processedRecord = {
          ...record,
          [config.lineNumberField]: lineCounter,
          [config.bonificationLineReferenceField]: null,
        };

        lineMapping.set(record[config.regularArticleField], lineCounter);
        processedOrder.push(processedRecord);
        lineCounter++;

        logger.debug(
          `✅ Artículo regular procesado: ${
            record[config.regularArticleField]
          } -> Línea ${lineCounter - 1}`
        );
      } else {
        // Es bonificación, agregar a cola
        bonificationQueue.push(record);
      }
    });

    // Segunda pasada: procesar bonificaciones
    bonificationQueue.forEach((bonification) => {
      const referencedArticle = bonification[config.bonificationReferenceField];
      const referencedLine = lineMapping.get(referencedArticle);

      const processedBonification = {
        ...bonification,
        [config.lineNumberField]: lineCounter,
        [config.bonificationLineReferenceField]: referencedLine || null,
        [config.bonificationReferenceField]: null, // Limpiar referencia original
      };

      if (!referencedLine) {
        logger.warn(
          `⚠️ Bonificación huérfana en ${config.orderField}=${groupKey}: ${config.bonificationReferenceField}=${referencedArticle} no encontrado`
        );
      } else {
        logger.debug(
          `🎁 Bonificación procesada: ${
            bonification[config.regularArticleField]
          } -> Línea ${lineCounter}, referencia línea ${referencedLine}`
        );
      }

      processedOrder.push(processedBonification);
      lineCounter++;
    });

    return processedOrder;
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

  /**
   * Procesa documentos según una configuración de mapeo
   * @param {Array} documentIds - IDs de los documentos a procesar
   * @param {string} mappingId - ID de la configuración de mapeo
   * @param {Object} signal - Señal de AbortController para cancelación
   * @returns {Promise<Object>} - Resultado del procesamiento
   */
  async processDocuments(documentIds, mappingId, signal = null) {
    // Crear AbortController local si no se proporcionó signal
    const localAbortController = !signal ? new AbortController() : null;
    signal = signal || localAbortController.signal;

    // Define cancelTaskId at the function level so it's available in all scopes
    const cancelTaskId = `dynamic_process_${mappingId}_${Date.now()}`;

    // Configurar un timeout interno como medida de seguridad
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

    // Variables para manejar consecutivos centralizados
    let useCentralizedConsecutives = false;
    let centralizedConsecutiveId = null;

    try {
      // 1. Cargar configuración de mapeo
      mapping = await TransferMapping.findById(mappingId);
      if (!mapping) {
        clearTimeout(timeoutId);
        throw new Error(`Configuración de mapeo ${mappingId} no encontrada`);
      }

      // 🟢 NUEVO: Validar configuración de bonificaciones
      if (mapping.hasBonificationProcessing) {
        const validation = this.validateBonificationConfig(mapping);
        if (!validation.valid) {
          throw new Error(
            `Configuración de bonificaciones inválida: ${validation.errors.join(
              ", "
            )}`
          );
        }
        logger.info(
          `✅ Configuración de bonificaciones validada para mapping: ${mapping.name}`
        );
      }

      // Asegurar configuración por defecto para mappings existentes
      if (!mapping.markProcessedStrategy) {
        mapping.markProcessedStrategy = "individual"; // Mantener comportamiento actual
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
          // Buscar consecutivos asignados a este mapeo específico
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

      // 3. Registrar en TaskTracker para permitir cancelación
      TaskTracker.registerTask(
        cancelTaskId,
        localAbortController || { abort: () => {} },
        {
          type: "dynamicProcess",
          mappingName: mapping.name,
          documentIds,
        }
      );

      // 4. Crear registro de ejecución - ✅ CORREGIDO: Agregar taskName
      let taskName = mapping.name; // Usar nombre del mapping como fallback

      // Si hay taskId, intentar obtener el nombre real de la tarea
      if (mapping.taskId) {
        try {
          const task = await TransferTask.findById(mapping.taskId);
          if (task && task.name) {
            taskName = task.name;
          }
        } catch (taskError) {
          logger.warn(
            `No se pudo obtener el nombre de la tarea ${mapping.taskId}, usando nombre del mapping`
          );
        }
      }

      const taskExecution = new TaskExecution({
        taskId: mapping.taskId,
        taskName: taskName, // ✅ CAMPO REQUERIDO AGREGADO
        mappingId: mappingId,
        date: new Date(),
        status: "running",
        details: {
          documentIds,
          mappingId,
        },
      });

      await taskExecution.save();
      executionId = taskExecution._id;

      // 5. Establecer conexiones
      const sourceServerName = mapping.sourceServer;
      const targetServerName = mapping.targetServer;

      const getConnection = async (serverName, retries = 3) => {
        for (let attempt = 0; attempt < retries; attempt++) {
          try {
            logger.info(
              `Intento ${
                attempt + 1
              }/${retries} para conectar a ${serverName}...`
            );

            const connectionResult =
              await ConnectionService.enhancedRobustConnect(serverName);

            if (!connectionResult.success || !connectionResult.connection) {
              const error =
                connectionResult.error ||
                new Error(`Conexión inválida a ${serverName}`);
              logger.warn(`Intento ${attempt + 1} falló: ${error.message}`);

              if (attempt === retries - 1) {
                throw error;
              }

              const delay = Math.pow(2, attempt) * 1000;
              await new Promise((resolve) => setTimeout(resolve, delay));
              continue;
            }

            await SqlService.query(
              connectionResult.connection,
              "SELECT 1 AS test"
            );

            logger.info(`Conexión a ${serverName} establecida exitosamente`);
            return connectionResult.connection;
          } catch (error) {
            logger.error(
              `Error al conectar a ${serverName} (intento ${attempt + 1}): ${
                error.message
              }`
            );

            if (attempt === retries - 1) {
              throw error;
            }

            const delay = Math.pow(2, attempt) * 1000;
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }

        throw new Error(
          `No se pudo establecer conexión a ${serverName} después de ${retries} intentos`
        );
      };

      try {
        logger.info(
          `Estableciendo conexiones a ${sourceServerName} y ${targetServerName}...`
        );
        [sourceConnection, targetConnection] = await Promise.all([
          getConnection(sourceServerName),
          getConnection(targetServerName),
        ]);
        logger.info(`Conexiones establecidas exitosamente`);
      } catch (connectionError) {
        clearTimeout(timeoutId);
        throw new Error(
          `Error al establecer conexiones: ${connectionError.message}`
        );
      }

      // 6. Procesar documentos - NUEVA LÓGICA CON ESTRATEGIAS DE MARCADO Y BONIFICACIONES
      const results = {
        processed: 0,
        failed: 0,
        skipped: 0,
        byType: {},
        details: [],
        consecutivesUsed: [],
      };

      // NUEVO: Arrays para recopilar documentos exitosos y fallidos
      const successfulDocuments = [];
      const failedDocuments = [];
      let hasErrors = false;

      // 🟢 OPTIMIZACIÓN: Procesar con BonificationService si está habilitado
      if (mapping.hasBonificationProcessing && mapping.bonificationConfig) {
        logger.info(
          `🎁 Procesamiento unificado de bonificaciones habilitado para ${documentIds.length} documentos`
        );

        try {
          // Obtener datos unificados con bonificaciones procesadas
          const unifiedProcessedData = await this.getSourceDataForDocuments(
            documentIds,
            mapping,
            sourceConnection
          );

          // Procesar todos los documentos de una vez con los datos unificados
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
                      isCentralized: true,
                      reservationId: reservation.reservationId,
                    };

                    logger.info(
                      `Consecutivo centralizado generado para documento ${documentId}: ${currentConsecutive.formatted}`
                    );
                  } catch (consecutiveError) {
                    logger.error(
                      `Error reservando consecutivo centralizado: ${consecutiveError.message}`
                    );
                    failedDocuments.push(documentId);
                    results.failed++;
                    results.details.push({
                      documentId,
                      success: false,
                      error: `Error generando consecutivo: ${consecutiveError.message}`,
                      errorDetails: consecutiveError.stack,
                    });
                    continue;
                  }
                } else {
                  try {
                    currentConsecutive = await this.generateConsecutive(
                      mapping
                    );
                    if (currentConsecutive) {
                      logger.info(
                        `Consecutivo local generado para documento ${documentId}: ${currentConsecutive.formatted}`
                      );
                    }
                  } catch (consecError) {
                    logger.error(
                      `Error generando consecutivo local para documento ${documentId}: ${consecError.message}`
                    );
                    failedDocuments.push(documentId);
                    results.failed++;
                    results.details.push({
                      documentId,
                      success: false,
                      error: `Error generando consecutivo: ${consecError.message}`,
                      errorDetails: consecError.stack,
                    });
                    continue;
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

              const docResult = await this.processSingleDocumentSimple(
                documentId,
                mapping,
                sourceConnection,
                targetConnection,
                currentConsecutive,
                documentData // Pasar los datos ya procesados
              );

              // Confirmar o cancelar reserva de consecutivo centralizado
              if (
                useCentralizedConsecutives &&
                currentConsecutive &&
                currentConsecutive.reservationId
              ) {
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

              // NUEVA LÓGICA: Recopilar documentos exitosos y fallidos
              if (docResult.success) {
                successfulDocuments.push(documentId);
                results.processed++;

                if (!results.byType[docResult.documentType]) {
                  results.byType[docResult.documentType] = {
                    processed: 0,
                    failed: 0,
                  };
                }
                results.byType[docResult.documentType].processed++;

                if (docResult.consecutiveUsed) {
                  results.consecutivesUsed.push({
                    documentId,
                    consecutive: docResult.consecutiveUsed,
                  });
                }

                // NUEVA LÓGICA: Marcado individual solo si está configurado así
                if (
                  mapping.markProcessedStrategy === "individual" &&
                  mapping.markProcessedField
                ) {
                  try {
                    await this.markDocumentsAsProcessed(
                      [documentId],
                      mapping,
                      sourceConnection,
                      true
                    );
                    logger.debug(
                      `✅ Documento ${documentId} marcado individualmente como procesado`
                    );
                  } catch (markError) {
                    logger.warn(
                      `⚠️ Error al marcar documento ${documentId}: ${markError.message}`
                    );
                    // No detener el proceso por errores de marcado
                  }
                }
              } else {
                hasErrors = true;
                failedDocuments.push(documentId);
                results.failed++;

                if (docResult.documentType) {
                  if (!results.byType[docResult.documentType]) {
                    results.byType[docResult.documentType] = {
                      processed: 0,
                      failed: 0,
                    };
                  }
                  results.byType[docResult.documentType].failed++;
                }
              }

              results.details.push({
                documentId,
                ...docResult,
              });

              logger.info(
                `Documento ${documentId} procesado: ${
                  docResult.success ? "Éxito" : "Error"
                }`
              );
            } catch (docError) {
              // Verificar si fue cancelado
              if (signal?.aborted) {
                clearTimeout(timeoutId);
                throw new Error("Tarea cancelada por el usuario");
              }

              hasErrors = true;
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
        // Procesamiento individual estándar (código existente)
        for (let i = 0; i < documentIds.length; i++) {
          // Verificar si se ha cancelado la tarea
          if (signal.aborted) {
            clearTimeout(timeoutId);
            throw new Error("Tarea cancelada por el usuario");
          }

          const documentId = documentIds[i];
          let currentConsecutive = null;

          try {
            // Generación de consecutivos (código existente)
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
                    isCentralized: true,
                    reservationId: reservation.reservationId,
                  };

                  logger.info(
                    `Consecutivo centralizado generado para documento ${documentId}: ${currentConsecutive.formatted}`
                  );
                } catch (consecError) {
                  logger.error(
                    `Error generando consecutivo centralizado para documento ${documentId}: ${consecError.message}`
                  );
                  failedDocuments.push(documentId);
                  results.failed++;
                  results.details.push({
                    documentId,
                    success: false,
                    error: `Error generando consecutivo: ${consecError.message}`,
                    errorDetails: consecError.stack,
                  });
                  continue;
                }
              } else {
                try {
                  currentConsecutive = await this.generateConsecutive(mapping);
                  if (currentConsecutive) {
                    logger.info(
                      `Consecutivo local generado para documento ${documentId}: ${currentConsecutive.formatted}`
                    );
                  }
                } catch (consecError) {
                  logger.error(
                    `Error generando consecutivo local para documento ${documentId}: ${consecError.message}`
                  );
                  failedDocuments.push(documentId);
                  results.failed++;
                  results.details.push({
                    documentId,
                    success: false,
                    error: `Error generando consecutivo: ${consecError.message}`,
                    errorDetails: consecError.stack,
                  });
                  continue;
                }
              }
            }

            // Obtener datos de origen normalmente (sin bonificaciones)
            let sourceData = await this.getSourceDataForDocuments(
              [documentId],
              mapping,
              sourceConnection
            );

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
            if (
              useCentralizedConsecutives &&
              currentConsecutive &&
              currentConsecutive.reservationId
            ) {
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

            // NUEVA LÓGICA: Recopilar documentos exitosos y fallidos
            if (docResult.success) {
              successfulDocuments.push(documentId);
              results.processed++;

              if (!results.byType[docResult.documentType]) {
                results.byType[docResult.documentType] = {
                  processed: 0,
                  failed: 0,
                };
              }
              results.byType[docResult.documentType].processed++;

              if (docResult.consecutiveUsed) {
                results.consecutivesUsed.push({
                  documentId,
                  consecutive: docResult.consecutiveUsed,
                });
              }

              // NUEVA LÓGICA: Marcado individual solo si está configurado así
              if (
                mapping.markProcessedStrategy === "individual" &&
                mapping.markProcessedField
              ) {
                try {
                  await this.markDocumentsAsProcessed(
                    [documentId],
                    mapping,
                    sourceConnection,
                    true
                  );
                  logger.debug(
                    `✅ Documento ${documentId} marcado individualmente como procesado`
                  );
                } catch (markError) {
                  logger.warn(
                    `⚠️ Error al marcar documento ${documentId}: ${markError.message}`
                  );
                  // No detener el proceso por errores de marcado
                }
              }
            } else {
              hasErrors = true;
              failedDocuments.push(documentId);
              results.failed++;

              if (docResult.documentType) {
                if (!results.byType[docResult.documentType]) {
                  results.byType[docResult.documentType] = {
                    processed: 0,
                    failed: 0,
                  };
                }
                results.byType[docResult.documentType].failed++;
              }
            }

            results.details.push({
              documentId,
              ...docResult,
            });

            logger.info(
              `Documento ${documentId} procesado: ${
                docResult.success ? "Éxito" : "Error"
              }`
            );
          } catch (docError) {
            // Verificar si fue cancelado
            if (signal?.aborted) {
              clearTimeout(timeoutId);
              throw new Error("Tarea cancelada por el usuario");
            }

            hasErrors = true;
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
      }

      // NUEVA LÓGICA: Marcado en lotes al final si está configurado así
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

          // Agregar información del marcado al resultado final
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

      // NUEVA LÓGICA: Rollback si está habilitado y hay fallos críticos
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

      // Actualizar registro de ejecución y tarea
      const executionTime = Date.now() - startTime;

      // Determinar el estado correcto basado en los resultados
      let finalStatus = "completed";
      if (results.processed === 0 && results.failed > 0) {
        finalStatus = "failed";
      } else if (results.failed > 0) {
        finalStatus = "partial";
      }

      // Actualizar el registro de ejecución
      await TaskExecution.findByIdAndUpdate(executionId, {
        status: finalStatus,
        executionTime,
        totalRecords: documentIds.length,
        successfulRecords: results.processed,
        failedRecords: results.failed,
        details: results,
      });

      // Actualizar la tarea principal con el resultado
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
            ? results.details
                .filter((d) => !d.success)
                .map(
                  (d) =>
                    `Documento ${d.documentId}: ${
                      d.message || d.error || "Error no especificado"
                    }`
                )
                .join("\n")
            : null,
        },
      });

      clearTimeout(timeoutId);
      TaskTracker.completeTask(cancelTaskId, finalStatus);

      return {
        success: true,
        executionId,
        status: finalStatus,
        ...results,
      };
    } catch (error) {
      // Limpiar timeout
      clearTimeout(timeoutId);

      // Verificar si fue cancelado
      if (signal?.aborted) {
        logger.info("Tarea cancelada por el usuario");

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

        TaskTracker.completeTask(
          cancelTaskId || `dynamic_process_${mappingId}`,
          "cancelled"
        );

        return {
          success: false,
          message: "Tarea cancelada por el usuario",
          executionId,
        };
      }

      logger.error(`Error al procesar documentos: ${error.message}`);

      // Actualizar el registro de ejecución en caso de error
      if (executionId) {
        await TaskExecution.findByIdAndUpdate(executionId, {
          status: "failed",
          executionTime: Date.now() - startTime,
          errorMessage: error.message,
        });
      }

      // Actualizar la tarea principal con el error
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

      TaskTracker.completeTask(
        cancelTaskId || `dynamic_process_${mappingId}`,
        "failed"
      );

      throw error;
    } finally {
      // Cerrar conexiones de forma segura
      if (sourceConnection || targetConnection) {
        logger.info("Liberando conexiones...");

        const releasePromises = [];

        if (sourceConnection) {
          releasePromises.push(
            ConnectionService.releaseConnection(sourceConnection).catch((e) =>
              logger.error(`Error al liberar conexión origen: ${e.message}`)
            )
          );
        }

        if (targetConnection) {
          releasePromises.push(
            ConnectionService.releaseConnection(targetConnection).catch((e) =>
              logger.error(`Error al liberar conexión destino: ${e.message}`)
            )
          );
        }

        await Promise.allSettled(releasePromises);
        logger.info("Conexiones liberadas correctamente");
      }
    }
  }

  /**
   * 🟢 MODIFICADO: Obtener datos de origen para documentos específicos
   * Ahora puede usar BonificationService si está configurado
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

      // 🔥 CAMBIO 2: OPTIMIZACIÓN: Si hay bonificaciones, usar BonificationService directamente
      if (mapping.hasBonificationProcessing && mapping.bonificationConfig) {
        logger.info(
          `🎁 Usando BonificationService para obtener datos con bonificaciones`
        );
        return await this.getSourceDataWithBonifications(
          documentIds,
          mapping,
          connection
        );
      }

      // Lógica normal sin bonificaciones - PERO CON SOPORTE DINÁMICO
      let sourceTable = "FAC_ENC_PED";
      let orderField = "NUM_PED"; // ✅ Campo por defecto
      let lineField = "NUM_LN"; // ✅ Campo por defecto

      const mainTableConfig = mapping.tableConfigs.find(
        (tc) => !tc.isDetailTable
      );
      if (mainTableConfig && mainTableConfig.sourceTable) {
        sourceTable = mainTableConfig.sourceTable;
      }

      // ✅ Si hay configuración de bonificaciones, usar esos campos dinámicamente
      if (mapping.bonificationConfig) {
        orderField = mapping.bonificationConfig.orderField || "NUM_PED";
        // Para lineField, podrías agregar un campo en bonificationConfig si es necesario
      }

      const placeholders = documentIds
        .map((_, index) => `@doc${index}`)
        .join(", ");
      const params = {};
      documentIds.forEach((id, index) => {
        params[`doc${index}`] = id;
      });

      // ✅ CORREGIDO: Completamente dinámico
      const query = `
      SELECT * FROM ${sourceTable}
      WHERE ${orderField} IN (${placeholders})
      ORDER BY ${orderField}, ${lineField}
    `;

      const result = await SqlService.query(connection, query, params);
      logger.info(`📥 Obtenidos ${result.recordset.length} registros normales`);

      return result.recordset || [];
    } catch (error) {
      logger.error(`Error al obtener datos de origen: ${error.message}`);
      throw error;
    }
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

      // Procesar bonificaciones usando el servicio especializado
      const processedData = await this.processBonifications(
        allDetails,
        mapping
      );

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
   * Aplica conversión de unidades a un valor específico - VERSIÓN CORREGIDA
   * @param {Object} sourceData - Datos completos del registro
   * @param {Object} fieldMapping - Configuración del campo con conversión
   * @param {any} originalValue - Valor original del campo
   * @returns {any} - Valor convertido
   */
  applyUnitConversion(sourceData, fieldMapping, originalValue) {
    try {
      console.log(`🐛 DEBUG applyUnitConversion llamado:`);
      console.log(`   Campo: ${fieldMapping.targetField}`);
      console.log(`   Valor original: ${originalValue}`);
      console.log(
        `   Configuración enabled: ${fieldMapping.unitConversion?.enabled}`
      );
      console.log(`   sourceData keys: ${Object.keys(sourceData).join(", ")}`);

      // Log detallado de TODOS los campos disponibles con sus valores
      console.log(`🔍 DATOS COMPLETOS DISPONIBLES:`);
      Object.keys(sourceData).forEach((key) => {
        console.log(`   ${key}: ${sourceData[key]}`);
      });

      logger.info(
        `🔄 Iniciando conversión para campo: ${fieldMapping.targetField}`
      );

      // Validación inicial
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

      // Validar configuración completa
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

      // IMPORTANTE: Buscar los campos con diferentes variaciones de nombres
      let unitMeasureValue = null;
      let conversionFactorValue = null;

      // Lista de posibles nombres para Unit_Measure
      const possibleUnitFields = [
        config.unitMeasureField, // Unit_Measure
        "Unit_Measure",
        "UNIT_MEASURE",
        "UNI_MED",
        "UNIDAD",
        "TIPO_UNIDAD",
      ];

      // Lista de posibles nombres para Factor_Conversion
      const possibleFactorFields = [
        config.conversionFactorField, // Factor_Conversion
        "Factor_Conversion",
        "FACTOR_CONVERSION",
        "CNT_MAX", // Este podría ser el factor
        "FACTOR",
        "CONV_FACTOR",
      ];

      // Buscar campo de unidad de medida
      for (const fieldName of possibleUnitFields) {
        if (
          sourceData[fieldName] !== undefined &&
          sourceData[fieldName] !== null
        ) {
          unitMeasureValue = sourceData[fieldName];
          console.log(
            `✅ Campo unidad encontrado: ${fieldName} = ${unitMeasureValue}`
          );
          break;
        }
      }

      // Buscar campo de factor de conversión
      for (const fieldName of possibleFactorFields) {
        if (
          sourceData[fieldName] !== undefined &&
          sourceData[fieldName] !== null
        ) {
          conversionFactorValue = sourceData[fieldName];
          console.log(
            `✅ Campo factor encontrado: ${fieldName} = ${conversionFactorValue}`
          );
          break;
        }
      }

      console.log(`🐛 VALORES ENCONTRADOS:`);
      console.log(`   unitMeasureValue: ${unitMeasureValue}`);
      console.log(`   conversionFactorValue: ${conversionFactorValue}`);
      console.log(`   fromUnit configurado: "${config.fromUnit}"`);

      if (unitMeasureValue === undefined || unitMeasureValue === null) {
        logger.warn(
          `⚠️ Campo de unidad de medida no encontrado en datos de origen`
        );
        logger.debug(`Campos buscados: ${possibleUnitFields.join(", ")}`);
        logger.debug(
          `Campos disponibles: ${Object.keys(sourceData).join(", ")}`
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
        logger.debug(`Campos buscados: ${possibleFactorFields.join(", ")}`);
        logger.debug(
          `Campos disponibles: ${Object.keys(sourceData).join(", ")}`
        );
        return originalValue;
      }

      // Validación del factor de conversión
      const conversionFactor = parseFloat(conversionFactorValue);
      if (isNaN(conversionFactor)) {
        logger.error(
          `❌ Factor de conversión no es un número válido: '${conversionFactorValue}'`
        );
        return originalValue;
      }

      if (conversionFactor <= 0) {
        logger.error(
          `❌ Factor de conversión debe ser mayor que cero: ${conversionFactor}`
        );
        return originalValue;
      }

      // Logging detallado de valores
      logger.info(
        `📏 Unidad actual: '${unitMeasureValue}', Unidad origen configurada: '${config.fromUnit}'`
      );
      logger.info(
        `🔢 Factor de conversión: ${conversionFactor} (origen: '${conversionFactorValue}')`
      );
      logger.info(`⚙️ Operación: ${config.operation}`);
      logger.info(`🎯 Convertir de '${config.fromUnit}' a '${config.toUnit}'`);

      // Verificar si necesita conversión
      const shouldConvert = this.shouldApplyUnitConversion(
        unitMeasureValue,
        config.fromUnit
      );
      if (!shouldConvert) {
        logger.info(
          `❌ No se aplica conversión: unidad actual '${unitMeasureValue}' no requiere conversión desde '${config.fromUnit}'`
        );
        return originalValue;
      }

      logger.info(
        `✅ Se aplicará conversión: unidad '${unitMeasureValue}' coincide con patrón '${config.fromUnit}'`
      );

      // Validación del valor original
      const numericValue = parseFloat(originalValue);
      if (isNaN(numericValue)) {
        logger.warn(
          `⚠️ Valor original no es numérico: '${originalValue}', manteniendo valor original`
        );
        return originalValue;
      }

      // Realizar conversión
      let convertedValue;
      if (config.operation === "multiply") {
        // Para cantidades: cantidad_en_cajas * factor = cantidad_en_unidades
        // Ejemplo: 10 Cajas × 144 = 1440 Unidades
        convertedValue = numericValue * conversionFactor;
        logger.info(
          `🔢 Conversión (multiplicar): ${numericValue} × ${conversionFactor} = ${convertedValue}`
        );
      } else if (config.operation === "divide") {
        // Para precios: precio_por_caja / factor = precio_por_unidad
        // Ejemplo: $1000 por Caja ÷ 144 = $6.94 por Unidad
        if (conversionFactor === 0) {
          logger.error(
            `❌ No se puede dividir por cero (factor: ${conversionFactor})`
          );
          return originalValue;
        }
        convertedValue = numericValue / conversionFactor;
        logger.info(
          `🔢 Conversión (dividir): ${numericValue} ÷ ${conversionFactor} = ${convertedValue}`
        );
      } else {
        logger.error(
          `❌ Operación de conversión no válida: '${config.operation}'. Debe ser 'multiply' o 'divide'`
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
   * Realiza consultas de lookup en la base de datos destino para enriquecer los datos
   * @param {Object} tableConfig - Configuración de la tabla
   * @param {Object} sourceData - Datos de origen
   * @param {Object} targetConnection - Conexión a la base de datos destino
   * @returns {Promise<Object>} - Objeto con los valores obtenidos del lookup
   */
  async lookupValuesFromTarget(tableConfig, sourceData, targetConnection) {
    try {
      logger.info(
        `Realizando consultas de lookup en base de datos destino para tabla ${tableConfig.name}`
      );

      const lookupResults = {};
      const failedLookups = [];

      // Identificar todos los campos que requieren lookup
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

      // Ejecutar cada consulta de lookup
      for (const fieldMapping of lookupFields) {
        try {
          let lookupQuery = fieldMapping.lookupQuery;
          logger.debug(
            `Procesando lookup para campo ${fieldMapping.targetField}: ${lookupQuery}`
          );

          // Preparar parámetros para la consulta
          const params = {};
          const missingParams = [];

          // Registrar todos los parámetros que se esperan en la consulta
          const expectedParams = [];
          const paramRegex = /@(\w+)/g;
          let match;
          while ((match = paramRegex.exec(lookupQuery)) !== null) {
            expectedParams.push(match[1]);
          }

          logger.debug(
            `Parámetros esperados en la consulta: ${expectedParams.join(", ")}`
          );

          // Si hay parámetros definidos, extraerlos de los datos de origen
          if (
            fieldMapping.lookupParams &&
            fieldMapping.lookupParams.length > 0
          ) {
            for (const param of fieldMapping.lookupParams) {
              if (!param.sourceField || !param.paramName) {
                logger.warn(
                  `Parámetro mal configurado para ${fieldMapping.targetField}. Debe tener sourceField y paramName.`
                );
                continue;
              }

              // Obtener el valor del campo origen
              let paramValue = sourceData[param.sourceField];

              // Registrar si el valor está presente
              logger.debug(
                `Parámetro ${param.paramName} (desde campo ${
                  param.sourceField
                }): ${
                  paramValue !== undefined && paramValue !== null
                    ? "PRESENTE"
                    : "NO ENCONTRADO"
                }`
              );

              // Comprobar si el parámetro es requerido en la consulta
              if (
                expectedParams.includes(param.paramName) &&
                (paramValue === undefined || paramValue === null)
              ) {
                missingParams.push(
                  `@${param.paramName} (campo: ${param.sourceField})`
                );
              }

              // Aplicar eliminación de prefijo si está configurado
              if (
                fieldMapping.removePrefix &&
                typeof paramValue === "string" &&
                paramValue.startsWith(fieldMapping.removePrefix)
              ) {
                const originalValue = paramValue;
                paramValue = paramValue.substring(
                  fieldMapping.removePrefix.length
                );
                logger.debug(
                  `Prefijo '${fieldMapping.removePrefix}' eliminado del parámetro ${param.paramName}: '${originalValue}' → '${paramValue}'`
                );
              }

              params[param.paramName] = paramValue;
            }
          }

          // Verificar si faltan parámetros requeridos
          if (missingParams.length > 0) {
            const errorMessage = `Faltan parámetros requeridos para la consulta: ${missingParams.join(
              ", "
            )}`;
            logger.error(errorMessage);

            if (fieldMapping.failIfNotFound) {
              throw new Error(errorMessage);
            } else {
              // No es obligatorio, usar null y continuar
              lookupResults[fieldMapping.targetField] = null;
              failedLookups.push({
                field: fieldMapping.targetField,
                error: errorMessage,
              });
              continue;
            }
          }

          logger.debug(`Parámetros para lookup: ${JSON.stringify(params)}`);

          // Ejecutar la consulta
          try {
            // Asegurar que es una consulta SELECT
            if (!lookupQuery.trim().toUpperCase().startsWith("SELECT")) {
              lookupQuery = `SELECT ${lookupQuery} AS result`;
            }

            // Verificar que los parámetros esperados tengan valor asignado
            for (const expectedParam of expectedParams) {
              if (params[expectedParam] === undefined) {
                logger.warn(
                  `El parámetro @${expectedParam} en la consulta no está definido en los parámetros proporcionados. Se usará NULL.`
                );
                params[expectedParam] = null;
              }
            }

            const result = await SqlService.query(
              targetConnection,
              lookupQuery,
              params
            );

            // Verificar resultados
            if (result.recordset && result.recordset.length > 0) {
              // Extraer el valor del resultado (primera columna o columna 'result')
              const value =
                result.recordset[0].result !== undefined
                  ? result.recordset[0].result
                  : Object.values(result.recordset[0])[0];

              // Validar existencia si es requerido
              if (
                fieldMapping.validateExistence &&
                (value === null || value === undefined) &&
                fieldMapping.failIfNotFound
              ) {
                throw new Error(
                  `No se encontró valor para el campo ${fieldMapping.targetField} con los parámetros proporcionados`
                );
              }

              // Guardar el valor obtenido
              lookupResults[fieldMapping.targetField] = value;
              logger.debug(
                `Lookup exitoso para ${fieldMapping.targetField}: ${value}`
              );
            } else if (fieldMapping.failIfNotFound) {
              // No se encontraron resultados y es obligatorio
              throw new Error(
                `No se encontraron resultados para el campo ${fieldMapping.targetField}`
              );
            } else {
              // No se encontraron resultados pero no es obligatorio
              lookupResults[fieldMapping.targetField] = null;
              logger.debug(
                `No se encontraron resultados para lookup de ${fieldMapping.targetField}, usando NULL`
              );
            }
          } catch (queryError) {
            // Error en la consulta SQL
            const errorMessage = `Error ejecutando consulta SQL para ${fieldMapping.targetField}: ${queryError.message}`;
            logger.error(errorMessage, {
              sql: lookupQuery,
              params: params,
              error: queryError,
            });

            if (fieldMapping.failIfNotFound) {
              throw new Error(errorMessage);
            } else {
              // Registrar fallo pero continuar
              failedLookups.push({
                field: fieldMapping.targetField,
                error: `Error en consulta SQL: ${queryError.message}`,
              });
              lookupResults[fieldMapping.targetField] = null; // Usar null como valor por defecto
            }
          }
        } catch (fieldError) {
          // Error al procesar el campo
          logger.error(
            `Error al realizar lookup para campo ${fieldMapping.targetField}: ${fieldError.message}`
          );

          if (fieldMapping.failIfNotFound) {
            // Si es obligatorio, añadir a los errores pero seguir con otros campos
            failedLookups.push({
              field: fieldMapping.targetField,
              error: fieldError.message,
            });
          } else {
            // No es obligatorio, usar null y continuar
            lookupResults[fieldMapping.targetField] = null;
          }
        }
      }

      // Verificar si hay errores críticos (campos que fallan y son obligatorios)
      const criticalFailures = failedLookups.filter((fail) => {
        // Buscar si el campo que falló está marcado como obligatorio
        const field = lookupFields.find((f) => f.targetField === fail.field);
        return field && field.failIfNotFound;
      });

      if (criticalFailures.length > 0) {
        const failuresMsg = criticalFailures
          .map((f) => `${f.field}: ${f.error}`)
          .join(", ");

        logger.error(`Fallos críticos en lookup: ${failuresMsg}`);

        return {
          results: lookupResults,
          success: false,
          failedFields: criticalFailures,
          error: `Error en validación de datos: ${failuresMsg}`,
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
        failedFields: failedLookups, // Incluir fallos no críticos para información
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
   * 🔄 MODIFICADO: Procesa un único documento según la configuración - AGREGADO PARÁMETRO sourceData
   * @param {string} documentId - ID del documento
   * @param {Object} mapping - Configuración de mapeo
   * @param {Object} sourceConnection - Conexión a servidor origen
   * @param {Object} targetConnection - Conexión a servidor destino
   * @param {Object} currentConsecutive - Consecutivo generado previamente (opcional)
   * @param {Array} sourceData - Datos ya obtenidos (opcional para bonificaciones)
   * @returns {Promise<Object>} - Resultado del procesamiento
   */
  async processSingleDocumentSimple(
    documentId,
    mapping,
    sourceConnection,
    targetConnection,
    currentConsecutive = null,
    sourceData = null // 🟢 NUEVO: parámetro opcional para datos ya procesados
  ) {
    let processedTables = [];
    let documentType = "unknown";

    try {
      logger.info(
        `Procesando documento ${documentId} (modo sin transacciones)`
      );

      // Create column length cache
      const columnLengthCache = new Map();

      // 1. Identificar las tablas principales (no de detalle)
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

      // Ordenar tablas por executionOrder si está definido
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
        // 🟢 MODIFICADO: Obtener datos de la tabla de origen (usar datos ya procesados si están disponibles)
        let tableSourceData;

        if (
          sourceData &&
          mapping.hasBonificationProcessing &&
          tableConfig.sourceTable === mapping.bonificationConfig.sourceTable
        ) {
          // Usar datos ya procesados de bonificaciones
          tableSourceData = sourceData.find(
            (record) => record.NUM_PED == documentId
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
              continue; // Pasar a la siguiente tabla principal
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

        // Procesar dependencias de foreign key ANTES de insertar datos principales
        try {
          if (
            mapping.foreignKeyDependencies &&
            mapping.foreignKeyDependencies.length > 0
          ) {
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

        // 3. Determinar el tipo de documento basado en las reglas
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
          null, // No hay detailRow para tabla principal
          targetConnection,
          currentConsecutive,
          mapping,
          documentId,
          columnLengthCache,
          false // isDetailTable = false
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

      console.log(`🔍 CONSULTA ENCABEZADO CORREGIDA: ${query}`);
      console.log(`🔍 Campos seleccionados: ${requiredFields.join(", ")}`);

      logger.debug(`Ejecutando consulta principal: ${query}`);
      const result = await SqlService.query(sourceConnection, query, {
        documentId,
      });

      // DEBUG: Mostrar qué campos tenemos disponibles en el resultado
      if (result.recordset && result.recordset.length > 0) {
        console.log(
          `🔍 CAMPOS DISPONIBLES EN ENCABEZADO: ${Object.keys(
            result.recordset[0]
          ).join(", ")}`
        );
      }

      return result.recordset[0];
    }
  }

  /**
   * NUEVO: Método auxiliar para recopilar todos los campos necesarios de una configuración de tabla
   * @private
   */
  getRequiredFieldsFromTableConfig(tableConfig) {
    const requiredFields = new Set();

    if (tableConfig.fieldMappings && tableConfig.fieldMappings.length > 0) {
      tableConfig.fieldMappings.forEach((fm) => {
        // Campo de origen mapeado
        if (fm.sourceField) {
          requiredFields.add(fm.sourceField);
        }

        // Campos para conversión de unidades
        if (fm.unitConversion && fm.unitConversion.enabled) {
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
   * @private
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
   * @private
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
   * @private
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
   * @private
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
        targetValues.push(processedField.value); // Expresión SQL directa
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
   * Procesa un campo individual - MÉTODO UNIFICADO CON FIX PARA BONIFICACIONES
   * @private
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

    // 🔥 CAMBIO 3: NUEVO: Solo agregar estas 4 líneas para bonificaciones
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
      // No hay campo origen, usar valor por defecto
      value = defaultValue === "NULL" ? null : defaultValue;
    }

    // Si el valor es undefined/null pero hay un valor por defecto
    if ((value === undefined || value === null) && defaultValue !== undefined) {
      value = defaultValue === "NULL" ? null : defaultValue;
    }

    // PASO 3: **APLICAR CONVERSIÓN DE UNIDADES**
    if (fieldMapping.unitConversion && fieldMapping.unitConversion.enabled) {
      logger.info(
        `🔄 Iniciando conversión de unidades para campo: ${fieldMapping.targetField}`
      );
      logger.info(
        `📦 Valor antes de conversión: ${value} (tipo: ${typeof value})`
      );

      // **LOG CRÍTICO PARA DEBUG**
      console.log(`🔍 DEBUG CONVERSIÓN - Campo: ${fieldMapping.targetField}`);
      console.log(`🔍 sourceData keys: ${Object.keys(sourceData).join(", ")}`);
      console.log(`🔍 Buscando campos:`);
      console.log(
        `   - unitMeasureField: ${fieldMapping.unitConversion.unitMeasureField}`
      );
      console.log(
        `   - conversionFactorField: ${fieldMapping.unitConversion.conversionFactorField}`
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
    if (
      currentConsecutive &&
      mapping.consecutiveConfig &&
      mapping.consecutiveConfig.enabled
    ) {
      const shouldReceiveConsecutive = this.shouldReceiveConsecutive(
        fieldMapping,
        mapping.consecutiveConfig,
        tableConfig,
        isDetailTable
      );

      if (shouldReceiveConsecutive) {
        // Solo aplicar consecutivo si no hubo conversión numérica
        if (
          fieldMapping.unitConversion &&
          fieldMapping.unitConversion.enabled &&
          typeof value === "number"
        ) {
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
   * Verifica si un campo debe recibir el consecutivo
   * @private
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
   * @private
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
   * @private
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
    // Ordenar tablas de detalle por executionOrder
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

      // 🟢 NUEVO: Si hay bonificaciones, usar datos procesados
      let detailDataToProcess = detailsData;
      if (
        mapping.hasBonificationProcessing &&
        mapping.bonificationConfig &&
        Array.isArray(sourceData)
      ) {
        // Filtrar los datos de bonificaciones que corresponden a este documento
        detailDataToProcess = sourceData.filter(
          (record) =>
            record[mapping.bonificationConfig.orderField] === documentId
        );
        logger.info(
          `🎁 Usando ${detailDataToProcess.length} registros procesados de bonificaciones para detalles`
        );
      }

      // Insertar detalles
      for (const detailRow of detailDataToProcess) {
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
   * @private
   */
  async getDetailData(
    detailConfig,
    parentTableConfig,
    documentId,
    sourceConnection
  ) {
    if (detailConfig.customQuery) {
      // Usar consulta personalizada
      const query = detailConfig.customQuery.replace(
        /@documentId/g,
        documentId
      );
      logger.debug(`Ejecutando consulta personalizada para detalles: ${query}`);
      const result = await SqlService.query(sourceConnection, query);
      return result.recordset;
    } else if (detailConfig.useSameSourceTable) {
      // Caso especial: usa la misma tabla que el encabezado
      return this.getDetailDataFromSameTable(
        detailConfig,
        parentTableConfig,
        documentId,
        sourceConnection
      );
    } else {
      // Tabla de detalle normal con su propia fuente
      return this.getDetailDataFromOwnTable(
        detailConfig,
        documentId,
        sourceConnection
      );
    }
  }

  /**
   * Obtiene datos de detalle de la misma tabla que el encabezado - CORREGIDO
   * @private
   */
  async getDetailDataFromSameTable(
    detailConfig,
    parentTableConfig,
    documentId,
    sourceConnection
  ) {
    const tableAlias = "d1";
    const orderByColumn = detailConfig.orderByColumn || "";

    // CAMBIO: Usar la función centralizada para obtener campos requeridos
    const requiredFields = this.getRequiredFieldsFromTableConfig(detailConfig);

    // Construir la lista de campos con alias de tabla
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

    console.log(`🔍 CONSULTA DETALLE CORREGIDA: ${query}`);
    console.log(`🔍 Campos seleccionados: ${requiredFields.join(", ")}`);

    logger.debug(`Ejecutando consulta para detalles: ${query}`);
    const result = await SqlService.query(sourceConnection, query, {
      documentId,
    });

    // DEBUG: Mostrar qué campos tenemos disponibles en el resultado
    if (result.recordset && result.recordset.length > 0) {
      console.log(
        `🔍 CAMPOS DISPONIBLES EN RESULTADO: ${Object.keys(
          result.recordset[0]
        ).join(", ")}`
      );
    }

    return result.recordset;
  }

  /**
   * Obtiene datos de detalle de su propia tabla - CORREGIDO
   * @private
   */
  async getDetailDataFromOwnTable(detailConfig, documentId, sourceConnection) {
    const orderByColumn = detailConfig.orderByColumn || "";

    // CAMBIO: Usar la función centralizada para obtener campos requeridos
    const requiredFields = this.getRequiredFieldsFromTableConfig(detailConfig);

    // Construir la lista de campos (sin alias porque es tabla única)
    const finalSelectFields = requiredFields.join(", ");

    const primaryKey = detailConfig.primaryKey || "NUM_PED";

    const query = `
   SELECT ${finalSelectFields} FROM ${detailConfig.sourceTable}
   WHERE ${primaryKey} = @documentId
   ${detailConfig.filterCondition ? ` AND ${detailConfig.filterCondition}` : ""}
   ${orderByColumn ? ` ORDER BY ${orderByColumn}` : ""}
 `;

    console.log(`🔍 CONSULTA DETALLE PROPIA CORREGIDA: ${query}`);
    console.log(`🔍 Campos seleccionados: ${requiredFields.join(", ")}`);

    logger.debug(`Ejecutando consulta para detalles: ${query}`);
    const result = await SqlService.query(sourceConnection, query, {
      documentId,
    });

    // DEBUG: Mostrar qué campos tenemos disponibles en el resultado
    if (result.recordset && result.recordset.length > 0) {
      console.log(
        `🔍 CAMPOS DISPONIBLES EN RESULTADO: ${Object.keys(
          result.recordset[0]
        ).join(", ")}`
      );
    }

    return result.recordset;
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
   * Genera un consecutivo según la configuración (local)
   * @param {Object} mapping - Configuración de mapeo
   * @returns {Promise<Object>} - { value: number, formatted: string }
   */
  async generateConsecutive(mapping) {
    try {
      if (!mapping.consecutiveConfig || !mapping.consecutiveConfig.enabled) {
        return null;
      }

      // Generar número consecutivo
      const lastValue = mapping.consecutiveConfig.lastValue || 0;
      const newValue = lastValue + 1;

      // IMPORTANTE: Actualizar inmediatamente el último valor usado en la configuración
      // Esto evita que dos documentos obtengan el mismo valor consecutivo
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
        // Si no hay patrón pero sí prefijo
        formattedValue = `${mapping.consecutiveConfig.prefix}${newValue}`;
      }

      return {
        value: newValue,
        formatted: formattedValue,
        isCentralized: false, // Marcar que es un consecutivo local
      };
    } catch (error) {
      logger.error(`Error al generar consecutivo: ${error.message}`);
      throw error;
    }
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
   * Actualiza el último valor consecutivo en la configuración
   * @param {string} mappingId - ID de la configuración
   * @param {number} lastValue - Último valor usado
   * @returns {Promise<boolean>} - true si se actualizó correctamente
   */
  async updateLastConsecutive(mappingId, lastValue) {
    try {
      // Usar findOneAndUpdate para actualizar de manera atómica
      // Esto evita condiciones de carrera con múltiples procesos
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
        // No se actualizó porque ya hay un valor mayor (posiblemente actualizado por otro proceso)
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
   * Marca documentos como procesados según la estrategia configurada
   * @param {Array|string} documentIds - ID(s) de documentos
   * @param {Object} mapping - Configuración de mapeo
   * @param {Object} connection - Conexión a la base de datos
   * @param {boolean} shouldMark - true para marcar, false para desmarcar
   * @returns {Promise<Object>} - Resultado del marcado
   */
  async markDocumentsAsProcessed(
    documentIds,
    mapping,
    connection,
    shouldMark = true
  ) {
    // Normalizar documentIds a array
    const docArray = Array.isArray(documentIds) ? documentIds : [documentIds];

    if (!mapping.markProcessedField || docArray.length === 0) {
      return {
        success: 0,
        failed: 0,
        strategy: "none",
        message: "No hay campo de marcado configurado",
      };
    }

    const strategy = mapping.markProcessedStrategy || "individual";

    logger.info(
      `Ejecutando estrategia de marcado: ${strategy} para ${docArray.length} documento(s)`
    );

    switch (strategy) {
      case "individual":
        return await this.markIndividualDocuments(
          docArray,
          mapping,
          connection,
          shouldMark
        );

      case "batch":
        return await this.markBatchDocuments(
          docArray,
          mapping,
          connection,
          shouldMark
        );

      case "none":
        return {
          success: 0,
          failed: 0,
          strategy: "none",
          message: "Marcado deshabilitado por configuración",
        };

      default:
        logger.warn(`Estrategia desconocida: ${strategy}, usando individual`);
        return await this.markIndividualDocuments(
          docArray,
          mapping,
          connection,
          shouldMark
        );
    }
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

module.exports = new DynamicTransferService();
