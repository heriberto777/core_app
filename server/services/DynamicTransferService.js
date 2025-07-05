// services/DynamicTransferService.js
const logger = require("./logger");
const ConnectionService = require("./ConnectionCentralService");
const { SqlService } = require("./SqlService");
const TransferMapping = require("../models/transferMappingModel");
const TaskExecution = require("../models/taskExecutionModel");
const TaskTracker = require("./TaskTracker");
const TransferTask = require("../models/transferTaks");
const ConsecutiveService = require("./ConsecutiveService");
const { sendProgress } = require("./progressSse");
const UnifiedCancellationService = require("./UnifiedCancellationService");
const BonificationIntegrationService = require("./BonificationProcessingService");

class DynamicTransferService {
  constructor() {
    this.activeProcesses = new Map();
    this.processingStats = {
      totalProcessed: 0,
      totalFailed: 0,
      averageProcessingTime: 0,
      lastProcessingTime: null,
    };

    logger.info("🚀 DynamicTransferService inicializado");
  }

  /**
   * 🎁 CORREGIDO: Procesa documentos según una configuración de mapeo con soporte completo para bonificaciones
   * @param {Array} documentIds - IDs de los documentos a procesar
   * @param {string} mappingId - ID de la configuración de mapeo
   * @param {Object} signal - Señal de AbortController para cancelación
   * @param {Object} options - Opciones de procesamiento
   * @returns {Promise<Object>} - Resultado del procesamiento
   */
  async processDocuments(documentIds, mappingId, signal = null, options = {}) {
    const processingId = `dynamic_process_${mappingId}_${Date.now()}`;
    const startTime = Date.now();

    logger.info(
      `🔄 [${processingId}] Iniciando procesamiento de ${documentIds.length} documentos`
    );

    // Crear AbortController local si no se proporcionó signal
    const localAbortController = !signal ? new AbortController() : null;
    signal = signal || localAbortController.signal;

    // Configurar un timeout interno como medida de seguridad
    const timeoutId = setTimeout(() => {
      if (localAbortController) {
        logger.warn(
          `⏰ [${processingId}] Timeout interno activado para tarea ${mappingId}`
        );
        localAbortController.abort();
      }
    }, 300000); // 5 minutos

    let sourceConnection = null;
    let targetConnection = null;
    let executionId = null;
    let mapping = null;
    let transaction = null;

    // Variables para resultados CON estadísticas de bonificaciones
    const results = {
      success: true,
      processed: 0,
      failed: 0,
      skipped: 0,
      details: [],
      errors: [],
      processingTime: 0,
      rollbackExecuted: false,
      // 🎁 NUEVO: Estadísticas de bonificaciones
      bonificationStats: {
        totalDocumentsWithBonifications: 0,
        totalBonifications: 0,
        totalPromotions: 0,
        totalDiscountAmount: 0,
        processedDetails: 0,
        bonificationTypes: {},
        errorDetails: [],
      },
    };

    // Arrays para tracking
    const successfulDocuments = [];
    const failedDocuments = [];
    let hasErrors = false;

    try {
      // 1. Registrar proceso en TaskTracker
      logger.info(`📝 [${processingId}] Registrando proceso en TaskTracker`);
      TaskTracker.registerTask(
        processingId,
        localAbortController || { abort: () => {} },
        {
          type: "dynamicProcessing",
          mappingId,
          totalRecords: documentIds.length,
          startTime: new Date(),
        }
      );

      // 2. Cargar configuración de mapeo
      logger.info(
        `📋 [${processingId}] Cargando configuración de mapeo: ${mappingId}`
      );
      mapping = await TransferMapping.findById(mappingId);
      if (!mapping) {
        clearTimeout(timeoutId);
        throw new Error(`Configuración de mapeo ${mappingId} no encontrada`);
      }

      logger.info(`✅ [${processingId}] Mapping cargado: ${mapping.name}`);

      // 🎁 NUEVO: Log de configuración de bonificaciones
      if (
        mapping.hasBonificationProcessing &&
        mapping.bonificationConfig?.enabled
      ) {
        logger.info(
          `🎁 [${processingId}] Procesamiento de bonificaciones habilitado`
        );
      }

      // Asegurar configuración por defecto para mappings existentes
      if (!mapping.markProcessedStrategy) {
        mapping.markProcessedStrategy = "individual";
        logger.debug(
          `🔧 [${processingId}] Configurando estrategia de marcado por defecto: individual`
        );
      }

      if (!mapping.markProcessedConfig) {
        mapping.markProcessedConfig = {
          batchSize: 100,
          includeTimestamp: true,
          timestampField: "LAST_PROCESSED_DATE",
          allowRollback: false,
        };
        logger.debug(
          `🔧 [${processingId}] Configurando configuración de marcado por defecto`
        );
      }

      // 3. Establecer conexiones
      logger.info(`🔗 [${processingId}] Estableciendo conexiones...`);
      sourceConnection = await ConnectionService.getConnection(
        mapping.sourceServer
      );
      targetConnection = await ConnectionService.getConnection(
        mapping.targetServer
      );
      logger.info(`✅ [${processingId}] Conexiones establecidas correctamente`);

      // 4. Crear registro de ejecución
      logger.info(`📊 [${processingId}] Creando registro de ejecución`);
      executionId = await this.createExecutionRecord(
        mappingId,
        documentIds.length
      );
      logger.info(
        `✅ [${processingId}] Registro de ejecución creado: ${executionId}`
      );

      // 5. Iniciar transacción si está configurada
      if (mapping.useTransaction) {
        logger.info(`🔄 [${processingId}] Iniciando transacción`);
        transaction = await ConnectionService.beginTransaction(
          targetConnection
        );
        logger.info(`✅ [${processingId}] Transacción iniciada correctamente`);
      }

      // 6. Procesar documentos individualmente
      logger.info(`🔄 [${processingId}] Iniciando procesamiento de documentos`);
      let processedCount = 0;

      for (const documentId of documentIds) {
        const docStartTime = Date.now();

        try {
          // Verificar cancelación
          if (signal && signal.aborted) {
            logger.info(
              `⏹️ [${processingId}] Procesamiento cancelado para documento ${documentId}`
            );
            results.skipped++;
            continue;
          }

          logger.debug(
            `📄 [${processingId}] Procesando documento: ${documentId}`
          );

          // Actualizar progreso
          const progress = Math.round(
            (processedCount / documentIds.length) * 100
          );
          if (mapping.taskId) {
            await TransferTask.findByIdAndUpdate(mapping.taskId, {
              status: "running",
              progress: progress,
            });
            sendProgress(mapping.taskId, progress);
          }

          // 🎁 MODIFICADO: Procesar documento individual con captura de estadísticas
          const docResult = await this.processDocument(
            documentId,
            mapping,
            sourceConnection,
            targetConnection,
            transaction,
            executionId,
            processingId,
            options // 🎁 NUEVO: Pasar opciones al procesamiento
          );

          const docProcessingTime = Date.now() - docStartTime;

          if (docResult.success) {
            results.processed++;
            successfulDocuments.push(documentId);

            // 🎁 NUEVO: Acumular estadísticas de bonificaciones si existen
            if (docResult.bonificationStats) {
              this.accumulateBonificationStats(
                results.bonificationStats,
                docResult.bonificationStats
              );
            }

            logger.info(
              `✅ [${processingId}] Documento ${documentId} procesado exitosamente en ${docProcessingTime}ms`
            );
          } else {
            results.failed++;
            failedDocuments.push(documentId);
            hasErrors = true;
            logger.error(
              `❌ [${processingId}] Error procesando documento ${documentId}: ${docResult.error}`
            );
          }

          results.details.push({
            documentId,
            success: docResult.success,
            message: docResult.message,
            processingTime: docProcessingTime,
            error: docResult.error,
            bonificationStats: docResult.bonificationStats, // 🎁 NUEVO: Incluir estadísticas por documento
          });

          processedCount++;
        } catch (docError) {
          const docProcessingTime = Date.now() - docStartTime;

          // Verificar si fue cancelado
          if (signal?.aborted) {
            clearTimeout(timeoutId);
            throw new Error("Tarea cancelada por el usuario");
          }

          hasErrors = true;
          failedDocuments.push(documentId);
          results.failed++;

          logger.error(
            `💥 [${processingId}] Error crítico procesando documento ${documentId}: ${docError.message}`
          );
          logger.debug(`📊 [${processingId}] Stack trace: ${docError.stack}`);

          results.details.push({
            documentId,
            success: false,
            error: docError.message,
            processingTime: docProcessingTime,
            errorDetails: docError.stack,
            bonificationStats: null,
          });

          results.errors.push({
            documentId,
            error: docError.message,
            timestamp: new Date(),
          });
        }
      }

      // 7. Confirmar transacción si todo fue exitoso
      if (transaction) {
        if (hasErrors && mapping.rollbackOnError) {
          logger.warn(
            `🔄 [${processingId}] Ejecutando rollback debido a errores`
          );
          await ConnectionService.rollbackTransaction(transaction);
          results.rollbackExecuted = true;
          logger.info(`✅ [${processingId}] Rollback ejecutado correctamente`);
        } else {
          logger.info(`✅ [${processingId}] Confirmando transacción`);
          await ConnectionService.commitTransaction(transaction);
          logger.info(
            `✅ [${processingId}] Transacción confirmada correctamente`
          );
        }
      }

      // 8. Marcado de documentos procesados
      if (
        mapping.markProcessedStrategy === "batch" &&
        successfulDocuments.length > 0
      ) {
        logger.info(
          `📦 [${processingId}] Iniciando marcado en lotes para ${successfulDocuments.length} documentos exitosos`
        );

        try {
          const markResult = await this.markDocumentsAsProcessed(
            successfulDocuments,
            mapping,
            sourceConnection,
            true
          );

          logger.info(
            `📦 [${processingId}] Resultado del marcado en lotes: ${markResult.message}`
          );
          results.markingResult = markResult;

          if (markResult.failed > 0) {
            logger.warn(
              `⚠️ [${processingId}] ${markResult.failed} documentos exitosos no se pudieron marcar como procesados`
            );
          }
        } catch (markError) {
          logger.error(
            `❌ [${processingId}] Error en marcado por lotes: ${markError.message}`
          );
          results.markingError = markError.message;
        }
      }

      // 9. Rollback si está habilitado y hay fallos críticos
      if (
        mapping.markProcessedConfig?.allowRollback &&
        failedDocuments.length > 0 &&
        mapping.markProcessedStrategy === "batch" &&
        successfulDocuments.length > 0
      ) {
        logger.warn(
          `🔄 [${processingId}] Rollback habilitado: desmarcando ${successfulDocuments.length} documentos debido a fallos`
        );

        try {
          await this.markDocumentsAsProcessed(
            successfulDocuments,
            mapping,
            sourceConnection,
            false
          );
          logger.info(
            `🔄 [${processingId}] Rollback completado: documentos desmarcados`
          );
          results.rollbackExecuted = true;
        } catch (rollbackError) {
          logger.error(
            `❌ [${processingId}] Error en rollback: ${rollbackError.message}`
          );
          results.rollbackError = rollbackError.message;
        }
      }

      // 10. Actualizar estadísticas del servicio
      const processingTime = Date.now() - startTime;
      results.processingTime = processingTime;

      this.processingStats.totalProcessed += results.processed;
      this.processingStats.totalFailed += results.failed;
      this.processingStats.lastProcessingTime = processingTime;

      // Calcular tiempo promedio
      const totalOperations =
        this.processingStats.totalProcessed + this.processingStats.totalFailed;
      this.processingStats.averageProcessingTime =
        (this.processingStats.averageProcessingTime *
          (totalOperations - documentIds.length) +
          processingTime) /
        totalOperations;

      // 11. Finalizar registro de ejecución
      await this.updateExecutionRecord(executionId, results, hasErrors);

      // 12. Actualizar tarea principal
      if (mapping.taskId) {
        await this.updateTaskStatus(mapping.taskId, results, hasErrors);
      }

      // 13. Completar en TaskTracker
      const finalStatus = hasErrors ? "partial" : "completed";
      await TaskTracker.safeCompleteTask(processingId, finalStatus);

      logger.info(
        `🎉 [${processingId}] Procesamiento completado: ${results.processed} éxitos, ${results.failed} fallos en ${processingTime}ms`
      );

      // 🎁 NUEVO: Log de estadísticas de bonificaciones
      if (results.bonificationStats.totalBonifications > 0) {
        logger.info(
          `🎁 [${processingId}] Estadísticas de bonificaciones: ${results.bonificationStats.totalBonifications} bonificaciones procesadas en ${results.bonificationStats.totalDocumentsWithBonifications} documentos`
        );
        logger.info(
          `🎁 [${processingId}] Tipos de bonificaciones: ${JSON.stringify(
            results.bonificationStats.bonificationTypes
          )}`
        );
      }

      clearTimeout(timeoutId);

      // 🎁 NUEVO: Limpiar estadísticas de bonificaciones si están vacías
      if (results.bonificationStats.totalBonifications === 0) {
        results.bonificationStats = null;
      }

      return results;
    } catch (error) {
      clearTimeout(timeoutId);

      logger.error(
        `💥 [${processingId}] Error crítico en processDocuments: ${error.message}`
      );
      logger.debug(`📊 [${processingId}] Stack trace: ${error.stack}`);

      // Rollback si hay transacción activa
      if (transaction) {
        try {
          logger.warn(`🔄 [${processingId}] Ejecutando rollback de emergencia`);
          await ConnectionService.rollbackTransaction(transaction);
          results.rollbackExecuted = true;
          logger.info(`✅ [${processingId}] Rollback de emergencia ejecutado`);
        } catch (rollbackError) {
          logger.error(
            `❌ [${processingId}] Error en rollback de emergencia: ${rollbackError.message}`
          );
          results.rollbackError = rollbackError.message;
        }
      }

      // Marcar como fallido en TaskTracker
      await TaskTracker.safeCompleteTask(processingId, "failed");

      results.success = false;
      results.error = error.message;
      results.processingTime = Date.now() - startTime;

      throw error;
    } finally {
      // Limpiar recursos
      if (sourceConnection) {
        try {
          await ConnectionService.releaseConnection(sourceConnection);
          logger.debug(`🔗 [${processingId}] Conexión source liberada`);
        } catch (connError) {
          logger.error(
            `❌ [${processingId}] Error liberando conexión source: ${connError.message}`
          );
        }
      }

      if (targetConnection) {
        try {
          await ConnectionService.releaseConnection(targetConnection);
          logger.debug(`🔗 [${processingId}] Conexión target liberada`);
        } catch (connError) {
          logger.error(
            `❌ [${processingId}] Error liberando conexión target: ${connError.message}`
          );
        }
      }

      // Remover del tracking de procesos activos
      this.activeProcesses.delete(processingId);

      logger.info(`🏁 [${processingId}] Limpieza de recursos completada`);
    }
  }

