const logger = require("./logger");
const ConnectionManager = require("./ConnectionManager");
const { SqlService } = require("./SqlService");
const TransferMapping = require("../models/transferMappingModel");
const TaskExecution = require("../models/taskExecutionModel");
const TaskTracker = require("./TaskTracker");
const TransferTask = require("../models/transferTaks");
const ConsecutiveService = require("./ConsecutiveService");

class DynamicTransferService {
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

      logger.info(`🚀 Iniciando proceso para mapping: ${mapping.name}`);

      // 🎁 NUEVA LÓGICA: Verificar si tiene procesamiento de bonificaciones
      let bonificationServiceLoaded = false;
      let BonificationService = null;

      if (mapping.hasBonificationProcessing) {
        logger.info(
          `🎁 Mapping configurado con procesamiento de bonificaciones habilitado`
        );

        try {
          BonificationService = require("./BonificationProcessingService");
          BonificationService.validateBonificationConfig(
            mapping.bonificationConfig
          );
          bonificationServiceLoaded = true;
          logger.info(
            `🎁 Servicio de bonificaciones cargado y validado correctamente`
          );
        } catch (configError) {
          logger.error(
            `❌ Error en configuración de bonificaciones: ${configError.message}`
          );
          clearTimeout(timeoutId);
          throw new Error(
            `Configuración de bonificaciones inválida: ${configError.message}`
          );
        }
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

      // 2. Registrar tarea en el TaskTracker
      TaskTracker.registerTask(cancelTaskId, "processDocuments", {
        mappingId,
        documentCount: documentIds.length,
        hasBonifications: mapping.hasBonificationProcessing, // 🎁 NUEVO
      });

      // 3. Obtener conexiones
      const ConnectionManager = require("./ConnectionCentralService");
      sourceConnection = await ConnectionManager.getConnection(
        mapping.sourceServer
      );
      targetConnection = await ConnectionManager.getConnection(
        mapping.targetServer
      );

      if (!sourceConnection || !targetConnection) {
        throw new Error("No se pudieron establecer las conexiones necesarias");
      }

      logger.info(
        `🔗 Conexiones establecidas: ${mapping.sourceServer} -> ${mapping.targetServer}`
      );

      // 4. Crear registro de ejecución
      const TaskExecution = require("../models/taskExecutionModel");
      const execution = new TaskExecution({
        taskId: mapping.taskId,
        mappingId: mappingId,
        executedBy: "system",
        status: "running",
        startTime: new Date(),
        totalRecords: documentIds.length,
        hasBonificationProcessing: mapping.hasBonificationProcessing, // 🎁 NUEVO
      });
      await execution.save();
      executionId = execution._id;

      // 5. Verificar consecutivos centralizados
      if (mapping.consecutiveConfig && mapping.consecutiveConfig.enabled) {
        if (mapping.consecutiveConfig.useConsecutiveService) {
          useCentralizedConsecutives = true;
          const ConsecutiveService = require("./ConsecutiveService");

          try {
            centralizedConsecutiveId =
              await ConsecutiveService.getOrCreateConsecutive(
                mapping.consecutiveConfig.consecutiveName,
                {
                  format: mapping.consecutiveConfig.format,
                  startValue: mapping.consecutiveConfig.startValue || 1,
                  increment: mapping.consecutiveConfig.increment || 1,
                },
                { id: mapping._id.toString(), name: "mapping" }
              );
            logger.info(
              `📊 Consecutivo centralizado configurado: ${centralizedConsecutiveId}`
            );
          } catch (consecError) {
            logger.error(
              `Error configurando consecutivo centralizado: ${consecError.message}`
            );
            throw consecError;
          }
        }
      }

      // 6. Procesar documentos - NUEVA LÓGICA CON ESTRATEGIAS DE MARCADO
      const results = {
        processed: 0,
        failed: 0,
        skipped: 0,
        byType: {},
        details: [],
        consecutivesUsed: [],
        // 🎁 NUEVAS ESTADÍSTICAS DE BONIFICACIONES
        bonificationStats: {
          totalDocumentsWithBonifications: 0,
          totalBonifications: 0,
          totalPromotions: 0,
          totalDiscountAmount: 0,
          processedDetails: 0,
          bonificationTypes: {},
        },
      };

      // NUEVO: Arrays para recopilar documentos exitosos y fallidos
      const successfulDocuments = [];
      const failedDocuments = [];
      let hasErrors = false;

      // Procesar cada documento individualmente
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

          // 🎁 NUEVA LÓGICA: Decidir qué método usar según configuración de bonificaciones
          let docResult;

          if (mapping.hasBonificationProcessing && bonificationServiceLoaded) {
            // Procesar con bonificaciones
            docResult = await this.processSingleDocumentWithBonifications(
              documentId,
              mapping,
              sourceConnection,
              targetConnection,
              currentConsecutive,
              BonificationService
            );
          } else {
            // Procesar normalmente (lógica existente)
            docResult = await this.processSingleDocumentSimple(
              documentId,
              mapping,
              sourceConnection,
              targetConnection,
              currentConsecutive
            );
          }

          if (docResult.success) {
            results.processed++;
            successfulDocuments.push(documentId);

            // 🎁 NUEVA LÓGICA: Agregar estadísticas de bonificaciones si existen
            if (docResult.bonificationStats) {
              results.bonificationStats.totalDocumentsWithBonifications++;
              results.bonificationStats.totalBonifications +=
                docResult.bonificationStats.totalBonifications || 0;
              results.bonificationStats.totalPromotions +=
                docResult.bonificationStats.totalPromotions || 0;
              results.bonificationStats.totalDiscountAmount +=
                docResult.bonificationStats.totalDiscountAmount || 0;
              results.bonificationStats.processedDetails +=
                docResult.bonificationStats.processedDetails || 0;

              // Agregar tipos de bonificaciones
              if (docResult.bonificationStats.promotionTypes) {
                docResult.bonificationStats.promotionTypes.forEach((type) => {
                  results.bonificationStats.bonificationTypes[type] =
                    (results.bonificationStats.bonificationTypes[type] || 0) +
                    1;
                });
              }
            }

            // Actualizar estadísticas por tipo de documento
            if (
              docResult.documentType &&
              docResult.documentType !== "unknown"
            ) {
              results.byType[docResult.documentType] =
                (results.byType[docResult.documentType] || 0) + 1;
            }

            // Guardar consecutivo usado
            if (currentConsecutive) {
              results.consecutivesUsed.push({
                documentId,
                consecutive: currentConsecutive.formatted,
                value: currentConsecutive.value,
              });
            }

            logger.debug(
              `✅ Documento procesado exitosamente: ${documentId}${
                docResult.bonificationStats ? " (con bonificaciones)" : ""
              }`
            );
          } else {
            results.failed++;
            failedDocuments.push(documentId);
            hasErrors = true;
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
            bonificationStats: docResult.bonificationStats, // 🎁 NUEVO
            error: docResult.success ? null : docResult.message,
          });

