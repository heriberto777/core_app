const logger = require("./logger");
const ConnectionService = require("./ConnectionCentralService");
const { SqlService } = require("./SqlService");
const TransferMapping = require("../models/transferMappingModel");
const TaskExecution = require("../models/taskExecutionModel");
const TaskTracker = require("./TaskTracker");
const TransferTask = require("../models/transferTaks");
const ConsecutiveService = require("./ConsecutiveService");
const PromotionProcessor = require("./PromotionProcessor");

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
          // NUEVO: Verificar si está configurado explícitamente para usar consecutivos centralizados
          if (
            mapping.consecutiveConfig.useCentralizedSystem &&
            mapping.consecutiveConfig.selectedCentralizedConsecutive
          ) {
            // Verificar que el consecutivo centralizado existe y está activo
            try {
              const consecutive = await ConsecutiveService.getConsecutiveById(
                mapping.consecutiveConfig.selectedCentralizedConsecutive
              );
              if (consecutive && consecutive.active) {
                useCentralizedConsecutives = true;
                centralizedConsecutiveId =
                  mapping.consecutiveConfig.selectedCentralizedConsecutive;
                logger.info(
                  `Se usará consecutivo centralizado configurado para mapeo ${mappingId}: ${centralizedConsecutiveId}`
                );
              } else {
                logger.warn(
                  `Consecutivo centralizado ${mapping.consecutiveConfig.selectedCentralizedConsecutive} no está activo o no existe. Usando sistema local.`
                );
              }
            } catch (error) {
              logger.warn(
                `Error al verificar consecutivo centralizado configurado: ${error.message}. Usando sistema local.`
              );
            }
          }

          // Si no se configuró explícitamente, buscar consecutivos asignados automáticamente (compatibilidad hacia atrás)
          if (!useCentralizedConsecutives) {
            const assignedConsecutives =
              await ConsecutiveService.getConsecutivesByEntity(
                "mapping",
                mappingId
              );

            if (assignedConsecutives && assignedConsecutives.length > 0) {
              useCentralizedConsecutives = true;
              centralizedConsecutiveId = assignedConsecutives[0]._id;
              logger.info(
                `Se usará consecutivo centralizado asignado para mapeo ${mappingId}: ${centralizedConsecutiveId}`
              );
            } else {
              logger.info(
                `No se encontraron consecutivos centralizados para ${mappingId}. Se usará el sistema local.`
              );
            }
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

      // 4. Crear registro de ejecución
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

      // 6. Procesar documentos - NUEVA LÓGICA CON ESTRATEGIAS DE MARCADO
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
          // GENERAR CONSECUTIVO SEGÚN EL SISTEMA DETERMINADO
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

          // Procesar documento
          const docResult = await this.processSingleDocumentSimple(
            documentId,
            mapping,
            sourceConnection,
            targetConnection,
            currentConsecutive
          );

          // CONFIRMAR O CANCELAR RESERVA DE CONSECUTIVO CENTRALIZADO
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
   * Procesa un documento con soporte para promociones
   * @param {string} documentId - ID del documento
   * @param {Object} mapping - Configuración de mapeo
   * @param {Object} sourceConnection - Conexión a servidor origen
   * @param {Object} targetConnection - Conexión a servidor destino
   * @param {boolean} useCentralizedConsecutives - Si usar consecutivos centralizados
   * @param {string} centralizedConsecutiveId - ID del consecutivo centralizado
   * @returns {Promise<Object>} - Resultado del procesamiento
   */
  async processSingleDocumentWithPromotions(
    documentId,
    mapping,
    sourceConnection,
    targetConnection,
    useCentralizedConsecutives = false,
    centralizedConsecutiveId = null
  ) {
    let processedTables = [];
    let documentType = "unknown";

    try {
      logger.info(
        `Procesando documento ${documentId} con soporte para promociones`
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

      // 2. Generar consecutivo si es necesario
      let currentConsecutive = null;
      if (mapping.consecutiveConfig && mapping.consecutiveConfig.enabled) {
        logger.info("Generando consecutivo para documento...");
        currentConsecutive = await this.generateConsecutive(
          mapping,
          useCentralizedConsecutives,
          centralizedConsecutiveId
        );
        logger.info(`Consecutivo generado: ${currentConsecutive.formatted}`);
      }

      // 3. Procesar cada tabla principal
      for (const tableConfig of orderedMainTables) {
        // Obtener datos de la tabla de origen
        let sourceData;

        try {
          sourceData = await this.getSourceData(
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

          logger.debug(
            `Datos de origen obtenidos: ${JSON.stringify(sourceData)}`
          );
        } catch (error) {
          logger.error(
            `Error al obtener datos de origen para documento ${documentId}: ${error.message}`
          );
          throw new Error(`Error al obtener datos de origen: ${error.message}`);
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
              sourceData
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

        // 4. Determinar el tipo de documento basado en las reglas
        documentType = this.determineDocumentType(
          mapping.documentTypeRules,
          sourceData
        );
        if (documentType !== "unknown") {
          logger.info(`Tipo de documento determinado: ${documentType}`);
        }

        // 5. Insertar datos principales
        await this.processTable(
          tableConfig,
          sourceData,
          sourceData,
          targetConnection,
          currentConsecutive,
          mapping,
          documentId,
          columnLengthCache,
          false // isDetailTable = false
        );

        logger.info(`Insertados datos principales en ${tableConfig.name}`);
        processedTables.push(tableConfig.name);

        // 6. Procesar tablas de detalle con promociones
        const detailTables = mapping.tableConfigs.filter(
          (tc) =>
            tc.isDetailTable &&
            (!tc.parentTableRef || tc.parentTableRef === tableConfig.name)
        );

        if (detailTables.length > 0) {
          await this.processDetailTablesWithPromotions(
            detailTables,
            documentId,
            sourceData,
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

      return {
        success: true,
        message: "Documento procesado exitosamente",
        documentType,
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
        // Obtener datos de la tabla de origen
        let sourceData;

        try {
          sourceData = await this.getSourceData(
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

          logger.debug(
            `Datos de origen obtenidos: ${JSON.stringify(sourceData)}`
          );
        } catch (error) {
          logger.error(
            `Error al obtener datos de origen para documento ${documentId}: ${error.message}`
          );
          throw new Error(`Error al obtener datos de origen: ${error.message}`);
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
              sourceData
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
          sourceData
        );
        if (documentType !== "unknown") {
          logger.info(`Tipo de documento determinado: ${documentType}`);
        }

        // 4. Insertar datos principales
        await this.processTable(
          tableConfig,
          sourceData,
          sourceData,
          targetConnection,
          currentConsecutive,
          mapping,
          documentId,
          columnLengthCache,
          false // isDetailTable = false
        );

        logger.info(
          `Insertados datos principales en ${tableConfig.name} sin transacción`
        );
        processedTables.push(tableConfig.name);

        // 5. Procesar tablas de detalle
        const detailTables = mapping.tableConfigs.filter(
          (tc) =>
            tc.isDetailTable &&
            (!tc.parentTableRef || tc.parentTableRef === tableConfig.name)
        );

        if (detailTables.length > 0) {
          await this.processDetailTables(
            detailTables,
            documentId,
            sourceData,
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

      return {
        success: true,
        message: "Documento procesado exitosamente",
        documentType,
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
   * Procesa las tablas de detalle con soporte para promociones
   * @private
   */
  async processDetailTablesWithPromotions(
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
      logger.info(`Procesando tabla de detalle: ${detailConfig.name}`);

      // Obtener detalles con procesamiento de promociones
      const detailsData = await this.getDetailDataWithPromotions(
        detailConfig,
        parentTableConfig,
        documentId,
        sourceConnection,
        mapping
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

      logger.info(`Insertados detalles en ${detailConfig.name}`);
      processedTables.push(detailConfig.name);
    }
  }

  /**
   * Procesa las tablas de detalle (método original)
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
      logger.info(`Procesando tabla de detalle: ${detailConfig.name}`);

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
   * Obtiene datos de detalle con procesamiento de promociones
   * @private
   */
  async getDetailDataWithPromotions(
    detailConfig,
    parentTableConfig,
    documentId,
    sourceConnection,
    mapping
  ) {
    // Obtener datos de detalle normalmente
    const detailData = await this.getDetailData(
      detailConfig,
      parentTableConfig,
      documentId,
      sourceConnection
    );

    // Verificar si hay configuración de promociones
    if (!mapping.promotionConfig || !mapping.promotionConfig.enabled) {
      logger.debug("Promociones deshabilitadas, procesando datos normalmente");
      return detailData;
    }

    // Validar configuración de promociones
    if (!PromotionProcessor.validatePromotionConfig(mapping)) {
      logger.warn(
        "Configuración de promociones inválida, procesando sin promociones"
      );
      return detailData;
    }

    logger.info(
      `Procesando detalles con promociones para documento ${documentId}`
    );

    // Procesar promociones
    const processedData = PromotionProcessor.processPromotions(
      detailData,
      mapping
    );

    // Aplicar reglas específicas si están configuradas
    const finalData = PromotionProcessor.applyPromotionRules(
      processedData,
      mapping.promotionConfig
    );

    logger.info(
      `Procesamiento de promociones completado para documento ${documentId}`
    );
    return finalData;
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
   * Obtiene datos de detalle de la misma tabla que el encabezado
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

    // Usar la función centralizada para obtener campos requeridos
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
   * Obtiene datos de detalle de su propia tabla
   * @private
   */
  async getDetailDataFromOwnTable(detailConfig, documentId, sourceConnection) {
    const orderByColumn = detailConfig.orderByColumn || "";

    // Usar la función centralizada para obtener campos requeridos
    const requiredFields = this.getRequiredFieldsFromTableConfig(detailConfig);

    // Construir la lista de campos (sin alias porque es tabla única)
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

    console.log(`🔍 CONSULTA DETALLE PROPIA: ${query}`);
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
   * Obtiene datos de la tabla de origen
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
      // Usar la función centralizada para obtener campos requeridos
      const requiredFields = this.getRequiredFieldsFromTableConfig(tableConfig);
      const tableAlias = "t1";

      // Construir la lista de campos con alias de tabla
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
   * Método auxiliar para recopilar todos los campos necesarios de una configuración de tabla
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
   * Procesa una tabla individual
   * @private
   */
  async processTable(
    tableConfig,
    sourceData,
    tableData,
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

    // Determinar si los datos a procesar son para la tabla actual
    const dataForProcessing = isDetailTable ? tableData : sourceData;

    // Ejecutar lookup si está configurado
    let lookupResults = {};
    if (this.hasLookupFields(tableConfig)) {
      logger.info(`Ejecutando lookup para tabla ${tableConfig.name}...`);
      const lookupExecution = await this.executeLookupInTarget(
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
      if (fieldMapping.targetField === "CODIGO_ARTICULO") {
        logger.warn(
          `Corrigiendo campo CODIGO_ARTICULO a ARTICULO en tabla ${tableConfig.targetTable}`
        );
        fieldMapping.targetField = "ARTICULO";
      }

      if (fieldMapping.sourceField === "CODIGO_ARTICULO") {
        logger.warn(`Corrigiendo campo origen CODIGO_ARTICULO a ARTICULO`);
        fieldMapping.sourceField = "ARTICULO";
      }
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
    // VALIDACIÓN PARA CORREGIR CAMPOS PROBLEMÁTICOS
    if (fieldMapping.targetField === "CODIGO_ARTICULO") {
      logger.warn(
        `Campo destino CODIGO_ARTICULO corregido automáticamente a ARTICULO para tabla ${tableConfig.targetTable}`
      );
      fieldMapping.targetField = "ARTICULO";
    }

    if (fieldMapping.sourceField === "CODIGO_ARTICULO") {
      logger.warn(
        `Campo origen CODIGO_ARTICULO corregido automáticamente a ARTICULO`
      );
      fieldMapping.sourceField = "ARTICULO";
    }
    let value;

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
      sqlNativeFunctions.some((fn) => defaultValue.includes(fn));

    if (isNativeFunction) {
      logger.debug(
        `Campo ${fieldMapping.targetField} usa función SQL nativa: ${defaultValue}`
      );
      return { value: defaultValue, isDirectSql: true };
    }

    // PRIORIDAD 3: Consecutivo (si está configurado)
    if (currentConsecutive && this.isConsecutiveField(fieldMapping, mapping)) {
      const consecutiveValue = this.getConsecutiveValue(
        fieldMapping,
        currentConsecutive,
        isDetailTable
      );
      logger.debug(
        `Asignando consecutivo a ${fieldMapping.targetField}: ${consecutiveValue}`
      );
      return { value: consecutiveValue, isDirectSql: false };
    }

    // PRIORIDAD 4: Obtener valor del campo origen
    if (fieldMapping.sourceField) {
      value = sourceData[fieldMapping.sourceField];
      logger.debug(
        `Valor original de ${
          fieldMapping.sourceField
        }: ${value} (tipo: ${typeof value})`
      );

      // Aplicar conversión de unidades si está configurado
      if (fieldMapping.unitConversion && fieldMapping.unitConversion.enabled) {
        logger.debug(
          `Aplicando conversión de unidades para ${fieldMapping.targetField}`
        );
        value = this.applyUnitConversion(sourceData, fieldMapping, value);
      }

      // Aplicar eliminación de prefijo si está configurado
      if (
        fieldMapping.removePrefix &&
        typeof value === "string" &&
        value.startsWith(fieldMapping.removePrefix)
      ) {
        value = value.substring(fieldMapping.removePrefix.length);
        logger.debug(
          `Prefijo removido de ${fieldMapping.targetField}: ${value}`
        );
      }

      // Aplicar mapeo de valores si existe
      if (
        value !== null &&
        value !== undefined &&
        fieldMapping.valueMappings?.length > 0
      ) {
        const valueMap = fieldMapping.valueMappings.find(
          (vm) => vm.sourceValue === value
        );
        if (valueMap) {
          value = valueMap.targetValue;
          logger.debug(
            `Valor mapeado para ${fieldMapping.targetField}: ${value}`
          );
        }
      }
    }

    // PRIORIDAD 5: Usar valor por defecto si no hay valor
    if (
      (value === null || value === undefined) &&
      fieldMapping.defaultValue !== undefined
    ) {
      value =
        fieldMapping.defaultValue === "NULL" ? null : fieldMapping.defaultValue;
      logger.debug(
        `Valor por defecto para ${fieldMapping.targetField}: ${value}`
      );
    }

    // PRIORIDAD 6: Truncar valor si excede la longitud máxima
    if (typeof value === "string" && value.length > 0) {
      const maxLength = await this.getColumnMaxLength(
        targetConnection,
        tableConfig.targetTable,
        fieldMapping.targetField,
        columnLengthCache
      );

      if (maxLength > 0 && value.length > maxLength) {
        const originalValue = value;
        value = value.substring(0, maxLength);
        logger.warn(
          `Valor truncado para ${fieldMapping.targetField}: "${originalValue}" -> "${value}" (max: ${maxLength})`
        );
      }
    }

    logger.debug(
      `Valor final para ${
        fieldMapping.targetField
      }: ${value} (tipo: ${typeof value})`
    );

    return { value, isDirectSql: false };
  }

  /**
   * Ejecuta la inserción en la tabla destino
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
    const insertValuesList = targetValues.map((value, index) => {
      const field = targetFields[index];
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
   * Determina si un campo es un campo de consecutivo
   * @private
   */
  isConsecutiveField(fieldMapping, mapping) {
    const consecutiveConfig = mapping.consecutiveConfig;
    if (!consecutiveConfig || !consecutiveConfig.enabled) {
      return false;
    }

    // Verificar si es el campo general
    if (fieldMapping.targetField === consecutiveConfig.fieldName) {
      return true;
    }

    // Verificar si es un campo específico de tabla
    if (
      consecutiveConfig.applyToTables &&
      consecutiveConfig.applyToTables.length > 0
    ) {
      return consecutiveConfig.applyToTables.some(
        (tableMapping) => tableMapping.fieldName === fieldMapping.targetField
      );
    }

    return false;
  }

  /**
   * Verifica si un campo debe recibir el consecutivo
   * @private
   */
  shouldFieldReceiveConsecutive(
    fieldMapping,
    consecutiveConfig,
    tableConfig,
    isDetailTable
  ) {
    if (!consecutiveConfig || !consecutiveConfig.enabled) {
      return false;
    }

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
   * Obtiene el valor del consecutivo para un campo
   * @private
   */
  getConsecutiveValue(fieldMapping, currentConsecutive, isDetailTable) {
    const consecutiveConfig = fieldMapping.consecutiveConfig;
    if (!consecutiveConfig || !consecutiveConfig.enabled) {
      return currentConsecutive.formatted;
    }

    // Para tablas de detalle, usar el campo específico si está configurado
    if (isDetailTable && consecutiveConfig.detailFieldName) {
      return currentConsecutive.formatted;
    }

    return currentConsecutive.formatted;
  }

  /**
   * Verifica si una tabla tiene campos de lookup
   * @private
   */
  hasLookupFields(tableConfig) {
    return (
      tableConfig.fieldMappings &&
      tableConfig.fieldMappings.some((fm) => fm.lookupFromTarget)
    );
  }

  /**
   * Ejecuta lookup en la base de datos destino
   * @private
   */
  async executeLookupInTarget(tableConfig, sourceData, targetConnection) {
    try {
      logger.info(
        `Realizando consultas de lookup en BD destino para tabla ${tableConfig.name}`
      );

      const lookupResults = {};
      const failedLookups = [];

      // Identificar campos que requieren lookup
      const lookupFields = tableConfig.fieldMappings.filter(
        (fm) => fm.lookupFromTarget && fm.lookupQuery
      );

      if (lookupFields.length === 0) {
        logger.debug(`No hay campos con lookup en tabla ${tableConfig.name}`);
        return { results: {}, success: true };
      }

      logger.info(`Procesando ${lookupFields.length} campos con lookup`);

      // Procesar cada campo con lookup
      for (const fieldMapping of lookupFields) {
        if (fieldMapping.targetField === "CODIGO_ARTICULO") {
          logger.warn(`Corrigiendo campo lookup CODIGO_ARTICULO a ARTICULO`);
          fieldMapping.targetField = "ARTICULO";
        }

        if (fieldMapping.sourceField === "CODIGO_ARTICULO") {
          logger.warn(
            `Corrigiendo campo origen lookup CODIGO_ARTICULO a ARTICULO`
          );
          fieldMapping.sourceField = "ARTICULO";
        }
        try {
          let lookupQuery = fieldMapping.lookupQuery;
          logger.debug(
            `Procesando lookup para ${fieldMapping.targetField}: ${lookupQuery}`
          );

          // Preparar parámetros
          const params = {};
          const expectedParams = this.extractParametersFromQuery(lookupQuery);

          logger.debug(`Parámetros esperados: ${expectedParams.join(", ")}`);

          // Extraer valores de parámetros desde datos de origen
          if (
            fieldMapping.lookupParams &&
            fieldMapping.lookupParams.length > 0
          ) {
            for (const param of fieldMapping.lookupParams) {
              if (!param.sourceField || !param.paramName) {
                logger.warn(
                  `Parámetro mal configurado para ${fieldMapping.targetField}`
                );
                continue;
              }

              let paramValue = sourceData[param.sourceField];

              // Aplicar eliminación de prefijo si está configurado
              if (
                param.removePrefix &&
                typeof paramValue === "string" &&
                paramValue.startsWith(param.removePrefix)
              ) {
                paramValue = paramValue.substring(param.removePrefix.length);
              }

              params[param.paramName] = paramValue;

              logger.debug(
                `Parámetro ${param.paramName} (desde ${param.sourceField}): ${paramValue}`
              );
            }
          }

          // Validar parámetros requeridos
          const missingParams = expectedParams.filter(
            (p) => params[p] === undefined || params[p] === null
          );

          if (missingParams.length > 0) {
            const errorMsg = `Parámetros faltantes: ${missingParams.join(
              ", "
            )}`;
            logger.warn(`${fieldMapping.targetField}: ${errorMsg}`);

            if (fieldMapping.failIfNotFound) {
              failedLookups.push({
                field: fieldMapping.targetField,
                error: errorMsg,
                isCritical: true,
              });
              continue;
            } else {
              lookupResults[fieldMapping.targetField] =
                fieldMapping.defaultValue || null;
              continue;
            }
          }

          // Ejecutar consulta
          logger.debug(
            `Ejecutando consulta: ${lookupQuery} con parámetros:`,
            params
          );

          const result = await SqlService.query(
            targetConnection,
            lookupQuery,
            params
          );

          if (result.recordset && result.recordset.length > 0) {
            // Tomar el primer campo del primer registro
            const firstRecord = result.recordset[0];
            const firstColumnName = Object.keys(firstRecord)[0];
            const value = firstRecord[firstColumnName];

            lookupResults[fieldMapping.targetField] = value;

            logger.debug(`✅ ${fieldMapping.targetField}: ${value}`);
          } else {
            const errorMsg = `No se encontraron resultados en lookup`;
            logger.warn(`${fieldMapping.targetField}: ${errorMsg}`);

            if (fieldMapping.failIfNotFound) {
              failedLookups.push({
                field: fieldMapping.targetField,
                error: errorMsg,
                isCritical: true,
              });
            } else {
              lookupResults[fieldMapping.targetField] =
                fieldMapping.defaultValue || null;
              logger.debug(
                `Usando valor por defecto para ${fieldMapping.targetField}: ${
                  lookupResults[fieldMapping.targetField]
                }`
              );
            }
          }
        } catch (fieldError) {
          const errorMsg = `Error en lookup: ${fieldError.message}`;
          logger.error(`${fieldMapping.targetField}: ${errorMsg}`, fieldError);

          if (fieldMapping.failIfNotFound) {
            failedLookups.push({
              field: fieldMapping.targetField,
              error: errorMsg,
              isCritical: true,
            });
          } else {
            lookupResults[fieldMapping.targetField] =
              fieldMapping.defaultValue || null;
          }
        }
      }

      // Verificar fallos críticos
      const criticalFailures = failedLookups.filter((f) => f.isCritical);
      if (criticalFailures.length > 0) {
        logger.error(
          `Fallos críticos en lookup: ${criticalFailures.length} campos`
        );
        return {
          results: {},
          success: false,
          failedFields: criticalFailures,
        };
      }

      logger.info(
        `Lookup completado. Obtenidos ${
          Object.keys(lookupResults).length
        } valores`
      );

      return {
        results: lookupResults,
        success: true,
        failedFields: failedLookups,
      };
    } catch (error) {
      logger.error(`Error general en lookup: ${error.message}`, {
        error,
        stack: error.stack,
      });

      return {
        results: {},
        success: false,
        error: error.message,
      };
    }
  }

  // Método auxiliar para extraer parámetros de la consulta
  extractParametersFromQuery(query) {
    const paramRegex = /@(\w+)/g;
    const params = [];
    let match;

    while ((match = paramRegex.exec(query)) !== null) {
      if (!params.includes(match[1])) {
        params.push(match[1]);
      }
    }

    return params;
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
        if (fieldMapping.targetField === "CODIGO_ARTICULO") {
          logger.warn(`Corrigiendo campo lookup CODIGO_ARTICULO a ARTICULO`);
          fieldMapping.targetField = "ARTICULO";
        }

        if (fieldMapping.sourceField === "CODIGO_ARTICULO") {
          logger.warn(
            `Corrigiendo campo origen lookup CODIGO_ARTICULO a ARTICULO`
          );
          fieldMapping.sourceField = "ARTICULO";
        }
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
              // Usar valor por defecto
              lookupResults[fieldMapping.targetField] =
                fieldMapping.defaultValue || null;
              logger.debug(
                `Usando valor por defecto para ${fieldMapping.targetField}: ${
                  lookupResults[fieldMapping.targetField]
                }`
              );
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
              // Usar valor por defecto
              lookupResults[fieldMapping.targetField] =
                fieldMapping.defaultValue || null;
              logger.debug(
                `Usando valor por defecto para ${fieldMapping.targetField}: ${
                  lookupResults[fieldMapping.targetField]
                }`
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
              // Usar valor por defecto en caso de error
              lookupResults[fieldMapping.targetField] =
                fieldMapping.defaultValue || null;
              logger.debug(
                `Usando valor por defecto por error en ${
                  fieldMapping.targetField
                }: ${lookupResults[fieldMapping.targetField]}`
              );
            }
          }
        } catch (fieldError) {
          const errorMsg = `Error en lookup para ${fieldMapping.targetField}: ${fieldError.message}`;
          logger.error(errorMsg, fieldError);

          if (fieldMapping.failIfNotFound) {
            failedLookups.push({
              field: fieldMapping.targetField,
              error: errorMsg,
              isCritical: true,
            });
          } else {
            // Usar valor por defecto en caso de error
            lookupResults[fieldMapping.targetField] =
              fieldMapping.defaultValue || null;
            logger.debug(
              `Usando valor por defecto por error en ${
                fieldMapping.targetField
              }: ${lookupResults[fieldMapping.targetField]}`
            );
          }
        }
      }

      // Verificar si hay fallos críticos
      const criticalFailures = failedLookups.filter((f) => f.isCritical);
      if (criticalFailures.length > 0) {
        logger.error(
          `Fallos críticos en lookup: ${criticalFailures.length} campos`
        );
        return {
          results: {},
          success: false,
          failedFields: criticalFailures,
        };
      }

      logger.info(
        `Lookup en destino completado exitosamente. Obtenidos ${
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
   * Aplica conversión de unidades a un valor específico
   * @private
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

      logger.debug(
        `🔧 Aplicando conversión de unidades para campo ${fieldMapping.targetField}`
      );

      const unitConfig = fieldMapping.unitConversion;
      if (!unitConfig || !unitConfig.enabled) {
        logger.debug(
          `Conversión de unidades no habilitada para ${fieldMapping.targetField}`
        );
        return originalValue;
      }

      // Validar que el valor original sea numérico
      const numericValue = parseFloat(originalValue);
      if (isNaN(numericValue)) {
        logger.warn(
          `Valor no numérico para conversión de unidades en ${fieldMapping.targetField}: ${originalValue}`
        );
        return originalValue;
      }

      // Obtener el factor de conversión
      let conversionFactor = 1;

      if (unitConfig.conversionFactorField) {
        const factorValue = sourceData[unitConfig.conversionFactorField];
        console.log(
          `🔧 Factor de conversión desde campo ${unitConfig.conversionFactorField}: ${factorValue}`
        );

        if (factorValue !== undefined && factorValue !== null) {
          conversionFactor = parseFloat(factorValue);
          if (isNaN(conversionFactor)) {
            logger.warn(
              `Factor de conversión no numérico en ${unitConfig.conversionFactorField}: ${factorValue}`
            );
            conversionFactor = 1;
          }
        }
      }

      // Verificar unidad de medida si está configurada
      if (unitConfig.unitMeasureField) {
        const unitMeasure = sourceData[unitConfig.unitMeasureField];
        console.log(
          `🔧 Unidad de medida desde campo ${unitConfig.unitMeasureField}: ${unitMeasure}`
        );

        // Solo aplicar conversión si la unidad coincide con la unidad origen
        if (unitConfig.fromUnit && unitMeasure !== unitConfig.fromUnit) {
          logger.debug(
            `Unidad ${unitMeasure} no coincide con unidad origen ${unitConfig.fromUnit}, sin conversión`
          );
          return originalValue;
        }
      }

      // Aplicar la conversión
      let convertedValue;
      if (unitConfig.operation === "divide") {
        convertedValue =
          conversionFactor !== 0
            ? numericValue / conversionFactor
            : numericValue;
      } else {
        // Por defecto multiplicar
        convertedValue = numericValue * conversionFactor;
      }

      logger.info(
        `🔧 Conversión aplicada para ${
          fieldMapping.targetField
        }: ${originalValue} ${
          unitConfig.operation === "divide" ? "÷" : "×"
        } ${conversionFactor} = ${convertedValue}`
      );

      return convertedValue;
    } catch (error) {
      logger.error(
        `Error al aplicar conversión de unidades para ${fieldMapping.targetField}: ${error.message}`
      );
      return originalValue;
    }
  }

  /**
   * Obtiene la longitud máxima de una columna
   * @private
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
   * Genera un consecutivo para el documento
   * @private
   */
  async generateConsecutive(
    mapping,
    useCentralizedConsecutives = false,
    centralizedConsecutiveId = null
  ) {
    try {
      if (useCentralizedConsecutives && centralizedConsecutiveId) {
        // Usar consecutivo centralizado
        logger.info(
          `Generando consecutivo centralizado: ${centralizedConsecutiveId}`
        );
        return await ConsecutiveService.generateConsecutive(
          centralizedConsecutiveId
        );
      } else {
        // Usar consecutivo local del mapping
        logger.info("Generando consecutivo local del mapping");
        return await this.generateLocalConsecutive(mapping);
      }
    } catch (error) {
      logger.error(`Error al generar consecutivo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Genera un consecutivo local
   * @private
   */
  async generateLocalConsecutive(mapping) {
    const consecutiveConfig = mapping.consecutiveConfig;
    if (!consecutiveConfig || !consecutiveConfig.enabled) {
      return null;
    }

    // Incrementar el último valor
    const nextValue = (consecutiveConfig.lastValue || 0) + 1;

    // Formatear el consecutivo
    let formatted = nextValue.toString();

    if (consecutiveConfig.pattern) {
      // Usar patrón personalizado
      formatted = consecutiveConfig.pattern
        .replace(/{PREFIX}/g, consecutiveConfig.prefix || "")
        .replace(/{VALUE:(\d+)}/g, (match, digits) => {
          return nextValue.toString().padStart(parseInt(digits), "0");
        })
        .replace(/{VALUE}/g, nextValue.toString())
        .replace(/{YEAR}/g, new Date().getFullYear().toString())
        .replace(
          /{MONTH}/g,
          (new Date().getMonth() + 1).toString().padStart(2, "0")
        )
        .replace(/{DAY}/g, new Date().getDate().toString().padStart(2, "0"));
    } else {
      // Formato simple
      formatted = (consecutiveConfig.prefix || "") + nextValue;
    }

    // Actualizar el último valor en el mapping
    await TransferMapping.findByIdAndUpdate(mapping._id, {
      "consecutiveConfig.lastValue": nextValue,
    });

    return {
      value: nextValue,
      formatted: formatted,
    };
  }

  /**
   * Procesa dependencias de foreign key
   * @private
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

    // Ordenar dependencias por orden de ejecución
    const orderedDependencies = mapping.foreignKeyDependencies.sort(
      (a, b) => (a.executionOrder || 0) - (b.executionOrder || 0)
    );

    for (const dependency of orderedDependencies) {
      try {
        logger.info(`Procesando dependencia FK: ${dependency.fieldName}`);

        // Obtener el valor del campo que causa la dependencia
        const fieldValue = sourceData[dependency.fieldName];
        if (!fieldValue) {
          logger.warn(
            `Campo ${dependency.fieldName} no tiene valor, saltando dependencia`
          );
          continue;
        }

        // Buscar el campo clave en la configuración
        const keyField = dependency.dependentFields.find((f) => f.isKey);
        if (!keyField) {
          logger.warn(
            `No se encontró campo clave para dependencia ${dependency.fieldName}`
          );
          continue;
        }

        // Verificar si el registro ya existe
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
   * Determina el tipo de documento basado en las reglas
   * @private
   */
  determineDocumentType(documentTypeRules, sourceData) {
    if (!documentTypeRules || documentTypeRules.length === 0) {
      return "unknown";
    }

    for (const rule of documentTypeRules) {
      if (
        rule.sourceField &&
        rule.sourceValues &&
        rule.sourceValues.length > 0
      ) {
        const fieldValue = sourceData[rule.sourceField];
        if (rule.sourceValues.includes(fieldValue)) {
          return rule.name;
        }
      }
    }

    return "unknown";
  }

  /**
   * Maneja errores de procesamiento
   * @private
   */
  handleProcessingError(error, documentId, currentConsecutive, mapping) {
    logger.error(`Error procesando documento ${documentId}: ${error.message}`);

    // Si se generó un consecutivo, podríamos querer revertirlo
    if (currentConsecutive && mapping.consecutiveConfig?.updateAfterTransfer) {
      logger.warn(
        `Documento ${documentId} falló pero consecutivo ${currentConsecutive.formatted} ya fue generado`
      );
    }

    return {
      success: false,
      message: error.message,
      error: error.stack,
      documentType: "unknown",
      consecutiveUsed: currentConsecutive ? currentConsecutive.formatted : null,
      consecutiveValue: currentConsecutive ? currentConsecutive.value : null,
    };
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

    logger.info(
      `${shouldMark ? "Marcando" : "Desmarcando"} ${
        docArray.length
      } documento(s) como procesado(s)`
    );

    const strategy = mapping.markProcessedStrategy || "individual";
    const config = mapping.markProcessedConfig || {};

    try {
      switch (strategy) {
        case "individual":
          return await this.markDocumentsIndividually(
            docArray,
            mapping,
            connection,
            shouldMark,
            config
          );

        case "batch":
          return await this.markDocumentsBatch(
            docArray,
            mapping,
            connection,
            shouldMark,
            config
          );

        case "flag":
          return await this.markDocumentsWithFlag(
            docArray,
            mapping,
            connection,
            shouldMark,
            config
          );

        default:
          throw new Error(`Estrategia de marcado no soportada: ${strategy}`);
      }
    } catch (error) {
      logger.error(
        `Error al ${shouldMark ? "marcar" : "desmarcar"} documentos: ${
          error.message
        }`
      );
      throw error;
    }
  }

  /**
   * Marca documentos individualmente
   * @private
   */
  async markDocumentsIndividually(
    documentIds,
    mapping,
    connection,
    shouldMark,
    config
  ) {
    const results = { success: 0, failed: 0, errors: [] };

    // Obtener tabla principal
    const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
    if (!mainTable) {
      throw new Error("No se encontró tabla principal");
    }

    const primaryKey = mainTable.primaryKey || "NUM_PED";
    const processedField = config.processedField || "PROCESSED";

    for (const documentId of documentIds) {
      try {
        let query;
        let params = { documentId };

        if (shouldMark) {
          // Marcar como procesado
          let setClause = `${processedField} = 1`;

          if (config.includeTimestamp) {
            const timestampField = config.timestampField || "PROCESSED_DATE";
            setClause += `, ${timestampField} = GETDATE()`;
          }

          query = `UPDATE ${mainTable.sourceTable} SET ${setClause} WHERE ${primaryKey} = @documentId`;
        } else {
          // Desmarcar
          let setClause = `${processedField} = 0`;

          if (config.includeTimestamp) {
            const timestampField = config.timestampField || "PROCESSED_DATE";
            setClause += `, ${timestampField} = NULL`;
          }

          query = `UPDATE ${mainTable.sourceTable} SET ${setClause} WHERE ${primaryKey} = @documentId`;
        }

        await SqlService.query(connection, query, params);
        results.success++;

        logger.debug(
          `Documento ${documentId} ${
            shouldMark ? "marcado" : "desmarcado"
          } exitosamente`
        );
      } catch (error) {
        results.failed++;
        results.errors.push({
          documentId,
          error: error.message,
        });

        logger.error(
          `Error al ${
            shouldMark ? "marcar" : "desmarcar"
          } documento ${documentId}: ${error.message}`
        );
      }
    }

    return results;
  }

  /**
   * Marca documentos en lotes
   * @private
   */
  async markDocumentsBatch(
    documentIds,
    mapping,
    connection,
    shouldMark,
    config
  ) {
    const results = { success: 0, failed: 0, errors: [] };

    // Obtener tabla principal
    const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
    if (!mainTable) {
      throw new Error("No se encontró tabla principal");
    }

    const primaryKey = mainTable.primaryKey || "NUM_PED";
    const processedField = config.processedField || "PROCESSED";
    const batchSize = config.batchSize || 100;

    // Procesar en lotes
    for (let i = 0; i < documentIds.length; i += batchSize) {
      const batch = documentIds.slice(i, i + batchSize);

      try {
        const placeholders = batch.map((_, index) => `@doc${index}`).join(", ");
        const params = {};

        batch.forEach((docId, index) => {
          params[`doc${index}`] = docId;
        });

        let query;
        if (shouldMark) {
          let setClause = `${processedField} = 1`;

          if (config.includeTimestamp) {
            const timestampField = config.timestampField || "PROCESSED_DATE";
            setClause += `, ${timestampField} = GETDATE()`;
          }

          query = `UPDATE ${mainTable.sourceTable} SET ${setClause} WHERE ${primaryKey} IN (${placeholders})`;
        } else {
          let setClause = `${processedField} = 0`;

          if (config.includeTimestamp) {
            const timestampField = config.timestampField || "PROCESSED_DATE";
            setClause += `, ${timestampField} = NULL`;
          }

          query = `UPDATE ${mainTable.sourceTable} SET ${setClause} WHERE ${primaryKey} IN (${placeholders})`;
        }

        await SqlService.query(connection, query, params);
        results.success += batch.length;

        logger.debug(
          `Lote de ${batch.length} documentos ${
            shouldMark ? "marcados" : "desmarcados"
          } exitosamente`
        );
      } catch (error) {
        results.failed += batch.length;
        batch.forEach((docId) => {
          results.errors.push({
            documentId: docId,
            error: error.message,
          });
        });

        logger.error(
          `Error al ${
            shouldMark ? "marcar" : "desmarcar"
          } lote de documentos: ${error.message}`
        );
      }
    }

    return results;
  }

  /**
   * Marca documentos con flag
   * @private
   */
  async markDocumentsWithFlag(
    documentIds,
    mapping,
    connection,
    shouldMark,
    config
  ) {
    const results = { success: 0, failed: 0, errors: [] };

    // Obtener tabla principal
    const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
    if (!mainTable) {
      throw new Error("No se encontró tabla principal");
    }

    const primaryKey = mainTable.primaryKey || "NUM_PED";
    const flagField = config.flagField || "TRANSFER_FLAG";
    const flagValue = config.flagValue || "PROCESSED";

    for (const documentId of documentIds) {
      try {
        let query;
        let params = { documentId };

        if (shouldMark) {
          // Marcar con flag
          let setClause = `${flagField} = '${flagValue}'`;

          if (config.includeTimestamp) {
            const timestampField = config.timestampField || "FLAG_DATE";
            setClause += `, ${timestampField} = GETDATE()`;
          }

          query = `UPDATE ${mainTable.sourceTable} SET ${setClause} WHERE ${primaryKey} = @documentId`;
        } else {
          // Desmarcar flag
          let setClause = `${flagField} = NULL`;

          if (config.includeTimestamp) {
            const timestampField = config.timestampField || "FLAG_DATE";
            setClause += `, ${timestampField} = NULL`;
          }

          query = `UPDATE ${mainTable.sourceTable} SET ${setClause} WHERE ${primaryKey} = @documentId`;
        }

        await SqlService.query(connection, query, params);
        results.success++;

        logger.debug(
          `Documento ${documentId} ${
            shouldMark ? "marcado" : "desmarcado"
          } con flag exitosamente`
        );
      } catch (error) {
        results.failed++;
        results.errors.push({
          documentId,
          error: error.message,
        });

        logger.error(
          `Error al ${
            shouldMark ? "marcar" : "desmarcar"
          } documento ${documentId} con flag: ${error.message}`
        );
      }
    }

    return results;
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
          if (parts.length === 2) {
            schema = parts[0];
            tableName = parts[1];
          }
        }

        // Limpiar nombres de corchetes si existen
        schema = schema.replace(/\[|\]/g, "");
        tableName = tableName.replace(/\[|\]/g, "");

        logger.info(`Verificando tabla ${schema}.${tableName}...`);

        // Verificar si la tabla existe
        const checkTableQuery = `
        SELECT COUNT(*) as count
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = '${schema}'
        AND TABLE_NAME = '${tableName}'
      `;

        const tableCheckResult = await SqlService.query(
          connection,
          checkTableQuery
        );

        if (tableCheckResult.recordset[0].count === 0) {
          throw new Error(
            `La tabla ${schema}.${tableName} no existe en la base de datos`
          );
        }

        logger.info(`Tabla ${schema}.${tableName} encontrada correctamente`);

        // Obtener columnas de la tabla
        const columnsQuery = `
        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = '${schema}'
        AND TABLE_NAME = '${tableName}'
        ORDER BY ORDINAL_POSITION
      `;

        const columnsResult = await SqlService.query(connection, columnsQuery);

        if (!columnsResult.recordset || columnsResult.recordset.length === 0) {
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

        // CORRECCIÓN: Construir consulta directa sin subconsulta problemática
        const limit = filters.limit || 100;

        let query = `
        SELECT TOP ${limit} ${selectFieldsStr}
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
          logger.warn(
            `Campo de fecha ${dateField} no existe en ${fullTableName}. Campos disponibles: ${availableColumns.join(
              ", "
            )}`
          );
          // Buscar campos de fecha alternativos
          const alternativeDateFields = [
            "FEC_PED",
            "FECHA_PEDIDO",
            "FECHA",
            "DATE_CREATED",
            "CREATED_DATE",
            "FEC_CREACION",
            "FEC_DOC",
            "FECHA_DOC",
            "FEC_REGISTRO",
          ];
          for (const altField of alternativeDateFields) {
            if (availableColumns.includes(altField)) {
              dateField = altField;
              dateFieldExists = true;
              logger.info(`Usando campo de fecha alternativo: ${altField}`);
              break;
            }
          }
        }

        // Aplicar filtros solo si los campos existen
        if (dateFieldExists) {
          if (filters.dateFrom) {
            query += ` AND ${dateField} >= @dateFrom`;
            params.dateFrom = filters.dateFrom;
          }

          if (filters.dateTo) {
            query += ` AND ${dateField} <= @dateTo`;
            params.dateTo = filters.dateTo;
          }
        } else {
          logger.warn(
            `No se encontró campo de fecha válido. Consulta sin filtro de fecha.`
          );
        }

        // Filtros adicionales
        if (filters.status && availableColumns.includes("STATUS")) {
          query += ` AND STATUS = @status`;
          params.status = filters.status;
        }

        if (filters.processed !== undefined) {
          const processedField = filters.processedField || "PROCESSED";
          if (availableColumns.includes(processedField)) {
            query += ` AND ${processedField} = @processed`;
            params.processed = filters.processed;
          }
        }

        // Aplicar filtro personalizado si existe
        if (mainTable.filterCondition) {
          query += ` AND ${mainTable.filterCondition}`;
          logger.debug(
            `Aplicando filtro personalizado: ${mainTable.filterCondition}`
          );
        }

        // CORRECCIÓN: Agregar ORDER BY directamente en la consulta principal
        const primaryKey = mainTable.primaryKey || "NUM_PED";
        if (availableColumns.includes(primaryKey)) {
          query += ` ORDER BY ${primaryKey} DESC`;
        } else {
          // Si no existe la clave primaria, usar el primer campo disponible
          if (selectFields.length > 0) {
            query += ` ORDER BY ${selectFields[0]} DESC`;
          }
        }

        logger.info(`Ejecutando consulta: ${query}`);
        logger.debug(`Parámetros: ${JSON.stringify(params)}`);

        const result = await SqlService.query(connection, query, params);

        logger.info(
          `Consulta ejecutada exitosamente. Documentos encontrados: ${result.recordset.length}`
        );

        return result.recordset;
      } catch (tableError) {
        logger.error(
          `Error al verificar/consultar tabla ${mainTable.sourceTable}: ${tableError.message}`
        );
        throw tableError;
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
      // Crear tarea relacionada si no existe
      if (!mappingData.taskId) {
        const task = new TransferTask({
          name: `Mapeo: ${mappingData.name}`,
          description: `Tarea automática para mapeo ${mappingData.name}`,
          type: "mapping",
          status: "active",
          mappingId: null,
          schedule: {
            enabled: false,
            cron: "0 0 * * *",
            timezone: "America/Santo_Domingo",
          },
          active: true,
        });

        const savedTask = await task.save();
        logger.info(
          `Tarea creada automáticamente para mapeo: ${savedTask._id}`
        );

        // Asignar el ID de la tarea al mapeo
        mappingData.taskId = savedTask._id;
      }

      const mapping = new TransferMapping(mappingData);
      const savedMapping = await mapping.save();

      // Actualizar la tarea con el ID del mapeo
      if (mappingData.taskId) {
        await TransferTask.findByIdAndUpdate(mappingData.taskId, {
          mappingId: savedMapping._id,
        });
      }

      return savedMapping;
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
      // Crear tarea relacionada si no existe
      if (!mappingData.taskId) {
        const task = new TransferTask({
          name: `Mapeo: ${mappingData.name}`,
          description: `Tarea automática para mapeo ${mappingData.name}`,
          type: "mapping",
          status: "active",
          mappingId: mappingId,
          schedule: {
            enabled: false,
            cron: "0 0 * * *",
            timezone: "America/Santo_Domingo",
          },
          active: true,
        });

        const savedTask = await task.save();
        logger.info(
          `Tarea creada automáticamente para mapeo: ${savedTask._id}`
        );

        // Asignar el ID de la tarea al mapeo
        mappingData.taskId = savedTask._id;
      }

      const mapping = await TransferMapping.findByIdAndUpdate(
        mappingId,
        mappingData,
        {
          new: true,
        }
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
   * Obtiene estadísticas de un mapeo específico
   * @param {string} mappingId - ID del mapeo
   * @returns {Promise<Object>} - Estadísticas del mapeo
   */
  async getMappingStats(mappingId) {
    try {
      const mapping = await TransferMapping.findById(mappingId);
      if (!mapping) {
        throw new Error(`Mapeo ${mappingId} no encontrado`);
      }

      // Obtener ejecuciones recientes
      const executions = await TaskExecution.find({ mapping: mappingId })
        .sort({ startTime: -1 })
        .limit(10);

      // Calcular estadísticas
      const totalExecutions = executions.length;
      const successfulExecutions = executions.filter(
        (e) => e.status === "completed"
      ).length;
      const failedExecutions = executions.filter(
        (e) => e.status === "failed"
      ).length;
      const totalProcessed = executions.reduce(
        (sum, e) => sum + (e.processedDocuments || 0),
        0
      );

      const lastExecution = executions[0];
      const avgExecutionTime =
        totalExecutions > 0
          ? executions.reduce((sum, e) => sum + (e.executionTime || 0), 0) /
            totalExecutions
          : 0;

      return {
        mappingId,
        mappingName: mapping.name,
        totalExecutions,
        successfulExecutions,
        failedExecutions,
        totalProcessed,
        successRate:
          totalExecutions > 0
            ? (successfulExecutions / totalExecutions) * 100
            : 0,
        avgExecutionTime: Math.round(avgExecutionTime),
        lastExecution: lastExecution
          ? {
              date: lastExecution.startTime,
              status: lastExecution.status,
              processedDocuments: lastExecution.processedDocuments || 0,
              executionTime: lastExecution.executionTime || 0,
            }
          : null,
      };
    } catch (error) {
      logger.error(`Error al obtener estadísticas del mapeo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Valida una configuración de mapeo
   * @param {Object} mappingData - Datos del mapeo a validar
   * @returns {Promise<Object>} - Resultado de la validación
   */
  async validateMapping(mappingData) {
    const errors = [];
    const warnings = [];

    try {
      // Validaciones básicas
      if (!mappingData.name || mappingData.name.trim() === "") {
        errors.push("El nombre del mapeo es requerido");
      }

      if (!mappingData.sourceServer) {
        errors.push("El servidor origen es requerido");
      }

      if (!mappingData.targetServer) {
        errors.push("El servidor destino es requerido");
      }

      if (!mappingData.tableConfigs || mappingData.tableConfigs.length === 0) {
        errors.push("Se requiere al menos una configuración de tabla");
      }

      // Validar configuración de tablas
      if (mappingData.tableConfigs) {
        const mainTables = mappingData.tableConfigs.filter(
          (tc) => !tc.isDetailTable
        );
        const detailTables = mappingData.tableConfigs.filter(
          (tc) => tc.isDetailTable
        );

        if (mainTables.length === 0) {
          errors.push("Se requiere al menos una tabla principal");
        }

        // Validar cada tabla
        for (const tableConfig of mappingData.tableConfigs) {
          if (!tableConfig.name) {
            errors.push("Todas las tablas deben tener un nombre");
          }

          if (!tableConfig.sourceTable) {
            errors.push(
              `La tabla ${tableConfig.name} debe tener una tabla origen`
            );
          }

          if (!tableConfig.targetTable) {
            errors.push(
              `La tabla ${tableConfig.name} debe tener una tabla destino`
            );
          }

          if (
            !tableConfig.fieldMappings ||
            tableConfig.fieldMappings.length === 0
          ) {
            warnings.push(
              `La tabla ${tableConfig.name} no tiene campos mapeados`
            );
          }

          // Validar campos
          if (tableConfig.fieldMappings) {
            for (const fieldMapping of tableConfig.fieldMappings) {
              if (!fieldMapping.targetField) {
                errors.push(
                  `Campo sin nombre de destino en tabla ${tableConfig.name}`
                );
              }

              if (
                !fieldMapping.sourceField &&
                fieldMapping.defaultValue === undefined
              ) {
                warnings.push(
                  `Campo ${fieldMapping.targetField} no tiene origen ni valor por defecto`
                );
              }
            }
          }

          // Validar referencias de tablas de detalle
          if (tableConfig.isDetailTable && tableConfig.parentTableRef) {
            const parentExists = mainTables.some(
              (mt) => mt.name === tableConfig.parentTableRef
            );
            if (!parentExists) {
              errors.push(
                `La tabla de detalle ${tableConfig.name} referencia una tabla padre inexistente: ${tableConfig.parentTableRef}`
              );
            }
          }
        }
      }

      // Validar configuración de promociones si está habilitada
      if (mappingData.promotionConfig && mappingData.promotionConfig.enabled) {
        const promotionErrors = this.validatePromotionConfiguration(
          mappingData.promotionConfig
        );
        errors.push(...promotionErrors);
      }

      // Validar configuración de consecutivos si está habilitada
      if (
        mappingData.consecutiveConfig &&
        mappingData.consecutiveConfig.enabled
      ) {
        if (!mappingData.consecutiveConfig.fieldName) {
          errors.push(
            "Campo de consecutivo es requerido cuando está habilitado"
          );
        }
      }

      // Validar dependencias de foreign key
      if (mappingData.foreignKeyDependencies) {
        for (const dependency of mappingData.foreignKeyDependencies) {
          if (!dependency.fieldName) {
            errors.push(
              "Nombre de campo es requerido en dependencias de foreign key"
            );
          }

          if (!dependency.dependentTable) {
            errors.push(
              "Tabla dependiente es requerida en dependencias de foreign key"
            );
          }

          if (
            !dependency.dependentFields ||
            dependency.dependentFields.length === 0
          ) {
            errors.push(
              "Campos dependientes son requeridos en dependencias de foreign key"
            );
          }
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
      };
    } catch (error) {
      logger.error(`Error al validar configuración de mapeo: ${error.message}`);
      return {
        isValid: false,
        errors: [`Error interno de validación: ${error.message}`],
        warnings: [],
      };
    }
  }

  /**
   * Valida la configuración de promociones
   * @private
   */
  validatePromotionConfiguration(promotionConfig) {
    const errors = [];

    if (!promotionConfig.detectFields) {
      errors.push("Campos de detección de promociones son requeridos");
    } else {
      const detectFields = promotionConfig.detectFields;

      if (!detectFields.bonusField) {
        errors.push("Campo de bonificación es requerido");
      }

      if (!detectFields.referenceField) {
        errors.push("Campo de referencia es requerido");
      }

      if (!detectFields.lineNumberField) {
        errors.push("Campo de número de línea es requerido");
      }

      if (!detectFields.articleField) {
        errors.push("Campo de artículo es requerido");
      }
    }

    if (!promotionConfig.targetFields) {
      errors.push("Campos destino de promociones son requeridos");
    } else {
      const targetFields = promotionConfig.targetFields;

      if (!targetFields.bonusLineRef) {
        errors.push("Campo de referencia de bonificación es requerido");
      }

      if (!targetFields.orderedQuantity) {
        errors.push("Campo de cantidad pedida es requerido");
      }

      if (!targetFields.bonusQuantity) {
        errors.push("Campo de cantidad bonificación es requerido");
      }
    }

    // Validar reglas si existen
    if (promotionConfig.rules) {
      for (const rule of promotionConfig.rules) {
        if (!rule.name) {
          errors.push("Nombre de regla es requerido");
        }

        if (!rule.type) {
          errors.push("Tipo de regla es requerido");
        }

        const validTypes = [
          "FAMILY_DISCOUNT",
          "QUANTITY_BONUS",
          "SCALED_BONUS",
          "PRODUCT_BONUS",
          "INVOICE_DISCOUNT",
          "ONE_TIME_OFFER",
        ];
        if (rule.type && !validTypes.includes(rule.type)) {
          errors.push(`Tipo de regla inválido: ${rule.type}`);
        }
      }
    }

    return errors;
  }

  /**
   * Prueba la conexión a las bases de datos de un mapeo
   * @param {string} mappingId - ID del mapeo
   * @returns {Promise<Object>} - Resultado de la prueba
   */
  async testMappingConnections(mappingId) {
    try {
      const mapping = await TransferMapping.findById(mappingId);
      if (!mapping) {
        throw new Error(`Mapeo ${mappingId} no encontrado`);
      }

      const results = {
        sourceConnection: null,
        targetConnection: null,
        overall: false,
      };

      // Probar conexión origen
      try {
        const sourceConnResult = await ConnectionService.enhancedRobustConnect(
          mapping.sourceServer
        );
        if (sourceConnResult.success) {
          results.sourceConnection = {
            success: true,
            message: "Conexión exitosa",
            server: mapping.sourceServer,
          };
          // Liberar conexión
          await ConnectionService.releaseConnection(
            sourceConnResult.connection
          );
        } else {
          results.sourceConnection = {
            success: false,
            message: sourceConnResult.error?.message || "Error desconocido",
            server: mapping.sourceServer,
          };
        }
      } catch (sourceError) {
        results.sourceConnection = {
          success: false,
          message: sourceError.message,
          server: mapping.sourceServer,
        };
      }

      // Probar conexión destino
      try {
        const targetConnResult = await ConnectionService.enhancedRobustConnect(
          mapping.targetServer
        );
        if (targetConnResult.success) {
          results.targetConnection = {
            success: true,
            message: "Conexión exitosa",
            server: mapping.targetServer,
          };
          // Liberar conexión
          await ConnectionService.releaseConnection(
            targetConnResult.connection
          );
        } else {
          results.targetConnection = {
            success: false,
            message: targetConnResult.error?.message || "Error desconocido",
            server: mapping.targetServer,
          };
        }
      } catch (targetError) {
        results.targetConnection = {
          success: false,
          message: targetError.message,
          server: mapping.targetServer,
        };
      }

      // Resultado general
      results.overall =
        results.sourceConnection?.success && results.targetConnection?.success;

      return results;
    } catch (error) {
      logger.error(`Error al probar conexiones del mapeo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene una vista previa de los datos que se procesarían
   * @param {string} mappingId - ID del mapeo
   * @param {Object} filters - Filtros para la consulta
   * @param {number} limit - Límite de registros (default: 5)
   * @returns {Promise<Object>} - Vista previa de los datos
   */
  async getDataPreview(mappingId, filters = {}, limit = 5) {
    let sourceConnection = null;

    try {
      const mapping = await TransferMapping.findById(mappingId);
      if (!mapping) {
        throw new Error(`Mapeo ${mappingId} no encontrado`);
      }

      // Establecer conexión origen
      const sourceConnResult = await ConnectionService.enhancedRobustConnect(
        mapping.sourceServer
      );
      if (!sourceConnResult.success) {
        throw new Error(
          `No se pudo conectar al servidor origen: ${sourceConnResult.error?.message}`
        );
      }
      sourceConnection = sourceConnResult.connection;

      // Obtener documentos con límite
      const previewFilters = { ...filters, limit };
      const documents = await this.getDocuments(
        mapping,
        previewFilters,
        sourceConnection
      );

      const preview = {
        mappingId,
        mappingName: mapping.name,
        sourceServer: mapping.sourceServer,
        targetServer: mapping.targetServer,
        documentsFound: documents.length,
        sampleDocuments: [],
        promotionConfig: mapping.promotionConfig || null,
      };

      // Procesar algunos documentos como muestra
      for (const document of documents.slice(
        0,
        Math.min(limit, documents.length)
      )) {
        const documentId =
          document[
            mapping.tableConfigs.find((tc) => !tc.isDetailTable)?.primaryKey ||
              "NUM_PED"
          ];

        try {
          // Obtener detalles si hay tablas de detalle
          const details = {};
          const detailTables = mapping.tableConfigs.filter(
            (tc) => tc.isDetailTable
          );

          for (const detailTable of detailTables) {
            const detailData = await this.getDetailDataWithPromotions(
              detailTable,
              mapping.tableConfigs.find((tc) => !tc.isDetailTable),
              documentId,
              sourceConnection,
              mapping
            );
            details[detailTable.name] = detailData;
          }

          preview.sampleDocuments.push({
            documentId,
            header: document,
            details,
          });
        } catch (detailError) {
          logger.warn(
            `Error al obtener detalles para documento ${documentId}: ${detailError.message}`
          );
          preview.sampleDocuments.push({
            documentId,
            header: document,
            details: {},
            error: detailError.message,
          });
        }
      }

      return preview;
    } catch (error) {
      logger.error(`Error al obtener vista previa: ${error.message}`);
      throw error;
    } finally {
      if (sourceConnection) {
        await ConnectionService.releaseConnection(sourceConnection);
      }
    }
  }

  /**
   * Duplica una configuración de mapeo
   * @param {string} mappingId - ID del mapeo a duplicar
   * @param {string} newName - Nuevo nombre para el mapeo duplicado
   * @returns {Promise<Object>} - Nuevo mapeo creado
   */
  async duplicateMapping(mappingId, newName) {
    try {
      const originalMapping = await TransferMapping.findById(mappingId);
      if (!originalMapping) {
        throw new Error(`Mapeo ${mappingId} no encontrado`);
      }

      // Crear copia de los datos
      const duplicatedData = {
        name: newName,
        description: `Copia de ${originalMapping.name}`,
        sourceServer: originalMapping.sourceServer,
        targetServer: originalMapping.targetServer,
        tableConfigs: originalMapping.tableConfigs,
        documentTypeRules: originalMapping.documentTypeRules,
        foreignKeyDependencies: originalMapping.foreignKeyDependencies,
        consecutiveConfig: originalMapping.consecutiveConfig
          ? {
              ...originalMapping.consecutiveConfig.toObject(),
              enabled: false, // Deshabilitar consecutivos en la copia
              lastValue: 0, // Resetear contador
            }
          : undefined,
        promotionConfig: originalMapping.promotionConfig,
        markProcessedStrategy: originalMapping.markProcessedStrategy,
        markProcessedConfig: originalMapping.markProcessedConfig,
        active: false, // Crear como inactivo
      };

      // Crear nuevo mapeo
      const newMapping = await this.createMapping(duplicatedData);

      logger.info(`Mapeo duplicado: ${originalMapping.name} -> ${newName}`);
      return newMapping;
    } catch (error) {
      logger.error(`Error al duplicar mapeo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Exporta una configuración de mapeo a JSON
   * @param {string} mappingId - ID del mapeo
   * @returns {Promise<Object>} - Configuración exportada
   */
  async exportMapping(mappingId) {
    try {
      const mapping = await TransferMapping.findById(mappingId);
      if (!mapping) {
        throw new Error(`Mapeo ${mappingId} no encontrado`);
      }

      // Crear objeto exportable (sin campos internos)
      const exportData = {
        version: "1.0",
        exportDate: new Date().toISOString(),
        mapping: {
          name: mapping.name,
          description: mapping.description,
          sourceServer: mapping.sourceServer,
          targetServer: mapping.targetServer,
          tableConfigs: mapping.tableConfigs,
          documentTypeRules: mapping.documentTypeRules,
          foreignKeyDependencies: mapping.foreignKeyDependencies,
          consecutiveConfig: mapping.consecutiveConfig,
          promotionConfig: mapping.promotionConfig,
          markProcessedStrategy: mapping.markProcessedStrategy,
          markProcessedConfig: mapping.markProcessedConfig,
        },
      };

      logger.info(`Mapeo exportado: ${mapping.name}`);
      return exportData;
    } catch (error) {
      logger.error(`Error al exportar mapeo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Importa una configuración de mapeo desde JSON
   * @param {Object} importData - Datos importados
   * @param {string} newName - Nuevo nombre para el mapeo (opcional)
   * @returns {Promise<Object>} - Mapeo creado
   */
  async importMapping(importData, newName = null) {
    try {
      // Validar estructura de importación
      if (!importData.mapping) {
        throw new Error("Estructura de importación inválida");
      }

      const mappingData = importData.mapping;

      // Asignar nuevo nombre si se proporcionó
      if (newName) {
        mappingData.name = newName;
      }

      // Resetear campos que no deberían importarse
      delete mappingData._id;
      delete mappingData.taskId;
      delete mappingData.createdAt;
      delete mappingData.updatedAt;

      // Resetear consecutivos
      if (mappingData.consecutiveConfig) {
        mappingData.consecutiveConfig.enabled = false;
        mappingData.consecutiveConfig.lastValue = 0;
      }

      // Crear mapeo importado
      const newMapping = await this.createMapping(mappingData);

      logger.info(`Mapeo importado: ${mappingData.name}`);
      return newMapping;
    } catch (error) {
      logger.error(`Error al importar mapeo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene el historial de ejecuciones de un mapeo
   * @param {string} mappingId - ID del mapeo
   * @param {Object} options - Opciones de consulta
   * @returns {Promise<Array>} - Historial de ejecuciones
   */
  async getMappingExecutionHistory(mappingId, options = {}) {
    try {
      const { limit = 50, status, dateFrom, dateTo } = options;

      const query = { mapping: mappingId };

      if (status) {
        query.status = status;
      }

      if (dateFrom || dateTo) {
        query.startTime = {};
        if (dateFrom) query.startTime.$gte = new Date(dateFrom);
        if (dateTo) query.startTime.$lte = new Date(dateTo);
      }

      const executions = await TaskExecution.find(query)
        .sort({ startTime: -1 })
        .limit(limit);

      // Formatear resultados
      const formattedExecutions = executions.map((execution) => ({
        id: execution._id,
        startTime: execution.startTime,
        endTime: execution.endTime,
        status: execution.status,
        totalDocuments: execution.totalDocuments,
        processedDocuments: execution.processedDocuments,
        failedDocuments: execution.failedDocuments,
        executionTime: execution.executionTime,
        result: execution.result,
      }));

      return formattedExecutions;
    } catch (error) {
      logger.error(
        `Error al obtener historial de ejecuciones: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Limpia el historial de ejecuciones de un mapeo
   * @param {string} mappingId - ID del mapeo
   * @param {Object} options - Opciones de limpieza
   * @returns {Promise<Object>} - Resultado de la limpieza
   */
  async cleanMappingExecutionHistory(mappingId, options = {}) {
    try {
      const { olderThan = 30, status } = options; // Días

      const query = { mapping: mappingId };

      // Limpiar ejecuciones más antiguas que X días
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThan);
      query.startTime = { $lt: cutoffDate };

      if (status) {
        query.status = status;
      }

      const result = await TaskExecution.deleteMany(query);

      logger.info(
        `Historial de mapeo ${mappingId} limpiado: ${result.deletedCount} registros eliminados`
      );

      return {
        deletedCount: result.deletedCount,
        cutoffDate: cutoffDate.toISOString(),
      };
    } catch (error) {
      logger.error(
        `Error al limpiar historial de ejecuciones: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Obtiene métricas agregadas de todos los mapeos
   * @returns {Promise<Object>} - Métricas agregadas
   */
  async getAggregatedMappingMetrics() {
    try {
      const mappings = await TransferMapping.find();
      const totalMappings = mappings.length;
      const activeMappings = mappings.filter((m) => m.active !== false).length;
      const mappingsWithPromotions = mappings.filter(
        (m) => m.promotionConfig?.enabled
      ).length;
      const mappingsWithConsecutives = mappings.filter(
        (m) => m.consecutiveConfig?.enabled
      ).length;

      // Obtener ejecuciones recientes (últimos 30 días)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentExecutions = await TaskExecution.find({
        startTime: { $gte: thirtyDaysAgo },
      });

      const totalExecutions = recentExecutions.length;
      const successfulExecutions = recentExecutions.filter(
        (e) => e.status === "completed"
      ).length;
      const failedExecutions = recentExecutions.filter(
        (e) => e.status === "failed"
      ).length;
      const totalProcessedDocuments = recentExecutions.reduce(
        (sum, e) => sum + (e.processedDocuments || 0),
        0
      );

      return {
        mappings: {
          total: totalMappings,
          active: activeMappings,
          withPromotions: mappingsWithPromotions,
          withConsecutives: mappingsWithConsecutives,
        },
        executions: {
          total: totalExecutions,
          successful: successfulExecutions,
          failed: failedExecutions,
          successRate:
            totalExecutions > 0
              ? (successfulExecutions / totalExecutions) * 100
              : 0,
        },
        documents: {
          totalProcessed: totalProcessedDocuments,
          avgPerExecution:
            totalExecutions > 0
              ? Math.round(totalProcessedDocuments / totalExecutions)
              : 0,
        },
        period: {
          from: thirtyDaysAgo.toISOString(),
          to: new Date().toISOString(),
        },
      };
    } catch (error) {
      logger.error(`Error al obtener métricas agregadas: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new DynamicTransferService();
