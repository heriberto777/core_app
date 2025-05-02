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
   * Verifica si un documento puede ser procesado
   * @param {string} documentId - ID del documento
   * @param {Object} mapping - Configuración de mapeo
   * @param {Object} sourceConnection - Conexión a servidor origen
   * @param {Object} targetConnection - Conexión a servidor destino
   * @returns {Promise<Object>} - Resultado de la verificación {valid, reason, documentType, data}
   */
  async verifyDocument(
    documentId,
    mapping,
    sourceConnection,
    targetConnection
  ) {
    try {
      // 1. Identificar las tablas principales (no de detalle)
      const mainTables = mapping.tableConfigs.filter((tc) => !tc.isDetailTable);

      if (mainTables.length === 0) {
        return {
          valid: false,
          reason: "No se encontraron configuraciones de tablas principales",
          documentType: "unknown",
        };
      }

      // 2. Verificar cada tabla principal
      let documentType = "unknown";
      let validData = null;

      for (const tableConfig of mainTables) {
        // Obtener datos de la tabla de origen
        let sourceData;

        if (tableConfig.customQuery) {
          // Usar consulta personalizada si existe
          const query = tableConfig.customQuery.replace(
            /@documentId/g,
            documentId
          );
          const result = await SqlService.query(sourceConnection, query);
          sourceData = result.recordset[0];
        } else {
          // Consulta básica
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
          return {
            valid: false,
            reason: `No se encontraron datos en ${tableConfig.sourceTable} para documento ${documentId}`,
            documentType,
          };
        }

        // Determinar el tipo de documento basado en las reglas
        for (const rule of mapping.documentTypeRules) {
          const fieldValue = sourceData[rule.sourceField];

          if (rule.sourceValues.includes(fieldValue)) {
            documentType = rule.name;
            break;
          }
        }

        // Determinar clave en destino
        const targetPrimaryKey = this.getTargetPrimaryKeyField(tableConfig);

        // Verificar si ya existe en destino
        const checkQuery = `
        SELECT TOP 1 1 FROM ${tableConfig.targetTable}
        WHERE ${targetPrimaryKey} = @documentId
      `;

        const checkResult = await SqlService.query(
          targetConnection,
          checkQuery,
          { documentId }
        );

        if (checkResult.recordset?.length > 0) {
          return {
            valid: false,
            reason: `El documento ya existe en la tabla ${tableConfig.targetTable}`,
            documentType,
          };
        }

        // Si llegamos aquí, el documento es válido para esta tabla
        validData = sourceData;
      }

      // Si llegamos aquí, el documento es válido para todas las tablas
      return {
        valid: true,
        documentType,
        data: validData,
      };
    } catch (error) {
      return {
        valid: false,
        reason: `Error al verificar documento: ${error.message}`,
        error,
      };
    }
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

    // Inicializar el valor consecutivo más alto
    let highestConsecutiveValue = 0;

    // Variable para almacenar la referencia al consecutivo centralizado
    let centralizedConsecutiveId = null;
    let useCentralizedConsecutives = false;

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
              `Usando sistema centralizado de consecutivos para mapeo ${mappingId}. ID: ${centralizedConsecutiveId}`
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

      // 7. FASE 1: VERIFICACIÓN - Verificar qué documentos son válidos para insertar
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

      logger.info(
        `Iniciando fase de verificación para ${documentIds.length} documentos`
      );

      // Para cada documento, verificar si ya existe o si puede ser procesado
      for (let i = 0; i < documentIds.length; i++) {
        if (signal.aborted) {
          clearTimeout(timeoutId);
          throw new Error("Tarea cancelada por el usuario");
        }

        const documentId = documentIds[i];

        try {
          // Verificar si el documento puede ser procesado (existe en origen y no en destino)
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
            logger.info(`Documento ${documentId} válido para procesamiento`);
          } else {
            invalidDocuments.push({
              id: documentId,
              reason: canProcess.reason,
              type: canProcess.documentType || "unknown",
            });

            // Registrar el fallo
            results.failed++;
            if (!results.byType[canProcess.documentType]) {
              results.byType[canProcess.documentType] = {
                processed: 0,
                failed: 0,
              };
            }
            results.byType[canProcess.documentType].failed++;

            results.details.push({
              documentId,
              success: false,
              message: canProcess.reason,
              documentType: canProcess.documentType || "unknown",
            });

            logger.warn(
              `Documento ${documentId} no válido: ${canProcess.reason}`
            );
          }
        } catch (verifyError) {
          invalidDocuments.push({
            id: documentId,
            reason: verifyError.message,
            type: "unknown",
          });

          results.failed++;
          results.details.push({
            documentId,
            success: false,
            error: verifyError.message,
            errorDetails: verifyError.stack,
          });

          logger.error(
            `Error verificando documento ${documentId}: ${verifyError.message}`
          );
        }
      }

      logger.info(
        `Fase de verificación completada: ${validDocuments.length} documentos válidos, ${invalidDocuments.length} inválidos`
      );

      // 8. FASE 2: GENERACIÓN DE CONSECUTIVOS - Solo si hay documentos válidos y se necesitan consecutivos
      if (
        validDocuments.length > 0 &&
        mapping.consecutiveConfig &&
        mapping.consecutiveConfig.enabled
      ) {
        logger.info(
          `Generando consecutivos para ${validDocuments.length} documentos válidos`
        );

        if (useCentralizedConsecutives) {
          // Para sistema centralizado, generar todos los consecutivos necesarios
          for (let i = 0; i < validDocuments.length; i++) {
            const docInfo = validDocuments[i];
            try {
              // Código para generar consecutivo centralizado
              let segmentValue = null;
              const consecutive = await ConsecutiveService.getConsecutiveById(
                centralizedConsecutiveId
              );

              if (consecutive.segments && consecutive.segments.enabled) {
                if (consecutive.segments.type === "year") {
                  segmentValue = new Date().getFullYear().toString();
                } else if (consecutive.segments.type === "month") {
                  const date = new Date();
                  segmentValue = `${date.getFullYear()}${(date.getMonth() + 1)
                    .toString()
                    .padStart(2, "0")}`;
                }
              }

              // Obtener el siguiente valor
              const result = await ConsecutiveService.getNextConsecutiveValue(
                centralizedConsecutiveId,
                { segment: segmentValue }
              );

              if (result && result.data && result.data.value) {
                // Agregar el consecutivo a la información del documento
                docInfo.consecutive = {
                  value:
                    parseInt(result.data.value.replace(/\D/g, ""), 10) || 0,
                  formatted: result.data.value,
                  isCentralized: true,
                };

                logger.info(
                  `Asignado consecutivo centralizado ${docInfo.consecutive.formatted} a documento ${docInfo.id}`
                );
              }
            } catch (error) {
              logger.error(
                `Error al generar consecutivo centralizado para documento ${docInfo.id}: ${error.message}`
              );
              // No fallamos todo el proceso, sólo marcamos este documento como inválido
              docInfo.error = `Error al generar consecutivo: ${error.message}`;
            }
          }
        } else {
          // Para sistema local, calculamos el número de valores necesarios
          // y asignamos secuencialmente
          try {
            const initialValue = mapping.consecutiveConfig.lastValue || 0;
            const valuesToReserve = validDocuments.length;
            const finalValue = initialValue + valuesToReserve;

            // Asignar valores secuencialmente a cada documento ANTES de actualizar
            for (let i = 0; i < validDocuments.length; i++) {
              const docInfo = validDocuments[i];
              const consecValue = initialValue + i + 1;

              // Formatear
              let formattedValue = String(consecValue);
              if (mapping.consecutiveConfig.pattern) {
                formattedValue = this.formatConsecutive(
                  mapping.consecutiveConfig.pattern,
                  {
                    PREFIX: mapping.consecutiveConfig.prefix || "",
                    VALUE: consecValue,
                    YEAR: new Date().getFullYear(),
                    MONTH: String(new Date().getMonth() + 1).padStart(2, "0"),
                    DAY: String(new Date().getDate()).padStart(2, "0"),
                  }
                );
              } else if (mapping.consecutiveConfig.prefix) {
                formattedValue = `${mapping.consecutiveConfig.prefix}${consecValue}`;
              }

              // Asignar al documento
              docInfo.consecutive = {
                value: consecValue,
                formatted: formattedValue,
                isCentralized: false,
                skipUpdate: true, // Para que no se actualice en cada documento
              };

              logger.info(
                `Asignado consecutivo local ${formattedValue} a documento ${docInfo.id}`
              );
            }

            // Solo guardamos el último valor para actualizar al final
            highestConsecutiveValue = finalValue;
          } catch (error) {
            logger.error(
              `Error al asignar consecutivos locales: ${error.message}`
            );
            // Continuamos sin consecutivos
          }
        }
      }

      // 9. FASE 3: PROCESAMIENTO - Procesar documentos con consecutivos asignados
      logger.info(
        `Iniciando fase de procesamiento para ${validDocuments.length} documentos válidos`
      );

      for (let i = 0; i < validDocuments.length; i++) {
        if (signal.aborted) {
          clearTimeout(timeoutId);
          throw new Error("Tarea cancelada por el usuario");
        }

        const docInfo = validDocuments[i];

        try {
          // Si el documento tiene error, lo saltamos
          if (docInfo.error) {
            results.failed++;
            results.details.push({
              documentId: docInfo.id,
              success: false,
              error: docInfo.error,
              documentType: docInfo.type,
            });
            continue;
          }

          // Procesar el documento con el consecutivo ya asignado
          const docResult = useTransactions
            ? await this.processSingleDocument(
                docInfo.id,
                mapping,
                sourceConnection,
                targetConnection,
                docInfo.consecutive
              )
            : await this.processSingleDocumentSimple(
                docInfo.id,
                mapping,
                sourceConnection,
                targetConnection,
                docInfo.consecutive
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

            // Registrar el consecutivo
            if (docResult.consecutiveUsed) {
              results.consecutivesUsed.push({
                documentId: docInfo.id,
                consecutive: docResult.consecutiveUsed,
              });
            }

            // Marcar como procesado si está configurado
            if (mapping.markProcessedField) {
              await this.markAsProcessed(docInfo.id, mapping, sourceConnection);
            }
          } else {
            results.failed++;
            if (!results.byType[docResult.documentType]) {
              results.byType[docResult.documentType] = {
                processed: 0,
                failed: 0,
              };
            }
            results.byType[docResult.documentType].failed++;
          }

          results.details.push({
            documentId: docInfo.id,
            ...docResult,
          });

          logger.info(
            `Documento ${docInfo.id} procesado: ${
              docResult.success ? "Éxito" : "Error"
            }`
          );
        } catch (processError) {
          results.failed++;
          results.details.push({
            documentId: docInfo.id,
            success: false,
            error: processError.message,
            errorDetails: processError.stack,
            documentType: docInfo.type,
          });

          logger.error(
            `Error procesando documento ${docInfo.id}: ${processError.message}`
          );
        }
      }

      // 10. FASE 4: ACTUALIZACIÓN DEL CONSECUTIVO - Solo al final y una sola vez
      if (
        !useCentralizedConsecutives &&
        highestConsecutiveValue > 0 &&
        mapping.consecutiveConfig &&
        mapping.consecutiveConfig.enabled
      ) {
        try {
          await this.updateLastConsecutive(mappingId, highestConsecutiveValue);
          logger.info(
            `Consecutivo final actualizado a ${highestConsecutiveValue} para mapeo ${mappingId}`
          );
          results.lastConsecutiveValue = highestConsecutiveValue;
        } catch (updateError) {
          logger.error(
            `Error al actualizar último consecutivo: ${updateError.message}`
          );
        }
      }

      // 11. Actualizar registro de ejecución y tarea
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
          success: results.failed === 0, // Solo es éxito total si no hubo errores
          message:
            results.failed > 0
              ? `Procesamiento completado con errores: ${results.processed} éxitos, ${results.failed} fallos`
              : "Procesamiento completado con éxito",
          affectedRecords: results.processed,
          errorDetails:
            results.failed > 0
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
        success: true,
        executionId,
        status: finalStatus,
        ...results,
        lastConsecutiveValue:
          highestConsecutiveValue > 0 ? highestConsecutiveValue : undefined,
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
   * Procesa un único documento según la configuración
   * @param {string} documentId - ID del documento
   * @param {Object} mapping - Configuración de mapeo
   * @param {Object} sourceConnection - Conexión a servidor origen
   * @param {Object} targetConnection - Conexión a servidor destino
   * @param {Object} currentConsecutive - Consecutivo generado previamente (opcional)
   * @returns {Promise<Object>} - Resultado del procesamiento
   */
  async processSingleDocument(
    documentId,
    mapping,
    sourceConnection,
    targetConnection,
    currentConsecutive = null
  ) {
    // Iniciar transacción
    let transaction = null;
    let transactionStarted = false;

    try {
      // Iniciar una transacción en el servidor destino
      try {
        transaction = await SqlService.beginTransaction(targetConnection);
        transactionStarted = true;
        logger.info(
          `Transacción iniciada correctamente para documento ${documentId}`
        );
      } catch (transError) {
        logger.error(
          `Error al iniciar transacción para documento ${documentId}: ${transError.message}`
        );
        // Continuamos sin transacción en este caso
        transactionStarted = false;
      }

      // Crear un cache para las longitudes de columnas
      const columnLengthCache = new Map();

      // Generar consecutivo si no se proporcionó y está habilitado
      if (
        !currentConsecutive &&
        mapping.consecutiveConfig &&
        mapping.consecutiveConfig.enabled
      ) {
        try {
          // Generar un nuevo consecutivo
          const consecutiveResult = await this.generateConsecutive(mapping);
          if (consecutiveResult) {
            currentConsecutive = consecutiveResult;
            logger.info(
              `Consecutivo generado para documento ${documentId}: ${consecutiveResult.formatted}`
            );
          }
        } catch (consecError) {
          logger.error(`Error al generar consecutivo: ${consecError.message}`);
          throw consecError;
        }
      }

      // 1. Identificar las tablas principales (no de detalle)
      const mainTables = mapping.tableConfigs.filter((tc) => !tc.isDetailTable);

      if (mainTables.length === 0) {
        return {
          success: false,
          message: "No se encontraron configuraciones de tablas principales",
        };
      }

      // 2. Procesar cada tabla principal
      const processedTables = [];
      let documentType = "unknown";

      for (const tableConfig of mainTables) {
        // Obtener datos de la tabla de origen
        let sourceData;

        if (tableConfig.customQuery) {
          // Usar consulta personalizada si existe
          const query = tableConfig.customQuery.replace(
            /@documentId/g,
            documentId
          );
          const result = await SqlService.query(sourceConnection, query);
          sourceData = result.recordset[0];
        } else {
          // Construir consulta básica - Usar primaryKey para la tabla origen
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

        // 3. Determinar el tipo de documento basado en las reglas
        for (const rule of mapping.documentTypeRules) {
          const fieldValue = sourceData[rule.sourceField];

          if (rule.sourceValues.includes(fieldValue)) {
            documentType = rule.name;
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

        const checkResult = await SqlService.query(
          targetConnection,
          checkQuery,
          { documentId },
          transaction
        );
        const exists = checkResult.recordset?.length > 0;

        if (exists) {
          // Revertir la transacción si el documento ya existe
          if (transaction) {
            await SqlService.rollbackTransaction(transaction);
            logger.info(
              `Transacción revertida: documento ${documentId} ya existe`
            );
          }

          logger.warn(
            `Documento ${documentId} ya existe en tabla ${tableConfig.targetTable}`
          );
          return {
            success: false,
            message: `El documento ya existe en la tabla ${tableConfig.targetTable}`,
            documentType,
          };
        }

        // 5. Preparar datos para inserción en tabla principal
        const targetData = {};
        const targetFields = [];
        const targetValues = [];

        for (const fieldMapping of tableConfig.fieldMappings) {
          let value;

          if (fieldMapping.isSqlFunction) {
            // Valor es una función SQL
            value = fieldMapping.defaultValue;
            targetFields.push(fieldMapping.targetField);
            targetValues.push(value);
            continue;
          }

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
            value = fieldMapping.defaultValue;
          }

          // Si el valor es undefined/null pero hay un valor por defecto
          if (
            (value === undefined || value === null) &&
            fieldMapping.defaultValue !== undefined
          ) {
            value = fieldMapping.defaultValue;
          }

          // Aplicar consecutivo si corresponde a esta tabla y campo
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

        // 6. Insertar en tabla principal (usando la transacción)
        const insertQuery = `
      INSERT INTO ${tableConfig.targetTable} (${targetFields.join(", ")})
      VALUES (${targetValues.join(", ")})
    `;

        await SqlService.query(
          targetConnection,
          insertQuery,
          targetData,
          transaction
        );
        logger.info(
          `Insertado encabezado en ${tableConfig.name} con transacción`
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
            const result = await SqlService.query(sourceConnection, query);
            detailsData = result.recordset;
          } else {
            // Construir consulta básica
            // Usar el campo de ordenamiento si está configurado, o nada si no existe
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
              `No se encontraron detalles en ${detailConfig.sourceTable} para documento ${documentId}`
            );
            continue;
          }

          // Insertar detalles
          for (const detailRow of detailsData) {
            const detailTargetData = {};
            const detailFields = [];
            const detailValues = [];

            for (const fieldMapping of detailConfig.fieldMappings) {
              let value;

              if (fieldMapping.isSqlFunction) {
                // Valor es una función SQL
                value = fieldMapping.defaultValue;
                detailFields.push(fieldMapping.targetField);
                detailValues.push(value);
                continue;
              }

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
                  `Prefijo '${fieldMapping.removePrefix}' eliminado del campo ${fieldMapping.sourceField}: '${originalValue}' → '${value}'`
                );
              }

              if (
                (value === undefined || value === null) &&
                fieldMapping.defaultValue !== undefined
              ) {
                if (fieldMapping.defaultValue === "NULL") {
                  value = null; // Convertir la cadena "NULL" a null real
                } else {
                  value = fieldMapping.defaultValue;
                }
              }

              // IMPORTANTE: Aplicar consecutivo en detalles si corresponde
              // Esto es clave para mantener el mismo consecutivo en encabezado y detalle
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

            const insertDetailQuery = `
          INSERT INTO ${detailConfig.targetTable} (${detailFields.join(", ")})
          VALUES (${detailValues.join(", ")})
        `;

            // Insertar detalle usando la transacción
            await SqlService.query(
              targetConnection,
              insertDetailQuery,
              detailTargetData,
              transaction
            );
          }

          logger.info(
            `Insertados detalles en ${detailConfig.name} con transacción`
          );
          processedTables.push(detailConfig.name);
        }
      }

      if (processedTables.length === 0) {
        // Revertir la transacción si no se procesó ninguna tabla
        if (transaction) {
          await SqlService.rollbackTransaction(transaction);
          logger.info(
            `Transacción revertida: no se procesó ninguna tabla para documento ${documentId}`
          );
        }

        return {
          success: false,
          message: "No se procesó ninguna tabla para este documento",
          documentType,
        };
      }

      // NUEVO: Actualizar el último valor del consecutivo si se configuró así
      // Solo para sistema local, el centralizado se actualiza automáticamente
      if (
        currentConsecutive &&
        mapping.consecutiveConfig &&
        mapping.consecutiveConfig.enabled &&
        mapping.consecutiveConfig.updateAfterTransfer &&
        !currentConsecutive.isCentralized // Solo actualizar si es local
      ) {
        try {
          await this.updateLastConsecutive(
            mapping._id,
            currentConsecutive.value
          );
          logger.info(
            `Consecutivo actualizado a ${currentConsecutive.value} para mapeo ${mapping._id}`
          );
        } catch (updateError) {
          logger.warn(
            `Error al actualizar último consecutivo: ${updateError.message}`
          );
          // No fallamos la transacción por esto, solo lo registramos
        }
      }
      // Si todo fue exitoso, confirmar la transacción
      if (transactionStarted && transaction) {
        try {
          await SqlService.commitTransaction(transaction);
          logger.info(
            `Transacción confirmada exitosamente para documento ${documentId}`
          );
        } catch (commitError) {
          logger.error(
            `Error al confirmar transacción para documento ${documentId}: ${commitError.message}`
          );
          // Si no podemos confirmar, intentamos revertir
          try {
            await SqlService.rollbackTransaction(transaction);
            logger.info(
              `Transacción revertida después de error en commit para documento ${documentId}`
            );
          } catch (rollbackError) {
            logger.error(
              `Error tanto en commit como en rollback para documento ${documentId}`
            );
          }
          // Lanzar error original de commit
          throw commitError;
        }
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
      // Si ocurrió algún error, hacer rollback de la transacción
      if (transactionStarted && transaction) {
        try {
          await SqlService.rollbackTransaction(transaction);
          logger.info(
            `Transacción revertida para documento ${documentId} debido a error: ${error.message}`
          );
        } catch (rollbackError) {
          logger.error(
            `Error al revertir transacción: ${rollbackError.message}`
          );
        }
      }

      // Manejo de errores específicos
      if (
        error.name === "AggregateError" ||
        error.stack?.includes("AggregateError")
      ) {
        logger.error(
          `Error de conexión (AggregateError) para documento ${documentId}`,
          error
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
            errorDetails: "CONNECTION_ERROR",
            consecutiveUsed: null,
            consecutiveValue: null,
            errorCode: "CONNECTION_ERROR",
          };
        } catch (reconnectError) {
          logger.error(
            `Error al intentar reconexión: ${reconnectError.message}`
          );
          return {
            success: false,
            message: `Error grave de conexión: ${
              error.message || "Error en comunicación con la base de datos"
            }. Por favor, intente nuevamente más tarde.`,
            documentType: "unknown",
            errorDetails: error.stack || "No hay detalles adicionales",
            consecutiveUsed: null,
            consecutiveValue: null,
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
        errorCode: error.code || error.number || "UNKNOWN_ERROR",
        consecutiveUsed: null,
        consecutiveValue: null,
      };
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

      // Generar consecutivo si no se proporcionó y está habilitado
      if (
        !currentConsecutive &&
        mapping.consecutiveConfig &&
        mapping.consecutiveConfig.enabled
      ) {
        try {
          // Generar un nuevo consecutivo
          const consecutiveResult = await this.generateConsecutive(mapping);
          if (consecutiveResult) {
            currentConsecutive = consecutiveResult;
            logger.info(
              `Consecutivo generado para documento ${documentId}: ${consecutiveResult.formatted}`
            );
          }
        } catch (consecError) {
          logger.error(`Error al generar consecutivo: ${consecError.message}`);
          // No lanzamos el error para permitir que continúe sin consecutivo
        }
      }

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

        if (tableConfig.customQuery) {
          // Usar consulta personalizada si existe
          const query = tableConfig.customQuery.replace(
            /@documentId/g,
            documentId
          );
          const result = await SqlService.query(sourceConnection, query);
          sourceData = result.recordset[0];
        } else {
          // Construir consulta básica - Usar primaryKey para la tabla origen
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

        // 3. Determinar el tipo de documento basado en las reglas
        for (const rule of mapping.documentTypeRules) {
          const fieldValue = sourceData[rule.sourceField];

          if (rule.sourceValues.includes(fieldValue)) {
            documentType = rule.name;
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

        for (const fieldMapping of tableConfig.fieldMappings) {
          let value;

          if (fieldMapping.isSqlFunction) {
            // Valor es una función SQL
            value = fieldMapping.defaultValue;
            targetFields.push(fieldMapping.targetField);
            targetValues.push(value);
            continue;
          }

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
            if (fieldMapping.defaultValue === "NULL") {
              value = null; // Convertir la cadena "NULL" a null real
            } else {
              value = fieldMapping.defaultValue;
            }
          }

          // Si el valor es undefined/null pero hay un valor por defecto
          if (
            (value === undefined || value === null) &&
            fieldMapping.defaultValue !== undefined
          ) {
            //Validacion de los campos NULL
            if (fieldMapping.defaultValue === "NULL") {
              value = null; // Convertir la cadena "NULL" a null real
            } else {
              value = fieldMapping.defaultValue;
            }
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

        // 6. Insertar en tabla principal (sin transacción)
        const insertQuery = `
        INSERT INTO ${tableConfig.targetTable} (${targetFields.join(", ")})
        VALUES (${targetValues.join(", ")})
      `;

        await SqlService.query(targetConnection, insertQuery, targetData);
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
            const result = await SqlService.query(sourceConnection, query);
            detailsData = result.recordset;
          } else {
            // Construir consulta básica
            // Usar el campo de ordenamiento si está configurado, o nada si no existe
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
              `No se encontraron detalles en ${detailConfig.sourceTable} para documento ${documentId}`
            );
            continue;
          }

          // Insertar detalles - usar el mismo consecutivo que el encabezado
          for (const detailRow of detailsData) {
            const detailTargetData = {};
            const detailFields = [];
            const detailValues = [];

            for (const fieldMapping of detailConfig.fieldMappings) {
              let value;

              if (fieldMapping.isSqlFunction) {
                // Valor es una función SQL
                value = fieldMapping.defaultValue;
                detailFields.push(fieldMapping.targetField);
                detailValues.push(value);
                continue;
              }

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
                  `Prefijo '${fieldMapping.removePrefix}' eliminado del campo ${fieldMapping.sourceField}: '${originalValue}' → '${value}'`
                );
              }

              if (
                (value === undefined || value === null) &&
                fieldMapping.defaultValue !== undefined
              ) {
                value = fieldMapping.defaultValue;
              }

              // IMPORTANTE: Aplicar consecutivo en detalles si corresponde
              // Esto mantiene el mismo consecutivo para encabezado y detalles
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

            const insertDetailQuery = `
            INSERT INTO ${detailConfig.targetTable} (${detailFields.join(", ")})
            VALUES (${detailValues.join(", ")})
          `;

            // Insertar detalle sin transacción
            await SqlService.query(
              targetConnection,
              insertDetailQuery,
              detailTargetData
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

      // Actualizar el consecutivo si está configurado así
      // Solo para sistema local, el centralizado se actualiza automáticamente
      if (
        currentConsecutive &&
        mapping.consecutiveConfig &&
        mapping.consecutiveConfig.enabled &&
        mapping.consecutiveConfig.updateAfterTransfer &&
        !currentConsecutive.isCentralized // Solo actualizar si es local
      ) {
        try {
          await this.updateLastConsecutive(
            mapping._id,
            currentConsecutive.value
          );
          logger.info(
            `Consecutivo actualizado a ${currentConsecutive.value} para mapeo ${mapping._id}`
          );
        } catch (updateError) {
          logger.warn(
            `Error al actualizar último consecutivo: ${updateError.message}`
          );
          // No fallamos la transacción por esto, solo lo registramos
        }
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
      // Si ocurrió algún error, hacer rollback de la transacción
      if (transactionStarted && transaction) {
        try {
          await SqlService.rollbackTransaction(transaction);
          logger.info(
            `Transacción revertida para documento ${documentId} debido a error: ${error.message}`
          );
        } catch (rollbackError) {
          logger.error(
            `Error al revertir transacción: ${rollbackError.message}`
          );
        }
      }

      // Manejo de errores específicos
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

      // Implementación más segura usando findOneAndUpdate (operación atómica)
      const updatedMapping = await TransferMapping.findOneAndUpdate(
        { _id: mapping._id },
        { $inc: { "consecutiveConfig.lastValue": 1 } },
        { new: true }
      );

      if (!updatedMapping) {
        throw new Error(
          `No se pudo actualizar el consecutivo para mapeo ${mapping._id}`
        );
      }

      // Obtener el nuevo valor incrementado
      const newValue = updatedMapping.consecutiveConfig.lastValue;

      logger.info(
        `Consecutivo reservado: ${newValue} para mapeo ${mapping._id}`
      );

      // Formatear según el patrón si existe
      let formattedValue = String(newValue);

      if (updatedMapping.consecutiveConfig.pattern) {
        formattedValue = this.formatConsecutive(
          updatedMapping.consecutiveConfig.pattern,
          {
            PREFIX: updatedMapping.consecutiveConfig.prefix || "",
            VALUE: newValue,
            YEAR: new Date().getFullYear(),
            MONTH: String(new Date().getMonth() + 1).padStart(2, "0"),
            DAY: String(new Date().getDate()).padStart(2, "0"),
          }
        );
      } else if (updatedMapping.consecutiveConfig.prefix) {
        // Si no hay patrón pero sí prefijo
        formattedValue = `${updatedMapping.consecutiveConfig.prefix}${newValue}`;
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

  /**
   * Genera un consecutivo según la configuración
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
      };
    } catch (error) {
      logger.error(`Error al generar consecutivo: ${error.message}`);
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
