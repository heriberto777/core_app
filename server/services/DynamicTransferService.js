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

    // Variables para manejar consecutivos - MEJORADO
    let consecutiveSystem = {
      type: "none", // 'none', 'local', 'centralized'
      centralizedId: null,
      config: null,
    };

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

      // 2. NUEVA LÓGICA DE CONSECUTIVOS MEJORADA
      if (mapping.consecutiveConfig && mapping.consecutiveConfig.enabled) {
        consecutiveSystem = await this.determineConsecutiveSystem(mapping);

        logger.info(
          `Sistema de consecutivos determinado: ${consecutiveSystem.type}${
            consecutiveSystem.centralizedId
              ? ` (ID: ${consecutiveSystem.centralizedId})`
              : ""
          }`
        );
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

      // 6. Procesar documentos
      const results = {
        processed: 0,
        failed: 0,
        skipped: 0,
        byType: {},
        details: [],
        consecutivesUsed: [],
      };

      // Arrays para recopilar documentos exitosos y fallidos
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
          if (consecutiveSystem.type !== "none") {
            try {
              currentConsecutive = await this.generateConsecutiveBySystem(
                consecutiveSystem,
                mapping,
                documentId
              );

              if (currentConsecutive) {
                logger.info(
                  `Consecutivo generado (${consecutiveSystem.type}) para documento ${documentId}: ${currentConsecutive.formatted}`
                );
              }
            } catch (consecError) {
              logger.error(
                `Error generando consecutivo para documento ${documentId}: ${consecError.message}`
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

          // Procesar documento
          const docResult = await this.processSingleDocumentSimple(
            documentId,
            mapping,
            sourceConnection,
            targetConnection,
            currentConsecutive
          );

          // MANEJAR RESERVAS DE CONSECUTIVO CENTRALIZADO
          if (
            consecutiveSystem.type === "centralized" &&
            currentConsecutive &&
            currentConsecutive.reservationId
          ) {
            if (docResult.success) {
              await this.commitConsecutiveReservation(
                consecutiveSystem.centralizedId,
                currentConsecutive
              );
              logger.info(
                `Reserva confirmada para documento ${documentId}: ${currentConsecutive.formatted}`
              );
            } else {
              await this.cancelConsecutiveReservation(
                consecutiveSystem.centralizedId,
                currentConsecutive
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

            // Marcado individual solo si está configurado así
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

      // Actualizar registro de ejecución y tarea
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
      clearTimeout(timeoutId);

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

      TaskTracker.completeTask(
        cancelTaskId || `dynamic_process_${mappingId}`,
        "failed"
      );

      throw error;
    } finally {
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
   * NUEVO: Determina qué sistema de consecutivos usar
   * @param {Object} mapping - Configuración de mapeo
   * @returns {Promise<Object>} - Sistema a usar
   */
  async determineConsecutiveSystem(mapping) {
    try {
      // Verificar si está configurado explícitamente para usar consecutivos centralizados
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
            return {
              type: "centralized",
              centralizedId:
                mapping.consecutiveConfig.selectedCentralizedConsecutive,
              config: consecutive,
            };
          } else {
            logger.warn(
              `Consecutivo centralizado ${mapping.consecutiveConfig.selectedCentralizedConsecutive} no está activo o no existe. Usando sistema local.`
            );
          }
        } catch (error) {
          logger.warn(
            `Error al verificar consecutivo centralizado: ${error.message}. Usando sistema local.`
          );
        }
      }

      // Buscar consecutivos asignados automáticamente (compatibilidad hacia atrás)
      try {
        const assignedConsecutives =
          await ConsecutiveService.getConsecutivesByEntity(
            "mapping",
            mapping._id
          );

        if (assignedConsecutives && assignedConsecutives.length > 0) {
          const consecutive = assignedConsecutives[0];
          if (consecutive.active) {
            return {
              type: "centralized",
              centralizedId: consecutive._id,
              config: consecutive,
            };
          }
        }
      } catch (error) {
        logger.warn(`Error al buscar consecutivos asignados: ${error.message}`);
      }

      // Usar sistema local si está habilitado
      if (mapping.consecutiveConfig.enabled) {
        return {
          type: "local",
          centralizedId: null,
          config: mapping.consecutiveConfig,
        };
      }

      return {
        type: "none",
        centralizedId: null,
        config: null,
      };
    } catch (error) {
      logger.error(
        `Error determinando sistema de consecutivos: ${error.message}`
      );
      return {
        type: "local", // Fallback al sistema local
        centralizedId: null,
        config: mapping.consecutiveConfig,
      };
    }
  }

  /**
   * NUEVO: Genera consecutivo según el sistema determinado
   * @param {Object} consecutiveSystem - Sistema a usar
   * @param {Object} mapping - Configuración de mapeo
   * @param {string} documentId - ID del documento
   * @returns {Promise<Object>} - Consecutivo generado
   */
  async generateConsecutiveBySystem(consecutiveSystem, mapping, documentId) {
    try {
      switch (consecutiveSystem.type) {
        case "centralized":
          return await this.generateCentralizedConsecutive(
            consecutiveSystem.centralizedId,
            documentId
          );

        case "local":
          return await this.generateLocalConsecutive(mapping);

        default:
          return null;
      }
    } catch (error) {
      logger.error(
        `Error generando consecutivo (${consecutiveSystem.type}): ${error.message}`
      );
      throw error;
    }
  }

  /**
   * NUEVO: Genera consecutivo centralizado
   * @param {string} consecutiveId - ID del consecutivo centralizado
   * @param {string} documentId - ID del documento
   * @returns {Promise<Object>} - Consecutivo generado
   */
  async generateCentralizedConsecutive(consecutiveId, documentId) {
    try {
      const reservation = await ConsecutiveService.reserveConsecutiveValues(
        consecutiveId,
        1,
        { segment: null },
        { id: documentId, name: "document" }
      );

      return {
        value: reservation.values[0].numeric,
        formatted: reservation.values[0].formatted,
        isCentralized: true,
        reservationId: reservation.reservationId,
        consecutiveId: consecutiveId,
      };
    } catch (error) {
      logger.error(
        `Error generando consecutivo centralizado: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * NUEVO: Confirma reserva de consecutivo centralizado
   * @param {string} consecutiveId - ID del consecutivo
   * @param {Object} consecutiveData - Datos del consecutivo
   */
  async commitConsecutiveReservation(consecutiveId, consecutiveData) {
    try {
      await ConsecutiveService.commitReservation(
        consecutiveId,
        consecutiveData.reservationId,
        [
          {
            numeric: consecutiveData.value,
            formatted: consecutiveData.formatted,
          },
        ]
      );
    } catch (error) {
      logger.error(
        `Error confirmando reserva de consecutivo: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * NUEVO: Cancela reserva de consecutivo centralizado
   * @param {string} consecutiveId - ID del consecutivo
   * @param {Object} consecutiveData - Datos del consecutivo
   */
  async cancelConsecutiveReservation(consecutiveId, consecutiveData) {
    try {
      await ConsecutiveService.cancelReservation(
        consecutiveId,
        consecutiveData.reservationId
      );
    } catch (error) {
      logger.error(`Error cancelando reserva de consecutivo: ${error.message}`);
      // No lanzar error aquí para no afectar el flujo principal
    }
  }

  /**
   * NUEVO: Obtiene el siguiente valor de consecutivo (para API)
   * @param {string} mappingId - ID del mapping
   * @param {string} segment - Segmento (opcional)
   * @returns {Promise<string>} - Siguiente valor del consecutivo
   */
  async getNextConsecutiveValue(mappingId, segment = null) {
    try {
      const mapping = await TransferMapping.findById(mappingId);
      if (!mapping) {
        throw new Error(`Mapping ${mappingId} no encontrado`);
      }

      if (!mapping.consecutiveConfig || !mapping.consecutiveConfig.enabled) {
        throw new Error(
          "Esta configuración no tiene habilitada la numeración consecutiva"
        );
      }

      const consecutiveSystem = await this.determineConsecutiveSystem(mapping);

      if (consecutiveSystem.type === "centralized") {
        // Obtener siguiente valor del sistema centralizado
        const result = await ConsecutiveService.getNextConsecutiveValue(
          consecutiveSystem.centralizedId,
          { segment: segment || null }
        );
        return result.data.value;
      } else if (consecutiveSystem.type === "local") {
        // Formatear siguiente valor del sistema local
        const nextValue = (mapping.consecutiveConfig.lastValue || 0) + 1;
        return this.formatConsecutiveValue(
          nextValue,
          mapping.consecutiveConfig
        );
      } else {
        throw new Error("No hay sistema de consecutivos configurado");
      }
    } catch (error) {
      logger.error(`Error obteniendo siguiente consecutivo: ${error.message}`);
      throw error;
    }
  }

  /**
   * NUEVO: Formatea un valor de consecutivo local
   * @param {number} value - Valor numérico
   * @param {Object} config - Configuración del consecutivo
   * @returns {string} - Valor formateado
   */
  formatConsecutiveValue(value, config) {
    let formattedValue = String(value);

    if (config.pattern) {
      formattedValue = this.formatConsecutive(config.pattern, {
        PREFIX: config.prefix || "",
        VALUE: value,
        YEAR: new Date().getFullYear(),
        MONTH: String(new Date().getMonth() + 1).padStart(2, "0"),
        DAY: String(new Date().getDate()).padStart(2, "0"),
      });
    } else if (config.prefix) {
      formattedValue = `${config.prefix}${value}`;
    }

    return formattedValue;
  }

  /**
   * Procesa un único documento según la configuración
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
        `🔄 Procesando documento ${documentId} (modo: sin transacciones)`
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
            continue; // Pasar a la siguiente tabla principal
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
          sourceData,
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
      // Construir consulta estándar
      const fields = this.getRequiredFields(tableConfig);
      const primaryKey = tableConfig.primaryKey || "NUM_PED";

      const query = `
        SELECT ${fields.join(", ")} FROM ${tableConfig.sourceTable}
        WHERE ${primaryKey} = @documentId
        ${
          tableConfig.filterCondition
            ? ` AND ${tableConfig.filterCondition}`
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
   * Obtiene los campos requeridos para una tabla
   * @private
   */
  getRequiredFields(tableConfig) {
    const fields = new Set();

    // Agregar campos de mapeos
    if (tableConfig.fieldMappings) {
      for (const mapping of tableConfig.fieldMappings) {
        if (mapping.sourceField) {
          fields.add(mapping.sourceField);
        }
      }
    }

    // Agregar clave primaria
    fields.add(tableConfig.primaryKey || "NUM_PED");

    return Array.from(fields);
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

      // Verificar si hay soporte para promociones
      if (mapping.promotionConfig && mapping.promotionConfig.enabled) {
        // Procesar líneas con soporte para promociones
        const processedLines = PromotionProcessor.processLines(
          detailsData,
          mapping.promotionConfig
        );

        for (const detailRow of processedLines) {
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
      } else {
        // Procesamiento normal sin promociones
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
   * Obtiene datos de detalle de la misma tabla que el encabezado
   * @private
   */
  async getDetailDataFromSameTable(
    detailConfig,
    parentTableConfig,
    documentId,
    sourceConnection
  ) {
    const fields = this.getRequiredFields(detailConfig);
    const primaryKey =
      detailConfig.primaryKey || parentTableConfig.primaryKey || "NUM_PED";
    const orderByColumn = detailConfig.orderByColumn || "";

    const query = `
      SELECT ${fields.join(", ")} FROM ${parentTableConfig.sourceTable}
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
   * Obtiene datos de detalle de su propia tabla
   * @private
   */
  async getDetailDataFromOwnTable(detailConfig, documentId, sourceConnection) {
    const fields = this.getRequiredFields(detailConfig);
    const primaryKey = detailConfig.primaryKey || "NUM_PED";
    const orderByColumn = detailConfig.orderByColumn || "";

    const query = `
      SELECT ${fields.join(", ")} FROM ${detailConfig.sourceTable}
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
   * Procesa una tabla (principal o detalle)
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

    // Verificar si necesita lookup
    if (this.hasLookupFields(tableConfig)) {
      const lookupResults = await this.executeLookupInTarget(
        tableConfig,
        dataForProcessing,
        targetConnection
      );

      if (!lookupResults.success) {
        throw new Error(
          `Error en lookup para tabla ${tableConfig.name}: ${lookupResults.error}`
        );
      }

      // Agregar resultados del lookup a los datos
      Object.assign(dataForProcessing, lookupResults.data);
    }

    // Procesar cada campo
    for (const fieldMapping of tableConfig.fieldMappings) {
      const processedField = await this.processField(
        fieldMapping,
        dataForProcessing,
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

    // Ejecutar la inserción
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
   * Procesa un campo individual
   * @private
   */
  async processField(
    fieldMapping,
    sourceData,
    currentConsecutive,
    mapping,
    tableConfig,
    isDetailTable,
    targetConnection,
    columnLengthCache
  ) {
    let value;

    // PRIORIDAD 1: Verificar si el campo es una función SQL nativa
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

    // PRIORIDAD 2: Aplicar consecutivo si corresponde
    if (
      currentConsecutive &&
      this.shouldFieldReceiveConsecutive(
        fieldMapping,
        mapping.consecutiveConfig,
        tableConfig,
        isDetailTable
      )
    ) {
      value = currentConsecutive.formatted;
      logger.debug(
        `Asignando consecutivo ${currentConsecutive.formatted} a campo ${fieldMapping.targetField} en tabla ${tableConfig.name}`
      );
      return { value, isDirectSql: false };
    }

    // PRIORIDAD 3: Obtener valor del origen
    if (fieldMapping.sourceField) {
      value = sourceData[fieldMapping.sourceField];
      logger.debug(`Valor original de ${fieldMapping.sourceField}: ${value}`);

      // Aplicar eliminación de prefijo si está configurado
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
    }

    // PRIORIDAD 4: Aplicar mapeo de valores si existe
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

    // PRIORIDAD 5: Usar valor por defecto si no hay valor
    if (value === undefined || value === null) {
      value =
        defaultValue === "NULL" || defaultValue === null
          ? null
          : fieldMapping.defaultValue;
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
   * Obtiene el nombre del campo clave en la tabla destino
   * @private
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
    const lookupResults = {};
    const failedLookups = [];

    try {
      logger.info(
        `Ejecutando lookup en destino para tabla ${tableConfig.name}...`
      );

      // Obtener solo los campos que requieren lookup
      const lookupFields = tableConfig.fieldMappings.filter(
        (fm) => fm.lookupFromTarget && fm.lookupQuery
      );

      if (lookupFields.length === 0) {
        logger.debug("No hay campos de lookup configurados");
        return { success: true, data: {} };
      }

      for (const fieldMapping of lookupFields) {
        try {
          const query = fieldMapping.lookupQuery;
          const params = {};

          // Extraer parámetros de los datos de origen
          if (fieldMapping.lookupParams) {
            for (const param of fieldMapping.lookupParams) {
              params[param.paramName] = sourceData[param.sourceField];
            }
          }

          logger.debug(
            `Ejecutando lookup para ${fieldMapping.targetField}: ${query}`
          );
          const result = await SqlService.query(
            targetConnection,
            query,
            params
          );

          if (result.recordset && result.recordset.length > 0) {
            const value = Object.values(result.recordset[0])[0];
            lookupResults[fieldMapping.targetField] = value;
            logger.debug(
              `Lookup exitoso para ${fieldMapping.targetField}: ${value}`
            );
          } else {
            if (fieldMapping.failIfNotFound) {
              throw new Error(
                `No se encontraron resultados para el campo ${fieldMapping.targetField}`
              );
            } else {
              lookupResults[fieldMapping.targetField] = null;
              logger.debug(
                `No se encontraron resultados para lookup de ${fieldMapping.targetField}, usando NULL`
              );
            }
          }
        } catch (fieldError) {
          logger.error(
            `Error en lookup para campo ${fieldMapping.targetField}: ${fieldError.message}`
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

      if (failedLookups.length > 0) {
        return {
          success: false,
          error: `Fallos en lookup: ${failedLookups
            .map((f) => `${f.field}: ${f.error}`)
            .join(", ")}`,
        };
      }

      return { success: true, data: lookupResults };
    } catch (error) {
      logger.error(`Error general en lookup: ${error.message}`);
      return { success: false, error: error.message };
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
   * MEJORADO: Genera un consecutivo local
   * @private
   */
  async generateLocalConsecutive(mapping) {
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
        `Consecutivo local reservado: ${newValue} para mapeo ${mapping._id}`
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
        isCentralized: false,
      };
    } catch (error) {
      logger.error(`Error al generar consecutivo local: ${error.message}`);
      throw error;
    }
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
      } documento(s) como procesado(s) usando estrategia: ${
        mapping.markProcessedStrategy || "individual"
      }`
    );

    if (!mapping.markProcessedField || docArray.length === 0) {
      return {
        success: 0,
        failed: 0,
        strategy: "none",
        message: "No hay campo de marcado configurado",
      };
    }

    const strategy = mapping.markProcessedStrategy || "individual";

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

  /**
   * Obtiene documentos según los filtros especificados
   * @param {Object} mapping - Configuración de mapeo
   * @param {Object} filters - Filtros para la consulta
   * @param {Object} connection - Conexión a la base de datos
   * @returns {Promise<Array>} - Documentos encontrados
   */
  async getDocuments(mapping, filters, connection) {
    try {
      // Determinar tabla principal
      const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
      if (!mainTable) {
        throw new Error("No se encontró configuración de tabla principal");
      }

      logger.info(
        `Obteniendo documentos de ${mainTable.sourceTable} en ${mapping.sourceServer}`
      );

      // Construir consulta basada en filtros
      let query = `
        SELECT * FROM ${mainTable.sourceTable}
        WHERE 1=1
      `;

      const params = {};

      // Aplicar filtros
      if (filters.dateFrom) {
        query += ` AND ${filters.dateField || "FEC_PED"} >= @dateFrom`;
        params.dateFrom = new Date(filters.dateFrom);
      }

      if (filters.dateTo) {
        query += ` AND ${filters.dateField || "FEC_PED"} <= @dateTo`;
        params.dateTo = new Date(filters.dateTo);
      }

      if (filters.status && filters.status !== "all") {
        query += ` AND ${filters.statusField || "ESTADO"} = @status`;
        params.status = filters.status;
      }

      if (filters.warehouse && filters.warehouse !== "all") {
        query += ` AND ${filters.warehouseField || "COD_BOD"} = @warehouse`;
        params.warehouse = filters.warehouse;
      }

      // Filtrar documentos procesados
      if (!filters.showProcessed && mapping.markProcessedField) {
        query += ` AND (${mapping.markProcessedField} IS NULL OR ${mapping.markProcessedField} = 0)`;
      }

      // Aplicar condición adicional si existe
      if (mainTable.filterCondition) {
        query += ` AND ${mainTable.filterCondition}`;
      }

      // Ordenar por fecha descendente
      query += ` ORDER BY ${filters.dateField || "FEC_PED"} DESC`;

      logger.debug(`Consulta final: ${query}`);
      logger.debug(`Parámetros: ${JSON.stringify(params)}`);

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
   * Obtiene datos de detalle con soporte para promociones
   * @param {string} documentId - ID del documento
   * @param {Object} detailConfig - Configuración de la tabla de detalle
   * @param {Object} connection - Conexión a la base de datos
   * @param {Object} mapping - Configuración de mapeo
   * @returns {Promise<Array>} - Datos de detalle procesados
   */
  async getDetailDataWithPromotions(
    documentId,
    detailConfig,
    connection,
    mapping
  ) {
    try {
      // Obtener datos de detalle normal
      const detailData = await this.getDetailDataFromOwnTable(
        detailConfig,
        documentId,
        connection
      );

      if (!detailData || detailData.length === 0) {
        return [];
      }

      // Si no hay configuración de promociones, retornar datos normales
      if (!mapping.promotionConfig || !mapping.promotionConfig.enabled) {
        return detailData;
      }

      // Procesar líneas con promociones
      logger.info(
        `Procesando ${detailData.length} líneas con soporte para promociones`
      );

      const processedLines = PromotionProcessor.processLines(
        detailData,
        mapping.promotionConfig
      );

      logger.info(
        `Procesamiento de promociones completado: ${processedLines.length} líneas resultantes`
      );

      return processedLines;
    } catch (error) {
      logger.error(
        `Error al obtener datos de detalle con promociones: ${error.message}`
      );
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
}

module.exports = new DynamicTransferService();