  /**
   * 🎁 NUEVO: Acumula estadísticas de bonificaciones a nivel de lote
   * @param {Object} accumulator - Acumulador de estadísticas
   * @param {Object} documentStats - Estadísticas del documento
   */
  accumulateBonificationStats(accumulator, documentStats) {
    if (!documentStats || !documentStats.totalBonifications) return;

    accumulator.totalDocumentsWithBonifications++;
    accumulator.totalBonifications += documentStats.totalBonifications || 0;
    accumulator.totalPromotions += documentStats.totalPromotions || 0;
    accumulator.totalDiscountAmount += documentStats.totalDiscountAmount || 0;
    accumulator.processedDetails += documentStats.processedDetails || 0;

    // Acumular tipos de bonificaciones
    if (documentStats.bonificationTypes) {
      Object.entries(documentStats.bonificationTypes).forEach(
        ([type, count]) => {
          accumulator.bonificationTypes[type] =
            (accumulator.bonificationTypes[type] || 0) + count;
        }
      );
    }

    // Acumular errores
    if (documentStats.errorDetails) {
      accumulator.errorDetails.push(...documentStats.errorDetails);
    }
  }

  /**
   * 🎁 MODIFICADO: Procesa un documento individual con soporte para bonificaciones
   * @private
   */
  async processDocument(
    documentId,
    mapping,
    sourceConnection,
    targetConnection,
    transaction,
    executionId,
    processingId,
    options = {}
  ) {
    const docId = `${processingId}_doc_${documentId}`;
    let bonificationStats = null;

    try {
      logger.debug(`📄 [${docId}] Iniciando procesamiento de documento`);

      // 1. Obtener datos del documento
      const sourceData = await this.getDocumentData(
        documentId,
        mapping,
        sourceConnection
      );

      if (!sourceData) {
        logger.warn(`⚠️ [${docId}] No se encontraron datos para el documento`);
        return {
          success: false,
          error: `No se encontraron datos para documento ${documentId}`,
          message: "Documento no encontrado",
          bonificationStats: null,
        };
      }

      logger.debug(`✅ [${docId}] Datos del documento obtenidos correctamente`);

      // 2. Verificar si ya existe en destino (si está configurado)
      if (mapping.checkDuplicates) {
        const exists = await this.checkDocumentExists(
          documentId,
          mapping,
          targetConnection
        );
        if (exists) {
          logger.info(`⚠️ [${docId}] Documento ya existe en destino, saltando`);
          return {
            success: false,
            error: "Documento ya existe en destino",
            message: "Duplicado saltado",
            bonificationStats: null,
          };
        }
      }

      // 3. Obtener consecutivo si es necesario
      let currentConsecutive = null;
      if (mapping.consecutiveConfig && mapping.consecutiveConfig.enabled) {
        currentConsecutive = await this.getNextConsecutive(mapping);
        logger.debug(
          `🔢 [${docId}] Consecutivo obtenido: ${currentConsecutive}`
        );
      }

      // 4. Procesar tablas principales
      const mainTables = mapping.tableConfigs.filter((tc) => !tc.isDetailTable);
      const columnLengthCache = new Map();

      logger.debug(
        `🏗️ [${docId}] Procesando ${mainTables.length} tablas principales`
      );

      for (const tableConfig of mainTables) {
        logger.debug(
          `📋 [${docId}] Procesando tabla principal: ${tableConfig.name}`
        );

        await this.processTable(
          tableConfig,
          sourceData,
          null,
          targetConnection,
          currentConsecutive,
          mapping,
          documentId,
          columnLengthCache,
          false
        );

        logger.debug(
          `✅ [${docId}] Tabla principal ${tableConfig.name} procesada`
        );
      }

      // 5. Procesar tablas de detalle
      const detailTables = mapping.tableConfigs.filter(
        (tc) => tc.isDetailTable
      );

      if (detailTables.length > 0) {
        logger.debug(
          `🏗️ [${docId}] Procesando ${detailTables.length} tablas de detalle`
        );

        const processedTables = [];

        // 🎁 NUEVO: Procesar tablas de detalle y capturar estadísticas de bonificaciones
        const detailProcessingResult = await this.processDetailTables(
          detailTables,
          documentId,
          sourceData,
          mainTables[0],
          sourceConnection,
          targetConnection,
          currentConsecutive,
          mapping,
          columnLengthCache,
          processedTables,
          options // 🎁 NUEVO: Pasar opciones
        );

        // 🎁 NUEVO: Capturar estadísticas de bonificaciones si existen
        if (
          detailProcessingResult &&
          detailProcessingResult.bonificationStats
        ) {
          bonificationStats = detailProcessingResult.bonificationStats;
        }

        logger.debug(
          `✅ [${docId}] ${processedTables.length} tablas de detalle procesadas`
        );
      }

      // 6. Marcar como procesado si la estrategia es individual
      if (
        mapping.markProcessedStrategy === "individual" &&
        mapping.markProcessedField
      ) {
        logger.debug(
          `📝 [${docId}] Marcando documento como procesado (estrategia individual)`
        );

        try {
          const markResult = await this.markSingleDocument(
            documentId,
            mapping,
            sourceConnection,
            true
          );

          if (markResult) {
            logger.debug(`✅ [${docId}] Documento marcado como procesado`);
          } else {
            logger.warn(
              `⚠️ [${docId}] No se pudo marcar el documento como procesado`
            );
          }
        } catch (markError) {
          logger.error(
            `❌ [${docId}] Error marcando documento: ${markError.message}`
          );
          // No fallar el procesamiento por esto
        }
      }

      logger.info(`✅ [${docId}] Documento procesado exitosamente`);

      return {
        success: true,
        message: `Documento ${documentId} procesado exitosamente`,
        bonificationStats, // 🎁 NUEVO: Incluir estadísticas de bonificaciones
      };
    } catch (error) {
      logger.error(
        `💥 [${docId}] Error procesando documento: ${error.message}`
      );
      logger.debug(`📊 [${docId}] Stack trace: ${error.stack}`);

      return {
        success: false,
        error: error.message,
        message: `Error procesando documento ${documentId}`,
        bonificationStats: null,
      };
    }
  }