          // Marcado individual según estrategia (código existente)
          if (
            mapping.markProcessedStrategy === "individual" &&
            mapping.markProcessedField
          ) {
            try {
              const shouldMark = docResult.success;
              await this.markSingleDocument(
                documentId,
                mapping,
                sourceConnection,
                shouldMark
              );
            } catch (markError) {
              logger.warn(
                `Advertencia: No se pudo marcar documento ${documentId}: ${markError.message}`
              );
            }
          }

          // Actualizar progreso en TaskTracker
          const progress = Math.round(((i + 1) / documentIds.length) * 100);
          TaskTracker.updateTaskProgress(
            cancelTaskId,
            progress,
            `Procesado ${i + 1}/${documentIds.length} documentos`
          );

          // Log cada 10 documentos procesados
          if ((i + 1) % 10 === 0 || i === documentIds.length - 1) {
            logger.info(
              `📊 Progreso: ${i + 1}/${
                documentIds.length
              } documentos procesados. ${results.processed} éxitos, ${
                results.failed
              } fallos.`
            );

            // 🎁 NUEVO: Log estadísticas de bonificaciones
            if (
              mapping.hasBonificationProcessing &&
              results.bonificationStats.totalDocumentsWithBonifications > 0
            ) {
              logger.info(
                `🎁 Bonificaciones: ${results.bonificationStats.totalDocumentsWithBonifications} docs con bonificaciones, ${results.bonificationStats.totalBonifications} bonificaciones totales`
              );
            }
          }

