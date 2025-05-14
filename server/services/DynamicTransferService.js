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
          // Continuar con el sistema local si hay error al verificar el centralizado
        }
      }

      // 3. Registrar en TaskTracker para permitir cancelación
      const cancelTaskId = `dynamic_process_${mappingId}_${Date.now()}`;
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

      // 5. Establecer conexiones con mejor manejo de errores
      const sourceServerName = mapping.sourceServer;
      const targetServerName = mapping.targetServer;

      // Usar un patrón de retry más agresivo para conexiones
      const getConnection = async (serverName, retries = 3) => {
        for (let attempt = 0; attempt < retries; attempt++) {
          try {
            logger.info(
              `Intento ${
                attempt + 1
              }/${retries} para conectar a ${serverName}...`
            );

            const connectionResult =
              await ConnectionManager.enhancedRobustConnect(serverName);

            if (!connectionResult.success || !connectionResult.connection) {
              const error =
                connectionResult.error ||
                new Error(`Conexión inválida a ${serverName}`);
              logger.warn(`Intento ${attempt + 1} falló: ${error.message}`);

              if (attempt === retries - 1) {
                throw error; // Último intento, propagar error
              }

              // Esperar antes del siguiente intento (backoff exponencial)
              const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s...
              await new Promise((resolve) => setTimeout(resolve, delay));
              continue;
            }

            // Verificar que la conexión sea válida
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
              throw error; // Último intento, propagar error
            }

            // Esperar antes del siguiente intento
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }

        // No deberíamos llegar aquí, pero por si acaso
        throw new Error(
          `No se pudo establecer conexión a ${serverName} después de ${retries} intentos`
        );
      };

      // Establecer conexiones en paralelo para mayor eficiencia
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

      // 6. Configuración para usar o no transacciones
      const useTransactions = false; // Cambiamos a false para evitar problemas con transacciones

      // 7. Procesar documentos - AHORA CON GENERACIÓN INDIVIDUAL DE CONSECUTIVOS
      const results = {
        processed: 0,
        failed: 0,
        skipped: 0,
        byType: {},
        details: [],
        consecutivesUsed: [],
      };

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
          // GENERACIÓN INDIVIDUAL DE CONSECUTIVOS PARA CADA DOCUMENTO
          if (mapping.consecutiveConfig && mapping.consecutiveConfig.enabled) {
            if (useCentralizedConsecutives) {
              try {
                // Generar consecutivo individual para este documento
                const reservation =
                  await ConsecutiveService.reserveConsecutiveValues(
                    centralizedConsecutiveId,
                    1, // Solo un valor para este documento
                    { segment: null }, // Configurar según necesidad
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

                // Procesar documento con el consecutivo asignado
                const docResult = await this.processSingleDocumentSimple(
                  documentId,
                  mapping,
                  sourceConnection,
                  targetConnection,
                  currentConsecutive
                );

                // Si el procesamiento fue exitoso, confirmar la reserva
                if (docResult.success) {
                  await ConsecutiveService.commitReservation(
                    centralizedConsecutiveId,
                    reservation.reservationId,
                    reservation.values
                  );
                  logger.info(
                    `Reserva confirmada para documento ${documentId}: ${currentConsecutive.formatted}`
                  );
                } else {
                  // Si falló, cancelar la reserva
                  await ConsecutiveService.cancelReservation(
                    centralizedConsecutiveId,
                    reservation.reservationId
                  );
                  logger.info(
                    `Reserva cancelada para documento fallido ${documentId}: ${currentConsecutive.formatted}`
                  );
                }

                // Actualizar estadísticas
                if (docResult.success) {
                  results.processed++;
                  if (!results.byType[docResult.documentType]) {
                    results.byType[docResult.documentType] = {
                      processed: 0,
                      failed: 0,
                    };
                  }
                  results.byType[docResult.documentType].processed++;

                  // Registrar consecutivo si se utilizó
                  if (docResult.consecutiveUsed) {
                    results.consecutivesUsed.push({
                      documentId,
                      consecutive: docResult.consecutiveUsed,
                    });
                  }

                  // Marcar como procesado si está configurado
                  if (mapping.markProcessedField) {
                    await this.markAsProcessed(
                      documentId,
                      mapping,
                      sourceConnection
                    );
                  }
                } else {
                  hasErrors = true;
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
              } catch (consecError) {
                logger.error(
                  `Error generando consecutivo centralizado para documento ${documentId}: ${consecError.message}`
                );
                // Continuar con el siguiente documento
                results.failed++;
                results.details.push({
                  documentId,
                  success: false,
                  error: `Error generando consecutivo: ${consecError.message}`,
                  errorDetails: consecError.stack,
                });
              }
            } else {
              // Sistema local - Generar consecutivo individualmente
              try {
                currentConsecutive = await this.generateConsecutive(mapping);
                if (currentConsecutive) {
                  logger.info(
                    `Consecutivo local generado para documento ${documentId}: ${currentConsecutive.formatted}`
                  );
                }

                // Procesar documento con el consecutivo asignado
                const docResult = await this.processSingleDocumentSimple(
                  documentId,
                  mapping,
                  sourceConnection,
                  targetConnection,
                  currentConsecutive
                );

                // Actualizar estadísticas (mismo código que arriba)
                if (docResult.success) {
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

                  if (mapping.markProcessedField) {
                    await this.markAsProcessed(
                      documentId,
                      mapping,
                      sourceConnection
                    );
                  }
                } else {
                  hasErrors = true;
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
              } catch (consecError) {
                logger.error(
                  `Error generando consecutivo local para documento ${documentId}: ${consecError.message}`
                );
                // Continuar con el siguiente documento
                results.failed++;
                results.details.push({
                  documentId,
                  success: false,
                  error: `Error generando consecutivo: ${consecError.message}`,
                  errorDetails: consecError.stack,
                });
              }
            }
          } else {
            // Sin consecutivos configurados
            const docResult = await this.processSingleDocumentSimple(
              documentId,
              mapping,
              sourceConnection,
              targetConnection,
              null
            );

            // Actualizar estadísticas
            if (docResult.success) {
              results.processed++;
              if (!results.byType[docResult.documentType]) {
                results.byType[docResult.documentType] = {
                  processed: 0,
                  failed: 0,
                };
              }
              results.byType[docResult.documentType].processed++;

              if (mapping.markProcessedField) {
                await this.markAsProcessed(
                  documentId,
                  mapping,
                  sourceConnection
                );
              }
            } else {
              hasErrors = true;
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
          }
        } catch (docError) {
          // Verificar si fue cancelado
          if (signal?.aborted) {
            clearTimeout(timeoutId);
            throw new Error("Tarea cancelada por el usuario");
          }

          hasErrors = true;
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

      // Actualizar registro de ejecución y tarea
      const executionTime = Date.now() - startTime;

      // Determinar el estado correcto basado en los resultados
      let finalStatus = "completed";
      if (results.processed === 0 && results.failed > 0) {
        finalStatus = "failed"; // Si todos fallaron
      } else if (results.failed > 0) {
        finalStatus = "partial"; // Si algunos fallaron y otros tuvieron éxito
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
          success: !hasErrors, // Solo es éxito total si no hubo errores
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

      // Limpiar timeout ya que la operación terminó correctamente
      clearTimeout(timeoutId);

      TaskTracker.completeTask(cancelTaskId, finalStatus);

      return {
        success: true, // La operación en sí fue exitosa aunque algunos documentos fallaron
        executionId,
        status: finalStatus, // Añadimos el status para que el frontend pueda mostrarlo correctamente
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
            ConnectionManager.releaseConnection(sourceConnection).catch((e) =>
              logger.error(`Error al liberar conexión origen: ${e.message}`)
            )
          );
        }

        if (targetConnection) {
          releasePromises.push(
            ConnectionManager.releaseConnection(targetConnection).catch((e) =>
              logger.error(`Error al liberar conexión destino: ${e.message}`)
            )
          );
        }

        // Esperar a que ambas conexiones se liberen
        await Promise.allSettled(releasePromises);
        logger.info("Conexiones liberadas correctamente");
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
    let transactionStarted = false;
    let transaction = null;

    try {
      logger.info(
        `Procesando documento ${documentId} (modo sin transacciones)`
      );

      // Crear un cache para las longitudes de columnas
      const columnLengthCache = new Map();

      // Función auxiliar para procesar expresiones SQL y evitar problemas de sintaxis
      const processSqlExpression = (
        sqlExpression,
        sourceData,
        fieldName,
        isPreExecute = false
      ) => {
        if (!sqlExpression || typeof sqlExpression !== "string") {
          return { expression: sqlExpression, params: {}, hasErrors: false };
        }

        logger.debug(
          `Procesando expresión SQL para campo ${fieldName}: ${sqlExpression}`
        );

        const params = {};
        let hasErrors = false;
        let errorMessage = "";

        // Si no contiene referencias, devolver tal cual
        if (!sqlExpression.includes("@{")) {
          return { expression: sqlExpression, params, hasErrors, errorMessage };
        }

        try {
          // Reemplazar todas las referencias @{CAMPO} con sus valores
          const regex = /@\{([^}]+)\}/g;
          let matches = regex.exec(sqlExpression);
          let allMatches = [];

          // Recopilar todas las coincidencias primero
          while (matches !== null) {
            allMatches.push({
              fullMatch: matches[0],
              fieldName: matches[1],
            });
            matches = regex.exec(sqlExpression);
          }

          // Verificar si todos los campos referenciados existen
          for (const match of allMatches) {
            if (!(match.fieldName in sourceData)) {
              logger.warn(
                `Campo referenciado '${match.fieldName}' no existe en datos de origen para documento ${documentId}`
              );
              hasErrors = true;
              errorMessage = `Campo referenciado '${match.fieldName}' no existe en datos de origen`;
            }
          }

          // Reemplazar las referencias con valores
          let modifiedExpression = sqlExpression;

          for (const match of allMatches) {
            const fieldValue = sourceData[match.fieldName];
            let replacement;

            if (isPreExecute) {
              // Para pre-ejecución: convertir a parámetros SQL (@p_CAMPO)
              const paramName = `p_${match.fieldName}`;
              params[paramName] = fieldValue;
              replacement = `@${paramName}`;
            } else {
              // Para inserción directa: formatear valores según su tipo
              if (fieldValue === undefined || fieldValue === null) {
                replacement = "NULL";
              } else if (typeof fieldValue === "string") {
                // IMPORTANTE: Cuando reemplazamos en expresiones como CLIENTE = '@{COD_CLT}'
                // debemos quitar las comillas simples que ya rodean la referencia
                if (modifiedExpression.includes(`'${match.fullMatch}'`)) {
                  // Si la referencia ya está entre comillas en la expresión original,
                  // reemplazamos 'referencia' con el valor escapado pero sin comillas adicionales
                  modifiedExpression = modifiedExpression.replace(
                    `'${match.fullMatch}'`,
                    `'${fieldValue.replace(/'/g, "''")}'`
                  );
                  continue; // Saltamos a la siguiente iteración para evitar el reemplazo estándar
                } else {
                  // Caso normal - solo escapar las comillas en el valor
                  replacement = `'${fieldValue.replace(/'/g, "''")}'`;
                }
              } else if (typeof fieldValue === "number") {
                replacement = fieldValue.toString();
              } else if (typeof fieldValue === "boolean") {
                replacement = fieldValue ? "1" : "0";
              } else if (fieldValue instanceof Date) {
                replacement = `'${fieldValue.toISOString()}'`;
              } else {
                replacement = `'${String(fieldValue).replace(/'/g, "''")}'`;
              }
            }

            // Reemplazar solo la referencia exacta, no cuando está dentro de comillas
            if (modifiedExpression.includes(match.fullMatch)) {
              modifiedExpression = modifiedExpression.replace(
                new RegExp(
                  match.fullMatch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                  "g"
                ),
                replacement
              );
            }
          }

          // Validar sintaxis básica - paréntesis balanceados
          let parenthesesCount = 0;
          for (const char of modifiedExpression) {
            if (char === "(") parenthesesCount++;
            if (char === ")") parenthesesCount--;
            if (parenthesesCount < 0) {
              hasErrors = true;
              errorMessage = `Paréntesis desbalanceados: hay más paréntesis de cierre que de apertura`;
              break;
            }
          }

          if (parenthesesCount !== 0) {
            hasErrors = true;
            errorMessage = `Paréntesis desbalanceados: faltan ${parenthesesCount} paréntesis de cierre`;
          }

          // Validaciones adicionales específicas para detectar problemas comunes
          if (modifiedExpression.includes(",,")) {
            hasErrors = true;
            errorMessage = "Detectadas comas consecutivas";
          }

          if (modifiedExpression.includes("''")) {
            // Las comillas vacías son válidas en SQL para cadenas vacías
            logger.debug(
              `Cadena vacía ('') detectada en expresión SQL para campo ${fieldName}`
            );
          }

          // Verificación específica para el documento problemático PED1001
          if (documentId === "PED1001") {
            logger.info(
              `Validación adicional para documento problemático ${documentId}: ${modifiedExpression}`
            );

            // Buscar patrones específicos que causan problemas
            if (
              modifiedExpression.includes("CLIENTE = ''") ||
              modifiedExpression.includes("CLIENTE = ' '")
            ) {
              logger.warn(
                `Detectado valor vacío o espacio para CLIENTE en SQL de ${documentId}`
              );
              hasErrors = true;
              errorMessage = `Valor vacío o solo espacios para CLIENTE`;
            }
          }

          return {
            expression: modifiedExpression,
            params,
            hasErrors,
            errorMessage,
          };
        } catch (error) {
          logger.error(
            `Error procesando expresión SQL para campo ${fieldName}: ${error.message}`
          );
          return {
            expression: sqlExpression,
            params: {},
            hasErrors: true,
            errorMessage: `Error procesando expresión: ${error.message}`,
          };
        }
      };

      // Función para ejecutar una consulta SQL previa
      const executeSqlQuery = async (
        expression,
        params,
        connection,
        fieldName,
        server
      ) => {
        try {
          if (!connection || !connection.connected) {
            throw new Error(`Conexión no disponible para servidor ${server}`);
          }

          // Ejecutar la consulta
          const selectQuery = `SELECT ${expression} AS result`;
          logger.debug(
            `Ejecutando consulta previa para campo ${fieldName}: ${selectQuery}`
          );
          logger.debug(`Parámetros: ${JSON.stringify(params)}`);

          const result = await SqlService.query(
            connection,
            selectQuery,
            params
          );

          if (result.recordset && result.recordset.length > 0) {
            return {
              success: true,
              value: result.recordset[0].result,
              error: null,
            };
          } else {
            logger.warn(
              `No se obtuvieron resultados en consulta para campo ${fieldName}`
            );
            return {
              success: true,
              value: null,
              error: null,
            };
          }
        } catch (error) {
          logger.error(
            `Error ejecutando consulta SQL para campo ${fieldName}: ${error.message}`
          );
          return {
            success: false,
            value: null,
            error: error,
          };
        }
      };

      // Función para procesar un campo configurado como función SQL
      const processSqlFunction = async (
        fieldMapping,
        sourceData,
        connection,
        targetConnection
      ) => {
        if (!fieldMapping.isSqlFunction) return null;

        let sqlExpression = fieldMapping.defaultValue;
        logger.debug(
          `Procesando función SQL para campo ${fieldMapping.targetField}: ${sqlExpression}`
        );

        // Procesar la expresión SQL
        const processed = processSqlExpression(
          sqlExpression,
          sourceData,
          fieldMapping.targetField,
          fieldMapping.sqlFunctionPreExecute
        );

        // Si hay errores de sintaxis y son graves, lanzar excepción
        if (processed.hasErrors) {
          const errorMsg = `Error en expresión SQL para campo ${fieldMapping.targetField}: ${processed.errorMessage}`;

          // Para algunos errores críticos, lanzar excepción
          if (processed.errorMessage.includes("Paréntesis desbalanceados")) {
            logger.error(errorMsg);
            throw new Error(errorMsg);
          }

          // Para otros errores, solo advertir
          logger.warn(errorMsg);
        }

        // Si se debe pre-ejecutar la consulta
        if (fieldMapping.sqlFunctionPreExecute) {
          // Determinar qué conexión usar
          const sqlConnection =
            fieldMapping.sqlFunctionServer === "source"
              ? connection
              : targetConnection;

          // Ejecutar la consulta y obtener el resultado
          const queryResult = await executeSqlQuery(
            processed.expression,
            processed.params,
            sqlConnection,
            fieldMapping.targetField,
            fieldMapping.sqlFunctionServer
          );

          if (!queryResult.success) {
            // Analizar el error para determinar si es crítico
            if (
              queryResult.error &&
              (queryResult.error.message.includes("Timeout") ||
                queryResult.error.message.includes("Connection"))
            ) {
              throw queryResult.error;
            }

            // Para otros errores, devolver null y continuar
            return null;
          }

          return queryResult.value;
        } else {
          // Para inserción directa, devolver la expresión procesada
          return processed.expression;
        }
      };

      // Función para procesar un campo normal (no SQL)
      const processNormalField = (fieldMapping, sourceData, prefix) => {
        let value;

        // Obtener valor del origen o usar valor por defecto
        if (fieldMapping.sourceField) {
          value = sourceData[fieldMapping.sourceField];

          // Aplicar eliminación de prefijo si está configurado
          if (
            fieldMapping.removePrefix &&
            typeof value === "string" &&
            value.startsWith(fieldMapping.removePrefix)
          ) {
            const originalValue = value;
            value = value.substring(fieldMapping.removePrefix.length);
            logger.debug(
              `Prefijo '${fieldMapping.removePrefix}' eliminado: '${originalValue}' → '${value}'`
            );
          }
        } else {
          // No hay campo origen, usar valor por defecto
          value =
            fieldMapping.defaultValue === "NULL"
              ? null
              : fieldMapping.defaultValue;
        }

        // Si el valor es undefined/null pero hay valor por defecto
        if (
          (value === undefined || value === null) &&
          fieldMapping.defaultValue !== undefined
        ) {
          value =
            fieldMapping.defaultValue === "NULL"
              ? null
              : fieldMapping.defaultValue;
        }

        return value;
      };

      // Función para aplicar consecutivo a un campo si corresponde
      const applyConsecutive = (
        fieldMapping,
        tableConfig,
        mapping,
        currentConsecutive,
        isDetailTable,
        detailConfig
      ) => {
        if (
          !currentConsecutive ||
          !mapping.consecutiveConfig ||
          !mapping.consecutiveConfig.enabled
        ) {
          return null;
        }

        // Para tabla principal
        if (!isDetailTable) {
          if (
            mapping.consecutiveConfig.fieldName === fieldMapping.targetField ||
            (mapping.consecutiveConfig.applyToTables &&
              mapping.consecutiveConfig.applyToTables.some(
                (t) =>
                  t.tableName === tableConfig.name &&
                  t.fieldName === fieldMapping.targetField
              ))
          ) {
            return currentConsecutive.formatted;
          }
        }
        // Para tabla de detalle
        else if (isDetailTable && detailConfig) {
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
            return currentConsecutive.formatted;
          }
        }

        return null;
      };

      // IMPLEMENTACIÓN PRINCIPAL DEL MÉTODO

      // 1. Identificar tablas principales
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
        // Obtener datos de origen
        let sourceData;
        try {
          if (tableConfig.customQuery) {
            const query = tableConfig.customQuery.replace(
              /@documentId/g,
              documentId
            );
            const result = await SqlService.query(sourceConnection, query);
            sourceData = result.recordset[0];
          } else {
            const query = `
            SELECT * FROM ${tableConfig.sourceTable} 
            WHERE ${tableConfig.primaryKey || "NUM_PED"} = @documentId
            ${
              tableConfig.filterCondition
                ? ` AND ${tableConfig.filterCondition}`
                : ""
            }
          `;

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
        } catch (error) {
          logger.error(
            `Error obteniendo datos de origen para ${documentId}: ${error.message}`
          );
          throw error;
        }

        // 3. Determinar tipo de documento
        for (const rule of mapping.documentTypeRules) {
          const fieldValue = sourceData[rule.sourceField];
          if (rule.sourceValues.includes(fieldValue)) {
            documentType = rule.name;
            break;
          }
        }

        // 4. Verificar si el documento ya existe en destino
        const targetPrimaryKey = this.getTargetPrimaryKeyField(tableConfig);
        try {
          const checkQuery = `
          SELECT TOP 1 1 FROM ${tableConfig.targetTable}
          WHERE ${targetPrimaryKey} = @documentId
        `;

          const checkResult = await SqlService.query(
            targetConnection,
            checkQuery,
            { documentId }
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
        } catch (error) {
          logger.error(
            `Error verificando existencia de documento ${documentId}: ${error.message}`
          );
          throw error;
        }

        // 5. Preparar datos para inserción en tabla principal
        const targetData = {};
        const targetFields = [];
        const targetValues = [];

        // Procesar cada campo
        for (const fieldMapping of tableConfig.fieldMappings) {
          let value;

          try {
            // Determinar el valor según el tipo de campo
            if (fieldMapping.isSqlFunction) {
              // Procesar función SQL
              value = await processSqlFunction(
                fieldMapping,
                sourceData,
                sourceConnection,
                targetConnection
              );
            } else {
              // Procesar campo normal
              value = processNormalField(fieldMapping, sourceData);

              // Aplicar consecutivo si corresponde
              const consecutiveValue = applyConsecutive(
                fieldMapping,
                tableConfig,
                mapping,
                currentConsecutive,
                false
              );

              if (consecutiveValue !== null) {
                value = consecutiveValue;
                logger.debug(
                  `Aplicado consecutivo ${consecutiveValue} a campo ${fieldMapping.targetField}`
                );
              }

              // Validar campos requeridos
              if (
                fieldMapping.isRequired &&
                (value === undefined || value === null)
              ) {
                throw new Error(
                  `Campo obligatorio '${fieldMapping.targetField}' sin valor ni default`
                );
              }

              // Aplicar mapeo de valores
              if (
                value !== null &&
                value !== undefined &&
                fieldMapping.valueMappings?.length > 0
              ) {
                const mapping = fieldMapping.valueMappings.find(
                  (vm) => vm.sourceValue === value
                );
                if (mapping) {
                  value = mapping.targetValue;
                }
              }

              // Verificar longitud para strings
              if (typeof value === "string") {
                const maxLength = await this.getColumnMaxLength(
                  targetConnection,
                  tableConfig.targetTable,
                  fieldMapping.targetField,
                  columnLengthCache
                );

                if (maxLength > 0 && value.length > maxLength) {
                  logger.warn(
                    `Truncando valor para ${fieldMapping.targetField} de ${value.length} a ${maxLength}`
                  );
                  value = value.substring(0, maxLength);
                }
              }
            }

            // Agregar a los datos de destino
            targetData[fieldMapping.targetField] = value;
            targetFields.push(fieldMapping.targetField);
            targetValues.push(`@${fieldMapping.targetField}`);
          } catch (fieldError) {
            logger.error(
              `Error procesando campo ${fieldMapping.targetField}: ${fieldError.message}`
            );
            throw fieldError;
          }
        }

        // 6. Insertar en tabla principal
        try {
          const insertQuery = `
          INSERT INTO ${tableConfig.targetTable} (${targetFields.join(", ")})
          VALUES (${targetValues.join(", ")})
        `;

          await SqlService.query(targetConnection, insertQuery, targetData);
          logger.info(
            `Insertado encabezado en ${tableConfig.name} sin transacción`
          );
          processedTables.push(tableConfig.name);
        } catch (insertError) {
          logger.error(
            `Error al insertar en tabla principal: ${insertError.message}`
          );
          throw insertError;
        }

        // 7. Procesar tablas de detalle relacionadas
        const detailTables = mapping.tableConfigs.filter(
          (tc) => tc.isDetailTable && tc.parentTableRef === tableConfig.name
        );

        for (const detailConfig of detailTables) {
          try {
            // Obtener detalles
            let detailsData;

            if (detailConfig.customQuery) {
              const query = detailConfig.customQuery.replace(
                /@documentId/g,
                documentId
              );
              const result = await SqlService.query(sourceConnection, query);
              detailsData = result.recordset;
            } else {
              const orderByColumn = detailConfig.orderByColumn || "";
              const query = `
              SELECT * FROM ${detailConfig.sourceTable} 
              WHERE ${detailConfig.primaryKey || "NUM_PED"} = @documentId
              ${
                detailConfig.filterCondition
                  ? ` AND ${detailConfig.filterCondition}`
                  : ""
              }
              ${orderByColumn ? ` ORDER BY ${orderByColumn}` : ""}
            `;

              const result = await SqlService.query(sourceConnection, query, {
                documentId,
              });
              detailsData = result.recordset;
            }

            if (!detailsData || detailsData.length === 0) {
              logger.warn(
                `No se encontraron detalles en ${detailConfig.sourceTable} para ${documentId}`
              );
              continue;
            }

            // Procesar cada fila de detalle
            for (const detailRow of detailsData) {
              const detailTargetData = {};
              const detailFields = [];
              const detailValues = [];

              // Procesar cada campo en la configuración de detalle
              for (const fieldMapping of detailConfig.fieldMappings) {
                let value;

                try {
                  // Determinar el valor según el tipo de campo
                  if (fieldMapping.isSqlFunction) {
                    // Procesar función SQL
                    value = await processSqlFunction(
                      fieldMapping,
                      detailRow,
                      sourceConnection,
                      targetConnection
                    );
                  } else {
                    // Procesar campo normal
                    value = processNormalField(fieldMapping, detailRow);

                    // Aplicar consecutivo si corresponde
                    const consecutiveValue = applyConsecutive(
                      fieldMapping,
                      tableConfig,
                      mapping,
                      currentConsecutive,
                      true,
                      detailConfig
                    );

                    if (consecutiveValue !== null) {
                      value = consecutiveValue;
                      logger.debug(
                        `Aplicado consecutivo ${consecutiveValue} a campo ${fieldMapping.targetField} en detalle`
                      );
                    }

                    // Validar campos requeridos
                    if (
                      fieldMapping.isRequired &&
                      (value === undefined || value === null)
                    ) {
                      throw new Error(
                        `Campo obligatorio '${fieldMapping.targetField}' sin valor ni default en detalle`
                      );
                    }

                    // Aplicar mapeo de valores
                    if (
                      value !== null &&
                      value !== undefined &&
                      fieldMapping.valueMappings?.length > 0
                    ) {
                      const mapping = fieldMapping.valueMappings.find(
                        (vm) => vm.sourceValue === value
                      );
                      if (mapping) {
                        value = mapping.targetValue;
                      }
                    }

                    // Verificar longitud para strings
                    if (typeof value === "string") {
                      const maxLength = await this.getColumnMaxLength(
                        targetConnection,
                        detailConfig.targetTable,
                        fieldMapping.targetField,
                        columnLengthCache
                      );

                      if (maxLength > 0 && value.length > maxLength) {
                        logger.warn(
                          `Truncando valor para ${fieldMapping.targetField} de ${value.length} a ${maxLength} en detalle`
                        );
                        value = value.substring(0, maxLength);
                      }
                    }
                  }

                  // Agregar a los datos de destino
                  detailTargetData[fieldMapping.targetField] = value;
                  detailFields.push(fieldMapping.targetField);
                  detailValues.push(`@${fieldMapping.targetField}`);
                } catch (fieldError) {
                  logger.error(
                    `Error procesando campo ${fieldMapping.targetField} en detalle: ${fieldError.message}`
                  );
                  throw fieldError;
                }
              }

              // Insertar fila de detalle
              try {
                const insertDetailQuery = `
                INSERT INTO ${detailConfig.targetTable} (${detailFields.join(
                  ", "
                )})
                VALUES (${detailValues.join(", ")})
              `;

                await SqlService.query(
                  targetConnection,
                  insertDetailQuery,
                  detailTargetData
                );
              } catch (detailInsertError) {
                logger.error(
                  `Error al insertar detalle: ${detailInsertError.message}`
                );
                throw detailInsertError;
              }
            }

            logger.info(
              `Insertados detalles en ${detailConfig.name} sin transacción`
            );
            processedTables.push(detailConfig.name);
          } catch (detailError) {
            logger.error(
              `Error procesando tabla de detalle ${detailConfig.name}: ${detailError.message}`
            );
            throw detailError;
          }
        }
      }

      // Verificar si se procesó alguna tabla
      if (processedTables.length === 0) {
        return {
          success: false,
          message: "No se procesó ninguna tabla para este documento",
          documentType,
          consecutiveUsed: null,
          consecutiveValue: null,
        };
      }

      // Retornar resultado exitoso
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
      // MANEJO DE ERRORES

      // Si hay transacción activa, hacer rollback
      if (transactionStarted && transaction) {
        try {
          await SqlService.rollbackTransaction(transaction);
          logger.info(
            `Transacción revertida para documento ${documentId}: ${error.message}`
          );
        } catch (rollbackError) {
          logger.error(
            `Error al revertir transacción: ${rollbackError.message}`
          );
        }
      }

      // Categorizar y manejar diferentes tipos de errores

      // 1. Errores de conexión
      if (
        error.name === "AggregateError" ||
        error.stack?.includes("AggregateError")
      ) {
        logger.error(`Error de conexión para documento ${documentId}`, {
          errorDetails: error.message,
        });

        try {
          // Intentar reconexión
          const targetServer = mapping.targetServer;
          const reconnectResult = await ConnectionManager.enhancedRobustConnect(
            targetServer
          );

          if (!reconnectResult.success) {
            throw new Error(
              `No se pudo restablecer conexión a ${targetServer}`
            );
          }

          return {
            success: false,
            message: `Error de conexión. Se ha restablecido la conexión pero debe reprocesarse el documento.`,
            documentType,
            errorCode: "CONNECTION_ERROR",
            consecutiveUsed: currentConsecutive?.formatted || null,
            consecutiveValue: currentConsecutive?.value || null,
          };
        } catch (reconnectError) {
          return {
            success: false,
            message: `Error grave de conexión: ${error.message}`,
            documentType,
            errorCode: "SEVERE_CONNECTION_ERROR",
            consecutiveUsed: currentConsecutive?.formatted || null,
            consecutiveValue: currentConsecutive?.value || null,
          };
        }
      }

      // 2. Error de truncado
      if (error.message?.includes("String or binary data would be truncated")) {
        const match = error.message.match(/column '([^']+)'/);
        const columnName = match ? match[1] : "desconocida";

        return {
          success: false,
          message: `Error de truncado: Valor demasiado largo para columna '${columnName}'`,
          documentType,
          errorCode: "TRUNCATION_ERROR",
          consecutiveUsed: null,
          consecutiveValue: null,
        };
      }

      // 3. Error de valor NULL
      if (error.message?.includes("Cannot insert the value NULL into column")) {
        const match = error.message.match(/column '([^']+)'/);
        const columnName = match ? match[1] : "desconocida";

        return {
          success: false,
          message: `No se puede insertar NULL en columna '${columnName}'`,
          documentType,
          errorCode: "NULL_VALUE_ERROR",
          consecutiveUsed: null,
          consecutiveValue: null,
        };
      }

      // 4. Error de sintaxis SQL
      if (
        error.message?.includes("Incorrect syntax") ||
        error.message?.includes("syntax error")
      ) {
        const nearMatch = error.message.match(/near '([^']+)'/);
        let detailedMessage = `Error de sintaxis SQL: ${error.message}`;

        if (nearMatch) {
          const problemPart = nearMatch[1];
          detailedMessage += `. Problema cerca de: '${problemPart}'`;
        }

        return {
          success: false,
          message: detailedMessage,
          documentType,
          errorCode: "SQL_SYNTAX_ERROR",
          consecutiveUsed: null,
          consecutiveValue: null,
        };
      }

      // 5. Errores de clave duplicada
      if (
        error.message?.includes("Violation of PRIMARY KEY") ||
        error.message?.includes("duplicate key")
      ) {
        const keyMatch = error.message.match(/'([^']+)'/);
        const keyName = keyMatch ? keyMatch[1] : "desconocida";

        return {
          success: false,
          message: `Error de clave duplicada en '${keyName}'`,
          documentType,
          errorCode: "DUPLICATE_KEY_ERROR",
          consecutiveUsed: null,
          consecutiveValue: null,
        };
      }

      // 6. Error genérico para cualquier otro caso
      logger.error(
        `Error procesando documento ${documentId}: ${error.message}`
      );

      return {
        success: false,
        message: `Error: ${error.message || "Error desconocido"}`,
        documentType,
        errorDetails: error.stack || "No hay detalles disponibles",
        errorCode: this.determineErrorCode(error),
        consecutiveUsed: null,
        consecutiveValue: null,
      };
    }
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