  /**
   * 🎁 CORREGIDO: Procesa las tablas de detalle con bonificaciones
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
    processedTables,
    options = {}
  ) {
    const logId = `processDetailTables_${documentId}`;
    let accumulatedBonificationStats = null;

    try {
      logger.debug(`🏗️ [${logId}] Procesando tablas de detalle`);

      // Ordenar tablas de detalle por executionOrder
      const orderedDetailTables = [...detailTables].sort(
        (a, b) => (a.executionOrder || 0) - (b.executionOrder || 0)
      );

      logger.info(
        `📋 [${logId}] Procesando ${
          orderedDetailTables.length
        } tablas de detalle en orden: ${orderedDetailTables
          .map((t) => t.name)
          .join(" -> ")}`
      );

      for (const detailConfig of orderedDetailTables) {
        const tableLogId = `${logId}_${detailConfig.name}`;

        try {
          logger.debug(
            `📋 [${tableLogId}] Procesando tabla de detalle: ${detailConfig.name}`
          );

          // Obtener detalles
          const detailsData = await this.getDetailData(
            detailConfig,
            parentTableConfig,
            documentId,
            sourceConnection
          );

          if (!detailsData || detailsData.length === 0) {
            logger.warn(
              `⚠️ [${tableLogId}] No se encontraron detalles para la tabla`
            );
            continue;
          }

          logger.info(
            `📊 [${tableLogId}] Procesando ${detailsData.length} registros de detalle`
          );

          // 🎁 CORREGIDO: Procesar bonificaciones usando el servicio integrado
          let processedDetails = detailsData;
          let bonificationStats = null;

          if (
            mapping.hasBonificationProcessing &&
            mapping.bonificationConfig &&
            mapping.bonificationConfig.enabled
          ) {
            logger.info(`🎁 [${tableLogId}] Procesando bonificaciones`);

            try {
              const bonificationResult =
                await BonificationIntegrationService.processBonificationsInData(
                  sourceData,
                  detailsData,
                  mapping.bonificationConfig,
                  options
                );

              if (bonificationResult.success) {
                processedDetails = bonificationResult.processedData;
                bonificationStats = bonificationResult.bonificationStats;

                // Acumular estadísticas de bonificaciones
                if (
                  bonificationStats &&
                  bonificationStats.totalBonifications > 0
                ) {
                  if (!accumulatedBonificationStats) {
                    accumulatedBonificationStats = {
                      totalBonifications: 0,
                      totalPromotions: 0,
                      totalDiscountAmount: 0,
                      processedDetails: 0,
                      bonificationTypes: {},
                      errorDetails: [],
                    };
                  }

                  accumulatedBonificationStats.totalBonifications +=
                    bonificationStats.totalBonifications;
                  accumulatedBonificationStats.totalPromotions +=
                    bonificationStats.totalPromotions;
                  accumulatedBonificationStats.totalDiscountAmount +=
                    bonificationStats.totalDiscountAmount;
                  accumulatedBonificationStats.processedDetails +=
                    bonificationStats.processedDetails;

                  // Acumular tipos de bonificaciones
                  Object.entries(bonificationStats.bonificationTypes).forEach(
                    ([type, count]) => {
                      accumulatedBonificationStats.bonificationTypes[type] =
                        (accumulatedBonificationStats.bonificationTypes[type] ||
                          0) + count;
                    }
                  );
                }

                logger.info(
                  `✅ [${tableLogId}] Bonificaciones procesadas: ${bonificationStats.mappedBonifications}/${bonificationStats.totalBonifications} mapeadas`
                );

                if (bonificationStats.orphanBonifications > 0) {
                  logger.warn(
                    `⚠️ [${tableLogId}] ${bonificationStats.orphanBonifications} bonificaciones huérfanas detectadas`
                  );
                }
              } else {
                logger.warn(
                  `⚠️ [${tableLogId}] Falló procesamiento de bonificaciones: ${bonificationResult.message}`
                );
              }
            } catch (bonificationError) {
              logger.error(
                `❌ [${tableLogId}] Error procesando bonificaciones: ${bonificationError.message}`
              );
              // Continuar con datos originales si falla el procesamiento
            }
          }

          // Insertar detalles procesados
          let insertedCount = 0;
          for (const detailRow of processedDetails) {
            try {
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
              insertedCount++;
            } catch (rowError) {
              logger.error(
                `❌ [${tableLogId}] Error procesando registro de detalle: ${rowError.message}`
              );
              // Continuar con el siguiente registro
            }
          }

          logger.info(
            `✅ [${tableLogId}] ${insertedCount}/${processedDetails.length} registros insertados correctamente`
          );

          if (processedTables) {
            processedTables.push(detailConfig.name);
          }

          // Guardar estadísticas de bonificaciones para el documento
          if (bonificationStats && bonificationStats.totalBonifications > 0) {
            logger.info(
              `📊 [${tableLogId}] Estadísticas de bonificaciones: ${JSON.stringify(
                bonificationStats
              )}`
            );
          }
        } catch (tableError) {
          logger.error(
            `❌ [${tableLogId}] Error procesando tabla de detalle: ${tableError.message}`
          );
          // Continuar con la siguiente tabla
        }
      }

      logger.info(
        `✅ [${logId}] Procesamiento de tablas de detalle completado`
      );

      // 🎁 NUEVO: Retornar estadísticas de bonificaciones acumuladas
      return {
        success: true,
        bonificationStats: accumulatedBonificationStats,
      };
    } catch (error) {
      logger.error(
        `❌ [${logId}] Error procesando tablas de detalle: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Obtiene datos de un documento
   * @private
   */
  async getDocumentData(documentId, mapping, sourceConnection) {
    const logId = `getDocData_${documentId}`;

    try {
      logger.debug(`📊 [${logId}] Obteniendo datos del documento`);

      const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
      if (!mainTable) {
        throw new Error("No se encontró tabla principal en el mapping");
      }

      const primaryKey = mainTable.primaryKey || "NUM_PED";
      const query = `SELECT * FROM ${mainTable.sourceTable} WHERE ${primaryKey} = @documentId`;

      logger.debug(`🔍 [${logId}] Ejecutando consulta: ${query}`);

      const result = await SqlService.query(sourceConnection, query, {
        documentId: documentId,
      });

      if (result.recordset && result.recordset.length > 0) {
        logger.debug(
          `✅ [${logId}] Datos obtenidos: ${result.recordset.length} registros`
        );
        return result.recordset[0];
      } else {
        logger.warn(`⚠️ [${logId}] No se encontraron datos para el documento`);
        return null;
      }
    } catch (error) {
      logger.error(
        `❌ [${logId}] Error obteniendo datos del documento: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Verifica si un documento ya existe en destino
   * @private
   */
  async checkDocumentExists(documentId, mapping, targetConnection) {
    const logId = `checkExists_${documentId}`;

    try {
      logger.debug(`🔍 [${logId}] Verificando existencia en destino`);

      const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
      if (!mainTable) {
        return false;
      }

      const targetPrimaryKey = mainTable.primaryKey || "NUM_PED";
      const checkQuery = `SELECT TOP 1 1 FROM ${mainTable.targetTable} WHERE ${targetPrimaryKey} = @documentId`;

      logger.debug(`🔍 [${logId}] Ejecutando verificación: ${checkQuery}`);

      const checkResult = await SqlService.query(targetConnection, checkQuery, {
        documentId,
      });

      const exists = checkResult.recordset?.length > 0;
      logger.debug(
        `${exists ? "✅" : "❌"} [${logId}] Documento ${
          exists ? "existe" : "no existe"
        } en destino`
      );

      return exists;
    } catch (error) {
      logger.error(
        `❌ [${logId}] Error verificando existencia: ${error.message}`
      );
      return false; // Asumir que no existe si hay error
    }
  }

  /**
   * Crea un registro de ejecución
   * @private
   */
  async createExecutionRecord(mappingId, documentCount) {
    const logId = `createExec_${mappingId}`;

    try {
      logger.debug(`📝 [${logId}] Creando registro de ejecución`);

      const execution = new TaskExecution({
        mappingId,
        status: "running",
        startTime: new Date(),
        totalRecords: documentCount,
        successfulRecords: 0,
        failedRecords: 0,
        details: {
          phase: "initialization",
          message: "Procesamiento iniciado",
        },
      });

      await execution.save();
      logger.debug(
        `✅ [${logId}] Registro de ejecución creado: ${execution._id}`
      );

      return execution._id;
    } catch (error) {
      logger.error(
        `❌ [${logId}] Error creando registro de ejecución: ${error.message}`
      );
      return null;
    }
  }

  /**
   * Actualiza el registro de ejecución
   * @private
   */
  async updateExecutionRecord(executionId, results, hasErrors) {
    if (!executionId) return;

    const logId = `updateExec_${executionId}`;

    try {
      logger.debug(`📝 [${logId}] Actualizando registro de ejecución`);

      const finalStatus =
        results.processed === 0 && results.failed > 0
          ? "failed"
          : results.failed > 0
          ? "partial"
          : "completed";

      await TaskExecution.findByIdAndUpdate(executionId, {
        status: finalStatus,
        endTime: new Date(),
        executionTime: results.processingTime,
        successfulRecords: results.processed,
        failedRecords: results.failed,
        details: {
          ...results,
          hasErrors,
          finalStatus,
        },
      });

      logger.debug(
        `✅ [${logId}] Registro de ejecución actualizado: ${finalStatus}`
      );
    } catch (error) {
      logger.error(
        `❌ [${logId}] Error actualizando registro de ejecución: ${error.message}`
      );
    }
  }

  /**
   * Actualiza el estado de la tarea
   * @private
   */
  async updateTaskStatus(taskId, results, hasErrors) {
    const logId = `updateTask_${taskId}`;

    try {
      logger.debug(`📝 [${logId}] Actualizando estado de la tarea`);

      const finalStatus =
        results.processed === 0 && results.failed > 0
          ? "failed"
          : results.failed > 0
          ? "partial"
          : "completed";

      await TransferTask.findByIdAndUpdate(taskId, {
        status: finalStatus,
        progress: 100,
        lastExecutionDate: new Date(),
        lastExecutionResult: {
          success: !hasErrors,
          message: hasErrors
            ? `Procesamiento completado con errores: ${results.processed} éxitos, ${results.failed} fallos`
            : "Procesamiento completado con éxito",
          affectedRecords: results.processed,
          errorDetails: hasErrors ? results.errors : null,
          executionTime: results.processingTime,
        },
      });

      // Enviar progreso final
      sendProgress(taskId, 100);

      logger.debug(
        `✅ [${logId}] Estado de la tarea actualizado: ${finalStatus}`
      );
    } catch (error) {
      logger.error(
        `❌ [${logId}] Error actualizando estado de la tarea: ${error.message}`
      );
    }
  }

  /**
   * Obtiene documentos según una configuración de mapeo
   * @param {Object} mapping - Configuración de mapeo
   * @param {Object} options - Opciones de consulta
   * @returns {Promise<Array>} - Lista de documentos
   */
  async getDocuments(mapping, options = {}) {
    const { limit = 50, offset = 0, filters = {} } = options;
    const logId = `getDocuments_${mapping._id}`;

    let sourceConnection = null;
    try {
      logger.debug(
        `📊 [${logId}] Obteniendo documentos con límite: ${limit}, offset: ${offset}`
      );

      sourceConnection = await ConnectionService.getConnection(
        mapping.sourceServer
      );

      const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
      if (!mainTable) {
        throw new Error("No se encontró tabla principal");
      }

      const primaryKey = mainTable.primaryKey || "NUM_PED";
      let query = `SELECT TOP ${limit} * FROM ${mainTable.sourceTable}`;
      const queryParams = {};

      // Construir condiciones WHERE
      const whereConditions = [];

      // Agregar filtros personalizados
      if (Object.keys(filters).length > 0) {
        Object.entries(filters).forEach(([key, value]) => {
          if (key !== "processedValue") {
            // Excluir valores internos
            whereConditions.push(`${key} = @${key}`);
            queryParams[key] = value;
          }
        });
      }

      // Agregar filtro de procesamiento si está configurado
      if (mapping.markProcessedField && mapping.markProcessedValue) {
        const processedCondition = `(${mapping.markProcessedField} != @processedValue OR ${mapping.markProcessedField} IS NULL)`;
        whereConditions.push(processedCondition);
        queryParams.processedValue = mapping.markProcessedValue;
      }

      // Aplicar condiciones WHERE
      if (whereConditions.length > 0) {
        query += ` WHERE ${whereConditions.join(" AND ")}`;
      }

      query += ` ORDER BY ${primaryKey}`;

      if (offset > 0) {
        query += ` OFFSET ${offset} ROWS`;
      }

      logger.debug(`🔍 [${logId}] Ejecutando consulta: ${query}`);
      logger.debug(`📋 [${logId}] Parámetros: ${JSON.stringify(queryParams)}`);

      const result = await SqlService.query(
        sourceConnection,
        query,
        queryParams
      );
      const documents = result.recordset || [];

      logger.info(`✅ [${logId}] ${documents.length} documentos obtenidos`);
      return documents;
    } catch (error) {
      logger.error(
        `❌ [${logId}] Error obteniendo documentos: ${error.message}`
      );
      throw error;
    } finally {
      if (sourceConnection) {
        try {
          await ConnectionService.releaseConnection(sourceConnection);
        } catch (connError) {
          logger.error(
            `❌ [${logId}] Error liberando conexión: ${connError.message}`
          );
        }
      }
    }
  }

  /**
   * Obtiene detalles de un documento específico
   * @param {Object} mapping - Configuración de mapeo
   * @param {string} documentId - ID del documento
   * @returns {Promise<Object>} - Detalles del documento
   */
  async getDocumentDetails(mapping, documentId) {
    const logId = `getDetails_${documentId}`;
    let sourceConnection = null;

    try {
      logger.debug(`📊 [${logId}] Obteniendo detalles del documento`);

      sourceConnection = await ConnectionService.getConnection(
        mapping.sourceServer
      );

      const details = {};
      const detailTables = mapping.tableConfigs.filter(
        (tc) => tc.isDetailTable
      );

      logger.debug(
        `🔍 [${logId}] Procesando ${detailTables.length} tablas de detalle`
      );

      for (const detailConfig of detailTables) {
        let detailData = [];

        try {
          logger.debug(
            `📋 [${logId}] Obteniendo datos de tabla: ${detailConfig.name}`
          );

          if (detailConfig.useSameSourceTable) {
            detailData = await this.getDetailDataFromSameTable(
              detailConfig,
              mapping.tableConfigs.find((tc) => !tc.isDetailTable),
              documentId,
              sourceConnection
            );
          } else {
            detailData = await this.getDetailDataFromOwnTable(
              detailConfig,
              documentId,
              sourceConnection
            );
          }

          logger.debug(
            `✅ [${logId}] ${detailData.length} registros obtenidos de ${detailConfig.name}`
          );
        } catch (detailError) {
          logger.warn(
            `⚠️ [${logId}] Error obteniendo detalles de ${detailConfig.name}: ${detailError.message}`
          );
          detailData = [];
        }

        // Transformar datos según el mapeo de campos
        const transformedData = detailData.map((record, index) => {
          const transformedRecord = {};

          detailConfig.fieldMappings?.forEach((fieldMapping) => {
            let value = null;

            if (
              fieldMapping.sourceField &&
              record[fieldMapping.sourceField] !== undefined
            ) {
              value = record[fieldMapping.sourceField];
            } else if (fieldMapping.defaultValue !== undefined) {
              value =
                fieldMapping.defaultValue === "NULL"
                  ? null
                  : fieldMapping.defaultValue;
            }

            // Aplicar transformaciones si existen
            if (fieldMapping.transformation) {
              value = this.applyTransformation(
                value,
                fieldMapping.transformation
              );
            }

            transformedRecord[fieldMapping.targetField] = value;
          });

          // Agregar metadatos
          transformedRecord._detailTableName = detailConfig.name;
          transformedRecord._targetTable = detailConfig.targetTable;
          transformedRecord._index = index;

          return transformedRecord;
        });

        details[detailConfig.name] = transformedData;
      }

      logger.info(
        `✅ [${logId}] Detalles del documento obtenidos correctamente`
      );

      return {
        documentId,
        details,
        totalDetailRecords: Object.values(details).reduce(
          (sum, arr) => sum + arr.length,
          0
        ),
      };
    } catch (error) {
      logger.error(
        `❌ [${logId}] Error obteniendo detalles del documento: ${error.message}`
      );
      throw error;
    } finally {
      if (sourceConnection) {
        try {
          await ConnectionService.releaseConnection(sourceConnection);
        } catch (connError) {
          logger.error(
            `❌ [${logId}] Error liberando conexión: ${connError.message}`
          );
        }
      }
    }
  }

  /**
   * Obtiene datos de detalle de la misma tabla que el encabezado
   * @param {Object} detailConfig - Configuración de tabla de detalle
   * @param {Object} parentTableConfig - Configuración de tabla padre
   * @param {string} documentId - ID del documento
   * @param {Object} sourceConnection - Conexión a la base de datos
   * @returns {Promise<Array>} - Datos de detalle
   */
  async getDetailDataFromSameTable(
    detailConfig,
    parentTableConfig,
    documentId,
    sourceConnection
  ) {
    const logId = `getDetailSame_${documentId}_${detailConfig.name}`;

    try {
      logger.debug(
        `📊 [${logId}] Obteniendo datos de detalle de la misma tabla`
      );

      const tableAlias = "d1";
      const orderByColumn = detailConfig.orderByColumn || "";

      // Obtener campos requeridos
      const requiredFields =
        this.getRequiredFieldsFromTableConfig(detailConfig);

      // Construir la lista de campos con alias de tabla
      const finalSelectFields =
        requiredFields.length > 0
          ? requiredFields.map((field) => `${tableAlias}.${field}`).join(", ")
          : `${tableAlias}.*`;

      const primaryKey =
        detailConfig.primaryKey || parentTableConfig.primaryKey || "NUM_PED";

      const query = `
        SELECT ${finalSelectFields}
        FROM ${parentTableConfig.sourceTable} ${tableAlias}
        WHERE ${tableAlias}.${primaryKey} = @documentId
        ${
          detailConfig.filterCondition
            ? ` AND ${this.processFilterCondition(
                detailConfig.filterCondition,
                tableAlias
              )}`
            : ""
        }
        ${orderByColumn ? `ORDER BY ${tableAlias}.${orderByColumn}` : ""}
      `;

      logger.debug(`🔍 [${logId}] Ejecutando consulta: ${query}`);

      const result = await SqlService.query(sourceConnection, query, {
        documentId: documentId,
      });

      const data = result.recordset || [];
      logger.debug(`✅ [${logId}] ${data.length} registros obtenidos`);

      return data;
    } catch (error) {
      logger.error(
        `❌ [${logId}] Error obteniendo datos de detalle de misma tabla: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Obtiene datos de detalle de su propia tabla
   * @param {Object} detailConfig - Configuración de tabla de detalle
   * @param {string} documentId - ID del documento
   * @param {Object} sourceConnection - Conexión a la base de datos
   * @returns {Promise<Array>} - Datos de detalle
   */
  async getDetailDataFromOwnTable(detailConfig, documentId, sourceConnection) {
    const logId = `getDetailOwn_${documentId}_${detailConfig.name}`;

    try {
      logger.debug(
        `📊 [${logId}] Obteniendo datos de detalle de su propia tabla`
      );

      const tableAlias = "d1";
      const orderByColumn = detailConfig.orderByColumn || "";

      // Obtener campos requeridos
      const requiredFields =
        this.getRequiredFieldsFromTableConfig(detailConfig);

      // Construir la lista de campos con alias de tabla
      const finalSelectFields =
        requiredFields.length > 0
          ? requiredFields.map((field) => `${tableAlias}.${field}`).join(", ")
          : `${tableAlias}.*`;

      const primaryKey = detailConfig.primaryKey || "NUM_PED";

      const query = `
        SELECT ${finalSelectFields}
        FROM ${detailConfig.sourceTable} ${tableAlias}
        WHERE ${tableAlias}.${primaryKey} = @documentId
        ${
          detailConfig.filterCondition
            ? ` AND ${this.processFilterCondition(
                detailConfig.filterCondition,
                tableAlias
              )}`
            : ""
        }
        ${orderByColumn ? `ORDER BY ${tableAlias}.${orderByColumn}` : ""}
      `;

      logger.debug(`🔍 [${logId}] Ejecutando consulta: ${query}`);

      const result = await SqlService.query(sourceConnection, query, {
        documentId: documentId,
      });

      const data = result.recordset || [];
      logger.debug(`✅ [${logId}] ${data.length} registros obtenidos`);

      return data;
    } catch (error) {
      logger.error(
        `❌ [${logId}] Error obteniendo datos de detalle de propia tabla: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Obtiene campos requeridos de una configuración de tabla
   * @param {Object} tableConfig - Configuración de tabla
   * @returns {Array} - Lista de campos requeridos
   */
  getRequiredFieldsFromTableConfig(tableConfig) {
    const fields = new Set();

    // Agregar campos de mapeo
    if (tableConfig.fieldMappings) {
      tableConfig.fieldMappings.forEach((mapping) => {
        if (mapping.sourceField && mapping.sourceField !== "NULL") {
          fields.add(mapping.sourceField);
        }
      });
    }

    // Agregar campo de clave primaria
    if (tableConfig.primaryKey) {
      fields.add(tableConfig.primaryKey);
    }

    // Agregar campos de ordenamiento
    if (tableConfig.orderByColumn) {
      fields.add(tableConfig.orderByColumn);
    }

    // Si no hay campos específicos, devolver array vacío para usar *
    return Array.from(fields);
  }

  /**
   * Procesa condición de filtro
   * @param {string} condition - Condición a procesar
   * @param {string} tableAlias - Alias de la tabla
   * @returns {string} - Condición procesada
   */
  processFilterCondition(condition, tableAlias) {
    if (!condition) return "";

    try {
      // Reemplazar referencias de campos sin alias con el alias de tabla
      // Solo reemplazar identificadores que parecen nombres de columnas
      const processed = condition.replace(
        /\b([A-Z_][A-Z0-9_]*)\b/g,
        (match) => {
          // No reemplazar si ya tiene alias o es una palabra reservada
          if (
            match.includes(".") ||
            [
              "AND",
              "OR",
              "NOT",
              "IN",
              "LIKE",
              "BETWEEN",
              "NULL",
              "IS",
              "TRUE",
              "FALSE",
            ].includes(match.toUpperCase())
          ) {
            return match;
          }
          return `${tableAlias}.${match}`;
        }
      );

      logger.debug(`🔧 Condición procesada: ${condition} -> ${processed}`);
      return processed;
    } catch (error) {
      logger.error(`❌ Error procesando condición de filtro: ${error.message}`);
      return condition; // Devolver original si hay error
    }
  }

  /**
   * Simula el procesamiento de bonificaciones para preview
   * @param {Array} originalData - Datos originales
   * @param {Object} bonificationConfig - Configuración de bonificaciones
   * @param {string} documentId - ID del documento
   * @returns {Promise<Array>} - Datos procesados simulados
   */
  async simulateBonificationProcessing(
    originalData,
    bonificationConfig,
    documentId
  ) {
    const logId = `simulateBonif_${documentId}`;

    try {
      logger.debug(`🎁 [${logId}] Simulando procesamiento de bonificaciones`);

      const processedData = [];
      const bonificationIndicator =
        bonificationConfig.bonificationIndicatorField || "ART_BON";
      const bonificationValue =
        bonificationConfig.bonificationIndicatorValue || "B";
      const regularArticleField =
        bonificationConfig.regularArticleField || "COD_ART";
      const bonificationReferenceField =
        bonificationConfig.bonificationReferenceField || "COD_ART_RFR";
      const lineNumberField =
        bonificationConfig.lineNumberField || "PEDIDO_LINEA";

      // Separar artículos regulares y bonificaciones
      const regularItems = originalData.filter(
        (item) => item[bonificationIndicator] !== bonificationValue
      );
      const bonifications = originalData.filter(
        (item) => item[bonificationIndicator] === bonificationValue
      );

      logger.debug(
        `📊 [${logId}] Artículos regulares: ${regularItems.length}, Bonificaciones: ${bonifications.length}`
      );

      // Procesar artículos regulares
      regularItems.forEach((item, index) => {
        processedData.push({
          ...item,
          ITEM_TYPE: "REGULAR",
          ORIGINAL_LINE: index + 1,
          PROCESSED_BY: "DynamicTransferService",
          PROCESSED_AT: new Date().toISOString(),
        });
      });

      // Procesar bonificaciones
      let linkedCount = 0;
      let orphanCount = 0;

      bonifications.forEach((bonif, index) => {
        const referencedArticle = bonif[bonificationReferenceField];

        // Buscar el artículo regular correspondiente
        const matchingRegular = regularItems.find(
          (reg) => reg[regularArticleField] === referencedArticle
        );

        if (matchingRegular) {
          // Bonificación vinculada
          processedData.push({
            ...bonif,
            ITEM_TYPE: "BONIFICATION",
            PEDIDO_LINEA_BONIF: matchingRegular[lineNumberField],
            REFERENCED_ARTICLE: referencedArticle,
            LINKED_TO_LINE: matchingRegular[lineNumberField],
            PROCESSED_BY: "DynamicTransferService",
            PROCESSED_AT: new Date().toISOString(),
          });
          linkedCount++;
        } else {
          // Bonificación huérfana
          processedData.push({
            ...bonif,
            ITEM_TYPE: "BONIFICATION_ORPHAN",
            REFERENCED_ARTICLE: referencedArticle,
            ORPHAN_REASON: "Referenced article not found",
            PROCESSED_BY: "DynamicTransferService",
            PROCESSED_AT: new Date().toISOString(),
          });
          orphanCount++;
        }
      });

      logger.info(
        `✅ [${logId}] Simulación completada: ${linkedCount} vinculadas, ${orphanCount} huérfanas`
      );

      return processedData;
    } catch (error) {
      logger.error(
        `❌ [${logId}] Error simulando procesamiento de bonificaciones: ${error.message}`
      );
      throw error;
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
    const logId = `getDetail_${documentId}_${detailConfig.name}`;

    try {
      logger.debug(`📊 [${logId}] Obteniendo datos de detalle`);

      if (detailConfig.customQuery) {
        // Usar consulta personalizada
        const query = detailConfig.customQuery.replace(
          /@documentId/g,
          documentId
        );
        logger.debug(
          `🔍 [${logId}] Ejecutando consulta personalizada: ${query}`
        );

        const result = await SqlService.query(sourceConnection, query);
        return result.recordset || [];
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
    } catch (error) {
      logger.error(
        `❌ [${logId}] Error obteniendo datos de detalle: ${error.message}`
      );
      throw error;
    }
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
    const logId = `processTable_${documentId}_${tableConfig.name}`;

    try {
      logger.debug(
        `🏗️ [${logId}] Procesando tabla: ${
          isDetailTable ? "detalle" : "principal"
        }`
      );

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
      const lookupFields = tableConfig.fieldMappings.filter(
        (fm) => fm.lookupFromTarget && fm.lookupQuery
      );

      if (lookupFields.length > 0) {
        logger.debug(
          `🔍 [${logId}] Realizando ${lookupFields.length} consultas de lookup`
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
        logger.debug(`✅ [${logId}] Lookup completado exitosamente`);
      }

      // Procesar todos los campos
      for (const fieldMapping of tableConfig.fieldMappings) {
        try {
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
            `✅ [${logId}] Campo ${fieldMapping.targetField} preparado: ${
              processedField.value
            } (tipo: ${typeof processedField.value})`
          );
        } catch (fieldError) {
          logger.error(
            `❌ [${logId}] Error procesando campo ${fieldMapping.targetField}: ${fieldError.message}`
          );
          throw fieldError;
        }
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

      logger.debug(`✅ [${logId}] Tabla procesada exitosamente`);
    } catch (error) {
      logger.error(`❌ [${logId}] Error procesando tabla: ${error.message}`);
      throw error;
    }
  }

  /**
   * Procesa un campo individual - MÉTODO UNIFICADO
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
    const logId = `processField_${fieldMapping.targetField}`;

    try {
      let value;

      // PRIORIDAD 1: Usar valores obtenidos por lookup si existen
      if (
        fieldMapping.lookupFromTarget &&
        lookupResults[fieldMapping.targetField] !== undefined
      ) {
        value = lookupResults[fieldMapping.targetField];
        logger.debug(`🔍 [${logId}] Usando valor de lookup: ${value}`);
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
      ];

      const isNativeFunction = sqlNativeFunctions.some(
        (func) => defaultValue && defaultValue.toUpperCase().includes(func)
      );

      if (isNativeFunction) {
        logger.debug(
          `🔧 [${logId}] Usando función SQL nativa: ${defaultValue}`
        );
        return { value: defaultValue, isDirectSql: true };
      }

      // PRIORIDAD 3: Campo de origen
      if (fieldMapping.sourceField && fieldMapping.sourceField !== "NULL") {
        if (sourceData[fieldMapping.sourceField] !== undefined) {
          value = sourceData[fieldMapping.sourceField];
          logger.debug(`📊 [${logId}] Valor del campo origen: ${value}`);
        } else {
          logger.warn(
            `⚠️ [${logId}] Campo origen ${fieldMapping.sourceField} no encontrado`
          );
          value = null;
        }
      }

      // PRIORIDAD 4: Valor por defecto
      if (value === undefined || value === null) {
        if (fieldMapping.defaultValue !== undefined) {
          value =
            fieldMapping.defaultValue === "NULL"
              ? null
              : fieldMapping.defaultValue;
          logger.debug(`🔧 [${logId}] Usando valor por defecto: ${value}`);
        } else {
          value = null;
          logger.debug(`🔧 [${logId}] Valor establecido a NULL`);
        }
      }

      // PRIORIDAD 5: Consecutivo si es necesario
      if (fieldMapping.useConsecutive && currentConsecutive) {
        value = currentConsecutive;
        logger.debug(`🔢 [${logId}] Usando consecutivo: ${value}`);
      }

      // Aplicar transformaciones si existen
      if (fieldMapping.transformation) {
        const originalValue = value;
        value = this.applyTransformation(value, fieldMapping.transformation);
        logger.debug(
          `🔄 [${logId}] Transformación aplicada: ${originalValue} -> ${value}`
        );
      }

      // Validar longitud si está en caché
      if (
        columnLengthCache &&
        columnLengthCache.has(fieldMapping.targetField)
      ) {
        const maxLength = columnLengthCache.get(fieldMapping.targetField);
        if (value && typeof value === "string" && value.length > maxLength) {
          logger.warn(
            `⚠️ [${logId}] Truncando valor de ${value.length} a ${maxLength} caracteres`
          );
          value = value.substring(0, maxLength);
        }
      }

      logger.debug(`✅ [${logId}] Campo procesado correctamente: ${value}`);
      return { value, isDirectSql: false };
    } catch (error) {
      logger.error(`❌ [${logId}] Error procesando campo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Aplica transformaciones a un valor
   * @private
   */
  applyTransformation(value, transformation) {
    if (!transformation || value === null || value === undefined) {
      return value;
    }

    try {
      switch (transformation.type) {
        case "uppercase":
          return value.toString().toUpperCase();

        case "lowercase":
          return value.toString().toLowerCase();

        case "trim":
          return value.toString().trim();

        case "substring":
          return value
            .toString()
            .substring(
              transformation.start || 0,
              transformation.end || value.length
            );

        case "replace":
          return value
            .toString()
            .replace(
              new RegExp(transformation.search, "g"),
              transformation.replace || ""
            );

        case "pad":
          if (transformation.direction === "left") {
            return value
              .toString()
              .padStart(
                transformation.length || 10,
                transformation.char || " "
              );
          } else {
            return value
              .toString()
              .padEnd(transformation.length || 10, transformation.char || " ");
          }

        case "number":
          const num = parseFloat(value);
          return isNaN(num) ? 0 : num;

        case "date":
          if (transformation.format) {
            // Aquí podrías usar una librería como moment.js o date-fns
            return new Date(value).toISOString();
          }
          return new Date(value);

        default:
          logger.warn(
            `⚠️ Tipo de transformación desconocido: ${transformation.type}`
          );
          return value;
      }
    } catch (error) {
      logger.error(
        `❌ Error aplicando transformación ${transformation.type}: ${error.message}`
      );
      return value; // Devolver valor original si hay error
    }
  }

  /**
   * Ejecuta una consulta INSERT
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
    const logId = `executeInsert_${targetTable}`;

    try {
      logger.debug(
        `🔧 [${logId}] Ejecutando inserción en tabla: ${targetTable}`
      );

      if (targetFields.length === 0) {
        throw new Error("No hay campos para insertar");
      }

      // Construir consulta INSERT
      const insertQuery = `
        INSERT INTO ${targetTable} (${targetFields.join(", ")})
        VALUES (${targetValues.join(", ")})
      `;

      logger.debug(`🔍 [${logId}] Consulta SQL: ${insertQuery}`);
      logger.debug(`📊 [${logId}] Parámetros: ${JSON.stringify(targetData)}`);

      // Ejecutar consulta
      const result = await SqlService.query(
        targetConnection,
        insertQuery,
        targetData
      );

      logger.debug(
        `✅ [${logId}] Inserción ejecutada correctamente. Filas afectadas: ${
          result.rowsAffected || "N/A"
        }`
      );

      return result;
    } catch (error) {
      logger.error(`❌ [${logId}] Error en inserción: ${error.message}`);
      logger.debug(
        `📊 [${logId}] Datos que causaron el error: ${JSON.stringify(
          targetData
        )}`
      );
      throw error;
    }
  }

  /**
   * Realiza consultas de lookup en la base de datos destino
   * @private
   */
  async lookupValuesFromTarget(tableConfig, sourceData, targetConnection) {
    const logId = `lookup_${tableConfig.name}`;

    try {
      logger.debug(
        `🔍 [${logId}] Realizando consultas de lookup en BD destino`
      );

      const lookupResults = {};
      const failedLookups = [];

      // Identificar todos los campos que requieren lookup
      const lookupFields = tableConfig.fieldMappings.filter(
        (fm) => fm.lookupFromTarget && fm.lookupQuery
      );

      if (lookupFields.length === 0) {
        logger.debug(
          `⚠️ [${logId}] No se encontraron campos que requieran lookup`
        );
        return { results: {}, success: true };
      }

      logger.info(
        `🔍 [${logId}] Procesando ${lookupFields.length} campos con lookup`
      );

      // Ejecutar cada consulta de lookup
      for (const fieldMapping of lookupFields) {
        const fieldLogId = `${logId}_${fieldMapping.targetField}`;

        try {
          let lookupQuery = fieldMapping.lookupQuery;
          logger.debug(`🔍 [${fieldLogId}] Consulta original: ${lookupQuery}`);

          // Reemplazar parámetros en la consulta
          const queryParams = {};
          const paramMatches = lookupQuery.match(/@\w+/g) || [];

          for (const paramMatch of paramMatches) {
            const paramName = paramMatch.substring(1); // Remover @
            const expectedParam = paramName;

            if (sourceData[expectedParam] !== undefined) {
              queryParams[expectedParam] = sourceData[expectedParam];
              logger.debug(
                `📊 [${fieldLogId}] Parámetro ${expectedParam}: ${sourceData[expectedParam]}`
              );
            } else {
              logger.warn(
                `⚠️ [${fieldLogId}] Parámetro ${expectedParam} no encontrado en datos de origen, usando NULL`
              );
              queryParams[expectedParam] = null;
            }
          }

          // Ejecutar consulta
          const result = await SqlService.query(
            targetConnection,
            lookupQuery,
            queryParams
          );

          // Procesar resultados
          if (result.recordset && result.recordset.length > 0) {
            // Extraer el valor del resultado
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
                `No se encontró valor para el campo ${fieldMapping.targetField}`
              );
            }

            lookupResults[fieldMapping.targetField] = value;
            logger.debug(`✅ [${fieldLogId}] Lookup exitoso: ${value}`);
          } else if (fieldMapping.failIfNotFound) {
            throw new Error(
              `No se encontraron resultados para el campo ${fieldMapping.targetField}`
            );
          } else {
            lookupResults[fieldMapping.targetField] = null;
            logger.debug(
              `⚠️ [${fieldLogId}] No se encontraron resultados, usando NULL`
            );
          }
        } catch (fieldError) {
          logger.error(
            `❌ [${fieldLogId}] Error en lookup: ${fieldError.message}`
          );

          if (fieldMapping.failIfNotFound) {
            failedLookups.push({
              field: fieldMapping.targetField,
              error: fieldError.message,
            });
          } else {
            lookupResults[fieldMapping.targetField] = null;
          }
        }
      }

      // Verificar si hay errores críticos
      const criticalFailures = failedLookups.filter((fail) => {
        const field = lookupFields.find((f) => f.targetField === fail.field);
        return field && field.failIfNotFound;
      });

      if (criticalFailures.length > 0) {
        const failuresMsg = criticalFailures
          .map((f) => `${f.field}: ${f.error}`)
          .join(", ");
        logger.error(`❌ [${logId}] Fallos críticos en lookup: ${failuresMsg}`);

        return {
          results: lookupResults,
          success: false,
          failedFields: criticalFailures,
          error: `Error en validación de datos: ${failuresMsg}`,
        };
      }

      logger.info(
        `✅ [${logId}] Lookup completado exitosamente. ${
          Object.keys(lookupResults).length
        } valores obtenidos`
      );

      return {
        results: lookupResults,
        success: true,
        failedFields: [],
      };
    } catch (error) {
      logger.error(`❌ [${logId}] Error general en lookup: ${error.message}`);
      return {
        results: {},
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Marca documentos como procesados según la estrategia configurada
   * @private
   */
  async markDocumentsAsProcessed(
    documentIds,
    mapping,
    connection,
    shouldMark = true
  ) {
    const logId = `markDocs_${documentIds.length}`;

    try {
      logger.debug(
        `📝 [${logId}] Marcando documentos como procesados: ${
          shouldMark ? "sí" : "no"
        }`
      );

      // Normalizar documentIds a array
      const docArray = Array.isArray(documentIds) ? documentIds : [documentIds];

      if (docArray.length === 0) {
        return {
          success: 0,
          failed: 0,
          message: "No hay documentos para marcar",
        };
      }

      if (!mapping.markProcessedField) {
        logger.warn(`⚠️ [${logId}] No hay campo de marcado configurado`);
        return {
          success: 0,
          failed: 0,
          message: "Campo de marcado no configurado",
        };
      }

      const config = mapping.markProcessedConfig || {};
      const batchSize = config.batchSize || 100;

      // Procesar en lotes
      let totalSuccess = 0;
      let totalFailed = 0;

      for (let i = 0; i < docArray.length; i += batchSize) {
        const batch = docArray.slice(i, i + batchSize);

        try {
          const result = await this.markDocumentBatch(
            batch,
            mapping,
            connection,
            shouldMark
          );
          totalSuccess += result.success;
          totalFailed += result.failed;

          logger.debug(
            `📊 [${logId}] Lote ${Math.floor(i / batchSize) + 1}: ${
              result.success
            } éxitos, ${result.failed} fallos`
          );
        } catch (batchError) {
          logger.error(`❌ [${logId}] Error en lote: ${batchError.message}`);
          totalFailed += batch.length;
        }
      }

      logger.info(
        `✅ [${logId}] Marcado completado: ${totalSuccess} éxitos, ${totalFailed} fallos`
      );

      return {
        success: totalSuccess,
        failed: totalFailed,
        message: `Marcado completado: ${totalSuccess} éxitos, ${totalFailed} fallos`,
      };
    } catch (error) {
      logger.error(`❌ [${logId}] Error marcando documentos: ${error.message}`);
      throw error;
    }
  }

  /**
   * Marca un lote de documentos
   * @private
   */
  async markDocumentBatch(documentIds, mapping, connection, shouldMark) {
    const logId = `markBatch_${documentIds.length}`;

    try {
      const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
      if (!mainTable) {
        throw new Error("No se encontró tabla principal");
      }

      const config = mapping.markProcessedConfig || {};
      const primaryKey = mainTable.primaryKey || "NUM_PED";

      // Construir campos a actualizar
      let updateFields = `${mapping.markProcessedField} = @processedValue`;

      if (config.includeTimestamp && config.timestampField) {
        updateFields += `, ${config.timestampField} = GETDATE()`;
      }

      // Construir placeholders para los IDs
      const placeholders = documentIds
        .map((_, index) => `@doc${index}`)
        .join(", ");

      // Construir parámetros
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

      logger.debug(`🔍 [${logId}] Ejecutando marcado en lote: ${query}`);

      const result = await SqlService.query(connection, query, params);
      const rowsAffected = result.rowsAffected || 0;

      return {
        success: rowsAffected,
        failed: documentIds.length - rowsAffected,
      };
    } catch (error) {
      logger.error(`❌ [${logId}] Error en marcado de lote: ${error.message}`);
      throw error;
    }
  }

  /**
   * Marca un documento individual
   * @private
   */
  async markSingleDocument(documentId, mapping, connection, shouldMark) {
    const logId = `markSingle_${documentId}`;

    try {
      logger.debug(`📝 [${logId}] Marcando documento individual`);

      const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
      if (!mainTable) {
        logger.warn(`⚠️ [${logId}] No se encontró tabla principal`);
        return false;
      }

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

      logger.debug(`🔍 [${logId}] Ejecutando marcado individual: ${query}`);

      const result = await SqlService.query(connection, query, params);
      const success = (result.rowsAffected || 0) > 0;

      logger.debug(
        `${success ? "✅" : "❌"} [${logId}] Marcado individual ${
          success ? "exitoso" : "fallido"
        }`
      );

      return success;
    } catch (error) {
      logger.error(
        `❌ [${logId}] Error en marcado individual: ${error.message}`
      );
      return false;
    }
  }

  /**
   * Crea una nueva configuración de mapeo
   * @param {Object} mappingData - Datos de la configuración
   * @returns {Promise<Object>} - Configuración creada
   */
  async createMapping(mappingData) {
    const logId = `createMapping_${mappingData.name}`;

    try {
      logger.info(`📝 [${logId}] Creando nueva configuración de mapeo`);

      // Si no hay taskId, crear una tarea por defecto
      if (!mappingData.taskId) {
        logger.debug(`🔧 [${logId}] Creando tarea por defecto`);

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

        logger.info(`✅ [${logId}] Tarea por defecto creada: ${task._id}`);

        // Asignar el ID de la tarea al mapeo
        mappingData.taskId = task._id;
      }

      const mapping = new TransferMapping(mappingData);
      await mapping.save();

      logger.info(`✅ [${logId}] Configuración de mapeo creada exitosamente`);

      return mapping;
    } catch (error) {
      logger.error(
        `❌ [${logId}] Error creando configuración de mapeo: ${error.message}`
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
  async updateMapping(mappingId, mappingData) {
    const logId = `updateMapping_${mappingId}`;

    try {
      logger.info(`📝 [${logId}] Actualizando configuración de mapeo`);

      // Verificar si existe el mapeo
      const existingMapping = await TransferMapping.findById(mappingId);
      if (!existingMapping) {
        throw new Error(`Configuración de mapeo ${mappingId} no encontrada`);
      }

      logger.debug(
        `✅ [${logId}] Mapping existente encontrado: ${existingMapping.name}`
      );

      // Si hay cambios en las tablas y ya existe un taskId, actualizar la consulta de la tarea
      if (mappingData.tableConfigs && existingMapping.taskId) {
        try {
          logger.debug(`🔧 [${logId}] Actualizando tarea asociada`);

          const task = await TransferTask.findById(existingMapping.taskId);
          if (task) {
            const mainTable = mappingData.tableConfigs.find(
              (tc) => !tc.isDetailTable
            );
            if (mainTable && mainTable.sourceTable) {
              task.query = `SELECT * FROM ${mainTable.sourceTable}`;
              await task.save();
              logger.info(
                `✅ [${logId}] Tarea ${task._id} actualizada con nueva consulta`
              );
            }
          }
        } catch (taskError) {
          logger.warn(
            `⚠️ [${logId}] Error actualizando tarea asociada: ${taskError.message}`
          );
        }
      }

      // Si no tiene taskId, crear uno
      if (!existingMapping.taskId && !mappingData.taskId) {
        logger.debug(`🔧 [${logId}] Creando tarea para mapping existente`);

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
          `✅ [${logId}] Tarea por defecto creada para mapping existente: ${task._id}`
        );
        mappingData.taskId = task._id;
      }

      const mapping = await TransferMapping.findByIdAndUpdate(
        mappingId,
        mappingData,
        { new: true }
      );

      logger.info(
        `✅ [${logId}] Configuración de mapeo actualizada exitosamente`
      );

      return mapping;
    } catch (error) {
      logger.error(
        `❌ [${logId}] Error actualizando configuración de mapeo: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Obtiene todas las configuraciones de mapeo
   * @returns {Promise<Array>} - Lista de configuraciones
   */
  async getMappings() {
    const logId = `getMappings`;

    try {
      logger.debug(
        `📊 [${logId}] Obteniendo todas las configuraciones de mapeo`
      );

      const mappings = await TransferMapping.find().sort({ name: 1 });

      logger.info(`✅ [${logId}] ${mappings.length} configuraciones obtenidas`);

      return mappings;
    } catch (error) {
      logger.error(
        `❌ [${logId}] Error obteniendo configuraciones de mapeo: ${error.message}`
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
    const logId = `getMappingById_${mappingId}`;

    try {
      logger.debug(`📊 [${logId}] Obteniendo configuración de mapeo por ID`);

      const mapping = await TransferMapping.findById(mappingId);

      if (!mapping) {
        throw new Error(`Configuración de mapeo ${mappingId} no encontrada`);
      }

      logger.debug(`✅ [${logId}] Configuración obtenida: ${mapping.name}`);

      return mapping;
    } catch (error) {
      logger.error(
        `❌ [${logId}] Error obteniendo configuración de mapeo: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Elimina una configuración de mapeo
   * @param {string} mappingId - ID de la configuración
   * @returns {Promise<boolean>} - true si se eliminó correctamente
   */
  async deleteMapping(mappingId) {
    const logId = `deleteMapping_${mappingId}`;

    try {
      logger.info(`🗑️ [${logId}] Eliminando configuración de mapeo`);

      const result = await TransferMapping.findByIdAndDelete(mappingId);
      const success = !!result;

      if (success) {
        logger.info(`✅ [${logId}] Configuración eliminada exitosamente`);
      } else {
        logger.warn(
          `⚠️ [${logId}] No se encontró la configuración para eliminar`
        );
      }

      return success;
    } catch (error) {
      logger.error(
        `❌ [${logId}] Error eliminando configuración de mapeo: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Obtiene el siguiente consecutivo para un mapping
   * @param {Object} mapping - Configuración de mapeo
   * @returns {Promise<number>} - Siguiente valor consecutivo
   */
  async getNextConsecutive(mapping) {
    const logId = `getNextConsecutive_${mapping._id}`;

    try {
      logger.debug(`🔢 [${logId}] Obteniendo siguiente consecutivo`);

      if (!mapping.consecutiveConfig) {
        throw new Error("No hay configuración de consecutivos");
      }

      const nextValue = await ConsecutiveService.getNextValue(
        mapping.consecutiveConfig.consecutiveId
      );

      logger.debug(
        `✅ [${logId}] Siguiente consecutivo obtenido: ${nextValue}`
      );

      return nextValue;
    } catch (error) {
      logger.error(
        `❌ [${logId}] Error obteniendo consecutivo: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Resetea un consecutivo
   * @param {string} mappingId - ID del mapping
   * @param {number} newValue - Nuevo valor inicial
   * @returns {Promise<boolean>} - true si se reseteó correctamente
   */
  async resetConsecutive(mappingId, newValue) {
    const logId = `resetConsecutive_${mappingId}`;

    try {
      logger.info(`🔄 [${logId}] Reseteando consecutivo a: ${newValue}`);

      const mapping = await this.getMappingById(mappingId);

      if (!mapping.consecutiveConfig) {
        throw new Error("No hay configuración de consecutivos");
      }

      const success = await ConsecutiveService.resetValue(
        mapping.consecutiveConfig.consecutiveId,
        newValue
      );

      logger.info(
        `${success ? "✅" : "❌"} [${logId}] Consecutivo ${
          success ? "reseteado exitosamente" : "no pudo ser reseteado"
        }`
      );

      return success;
    } catch (error) {
      logger.error(
        `❌ [${logId}] Error reseteando consecutivo: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * 🎁 NUEVO: Verifica si un mapping debe procesar bonificaciones
   * @param {Object} mapping - Configuración de mapeo
   * @returns {boolean} - True si debe procesar bonificaciones
   */
  shouldProcessBonifications(mapping) {
    return !!(
      mapping.hasBonificationProcessing &&
      mapping.bonificationConfig &&
      mapping.bonificationConfig.enabled &&
      mapping.bonificationConfig.bonificationIndicatorField &&
      mapping.bonificationConfig.bonificationIndicatorValue
    );
  }

  /**
   * 🎁 NUEVO: Obtiene vista previa de bonificaciones para un documento
   * @param {Object} mapping - Configuración de mapeo
   * @param {string} documentId - ID del documento
   * @returns {Promise<Object>} - Vista previa de bonificaciones
   */
  async previewBonifications(mapping, documentId) {
    const logId = `previewBonif_${documentId}`;
    let sourceConnection = null;

    try {
      logger.info(`🎁 [${logId}] Generando vista previa de bonificaciones`);

      if (!this.shouldProcessBonifications(mapping)) {
        return {
          success: false,
          message: "Procesamiento de bonificaciones no habilitado",
          data: null,
        };
      }

      sourceConnection = await ConnectionService.getConnection(
        mapping.sourceServer
      );

      // Buscar tabla de detalle
      const detailTable = mapping.tableConfigs.find((tc) => tc.isDetailTable);
      if (!detailTable) {
        return {
          success: false,
          message: "No se encontró tabla de detalle",
          data: null,
        };
      }

      // Obtener datos originales
      let originalData = [];
      try {
        if (detailTable.useSameSourceTable) {
          originalData = await this.getDetailDataFromSameTable(
            detailTable,
            mapping.tableConfigs.find((tc) => !tc.isDetailTable),
            documentId,
            sourceConnection
          );
        } else {
          originalData = await this.getDetailDataFromOwnTable(
            detailTable,
            documentId,
            sourceConnection
          );
        }
      } catch (dataError) {
        logger.error(
          `❌ [${logId}] Error obteniendo datos: ${dataError.message}`
        );
        originalData = [];
      }

      if (originalData.length === 0) {
        return {
          success: true,
          message: "No se encontraron datos para el documento",
          data: {
            documentId,
            original: {
              totalItems: 0,
              regularItems: 0,
              bonifications: 0,
              details: [],
            },
            processed: {
              totalItems: 0,
              regularItems: 0,
              bonifications: 0,
              details: [],
            },
            transformation: {
              linesAdded: 0,
              bonificationsLinked: 0,
              orphanBonifications: 0,
            },
          },
        };
      }

      // Procesar bonificaciones usando el servicio integrado
      const bonificationResult =
        await BonificationIntegrationService.processBonificationsInData(
          null, // sourceData principal no necesario para preview
          originalData,
          mapping.bonificationConfig
        );

      // Calcular estadísticas
      const bonificationIndicator =
        mapping.bonificationConfig.bonificationIndicatorField || "ART_BON";
      const bonificationValue =
        mapping.bonificationConfig.bonificationIndicatorValue || "B";

      const originalStats = {
        totalItems: originalData.length,
        regularItems: originalData.filter(
          (item) => item[bonificationIndicator] !== bonificationValue
        ).length,
        bonifications: originalData.filter(
          (item) => item[bonificationIndicator] === bonificationValue
        ).length,
        details: originalData,
      };

      const processedData = bonificationResult.success
        ? bonificationResult.processedData
        : originalData;
      const processedStats = {
        totalItems: processedData.length,
        regularItems: processedData.filter(
          (item) =>
            item.recordType === "REGULAR" || item.ITEM_TYPE === "REGULAR"
        ).length,
        bonifications: processedData.filter(
          (item) =>
            item.recordType === "BONIFICATION" ||
            item.ITEM_TYPE === "BONIFICATION"
        ).length,
        orphanBonifications: processedData.filter(
          (item) => item.ITEM_TYPE === "BONIFICATION_ORPHAN"
        ).length,
        linkedBonifications: processedData.filter(
          (item) =>
            (item.recordType === "BONIFICATION" ||
              item.ITEM_TYPE === "BONIFICATION") &&
            item._isMappedBonification
        ).length,
        details: processedData,
      };

      const transformation = {
        linesAdded: processedData.length - originalData.length,
        bonificationsLinked: processedStats.linkedBonifications,
        orphanBonifications: processedStats.orphanBonifications,
      };

      logger.info(`✅ [${logId}] Vista previa generada exitosamente`);

      return {
        success: true,
        message: "Vista previa generada exitosamente",
        data: {
          documentId,
          original: originalStats,
          processed: processedStats,
          transformation,
          bonificationStats: bonificationResult.bonificationStats,
        },
      };
    } catch (error) {
      logger.error(`❌ [${logId}] Error en vista previa: ${error.message}`);
      return {
        success: false,
        message: error.message,
        data: null,
      };
    } finally {
      if (sourceConnection) {
        try {
          await ConnectionService.releaseConnection(sourceConnection);
        } catch (connError) {
          logger.error(
            `❌ [${logId}] Error liberando conexión: ${connError.message}`
          );
        }
      }
    }
  }

  /**
   * 🎁 NUEVO: Valida configuración de bonificaciones
   * @param {Object} mapping - Configuración de mapeo
   * @returns {Object} - Resultado de la validación
   */
  validateBonificationConfig(mapping) {
    const logId = `validateBonif_${mapping._id}`;

    try {
      logger.debug(`🎁 [${logId}] Validando configuración de bonificaciones`);

      const validation = {
        isValid: true,
        issues: [],
        warnings: [],
      };

      // Verificar si las bonificaciones están habilitadas
      if (!mapping.hasBonificationProcessing) {
        validation.isValid = false;
        validation.issues.push("Procesamiento de bonificaciones no habilitado");
        return validation;
      }

      // Verificar configuración de bonificaciones
      if (!mapping.bonificationConfig) {
        validation.isValid = false;
        validation.issues.push("Configuración de bonificaciones no encontrada");
        return validation;
      }

      const config = mapping.bonificationConfig;

      // Validar campos requeridos
      const requiredFields = [
        { field: "enabled", name: "Habilitado" },
        {
          field: "bonificationIndicatorField",
          name: "Campo indicador de bonificación",
        },
        {
          field: "bonificationIndicatorValue",
          name: "Valor indicador de bonificación",
        },
        { field: "regularArticleField", name: "Campo de artículo regular" },
        {
          field: "bonificationReferenceField",
          name: "Campo de referencia de bonificación",
        },
        {
          field: "bonificationLineReferenceField",
          name: "Campo de referencia de línea",
        },
      ];

      requiredFields.forEach(({ field, name }) => {
        if (!config[field]) {
          if (field === "enabled") {
            validation.isValid = false;
            validation.issues.push(`${name} debe estar establecido`);
          } else {
            validation.warnings.push(`${name} no está configurado`);
          }
        }
      });

      // Verificar tabla de detalle
      const detailTable = mapping.tableConfigs.find((tc) => tc.isDetailTable);
      if (!detailTable) {
        validation.isValid = false;
        validation.issues.push("No se encontró tabla de detalle en el mapping");
      }

      // Verificar campos en tabla de detalle
      if (detailTable && detailTable.fieldMappings) {
        const fieldMappings = detailTable.fieldMappings;
        const requiredMappings = [
          config.bonificationIndicatorField,
          config.regularArticleField,
          config.bonificationReferenceField,
        ].filter((field) => field);

        requiredMappings.forEach((field) => {
          const hasMapping = fieldMappings.some(
            (fm) => fm.sourceField === field
          );
          if (!hasMapping) {
            validation.warnings.push(
              `Campo ${field} no encontrado en mappings de tabla de detalle`
            );
          }
        });
      }

      logger.debug(
        `✅ [${logId}] Validación completada: ${
          validation.isValid ? "válida" : "inválida"
        }`
      );

      return validation;
    } catch (error) {
      logger.error(
        `❌ [${logId}] Error validando configuración: ${error.message}`
      );
      return {
        isValid: false,
        issues: [`Error de validación: ${error.message}`],
        warnings: [],
      };
    }
  }

  /**
   * 🎁 NUEVO: Obtiene estadísticas de bonificaciones de un mapping
   * @param {Object} mapping - Configuración de mapeo
   * @param {Object} filters - Filtros de búsqueda
   * @returns {Promise<Object>} - Estadísticas de bonificaciones
   */
  async getBonificationStats(mapping, filters = {}) {
    const logId = `getBonifStats_${mapping._id}`;
    let sourceConnection = null;

    try {
      logger.info(`📊 [${logId}] Obteniendo estadísticas de bonificaciones`);

      if (!this.shouldProcessBonifications(mapping)) {
        return {
          success: false,
          message: "Procesamiento de bonificaciones no habilitado",
          data: null,
        };
      }

      sourceConnection = await ConnectionService.getConnection(
        mapping.sourceServer
      );

      // Estadísticas básicas
      const stats = {
        totalDocuments: 0,
        documentsWithBonifications: 0,
        totalBonifications: 0,
        totalRegularItems: 0,
        avgBonificationsPerDocument: 0,
        bonificationTypes: {},
        period: {
          from: filters.dateFrom || null,
          to: filters.dateTo || null,
        },
        lastUpdated: new Date(),
      };

      // Obtener tabla de detalle
      const detailTable = mapping.tableConfigs.find((tc) => tc.isDetailTable);
      if (!detailTable) {
        return {
          success: false,
          message: "No se encontró tabla de detalle",
          data: null,
        };
      }

      // Construir consulta de estadísticas
      const bonificationIndicator =
        mapping.bonificationConfig.bonificationIndicatorField;
      const bonificationValue =
        mapping.bonificationConfig.bonificationIndicatorValue;
      const sourceTable = detailTable.useSameSourceTable
        ? mapping.tableConfigs.find((tc) => !tc.isDetailTable).sourceTable
        : detailTable.sourceTable;

      let statsQuery = `
        SELECT
          COUNT(DISTINCT ${
            detailTable.primaryKey || "NUM_PED"
          }) as totalDocuments,
          COUNT(*) as totalItems,
          SUM(CASE WHEN ${bonificationIndicator} = '${bonificationValue}' THEN 1 ELSE 0 END) as totalBonifications,
          SUM(CASE WHEN ${bonificationIndicator} != '${bonificationValue}' OR ${bonificationIndicator} IS NULL THEN 1 ELSE 0 END) as totalRegularItems
        FROM ${sourceTable}
      `;

      // Aplicar filtros de fecha si existen
      const whereConditions = [];
      const queryParams = {};

      if (filters.dateFrom) {
        whereConditions.push(`FECHA >= @dateFrom`);
        queryParams.dateFrom = filters.dateFrom;
      }

      if (filters.dateTo) {
        whereConditions.push(`FECHA <= @dateTo`);
        queryParams.dateTo = filters.dateTo;
      }

      if (whereConditions.length > 0) {
        statsQuery += ` WHERE ${whereConditions.join(" AND ")}`;
      }

      logger.debug(
        `📊 [${logId}] Ejecutando consulta de estadísticas: ${statsQuery}`
      );

      const result = await SqlService.query(
        sourceConnection,
        statsQuery,
        queryParams
      );

      if (result.recordset && result.recordset.length > 0) {
        const row = result.recordset[0];
        stats.totalDocuments = row.totalDocuments || 0;
        stats.totalBonifications = row.totalBonifications || 0;
        stats.totalRegularItems = row.totalRegularItems || 0;
        stats.documentsWithBonifications = stats.totalDocuments; // Aproximación
        stats.avgBonificationsPerDocument =
          stats.totalDocuments > 0
            ? (stats.totalBonifications / stats.totalDocuments).toFixed(2)
            : 0;
      }

      logger.info(`✅ [${logId}] Estadísticas obtenidas exitosamente`);

      return {
        success: true,
        message: "Estadísticas obtenidas exitosamente",
        data: stats,
      };
    } catch (error) {
      logger.error(
        `❌ [${logId}] Error obteniendo estadísticas: ${error.message}`
      );
      return {
        success: false,
        message: error.message,
        data: null,
      };
    } finally {
      if (sourceConnection) {
        try {
          await ConnectionService.releaseConnection(sourceConnection);
        } catch (connError) {
          logger.error(
            `❌ [${logId}] Error liberando conexión: ${connError.message}`
          );
        }
      }
    }
  }

  /**
   * Obtiene estadísticas del servicio
   * @returns {Object} - Estadísticas del servicio
   */
  getServiceStats() {
    return {
      ...this.processingStats,
      activeProcesses: this.activeProcesses.size,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      version: "2.0.0",
      features: {
        bonificationProcessing: true,
        transactionSupport: true,
        batchProcessing: true,
        lookupSupport: true,
        consecutiveGeneration: true,
      },
    };
  }

  /**
   * 🎁 NUEVO: Procesa un documento específico con bonificaciones para testing
   * @param {Object} mapping - Configuración de mapeo
   * @param {string} documentId - ID del documento
   * @param {Object} options - Opciones de procesamiento
   * @returns {Promise<Object>} - Resultado del procesamiento
   */
  async processDocumentWithBonifications(mapping, documentId, options = {}) {
    const logId = `processDocBonif_${documentId}`;
    let sourceConnection = null;
    let targetConnection = null;

    try {
      logger.info(`🎁 [${logId}] Procesando documento con bonificaciones`);

      // Establecer conexiones
      sourceConnection = await ConnectionService.getConnection(
        mapping.sourceServer
      );
      targetConnection = await ConnectionService.getConnection(
        mapping.targetServer
      );

      // Procesar documento usando el método principal
      const result = await this.processDocument(
        documentId,
        mapping,
        sourceConnection,
        targetConnection,
        null, // transaction
        null, // executionId
        logId,
        options
      );

      logger.info(`✅ [${logId}] Documento procesado exitosamente`);

      return result;
    } catch (error) {
      logger.error(
        `❌ [${logId}] Error procesando documento: ${error.message}`
      );
      return {
        success: false,
        message: error.message,
        bonificationStats: null,
      };
    } finally {
      if (sourceConnection) {
        try {
          await ConnectionService.releaseConnection(sourceConnection);
        } catch (connError) {
          logger.error(
            `❌ [${logId}] Error liberando conexión source: ${connError.message}`
          );
        }
      }
      if (targetConnection) {
        try {
          await ConnectionService.releaseConnection(targetConnection);
        } catch (connError) {
          logger.error(
            `❌ [${logId}] Error liberando conexión target: ${connError.message}`
          );
        }
      }
    }
  }

  /**
   * 🎁 NUEVO: Obtiene documentos con bonificaciones para análisis
   * @param {Object} mapping - Configuración de mapeo
   * @param {Object} options - Opciones de consulta
   * @returns {Promise<Array>} - Lista de documentos con bonificaciones
   */
  async getDocumentsWithBonifications(mapping, options = {}) {
    const logId = `getDocsBonif_${mapping._id}`;
    let sourceConnection = null;

    try {
      logger.info(`🎁 [${logId}] Obteniendo documentos con bonificaciones`);

      if (!this.shouldProcessBonifications(mapping)) {
        return [];
      }

      sourceConnection = await ConnectionService.getConnection(
        mapping.sourceServer
      );

      const detailTable = mapping.tableConfigs.find((tc) => tc.isDetailTable);
      if (!detailTable) {
        return [];
      }

      const bonificationIndicator =
        mapping.bonificationConfig.bonificationIndicatorField;
      const bonificationValue =
        mapping.bonificationConfig.bonificationIndicatorValue;
      const primaryKey = detailTable.primaryKey || "NUM_PED";
      const sourceTable = detailTable.useSameSourceTable
        ? mapping.tableConfigs.find((tc) => !tc.isDetailTable).sourceTable
        : detailTable.sourceTable;

      const { limit = 50, offset = 0 } = options;

      const query = `
        SELECT DISTINCT TOP ${limit} ${primaryKey}
        FROM ${sourceTable}
        WHERE ${bonificationIndicator} = @bonificationValue
        ORDER BY ${primaryKey}
        ${offset > 0 ? `OFFSET ${offset} ROWS` : ""}
      `;

      logger.debug(`🔍 [${logId}] Ejecutando consulta: ${query}`);

      const result = await SqlService.query(sourceConnection, query, {
        bonificationValue,
      });

      const documents = result.recordset || [];

      logger.info(
        `✅ [${logId}] ${documents.length} documentos con bonificaciones encontrados`
      );

      return documents.map((doc) => doc[primaryKey]);
    } catch (error) {
      logger.error(
        `❌ [${logId}] Error obteniendo documentos con bonificaciones: ${error.message}`
      );
      return [];
    } finally {
      if (sourceConnection) {
        try {
          await ConnectionService.releaseConnection(sourceConnection);
        } catch (connError) {
          logger.error(
            `❌ [${logId}] Error liberando conexión: ${connError.message}`
          );
        }
      }
    }
  }

  /**
   * 🎁 NUEVO: Limpia caché y estadísticas del servicio
   */
  clearCache() {
    try {
      logger.info("🧹 Limpiando caché del servicio");

      // Limpiar procesos activos
      this.activeProcesses.clear();

      // Resetear estadísticas
      this.processingStats = {
        totalProcessed: 0,
        totalFailed: 0,
        averageProcessingTime: 0,
        lastProcessingTime: null,
      };

      logger.info("✅ Caché limpiado exitosamente");
    } catch (error) {
      logger.error(`❌ Error limpiando caché: ${error.message}`);
    }
  }

  /**
   * 🎁 NUEVO: Obtiene información de salud del servicio
   * @returns {Object} - Información de salud
   */
  getHealthInfo() {
    return {
      status: "healthy",
      timestamp: new Date(),
      version: "2.0.0",
      uptime: process.uptime(),
      activeProcesses: this.activeProcesses.size,
      memoryUsage: process.memoryUsage(),
      stats: this.processingStats,
      features: {
        bonificationProcessing: true,
        transactionSupport: true,
        batchProcessing: true,
        lookupSupport: true,
        consecutiveGeneration: true,
        connectionPooling: true,
      },
    };
  }
}

module.exports = new DynamicTransferService();