          // Log de estado: "Éxito" o "Error"
          logger.info(
            `Documento ${documentId}: ${docResult.success ? "Éxito" : "Error"}`
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
        bonificationStats: results.bonificationStats, // 🎁 NUEVO
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
          bonificationStats: results.bonificationStats, // 🎁 NUEVO
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

      // 🎁 NUEVO: Log final con estadísticas de bonificaciones
      if (
        mapping.hasBonificationProcessing &&
        results.bonificationStats.totalDocumentsWithBonifications > 0
      ) {
        logger.info(`🎁 RESUMEN DE BONIFICACIONES:`);
        logger.info(
          `   📦 Documentos con bonificaciones: ${results.bonificationStats.totalDocumentsWithBonifications}`
        );
        logger.info(
          `   🎁 Total bonificaciones: ${results.bonificationStats.totalBonifications}`
        );
        logger.info(
          `   🏷️ Total promociones: ${results.bonificationStats.totalPromotions}`
        );
        logger.info(
          `   💰 Descuento total: $${results.bonificationStats.totalDiscountAmount.toFixed(
            2
          )}`
        );
        logger.info(
          `   📄 Detalles procesados: ${results.bonificationStats.processedDetails}`
        );
        if (
          Object.keys(results.bonificationStats.bonificationTypes).length > 0
        ) {
          logger.info(
            `   🏷️ Tipos de promociones: ${JSON.stringify(
              results.bonificationStats.bonificationTypes
            )}`
          );
        }
      }

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
            message: error.message,
          },
        });
      }

      TaskTracker.completeTask(
        cancelTaskId || `dynamic_process_${mappingId}`,
        "failed"
      );

      throw error;
    } finally {
      // Liberar conexiones
      if (sourceConnection) {
        try {
          await ConnectionManager.releaseConnection(sourceConnection);
        } catch (e) {
          logger.warn(`Error liberando conexión origen: ${e.message}`);
        }
      }

      if (targetConnection) {
        try {
          await ConnectionManager.releaseConnection(targetConnection);
        } catch (e) {
          logger.warn(`Error liberando conexión destino: ${e.message}`);
        }
      }
    }
  }

  /**
   * Procesa un documento con bonificaciones habilitadas - VERSIÓN CORREGIDA COMPLETA
   * @param {string} documentId - ID del documento
   * @param {Object} mapping - Configuración de mapeo
   * @param {Object} sourceConnection - Conexión origen
   * @param {Object} targetConnection - Conexión destino
   * @param {Object} currentConsecutive - Consecutivo actual
   * @returns {Promise<Object>} - Resultado del procesamiento
   */
  async processSingleDocumentWithBonifications(
    documentId,
    mapping,
    sourceConnection,
    targetConnection,
    currentConsecutive = null
  ) {
    let processedTables = [];
    let documentType = "unknown";
    let bonificationStats = {
      totalBonifications: 0,
      totalPromotions: 0,
      totalDiscountAmount: 0,
      processedDetails: 0,
    };

    try {
      logger.info(`🎁 Procesando documento con bonificaciones: ${documentId}`);

      const columnLengthCache = new Map();

      // 1. Identificar las tablas principales y de detalle
      const mainTables = mapping.tableConfigs.filter((tc) => !tc.isDetailTable);
      const detailTables = mapping.tableConfigs.filter(
        (tc) => tc.isDetailTable
      );

      if (mainTables.length === 0) {
        return {
          success: false,
          message: "No se encontraron configuraciones de tablas principales",
          documentType,
          consecutiveUsed: null,
          bonificationStats,
        };
      }

      const orderedMainTables = [...mainTables].sort(
        (a, b) => (a.executionOrder || 0) - (b.executionOrder || 0)
      );

      logger.info(
        `🎁 Procesando ${orderedMainTables.length} tablas principales con bonificaciones`
      );

      // 2. Procesar cada tabla principal
      for (const tableConfig of orderedMainTables) {
        try {
          // Obtener datos de origen del encabezado
          const sourceData = await this.getSourceData(
            documentId,
            tableConfig,
            sourceConnection
          );

          if (!sourceData) {
            logger.warn(
              `No se encontraron datos en ${tableConfig.sourceTable} para documento ${documentId}`
            );
            continue;
          }

          // Crear contexto del cliente para promociones
          const customerContext = {
            customerId: sourceData.CUSTOMER_ID || sourceData.COD_CLI,
            customerType: sourceData.CUSTOMER_TYPE || "GENERAL",
            priceList: sourceData.PRICE_LIST || sourceData.LST_PRC,
            salesPerson: sourceData.SALESPERSON || sourceData.VENDEDOR,
            zone: sourceData.ZONE || sourceData.ZONA,
            orderAmount: sourceData.TOTAL_AMOUNT || 0,
            orderDate: sourceData.ORDER_DATE || sourceData.FCH_PED,
          };

          // Procesar dependencias FK si existen
          if (mapping.foreignKeyDependencies?.length > 0) {
            await this.processForeignKeyDependencies(
              documentId,
              mapping,
              sourceConnection,
              targetConnection,
              sourceData
            );
          }

          // Determinar tipo de documento
          documentType = this.determineDocumentType(
            mapping.documentTypeRules,
            sourceData
          );

          // Aplicar consecutivo si está configurado
          if (currentConsecutive && mapping.consecutiveConfig?.enabled) {
            sourceData[mapping.consecutiveConfig.targetField] =
              currentConsecutive.formatted;
          }

          // ✅ NUEVA LÓGICA CORREGIDA: Procesar bonificaciones y detalles
          let enhancedSourceData = { ...sourceData };
          let allProcessedDetails = [];

          // Procesar cada tabla de detalle con bonificaciones
          for (const detailTable of detailTables) {
            try {
              // ✅ PASO 1: Obtener detalles originales
              const originalDetails = await this.getOrderDetailsWithPromotions(
                detailTable,
                documentId,
                sourceConnection
              );

              if (originalDetails.length === 0) {
                logger.warn(
                  `No se encontraron detalles en ${detailTable.sourceTable} para documento ${documentId}`
                );
                continue;
              }

              logger.info(
                `📦 Procesando ${originalDetails.length} detalles originales`
              );

              // ✅ PASO 2: Procesar bonificaciones CORRECTAMENTE
              let bonificationResult = null;
              let bonificationMapping = null;

              if (
                mapping.hasBonificationProcessing &&
                mapping.bonificationConfig
              ) {
                try {
                  bonificationResult =
                    await this.bonificationService.processBonifications(
                      sourceConnection, // ✅ CORRECTO: conexión
                      documentId, // ✅ CORRECTO: documentId
                      mapping.bonificationConfig // ✅ CORRECTO: configuración
                    );

                  if (bonificationResult.success) {
                    bonificationMapping =
                      bonificationResult.bonificationMapping;
                    logger.info(
                      `✅ Bonificaciones procesadas: ${bonificationResult.processed} mapeadas, ${bonificationResult.orphanBonifications} huérfanas`
                    );
                  } else {
                    logger.warn(
                      `⚠️ Error en bonificaciones: ${bonificationResult.error}`
                    );
                  }
                } catch (bonificationError) {
                  logger.error(
                    `❌ Error procesando bonificaciones: ${bonificationError.message}`
                  );
                  // Continuar sin bonificaciones
                }
              }

              // ✅ PASO 3: Aplicar reglas de promociones si están habilitadas
              let enhancedDetails = originalDetails;
              if (mapping.bonificationConfig?.applyPromotionRules) {
                try {
                  enhancedDetails =
                    await this.bonificationService.applyPromotionRules(
                      originalDetails,
                      customerContext,
                      mapping.bonificationConfig
                    );
                  logger.info(
                    `🎯 Promociones aplicadas: ${
                      enhancedDetails.length - originalDetails.length
                    } items añadidos`
                  );
                } catch (promotionError) {
                  logger.warn(
                    `⚠️ Error aplicando promociones: ${promotionError.message}`
                  );
                  enhancedDetails = originalDetails; // Usar originales si falla
                }
              }

              // ✅ PASO 4: Los detalles finales para procesar (ESTOS SÍ SON UN ARRAY)
              const processedDetails = enhancedDetails;

              // ✅ PASO 5: Detectar promociones con validación robusta
              let promotions = {
                summary: {
                  totalBonifiedItems: 0,
                  totalPromotions: 0,
                  totalDiscountAmount: 0,
                  appliedPromotions: [],
                },
              };

              if (
                Array.isArray(processedDetails) &&
                processedDetails.length > 0
              ) {
                try {
                  promotions = this.bonificationService.detectPromotionTypes(
                    processedDetails,
                    mapping.bonificationConfig,
                    sourceData
                  );
                  logger.debug(
                    `🔍 Promociones detectadas: ${promotions.summary.totalPromotions}`
                  );
                } catch (detectionError) {
                  logger.warn(
                    `⚠️ Error detectando promociones: ${detectionError.message}`
                  );
                }
              } else {
                logger.warn(
                  `⚠️ processedDetails no es un array válido: ${typeof processedDetails}, longitud: ${
                    processedDetails?.length
                  }`
                );
              }

              // ✅ PASO 6: Actualizar estadísticas de manera segura
              if (bonificationResult?.success) {
                bonificationStats.totalBonifications +=
                  bonificationResult.processed || 0;
              }
              bonificationStats.totalPromotions +=
                promotions.summary?.totalPromotions || 0;
              bonificationStats.totalDiscountAmount +=
                promotions.summary?.totalDiscountAmount || 0;
              bonificationStats.processedDetails +=
                processedDetails?.length || 0;

              // ✅ PASO 7: Agregar información de promociones al documento principal
              enhancedSourceData.HAS_BONIFICATIONS =
                (bonificationResult?.processed || 0) > 0;
              enhancedSourceData.TOTAL_BONIFICATIONS =
                bonificationResult?.processed || 0;
              enhancedSourceData.TOTAL_DISCOUNT_AMOUNT =
                promotions.summary?.totalDiscountAmount || 0;
              enhancedSourceData.PROMOTION_TYPES = JSON.stringify(
                promotions.summary?.appliedPromotions || []
              );

              // ✅ PASO 8: Insertar documento principal (solo una vez)
              if (allProcessedDetails.length === 0) {
                try {
                  await this.processTable(
                    tableConfig,
                    enhancedSourceData,
                    null, // No hay detailRow para tabla principal
                    targetConnection,
                    currentConsecutive,
                    mapping,
                    documentId,
                    columnLengthCache,
                    false, // isDetailTable = false
                    bonificationMapping // ✅ PASAR EL MAPEO DE BONIFICACIONES
                  );

                  processedTables.push({
                    tableName:
                      tableConfig.targetTable || tableConfig.sourceTable,
                    recordsInserted: 1,
                    tableType: "main",
                  });

                  logger.info(`✅ Documento principal insertado exitosamente`);
                } catch (mainError) {
                  throw new Error(
                    `Error insertando documento principal: ${mainError.message}`
                  );
                }
              }

              // ✅ PASO 9: Insertar detalles procesados
              let detailsInserted = 0;
              const detailErrors = [];

              // Validar que processedDetails sea un array antes de iterar
              if (Array.isArray(processedDetails)) {
                for (const [index, detail] of processedDetails.entries()) {
                  if (!detail || typeof detail !== "object") {
                    logger.warn(
                      `⚠️ Detalle inválido en índice ${index}: ${typeof detail}`
                    );
                    continue;
                  }

                  try {
                    await this.processTable(
                      detailTable,
                      enhancedSourceData, // Datos del encabezado
                      detail, // Datos de esta fila de detalle
                      targetConnection,
                      currentConsecutive,
                      mapping,
                      documentId,
                      columnLengthCache,
                      true, // isDetailTable = true
                      bonificationMapping // ✅ PASAR EL MAPEO DE BONIFICACIONES
                    );

                    detailsInserted++;
                    logger.debug(
                      `✅ Detalle ${index + 1} insertado exitosamente`
                    );
                  } catch (detailError) {
                    detailErrors.push({
                      line: index + 1,
                      article:
                        detail.COD_ART ||
                        detail.CODIGO ||
                        detail[
                          mapping.bonificationConfig?.sourceArticleField
                        ] ||
                        "N/A",
                      error: detailError.message,
                    });
                    logger.error(
                      `❌ Error en detalle línea ${index + 1}: ${
                        detailError.message
                      }`
                    );
                  }
                }
              } else {
                logger.error(
                  `❌ processedDetails no es un array: ${typeof processedDetails}`
                );
                throw new Error(
                  `processedDetails debe ser un array, recibido: ${typeof processedDetails}`
                );
              }

              processedTables.push({
                tableName: detailTable.targetTable || detailTable.sourceTable,
                recordsInserted: detailsInserted,
                totalRecords: processedDetails.length,
                errors: detailErrors,
                tableType: "detail_with_bonifications",
                bonificationStats: bonificationResult
                  ? {
                      mappedBonifications: bonificationResult.processed,
                      orphanBonifications:
                        bonificationResult.orphanBonifications,
                      regularArticles: bonificationResult.regularArticles,
                      bonifications: bonificationResult.bonifications,
                    }
                  : null,
              });

              allProcessedDetails.push(...processedDetails);

              logger.info(
                `🎁 Detalles procesados: ${detailsInserted}/${processedDetails.length} insertados exitosamente`
              );

              if (detailErrors.length > 0) {
                logger.warn(
                  `⚠️ ${detailErrors.length} errores en detalles:`,
                  detailErrors
                );
              }
            } catch (detailError) {
              logger.error(
                `Error procesando tabla de detalle ${detailTable.sourceTable}: ${detailError.message}`
              );
              throw detailError;
            }
          }

          // ✅ PASO 10: Si no hay tablas de detalle, procesar como documento normal
          if (detailTables.length === 0) {
            try {
              await this.processTable(
                tableConfig,
                enhancedSourceData,
                null, // No hay detailRow
                targetConnection,
                currentConsecutive,
                mapping,
                documentId,
                columnLengthCache,
                false // isDetailTable = false
              );

              processedTables.push({
                tableName: tableConfig.targetTable || tableConfig.sourceTable,
                recordsInserted: 1,
                tableType: "main_only",
              });

              logger.info(`✅ Documento sin detalles insertado exitosamente`);
            } catch (mainError) {
              throw new Error(
                `Error insertando documento principal: ${mainError.message}`
              );
            }
          }
        } catch (tableError) {
          logger.error(
            `Error procesando tabla ${tableConfig.sourceTable}: ${tableError.message}`
          );
          throw tableError;
        }
      }

      // ✅ PASO 11: Marcar como procesado si está configurado
      if (
        mapping.markProcessedStrategy === "individual" &&
        mapping.markProcessedField
      ) {
        try {
          await this.markSingleDocument(
            documentId,
            mapping,
            sourceConnection,
            true
          );
          logger.debug(`✅ Documento ${documentId} marcado como procesado`);
        } catch (markError) {
          logger.warn(
            `⚠️ No se pudo marcar documento ${documentId}: ${markError.message}`
          );
          // No fallar el proceso por error de marcado
        }
      }

      logger.info(
        `✅ Documento con bonificaciones procesado exitosamente: ${documentId}`
      );
      logger.info(
        `📊 Estadísticas finales: ${JSON.stringify(bonificationStats)}`
      );

      return {
        success: true,
        message: "Documento procesado exitosamente con bonificaciones",
        documentType,
        consecutiveUsed: currentConsecutive?.formatted || null,
        consecutiveValue: currentConsecutive?.value || null,
        processedTables,
        bonificationStats,
        totalDetailsProcessed: bonificationStats.processedDetails,
      };
    } catch (error) {
      logger.error(
        `❌ Error procesando documento con bonificaciones ${documentId}: ${error.message}`,
        {
          error: error.message,
          stack: error.stack,
          documentId,
          mappingId: mapping._id || mapping.id,
        }
      );

      return {
        success: false,
        message: error.message,
        documentType,
        consecutiveUsed: currentConsecutive?.formatted || null,
        consecutiveValue: currentConsecutive?.value || null,
        processedTables,
        bonificationStats,
        errorDetails: {
          message: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  /**
   * Obtiene detalles del pedido con información de promociones - MÉTODO MEJORADO
   * @private
   */
  async getOrderDetailsWithPromotions(
    detailConfig,
    documentId,
    sourceConnection
  ) {
    try {
      const orderByColumn = detailConfig.orderByColumn || "NUM_LN";
      const requiredFields =
        this.getRequiredFieldsFromTableConfig(detailConfig);

      // Agregar campos adicionales para promociones si existen en la tabla
      const promotionFields = [
        "PROMOTION_TYPE",
        "PROMOTION_ID",
        "PROMOTION_RULE_ID",
        "FAMILY_DISCOUNT_PCT",
        "DISCOUNT_AMOUNT",
        "IS_ONE_TIME_OFFER",
        "ONE_TIME_OFFER_FLAG",
        "REFLECT_AS_DISCOUNT",
        "BONUS_BY_FAMILY",
        "SCALED_PROMOTION",
        "PRODUCT_SPECIFIC",
        "FAMILY_CODE",
        "LINE_AMOUNT",
        "CUSTOMER_TYPE",
        "PRICE_LIST",
      ];

      // Combinar campos requeridos con campos de promociones (eliminar duplicados)
      const allFields = [...new Set([...requiredFields, ...promotionFields])];

      const finalSelectFields = allFields.join(", ");
      const primaryKey = detailConfig.primaryKey || "NUM_PED";

      const query = `
      SELECT ${finalSelectFields}
      FROM ${detailConfig.sourceTable}
      WHERE ${primaryKey} = @documentId
      ${
        detailConfig.filterCondition
          ? ` AND ${detailConfig.filterCondition}`
          : ""
      }
      ORDER BY ${orderByColumn}
    `;

      logger.debug(`🔍 Consulta detalles con promociones: ${query}`);
      const result = await SqlService.query(sourceConnection, query, {
        documentId,
      });

      return result.recordset || [];
    } catch (error) {
      logger.error(
        `Error obteniendo detalles con promociones: ${error.message}`
      );

      // Fallback: intentar con campos básicos si falla
      try {
        logger.warn(
          `Intentando fallback con campos básicos para ${detailConfig.sourceTable}`
        );
        return await this.getDetailDataFromOwnTable(
          detailConfig,
          documentId,
          sourceConnection
        );
      } catch (fallbackError) {
        logger.error(`Error en fallback: ${fallbackError.message}`);
        throw error;
      }
    }
  }

  /**
   * Procesa un único documento según la configuración (sin transacciones)
   * @param {string} documentId - ID del documento
   * @param {Object} mapping - Configuración de mapeo
   * @param {Object} sourceConnection - Conexión a servidor origen
   * @param {Object} targetConnection - Conexión a servidor destino
   * @param {Object} currentConsecutive - Consecutivo generado previamente (opcional)
   * @returns {Promise<Object>} - Resultado del procesamiento
   */
  async processSingleDocumentSimple(
    documentId,
    mapping,
    sourceConnection,
    targetConnection,
    currentConsecutive = null
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

      // 2. Procesar cada tabla principal
      for (const tableConfig of mainTables) {
        // Obtener datos de la tabla de origen
        let sourceData;

        try {
          if (tableConfig.customQuery) {
            // Usar consulta personalizada si existe
            const query = tableConfig.customQuery.replace(
              /@documentId/g,
              documentId
            );
            logger.debug(`Ejecutando consulta personalizada: ${query}`);
            const result = await SqlService.query(sourceConnection, query);
            sourceData = result.recordset[0];
          } else {
            // Construir consulta básica con alias para evitar ambigüedad
            const tableAlias = "t1";
            const query = `
          SELECT ${tableAlias}.* FROM ${tableConfig.sourceTable} ${tableAlias}
          WHERE ${tableAlias}.${
              tableConfig.primaryKey || "NUM_PED"
            } = @documentId
          ${
            tableConfig.filterCondition
              ? ` AND ${tableConfig.filterCondition.replace(
                  /\b(\w+)\b/g,
                  (m, field) => {
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
                  }
                )}`
              : ""
          }
        `;
            logger.debug(`Ejecutando consulta principal: ${query}`);
            const result = await SqlService.query(sourceConnection, query, {
              documentId,
            });
            sourceData = result.recordset[0];
          }

          if (!sourceData) {
            logger.warn(
              `No se encontraron datos en ${tableConfig.sourceTable} para documento ${documentId}`
            );
            continue; // Pasar a la siguiente tabla principal
          }

          logger.debug(
            `Datos de origen obtenidos: ${JSON.stringify(sourceData)}`
          );
        } catch (error) {
          logger.error(
            `Error al obtener datos de origen para documento ${documentId}: ${error.message}`,
            {
              error,
              stack: error.stack,
            }
          );

          throw new Error(`Error al obtener datos de origen: ${error.message}`);
        }

        // 3. Determinar el tipo de documento basado en las reglas
        for (const rule of mapping.documentTypeRules) {
          const fieldValue = sourceData[rule.sourceField];

          if (rule.sourceValues.includes(fieldValue)) {
            documentType = rule.name;
            logger.info(`Tipo de documento determinado: ${documentType}`);
            break;
          }
        }

        // Determinar la clave en la tabla destino correspondiente a primaryKey
        const targetPrimaryKey = this.getTargetPrimaryKeyField(tableConfig);

        // 4. Verificar si el documento ya existe en destino
        const checkQuery = `
      SELECT TOP 1 1 FROM ${tableConfig.targetTable}
      WHERE ${targetPrimaryKey} = @documentId
    `;

        logger.debug(`Verificando existencia en destino: ${checkQuery}`);
        const checkResult = await SqlService.query(
          targetConnection,
          checkQuery,
          {
            documentId,
          }
        );
        const exists = checkResult.recordset?.length > 0;

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

        // 5. Preparar datos para inserción en tabla principal
        const targetData = {};
        const targetFields = [];
        const targetValues = [];
        const directSqlFields = new Set(); // Para rastrear campos con expresiones SQL directas

        // NUEVO: Realizar consulta de lookup en la BD destino para obtener valores
        let lookupResults = {};
        if (tableConfig.fieldMappings.some((fm) => fm.lookupFromTarget)) {
          logger.info(
            `Realizando lookups en BD destino para tabla ${tableConfig.name}`
          );
          const lookupExecution = await this.lookupValuesFromTarget(
            tableConfig,
            sourceData,
            targetConnection
          );

          if (!lookupExecution.success) {
            // Si hay errores críticos en lookup, fallar el procesamiento
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
          let value;

          // NUEVO: Priorizar los valores obtenidos por lookup si existen
          if (
            fieldMapping.lookupFromTarget &&
            lookupResults[fieldMapping.targetField] !== undefined
          ) {
            value = lookupResults[fieldMapping.targetField];
            logger.debug(
              `Usando valor de lookup para ${fieldMapping.targetField}: ${value}`
            );

            targetFields.push(fieldMapping.targetField);
            targetValues.push(`@${fieldMapping.targetField}`);
            targetData[fieldMapping.targetField] = value;
          } else {
            // Verificar si el campo es una función SQL nativa (GETDATE(), etc)
            const defaultValue = fieldMapping.defaultValue;

            // Lista de funciones SQL nativas a insertar directamente
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

            // Verificar si es una función SQL nativa
            const isNativeFunction =
              typeof defaultValue === "string" &&
              sqlNativeFunctions.some((func) =>
                defaultValue.trim().toUpperCase().includes(func)
              );

            if (isNativeFunction) {
              // Para funciones nativas, usar la expresión SQL directamente
              logger.debug(
                `Detectada función SQL nativa para ${fieldMapping.targetField}: ${defaultValue}`
              );

              targetFields.push(fieldMapping.targetField);
              targetValues.push(defaultValue); // Expresión SQL directa
              directSqlFields.add(fieldMapping.targetField); // Marcar como SQL directo
            } else {
              // Obtener valor del origen o usar valor por defecto
              if (fieldMapping.sourceField) {
                value = sourceData[fieldMapping.sourceField];

                // Aplicar eliminación de prefijo específico si está configurado
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
                if (defaultValue === "NULL") {
                  value = null; // Convertir la cadena "NULL" a null real
                } else {
                  value = defaultValue;
                }
              }

              // Si el valor es undefined/null pero hay un valor por defecto
              if (
                (value === undefined || value === null) &&
                defaultValue !== undefined
              ) {
                // Validación de los campos NULL
                if (defaultValue === "NULL") {
                  value = null; // Convertir la cadena "NULL" a null real
                } else {
                  value = defaultValue;
                }
              }

              // Formatear fechas si es necesario
              if (
                value instanceof Date ||
                (typeof value === "string" &&
                  value.includes("T") &&
                  !isNaN(new Date(value).getTime()))
              ) {
                logger.debug(
                  `Convirtiendo fecha a formato SQL Server: ${value}`
                );
                value = this.formatSqlDate(value);
                logger.debug(`Fecha convertida: ${value}`);
              }

              // IMPORTANTE: Aplicar consecutivo si corresponde a esta tabla y campo
              if (
                currentConsecutive &&
                mapping.consecutiveConfig &&
                mapping.consecutiveConfig.enabled
              ) {
                // Verificar si este campo debe recibir el consecutivo (en tabla principal)
                if (
                  mapping.consecutiveConfig.fieldName ===
                    fieldMapping.targetField ||
                  (mapping.consecutiveConfig.applyToTables &&
                    mapping.consecutiveConfig.applyToTables.some(
                      (t) =>
                        t.tableName === tableConfig.name &&
                        t.fieldName === fieldMapping.targetField
                    ))
                ) {
                  // Asignar el consecutivo al campo correspondiente
                  value = currentConsecutive.formatted;
                  logger.debug(
                    `Asignando consecutivo ${currentConsecutive.formatted} a campo ${fieldMapping.targetField} en tabla ${tableConfig.name}`
                  );
                }
              }

              // Si es un campo obligatorio y aún no tiene valor, lanzar error
              if (
                fieldMapping.isRequired &&
                (value === undefined || value === null)
              ) {
                throw new Error(
                  `El campo obligatorio '${fieldMapping.targetField}' no tiene valor de origen ni valor por defecto`
                );
              }

              // Aplicar mapeo de valores si existe
              if (
                value !== null &&
                value !== undefined &&
                fieldMapping.valueMappings?.length > 0
              ) {
                const mapping = fieldMapping.valueMappings.find(
                  (vm) => vm.sourceValue === value
                );
                if (mapping) {
                  logger.debug(
                    `Aplicando mapeo de valor para ${fieldMapping.targetField}: ${value} → ${mapping.targetValue}`
                  );
                  value = mapping.targetValue;
                }
              }

              // Si el valor es un string, verificar y ajustar longitud
              if (typeof value === "string") {
                const maxLength = await this.getColumnMaxLength(
                  targetConnection,
                  tableConfig.targetTable,
                  fieldMapping.targetField,
                  columnLengthCache
                );

                // Si hay un límite de longitud y se excede, truncar
                if (maxLength > 0 && value.length > maxLength) {
                  logger.warn(
                    `Truncando valor para campo ${fieldMapping.targetField} de longitud ${value.length} a ${maxLength} caracteres en documento ${documentId}`
                  );
                  value = value.substring(0, maxLength);
                }
              }

              targetData[fieldMapping.targetField] = value;
              targetFields.push(fieldMapping.targetField);
              targetValues.push(`@${fieldMapping.targetField}`);
            }
          }
        }

        // 6. Construir la consulta INSERT con manejo especial para expresiones SQL directas
        const insertFieldsList = targetFields;
        const insertValuesList = targetFields.map((field, index) => {
          return directSqlFields.has(field) ? targetValues[index] : `@${field}`;
        });

        const insertQuery = `
      INSERT INTO ${tableConfig.targetTable} (${insertFieldsList.join(", ")})
      VALUES (${insertValuesList.join(", ")})
    `;

        logger.debug(
          `Ejecutando inserción en tabla principal ${tableConfig.name}: ${insertQuery}`
        );
        logger.debug(`Parámetros: ${JSON.stringify(targetData)}`);

        // Filtrar los datos para que solo contengan los campos que realmente son parámetros
        const filteredTargetData = {};
        for (const field in targetData) {
          if (!directSqlFields.has(field)) {
            filteredTargetData[field] = targetData[field];
          }
        }

        await SqlService.query(
          targetConnection,
          insertQuery,
          filteredTargetData
        );
        logger.info(
          `Insertado encabezado en ${tableConfig.name} sin transacción`
        );
        processedTables.push(tableConfig.name);

        // 7. Procesar tablas de detalle relacionadas
        const detailTables = mapping.tableConfigs.filter(
          (tc) => tc.isDetailTable && tc.parentTableRef === tableConfig.name
        );

        for (const detailConfig of detailTables) {
          // Obtener detalles
          let detailsData;

          if (detailConfig.customQuery) {
            // Usar consulta personalizada
            const query = detailConfig.customQuery.replace(
              /@documentId/g,
              documentId
            );
            logger.debug(
              `Ejecutando consulta personalizada para detalles: ${query}`
            );
            const result = await SqlService.query(sourceConnection, query);
            detailsData = result.recordset;
          } else {
            // Construir consulta básica con alias para evitar ambigüedad
            const tableAlias = "d1";
            const orderByColumn = detailConfig.orderByColumn || "";
            const query = `
          SELECT ${tableAlias}.* FROM ${detailConfig.sourceTable} ${tableAlias}
          WHERE ${tableAlias}.${
              detailConfig.primaryKey || "NUM_PED"
            } = @documentId
          ${
            detailConfig.filterCondition
              ? ` AND ${detailConfig.filterCondition.replace(
                  /\b(\w+)\b/g,
                  (m, field) => {
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
                  }
                )}`
              : ""
          }
          ${orderByColumn ? ` ORDER BY ${tableAlias}.${orderByColumn}` : ""}
        `;
            logger.debug(`Ejecutando consulta para detalles: ${query}`);
            const result = await SqlService.query(sourceConnection, query, {
              documentId,
            });
            detailsData = result.recordset;
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

          // Insertar detalles - usar el mismo consecutivo que el encabezado
          for (const detailRow of detailsData) {
            const detailTargetData = {};
            const detailFields = [];
            const detailValues = [];
            const detailDirectSqlFields = new Set(); // Para SQL directo en detalles

            // NUEVO: Realizar lookup para este detalle si es necesario
            let detailLookupResults = {};
            if (detailConfig.fieldMappings.some((fm) => fm.lookupFromTarget)) {
              logger.info(
                `Realizando lookups en BD destino para detalle en tabla ${detailConfig.name}`
              );

              // Los detalles pueden requerir valores del header para las consultas
              const combinedSourceData = {
                ...sourceData, // Datos del encabezado
                ...detailRow, // Datos del detalle (prevalecen sobre el encabezado en caso de colisión)
              };

              const detailLookupExecution = await this.lookupValuesFromTarget(
                detailConfig,
                combinedSourceData,
                targetConnection
              );

              if (!detailLookupExecution.success) {
                // Si hay errores críticos en lookup, fallar el procesamiento
                const failedMsg = detailLookupExecution.failedFields
                  ? detailLookupExecution.failedFields
                      .map((f) => `${f.field}: ${f.error}`)
                      .join(", ")
                  : detailLookupExecution.error ||
                    "Error desconocido en lookup de detalle";

                throw new Error(
                  `Falló la validación de lookup para detalle en tabla ${detailConfig.name}: ${failedMsg}`
                );
              }

              detailLookupResults = detailLookupExecution.results;
              logger.info(
                `Lookup de detalle completado exitosamente. Continuando con el procesamiento...`
              );
            }

            for (const fieldMapping of detailConfig.fieldMappings) {
              let value;

              // NUEVO: Priorizar los valores obtenidos por lookup si existen
              if (
                fieldMapping.lookupFromTarget &&
                detailLookupResults[fieldMapping.targetField] !== undefined
              ) {
                value = detailLookupResults[fieldMapping.targetField];
                logger.debug(
                  `Usando valor de lookup para detalle ${fieldMapping.targetField}: ${value}`
                );

                detailFields.push(fieldMapping.targetField);
                detailValues.push(`@${fieldMapping.targetField}`);
                detailTargetData[fieldMapping.targetField] = value;
              } else {
                // Verificar si el campo es una función SQL nativa (GETDATE(), etc)
                const defaultValue = fieldMapping.defaultValue;

                // Lista de funciones SQL nativas a insertar directamente
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

                // Verificar si es una función SQL nativa
                const isNativeFunction =
                  typeof defaultValue === "string" &&
                  sqlNativeFunctions.some((func) =>
                    defaultValue.trim().toUpperCase().includes(func)
                  );

                if (isNativeFunction) {
                  // Para funciones nativas, usar la expresión SQL directamente
                  logger.debug(
                    `Detectada función SQL nativa para detalle ${fieldMapping.targetField}: ${defaultValue}`
                  );

                  detailFields.push(fieldMapping.targetField);
                  detailValues.push(defaultValue); // Expresión SQL directa
                  detailDirectSqlFields.add(fieldMapping.targetField); // Marcar como SQL directo
                } else {
                  // Obtener valor del origen o usar valor por defecto
                  value = detailRow[fieldMapping.sourceField];

                  // Aplicar eliminación de prefijo específico si está configurado
                  if (
                    fieldMapping.removePrefix &&
                    typeof value === "string" &&
                    value.startsWith(fieldMapping.removePrefix)
                  ) {
                    const originalValue = value;
                    value = value.substring(fieldMapping.removePrefix.length);
                    logger.debug(
                      `Prefijo '${fieldMapping.removePrefix}' eliminado del campo de detalle ${fieldMapping.sourceField}: '${originalValue}' → '${value}'`
                    );
                  }

                  if (
                    (value === undefined || value === null) &&
                    fieldMapping.defaultValue !== undefined
                  ) {
                    if (fieldMapping.defaultValue === "NULL") {
                      value = null;
                    } else {
                      value = fieldMapping.defaultValue;
                    }
                  }

                  // Formatear fechas si es necesario
                  if (
                    value instanceof Date ||
                    (typeof value === "string" &&
                      value.includes("T") &&
                      !isNaN(new Date(value).getTime()))
                  ) {
                    logger.debug(
                      `Convirtiendo fecha de detalle a formato SQL Server: ${value}`
                    );
                    value = this.formatSqlDate(value);
                    logger.debug(`Fecha de detalle convertida: ${value}`);
                  }

                  // IMPORTANTE: Aplicar consecutivo en detalles si corresponde
                  if (
                    currentConsecutive &&
                    mapping.consecutiveConfig &&
                    mapping.consecutiveConfig.enabled
                  ) {
                    // Verificar si este campo debe recibir el consecutivo (en tabla de detalle)
                    if (
                      mapping.consecutiveConfig.detailFieldName ===
                        fieldMapping.targetField ||
                      (mapping.consecutiveConfig.applyToTables &&
                        mapping.consecutiveConfig.applyToTables.some(
                          (t) =>
                            t.tableName === detailConfig.name &&
                            t.fieldName === fieldMapping.targetField
                        ))
                    ) {
                      // Asignar el consecutivo al campo correspondiente en el detalle
                      value = currentConsecutive.formatted;
                      logger.debug(
                        `Asignando consecutivo ${currentConsecutive.formatted} a campo ${fieldMapping.targetField} en tabla de detalle ${detailConfig.name}`
                      );
                    }
                  }

                  // Si es un campo obligatorio y aún no tiene valor, lanzar error
                  if (
                    fieldMapping.isRequired &&
                    (value === undefined || value === null)
                  ) {
                    throw new Error(
                      `El campo obligatorio '${fieldMapping.targetField}' en detalle no tiene valor de origen ni valor por defecto`
                    );
                  }

                  // Aplicar mapeo de valores si existe
                  if (
                    value !== null &&
                    value !== undefined &&
                    fieldMapping.valueMappings?.length > 0
                  ) {
                    const mapping = fieldMapping.valueMappings.find(
                      (vm) => vm.sourceValue === value
                    );
                    if (mapping) {
                      logger.debug(
                        `Aplicando mapeo de valor para detalle ${fieldMapping.targetField}: ${value} → ${mapping.targetValue}`
                      );
                      value = mapping.targetValue;
                    }
                  }

                  // Si el valor es un string, verificar y ajustar longitud
                  if (typeof value === "string") {
                    const maxLength = await this.getColumnMaxLength(
                      targetConnection,
                      detailConfig.targetTable,
                      fieldMapping.targetField,
                      columnLengthCache
                    );

                    // Si hay un límite de longitud y se excede, truncar
                    if (maxLength > 0 && value.length > maxLength) {
                      logger.warn(
                        `Truncando valor para campo ${fieldMapping.targetField} de longitud ${value.length} a ${maxLength} caracteres en detalle de documento ${documentId}`
                      );
                      value = value.substring(0, maxLength);
                    }
                  }

                  detailTargetData[fieldMapping.targetField] = value;
                  detailFields.push(fieldMapping.targetField);
                  detailValues.push(`@${fieldMapping.targetField}`);
                }
              }
            }

            // Construir la consulta INSERT para detalle con manejo especial para SQL directo
            const insertDetailFieldsList = detailFields;
            const insertDetailValuesList = detailFields.map((field, index) => {
              return detailDirectSqlFields.has(field)
                ? detailValues[index]
                : `@${field}`;
            });

            const insertDetailQuery = `
          INSERT INTO ${
            detailConfig.targetTable
          } (${insertDetailFieldsList.join(", ")})
          VALUES (${insertDetailValuesList.join(", ")})
        `;

            logger.debug(
              `Ejecutando inserción en tabla de detalle: ${insertDetailQuery}`
            );

            // Filtrar los datos para que solo contengan los campos que realmente son parámetros
            const filteredDetailData = {};
            for (const field in detailTargetData) {
              if (!detailDirectSqlFields.has(field)) {
                filteredDetailData[field] = detailTargetData[field];
              }
            }

            logger.debug(
              `Parámetros de detalle: ${JSON.stringify(filteredDetailData)}`
            );

            // Insertar detalle sin transacción
            await SqlService.query(
              targetConnection,
              insertDetailQuery,
              filteredDetailData
            );
          }

          logger.info(
            `Insertados detalles en ${detailConfig.name} sin transacción`
          );
          processedTables.push(detailConfig.name);
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

      // NO ACTUALIZAR el consecutivo aquí porque ya se maneja individualmente en processDocuments

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
      // Manejo de errores específicos

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
            // Intentar extraer errores internos si existen
            innerErrors: error.errors
              ? JSON.stringify(error.errors)
              : "No inner errors available",
          }
        );

        // Intentar reconexión
        try {
          logger.info(`Intentando reconexión para documento ${documentId}...`);
          const targetServer = mapping.targetServer;
          const reconnectResult = await ConnectionManager.enhancedRobustConnect(
            targetServer
          );

          if (!reconnectResult.success) {
            throw new Error(
              `No se pudo restablecer conexión a ${targetServer}`
            );
          }

          logger.info(`Reconexión exitosa a ${targetServer}`);

          return {
            success: false,
            message: `Error de conexión: Se perdió la conexión con la base de datos. Se ha restablecido la conexión pero este documento debe procesarse nuevamente.`,
            documentType: "unknown",
            errorDetails: JSON.stringify({
              name: error.name,
              message: error.message,
              stack: error.stack,
              innerErrors: error.errors,
            }),
            consecutiveUsed: currentConsecutive
              ? currentConsecutive.formatted
              : null,
            consecutiveValue: currentConsecutive
              ? currentConsecutive.value
              : null,
            errorCode: "CONNECTION_ERROR",
          };
        } catch (reconnectError) {
          logger.error(
            `Error al intentar reconexión para documento ${documentId}: ${reconnectError.message}`,
            {
              originalError: error.message,
              reconnectError: reconnectError.message,
              reconnectStack: reconnectError.stack,
            }
          );
          return {
            success: false,
            message: `Error grave de conexión: ${
              error.message || "Error en comunicación con la base de datos"
            }. Por favor, intente nuevamente más tarde.`,
            documentType: "unknown",
            errorDetails: JSON.stringify({
              originalError: {
                name: error.name,
                message: error.message,
                stack: error.stack,
              },
              reconnectError: {
                message: reconnectError.message,
                stack: reconnectError.stack,
              },
            }),
            consecutiveUsed: currentConsecutive
              ? currentConsecutive.formatted
              : null,
            consecutiveValue: currentConsecutive
              ? currentConsecutive.value
              : null,
            errorCode: "SEVERE_CONNECTION_ERROR",
          };
        }
      }

      // Error de truncado
      if (
        error.message &&
        error.message.includes("String or binary data would be truncated")
      ) {
        const match = error.message.match(/column '([^']+)'/);
        const columnName = match ? match[1] : "desconocida";
        const detailedMessage = `Error de truncado: El valor es demasiado largo para la columna '${columnName}'. Verifique la longitud máxima permitida.`;
        logger.error(
          `Error de truncado en documento ${documentId}: ${detailedMessage}`
        );

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
        logger.error(
          `Error de valor NULL en documento ${documentId}: ${detailedMessage}`
        );

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

      // Error de conversión de fecha
      if (
        error.message &&
        error.message.toLowerCase().includes("conversion failed") &&
        (error.message.toLowerCase().includes("date") ||
          error.message.toLowerCase().includes("time"))
      ) {
        logger.error(
          `Error de conversión de fecha en documento ${documentId}: ${error.message}`,
          {
            documentId,
            errorStack: error.stack,
            errorDetails: error.code || error.number || "",
          }
        );

        return {
          success: false,
          message: `Error de conversión de fecha: ${error.message}. Por favor, verifique los formatos de fecha utilizados.`,
          documentType: "unknown",
          errorDetails: error.stack,
          errorCode: "DATE_CONVERSION_ERROR",
          consecutiveUsed: null,
          consecutiveValue: null,
        };
      }

      // Syntax error in SQL - común con funciones SQL
      if (
        error.message &&
        (error.message.includes("Incorrect syntax") ||
          error.message.includes("syntax error") ||
          error.message.includes("Syntax error"))
      ) {
        logger.error(
          `Error de sintaxis SQL en documento ${documentId}: ${error.message}`,
          {
            documentId,
            errorStack: error.stack,
            errorDetails: error.code || error.number || "",
          }
        );

        return {
          success: false,
          message: `Error de sintaxis en expresión SQL: ${error.message}. Por favor, verifique las funciones SQL configuradas.`,
          documentType: "unknown",
          errorDetails: error.stack,
          errorCode: "SQL_SYNTAX_ERROR",
          consecutiveUsed: null,
          consecutiveValue: null,
        };
      }

      // Error general
      logger.error(
        `Error procesando documento ${documentId}: ${error.message}`,
        {
          documentId,
          errorStack: error.stack,
          errorDetails: error.code || error.number || "",
        }
      );
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
    SET ${mapping.markProcessedField} = @processedValue
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
}

module.exports = new DynamicTransferService();
