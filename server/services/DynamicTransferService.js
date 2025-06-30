// services/DynamicTransferService.js
const logger = require("./logger");
const ConnectionService = require("./ConnectionCentralService");
const { SqlService } = require("./SqlService");
const TransferMapping = require("../models/transferMappingModel");
const TaskExecution = require("../models/taskExecutionModel");
const TaskTracker = require("./TaskTracker");
const TransferTask = require("../models/transferTaks");
const ConsecutiveService = require("./ConsecutiveService");
// 🟢 AGREGADO ÚNICAMENTE: Import del servicio de bonificaciones
const BonificationService = require("./BonificationService");

class DynamicTransferService {
  /**
   * 🔄 Procesa documentos según una configuración de mapeo
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

      // 🟢 AGREGADO ÚNICAMENTE: Validar configuración de bonificaciones
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

      // 2. Configurar consecutivos centralizados si están habilitados
      if (mapping.useCentralizedConsecutives) {
        useCentralizedConsecutives = true;
        centralizedConsecutiveId = mapping.centralizedConsecutiveId;
        logger.info(
          `📋 Usando consecutivos centralizados: ${centralizedConsecutiveId}`
        );
      }

      // 3. Obtener conexiones
      logger.info(`🔗 Estableciendo conexiones para mapeo: ${mapping.name}`);

      // if (mapping.transferType === "down") {
      //   sourceConnection = await ConnectionService.getConnection("server2");
      //   targetConnection = await ConnectionService.getConnection("server1");
      // } else {
      //   sourceConnection = await ConnectionService.getConnection("server1");
      //   targetConnection = await ConnectionService.getConnection("server2");
      // }
      if (mapping.transferType === "down") {
        try {
          sourceConnection = await ConnectionService.getConnection("server2");
          if (!sourceConnection) {
            throw new Error("No se pudo obtener conexión a server2");
          }
          logger.info("✅ Conexión a server2 establecida correctamente");
        } catch (connError) {
          logger.error(`❌ Error conectando a server2: ${connError.message}`);
          throw new Error(`Error de conexión a server2: ${connError.message}`);
        }

        try {
          targetConnection = await ConnectionService.getConnection("server1");
          if (!targetConnection) {
            throw new Error("No se pudo obtener conexión a server1");
          }
          logger.info("✅ Conexión a server1 establecida correctamente");
        } catch (connError) {
          logger.error(`❌ Error conectando a server1: ${connError.message}`);
          throw new Error(`Error de conexión a server1: ${connError.message}`);
        }
      } else {
        // Lógica similar para transferType "up"
        sourceConnection = await ConnectionService.getConnection("server1");
        targetConnection = await ConnectionService.getConnection("server2");
      }

      // 4. Crear registro de ejecución
      const execution = new TaskExecution({
        taskId: mapping.taskId,
        mappingId: mappingId,
        taskName: mapping.name || `Mapping ${mappingId}`, // ✅ CAMPO REQUERIDO AGREGADO
        startTime: new Date(),
        status: "running",
        documentIds: documentIds,
        processedDocuments: 0,
        totalDocuments: documentIds.length,
      });

      await execution.save();
      executionId = execution._id;

      logger.info(
        `📊 Ejecución iniciada: ${executionId}, Documentos a procesar: ${documentIds.length}`
      );

      // 5. 🟢 MODIFICADO ÚNICAMENTE: Obtener datos de origen con procesamiento especial
      let sourceData = await this.getSourceDataForDocuments(
        documentIds,
        mapping,
        sourceConnection
      );

      logger.info(
        `📥 Datos de origen obtenidos: ${sourceData.length} registros`
      );

      // 6. Verificar cancelación
      if (signal.aborted) {
        throw new Error("Operación cancelada por el usuario");
      }

      // ✅ VALIDACIÓN AGREGADA: Verificar que tableConfigs existe y es un array
      if (
        !mapping.tableConfigs ||
        !Array.isArray(mapping.tableConfigs) ||
        mapping.tableConfigs.length === 0
      ) {
        throw new Error(
          `La configuración de mapeo no tiene tablas configuradas. Mapping: ${mapping.name}`
        );
      }

      // 7. Procesar cada tabla configurada
      const results = [];
      let totalInserted = 0;
      let totalErrors = 0;

      for (const tableConfig of mapping.tableConfigs) {
        try {
          logger.info(
            `📋 Procesando tabla: ${tableConfig.name} (${tableConfig.sourceTable} -> ${tableConfig.targetTable})`
          );

          // Filtrar datos para esta tabla específica
          let tableData = sourceData;

          // 🟢 AGREGADO ÚNICAMENTE: Si es la tabla de bonificaciones, ya está procesada
          if (
            mapping.hasBonificationProcessing &&
            tableConfig.sourceTable === mapping.bonificationConfig.sourceTable
          ) {
            logger.info(
              `🎁 Usando datos procesados de bonificaciones para tabla ${tableConfig.name}`
            );
          }

          // Aplicar filtros adicionales si los hay
          if (tableConfig.filterCondition) {
            // Para simplicidad, mantenemos todos los datos
            // En una implementación más avanzada, podrías aplicar el filtro aquí
            logger.debug(
              `📝 Condición de filtro configurada: ${tableConfig.filterCondition}`
            );
          }

          // 8. Aplicar mapeo de campos
          const mappedData = this.applyFieldMapping(
            tableData,
            tableConfig.fieldMappings,
            targetConnection
          );

          if (mappedData.length === 0) {
            logger.warn(
              `⚠️ No hay datos para procesar en tabla ${tableConfig.name}`
            );
            continue;
          }

          // 9. Insertar datos en tabla destino
          const insertResult = await this.insertDataToTarget(
            mappedData,
            tableConfig,
            targetConnection,
            useCentralizedConsecutives,
            centralizedConsecutiveId
          );

          results.push({
            table: tableConfig.name,
            inserted: insertResult.inserted,
            errors: insertResult.errors,
          });

          totalInserted += insertResult.inserted;
          totalErrors += insertResult.errors;

          // Verificar cancelación entre tablas
          if (signal.aborted) {
            throw new Error("Operación cancelada por el usuario");
          }
        } catch (tableError) {
          logger.error(
            `❌ Error procesando tabla ${tableConfig.name}: ${tableError.message}`
          );
          totalErrors++;
          results.push({
            table: tableConfig.name,
            inserted: 0,
            errors: 1,
            error: tableError.message,
          });
        }
      }

      // 10. Marcar documentos como procesados
      if (mapping.markProcessedField && totalInserted > 0) {
        try {
          await this.markDocumentsAsProcessed(
            documentIds,
            mapping,
            sourceConnection,
            true
          );
          logger.info(
            `✅ Documentos marcados como procesados: ${documentIds.length}`
          );
        } catch (markError) {
          logger.error(
            `⚠️ Error marcando documentos como procesados: ${markError.message}`
          );
          // No detener la operación por este error
        }
      }

      // 11. Actualizar registro de ejecución
      const executionTime = Date.now() - startTime;
      await TaskExecution.findByIdAndUpdate(executionId, {
        endTime: new Date(),
        status:
          totalErrors === 0
            ? "completed"
            : totalInserted > 0
            ? "partial"
            : "failed",
        executionTime,
        totalRecords: documentIds.length,
        successfulRecords: totalInserted,
        failedRecords: totalErrors,
        details: results,
      });

      logger.info(
        `✅ Procesamiento completado: ${totalInserted} éxitos, ${totalErrors} errores`
      );

      return {
        processed: totalInserted,
        failed: totalErrors,
        results: results,
        executionTime,
      };
    } catch (error) {
      logger.error(`❌ Error en processDocuments: ${error.message}`);

      if (executionId) {
        await TaskExecution.findByIdAndUpdate(executionId, {
          status: "failed",
          executionTime: Date.now() - startTime,
          error: error.message,
        });
      }

      TaskTracker.completeTask(
        cancelTaskId || `dynamic_process_${mappingId}`,
        "failed"
      );
      throw error;
    } finally {
      clearTimeout(timeoutId);

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
   * 🟢 MODIFICADO ÚNICAMENTE: Obtener datos de origen para documentos específicos
   * @param {Array} documentIds - IDs de documentos
   * @param {Object} mapping - Configuración de mapeo
   * @param {Object} connection - Conexión a la base de datos
   * @returns {Promise<Array>} - Datos obtenidos
   */
  async getSourceDataForDocuments(documentIds, mapping, connection) {
    try {
      // ✅ VALIDACIONES INICIALES
      if (!Array.isArray(documentIds) || documentIds.length === 0) {
        logger.warn(
          "⚠️ No hay documentos para procesar en getSourceDataForDocuments"
        );
        return [];
      }

      if (!mapping) {
        throw new Error("Mapping es requerido");
      }

      if (!connection || connection.destroyed || connection.closed) {
        throw new Error(
          `La conexión a ${mapping.sourceServer} no está disponible`
        );
      }

      logger.info(`📥 Obteniendo datos para ${documentIds.length} documentos`);

      // ✅ VALIDAR que tableConfigs existe
      if (
        !mapping.tableConfigs ||
        !Array.isArray(mapping.tableConfigs) ||
        mapping.tableConfigs.length === 0
      ) {
        throw new Error(
          "La configuración de mapeo no tiene tablas configuradas"
        );
      }

      // ✅ VALIDAR DOCUMENTIDS
      if (!Array.isArray(documentIds) || documentIds.length === 0) {
        logger.warn("No hay documentos para procesar");
        return [];
      }

      // 🟢 AGREGADO ÚNICAMENTE: Si tiene bonificaciones, usar BonificationService
      if (mapping.hasBonificationProcessing && mapping.bonificationConfig) {
        return await BonificationService.processBonificationsUnified(
          documentIds,
          mapping,
          connection
        );
      }

      // ✅ CÓDIGO ORIGINAL MANTENIDO: Lógica normal sin bonificaciones
      let sourceTable = "FAC_ENC_PED";
      let orderField = "NUM_PED"; // ✅ Campo por defecto
      let lineField = "NUM_LN"; // ✅ Campo por defecto

      const mainTableConfig = mapping.tableConfigs.find(
        (tc) => !tc.isDetailTable
      );

      if (mainTableConfig) {
        sourceTable = mainTableConfig.sourceTable;
        orderField = mainTableConfig.primaryKey || "NUM_PED";
      }

      const placeholders = documentIds
        .map((_, index) => `@doc${index}`)
        .join(", ");
      const params = {};
      documentIds.forEach((id, index) => {
        params[`doc${index}`] = id;
      });

      // Consulta para obtener todos los datos relacionados
      let query = `
        SELECT *
        FROM ${sourceTable}
        WHERE ${orderField} IN (${placeholders})
      `;

      // Agregar condición adicional si existe
      if (mainTableConfig && mainTableConfig.filterCondition) {
        query += ` AND ${mainTableConfig.filterCondition}`;
      }

      // Agregar ordenamiento si existe
      if (mainTableConfig && mainTableConfig.orderByColumn) {
        query += ` ORDER BY ${mainTableConfig.orderByColumn}`;
      }

      logger.debug(`🔍 Ejecutando consulta de origen: ${query}`);

      const result = await SqlService.query(connection, query, params);
      return result.recordset || [];
    } catch (error) {
      logger.error(`❌ Error obteniendo datos de origen: ${error.message}`);
      throw error;
    }
  }

  /**
   * 🟢 AGREGADO ÚNICAMENTE: Método V2 para testing paralelo
   */
  async getSourceDataForDocumentsV2(documentIds, mapping, connection) {
    try {
      logger.info(
        `📥 [V2] Obteniendo datos para ${documentIds.length} documentos con BonificationService`
      );

      // ✅ Usar servicio unificado de bonificaciones
      const sourceData = await BonificationService.processBonificationsUnified(
        documentIds,
        mapping,
        connection
      );

      logger.info(
        `✅ [V2] Datos obtenidos y procesados: ${sourceData.length} registros`
      );
      return sourceData;
    } catch (error) {
      logger.error(
        `❌ [V2] Error al obtener datos de origen: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * 🟢 AGREGADO ÚNICAMENTE: Método de testing para bonificaciones
   */
  async testBonificationProcessing(mappingId, documentIds) {
    let sourceConnection;

    try {
      logger.info(
        `🧪 [TEST] Iniciando prueba de bonificaciones para mapping ${mappingId}`
      );

      // ✅ Cargar configuración
      const mapping = await TransferMapping.findById(mappingId);
      if (!mapping) {
        throw new Error(`Mapping ${mappingId} no encontrado`);
      }

      // ✅ Validar configuración de bonificaciones
      if (mapping.hasBonificationProcessing) {
        const validation = this.validateBonificationConfig(mapping);
        if (!validation.valid) {
          throw new Error(
            `Configuración inválida: ${validation.errors.join(", ")}`
          );
        }
      }

      // ✅ Obtener conexión
      if (mapping.transferType === "down") {
        sourceConnection = await ConnectionService.getConnection("server2");
      } else {
        sourceConnection = await ConnectionService.getConnection("server1");
      }

      // ✅ Procesar con método V2 (nuevo)
      logger.info(
        `🔄 [TEST] Procesando con método V2 (BonificationService)...`
      );
      const resultV2 = await this.getSourceDataForDocumentsV2(
        documentIds,
        mapping,
        sourceConnection
      );

      // ✅ Procesar con método original para comparar
      logger.info(
        `🔄 [TEST] Procesando con método original para comparación...`
      );
      const resultOriginal = await this.getSourceDataForDocuments(
        documentIds,
        mapping,
        sourceConnection
      );

      // ✅ Comparar resultados
      const comparison = {
        v2Records: resultV2.length,
        originalRecords: resultOriginal.length,
        difference: resultV2.length - resultOriginal.length,
        hasBonifications: mapping.hasBonificationProcessing,
        mappingName: mapping.name,
        testSuccess: true,
        timestamp: new Date().toISOString(),
        bonificationStats: BonificationService.getStats(),
      };

      logger.info(`📊 [TEST] Comparación completada:`, comparison);
      return comparison;
    } catch (error) {
      logger.error(`❌ [TEST] Error en prueba: ${error.message}`);
      throw error;
    } finally {
      if (sourceConnection) {
        try {
          await ConnectionService.releaseConnection(sourceConnection);
        } catch (e) {
          logger.error(`Error liberando conexión: ${e.message}`);
        }
      }
    }
  }

  /**
   * ✅ CÓDIGO ORIGINAL MANTENIDO: Inserta datos en la tabla destino
   */
  async insertDataToTarget(
    data,
    tableConfig,
    connection,
    useCentralizedConsecutives = false,
    centralizedConsecutiveId = null
  ) {
    let inserted = 0;
    let errors = 0;

    try {
      for (const record of data) {
        try {
          // Procesar funciones SQL nativas
          const processedRecord = {};
          for (const [key, value] of Object.entries(record)) {
            if (
              typeof value === "string" &&
              value.startsWith("__SQL_FUNCTION__")
            ) {
              processedRecord[key] = value.replace("__SQL_FUNCTION__", "");
            } else {
              processedRecord[key] = value;
            }
          }

          // Generar consecutivo centralizado si es necesario
          if (useCentralizedConsecutives && centralizedConsecutiveId) {
            const consecutive = await ConsecutiveService.getNextValue(
              centralizedConsecutiveId
            );
            processedRecord[tableConfig.targetPrimaryKey || "ID"] = consecutive;
          }

          // Construir query de inserción
          const fields = Object.keys(processedRecord);
          const values = fields.map((field) => {
            const value = processedRecord[field];
            if (
              typeof value === "string" &&
              (value.includes("GETDATE()") ||
                value.includes("NEWID()") ||
                value.includes("GETUTCDATE()"))
            ) {
              return value; // Función SQL nativa
            }
            return `@${field}`;
          });

          const query = `
            INSERT INTO ${tableConfig.targetTable} (${fields.join(", ")})
            VALUES (${values.join(", ")})
          `;

          // Preparar parámetros (excluir funciones SQL nativas)
          const params = {};
          fields.forEach((field) => {
            const value = processedRecord[field];
            if (
              !(
                typeof value === "string" &&
                (value.includes("GETDATE()") ||
                  value.includes("NEWID()") ||
                  value.includes("GETUTCDATE()"))
              )
            ) {
              params[field] = value;
            }
          });

          await SqlService.query(connection, query, params);
          inserted++;
        } catch (recordError) {
          logger.error(
            `Error insertando registro en ${tableConfig.targetTable}: ${recordError.message}`
          );
          errors++;
        }
      }

      logger.info(
        `📊 Inserción completada en ${tableConfig.targetTable}: ${inserted} éxitos, ${errors} errores`
      );

      return { inserted, errors };
    } catch (error) {
      logger.error(
        `❌ Error insertando datos en tabla ${tableConfig.targetTable}: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * 🟢 MEJORADO ÚNICAMENTE: Aplicar mapeo de campos (con soporte para bonificaciones)
   */
  applyFieldMapping(sourceData, fieldMappings, targetConnection) {
    try {
      // ✅ VALIDACIONES CRÍTICAS
      if (!Array.isArray(sourceData)) {
        logger.error("❌ sourceData no es un array:", typeof sourceData);
        throw new Error("sourceData debe ser un array");
      }

      if (!Array.isArray(fieldMappings)) {
        logger.error("❌ fieldMappings no es un array:", typeof fieldMappings);
        throw new Error("fieldMappings debe ser un array");
      }

      if (sourceData.length === 0) {
        logger.warn("⚠️ No hay datos de origen para mapear");
        return [];
      }

      if (fieldMappings.length === 0) {
        logger.warn("⚠️ No hay configuraciones de mapeo de campos");
        return sourceData; // Devolver datos originales si no hay mapeo
      }

      logger.debug(
        `🔄 Aplicando mapeo de campos: ${sourceData.length} registros, ${fieldMappings.length} mapeos`
      );

      const mappedData = [];

      for (const sourceRecord of sourceData) {
        const mappedRecord = {};

        // ✅ VALIDAR que sourceRecord sea un objeto
        if (!sourceRecord || typeof sourceRecord !== "object") {
          logger.warn(
            "⚠️ Registro de origen inválido, omitiendo:",
            sourceRecord
          );
          continue;
        }

        for (const fieldMapping of fieldMappings) {
          try {
            // ✅ VALIDAR fieldMapping
            if (!fieldMapping || typeof fieldMapping !== "object") {
              logger.warn(
                "⚠️ Mapeo de campo inválido, omitiendo:",
                fieldMapping
              );
              continue;
            }

            const {
              sourceField,
              targetField,
              defaultValue,
              transformFunction,
            } = fieldMapping;

            // ✅ VALIDAR targetField es requerido
            if (!targetField) {
              logger.warn("⚠️ targetField faltante en mapeo:", fieldMapping);
              continue;
            }

            let value = null;

            // 1. Obtener valor del campo origen
            if (sourceField && sourceRecord.hasOwnProperty(sourceField)) {
              value = sourceRecord[sourceField];
              logger.debug(
                `📥 Campo ${sourceField} → ${targetField}: ${value}`
              );
            } else if (sourceField) {
              logger.debug(
                `⚠️ Campo origen ${sourceField} no encontrado en registro`
              );
            }

            // 2. ✅ CAMPOS ESPECIALES - Manejar campos calculados (para bonificaciones)
            if (
              sourceRecord.CALCULATED_PEDIDO_LINEA &&
              targetField === "PEDIDO_LINEA"
            ) {
              value = sourceRecord.CALCULATED_PEDIDO_LINEA;
              logger.debug(`🎁 Usando campo calculado PEDIDO_LINEA: ${value}`);
            }

            if (
              sourceRecord.CALCULATED_PEDIDO_LINEA_BONIF !== undefined &&
              targetField === "PEDIDO_LINEA_BONIF"
            ) {
              value = sourceRecord.CALCULATED_PEDIDO_LINEA_BONIF;
              logger.debug(
                `🎁 Usando campo calculado PEDIDO_LINEA_BONIF: ${value}`
              );
            }

            // 3. ✅ APLICAR VALOR POR DEFECTO si es necesario
            if (value === null || value === undefined) {
              if (defaultValue !== undefined && defaultValue !== null) {
                // Verificar si es una función SQL nativa
                if (
                  typeof defaultValue === "string" &&
                  this.isSqlFunction(defaultValue)
                ) {
                  value = defaultValue; // Mantener la función SQL
                  logger.debug(
                    `🔧 Usando función SQL para ${targetField}: ${defaultValue}`
                  );
                } else {
                  value = defaultValue === "NULL" ? null : defaultValue;
                  logger.debug(
                    `🔧 Usando valor por defecto para ${targetField}: ${value}`
                  );
                }
              }
            }

            // 4. ✅ MAPEO ESPECIAL PARA CAMPOS CRÍTICOS
            if (
              targetField === "PEDIDO" &&
              (value === null || value === undefined)
            ) {
              // Intentar obtener el número de pedido de diferentes campos posibles
              const possibleFields = [
                "NUM_PED",
                "PEDIDO",
                "NUMERO_PEDIDO",
                "ID_PEDIDO",
              ];
              for (const field of possibleFields) {
                if (
                  sourceRecord[field] !== null &&
                  sourceRecord[field] !== undefined
                ) {
                  value = sourceRecord[field];
                  logger.info(`🔧 PEDIDO obtenido de campo ${field}: ${value}`);
                  break;
                }
              }
            }

            if (
              targetField === "FECHA_PEDIDO" &&
              (value === null || value === undefined)
            ) {
              // Intentar obtener la fecha de diferentes campos posibles
              const possibleDateFields = [
                "FECHA_PEDIDO",
                "FEC_PED",
                "FECHA",
                "FECHA_DOC",
              ];
              for (const field of possibleDateFields) {
                if (
                  sourceRecord[field] !== null &&
                  sourceRecord[field] !== undefined
                ) {
                  value = sourceRecord[field];
                  logger.info(
                    `🔧 FECHA_PEDIDO obtenida de campo ${field}: ${value}`
                  );
                  break;
                }
              }

              // Si aún no hay fecha, usar fecha actual
              if (value === null || value === undefined) {
                value = "GETDATE()"; // Función SQL para fecha actual
                logger.info(`🔧 FECHA_PEDIDO usando fecha actual: GETDATE()`);
              }
            }

            // 5. Aplicar transformación si está definida
            if (transformFunction && typeof transformFunction === "function") {
              try {
                const originalValue = value;
                value = transformFunction(value, sourceRecord);
                logger.debug(
                  `🔄 Transformación aplicada a ${targetField}: ${originalValue} → ${value}`
                );
              } catch (transformError) {
                logger.warn(
                  `⚠️ Error en transformación para campo ${targetField}: ${transformError.message}`
                );
              }
            }

            // 6. ✅ VALIDACIÓN FINAL para campos críticos
            if (
              targetField === "PEDIDO" &&
              (value === null || value === undefined || value === "")
            ) {
              logger.error(
                `❌ Campo crítico PEDIDO es NULL/vacío en registro:`,
                sourceRecord
              );
              throw new Error(
                `Campo PEDIDO no puede ser NULL. Registro: ${JSON.stringify(
                  sourceRecord
                )}`
              );
            }

            mappedRecord[targetField] = value;
          } catch (fieldError) {
            logger.error(
              `❌ Error procesando campo ${fieldMapping.targetField}: ${fieldError.message}`
            );
            throw fieldError;
          }
        }

        // ✅ VALIDACIÓN FINAL del registro mapeado
        if (Object.keys(mappedRecord).length === 0) {
          logger.warn("⚠️ Registro mapeado vacío, omitiendo");
          continue;
        }

        mappedData.push(mappedRecord);
      }

      logger.info(
        `✅ Mapeo de campos completado: ${mappedData.length} registros procesados de ${sourceData.length} originales`
      );
      return mappedData;
    } catch (error) {
      logger.error(`❌ Error crítico en mapeo de campos: ${error.message}`);
      logger.error(`Stack trace: ${error.stack}`);
      throw error;
    }
  }

  /**
   * ✅ NUEVO: Verificar si un valor es una función SQL
   */
  isSqlFunction(value) {
    if (typeof value !== "string") return false;

    const sqlFunctions = [
      "GETDATE()",
      "CURRENT_TIMESTAMP",
      "NEWID()",
      "SYSUTCDATETIME()",
      "SYSDATETIME()",
      "GETUTCDATE()",
      "GETDATE",
      "DATEADD",
      "DATEDIFF",
    ];

    const upperValue = value.toUpperCase();
    return sqlFunctions.some((func) => upperValue.includes(func));
  }

  /**
   * ✅ CÓDIGO ORIGINAL: Obtiene documentos con filtros aplicados
   */
  async processDocuments(documentIds, mappingId, signal = null) {
    logger.info(
      `🚀 Iniciando procesamiento de ${documentIds.length} documentos para mapping ${mappingId}`
    );

    try {
      // ✅ VALIDACIONES INICIALES
      if (!Array.isArray(documentIds) || documentIds.length === 0) {
        throw new Error("documentIds debe ser un array no vacío");
      }

      if (!mappingId) {
        throw new Error("mappingId es requerido");
      }

      // 1. Obtener configuración de mapeo
      const mapping = await this.getMappingById(mappingId);
      if (!mapping) {
        throw new Error(`Configuración de mapeo no encontrada: ${mappingId}`);
      }

      // ✅ VALIDACIÓN CRÍTICA: Verificar tableConfigs
      if (
        !mapping.tableConfigs ||
        !Array.isArray(mapping.tableConfigs) ||
        mapping.tableConfigs.length === 0
      ) {
        throw new Error(
          `La configuración de mapeo ${mapping.name} no tiene tablas configuradas válidas`
        );
      }

      logger.info(
        `📋 Configuración de mapeo cargada: ${mapping.name} con ${mapping.tableConfigs.length} tablas`
      );

      // 2. Establecer conexiones
      let sourceConnection = null;
      let targetConnection = null;

      try {
        // Conexión a servidor origen
        logger.info(`🔗 Conectando a servidor origen: ${mapping.sourceServer}`);
        const sourceResult = await ConnectionService.enhancedRobustConnect(
          mapping.sourceServer
        );
        if (!sourceResult.success) {
          throw new Error(
            `No se pudo conectar a servidor origen ${mapping.sourceServer}: ${
              sourceResult.error?.message || "Error desconocido"
            }`
          );
        }
        sourceConnection = sourceResult.connection;

        // Conexión a servidor destino
        logger.info(
          `🔗 Conectando a servidor destino: ${mapping.targetServer}`
        );
        const targetResult = await ConnectionService.enhancedRobustConnect(
          mapping.targetServer
        );
        if (!targetResult.success) {
          throw new Error(
            `No se pudo conectar a servidor destino ${mapping.targetServer}: ${
              targetResult.error?.message || "Error desconocido"
            }`
          );
        }
        targetConnection = targetResult.connection;

        // 3. Obtener datos de origen
        logger.info(
          `📥 Obteniendo datos de origen para ${documentIds.length} documentos`
        );
        let sourceData = await this.getSourceDataForDocuments(
          documentIds,
          mapping,
          sourceConnection
        );

        // ✅ VALIDACIÓN de datos de origen
        if (!Array.isArray(sourceData)) {
          logger.error("❌ sourceData no es un array:", typeof sourceData);
          throw new Error("Los datos de origen no son válidos");
        }

        if (sourceData.length === 0) {
          logger.warn("⚠️ No se encontraron datos de origen para procesar");
          return {
            processed: 0,
            failed: 0,
            details: [],
            message: "No se encontraron datos para procesar",
          };
        }

        logger.info(
          `📥 Datos de origen obtenidos: ${sourceData.length} registros`
        );

        // 4. Procesar cada tabla configurada
        const results = [];
        let totalInserted = 0;
        let totalErrors = 0;

        // ✅ ORDENAR tablas por dependencias
        const sortedTableConfigs = this.sortTablesByDependencies(
          mapping.tableConfigs
        );

        for (const tableConfig of sortedTableConfigs) {
          try {
            logger.info(
              `📋 Procesando tabla: ${tableConfig.name} (${tableConfig.sourceTable} → ${tableConfig.targetTable})`
            );

            // ✅ VALIDAR configuración de tabla
            if (
              !tableConfig.fieldMappings ||
              !Array.isArray(tableConfig.fieldMappings)
            ) {
              logger.error(
                `❌ Tabla ${tableConfig.name} no tiene fieldMappings válidos`
              );
              throw new Error(
                `Configuración de tabla ${tableConfig.name} es inválida`
              );
            }

            // Filtrar datos para esta tabla
            let tableData = sourceData;

            // Aplicar mapeo de campos
            const mappedData = this.applyFieldMapping(
              tableData,
              tableConfig.fieldMappings,
              targetConnection
            );

            if (mappedData.length === 0) {
              logger.warn(
                `⚠️ No hay datos mapeados para tabla ${tableConfig.name}`
              );
              continue;
            }

            // Insertar datos
            const insertResult = await this.insertDataBatch(
              mappedData,
              tableConfig,
              targetConnection
            );

            totalInserted += insertResult.inserted;
            totalErrors += insertResult.errors;

            results.push({
              table: tableConfig.name,
              inserted: insertResult.inserted,
              errors: insertResult.errors,
            });
          } catch (tableError) {
            logger.error(
              `❌ Error procesando tabla ${tableConfig.name}: ${tableError.message}`
            );
            totalErrors++;
            results.push({
              table: tableConfig.name,
              inserted: 0,
              errors: 1,
              error: tableError.message,
            });
          }
        }

        logger.info(
          `✅ Procesamiento completado: ${totalInserted} inserciones, ${totalErrors} errores`
        );

        return {
          processed: totalInserted,
          failed: totalErrors,
          details: results,
          message:
            totalErrors > 0
              ? `Procesamiento completado con ${totalErrors} errores`
              : "Procesamiento completado exitosamente",
        };
      } finally {
        // Liberar conexiones
        if (sourceConnection) {
          try {
            await ConnectionService.releaseConnection(sourceConnection);
            logger.debug("✅ Conexión origen liberada");
          } catch (e) {
            logger.warn(`⚠️ Error liberando conexión origen: ${e.message}`);
          }
        }

        if (targetConnection) {
          try {
            await ConnectionService.releaseConnection(targetConnection);
            logger.debug("✅ Conexión destino liberada");
          } catch (e) {
            logger.warn(`⚠️ Error liberando conexión destino: ${e.message}`);
          }
        }
      }
    } catch (error) {
      logger.error(
        `❌ Error durante el procesamiento de documentos: ${error.message}`
      );
      logger.error(`Stack trace: ${error.stack}`);
      throw error;
    }
  }

  /**
   * ✅ NUEVO: Ordenar tablas por dependencias
   */
  sortTablesByDependencies(tableConfigs) {
    if (!Array.isArray(tableConfigs)) {
      logger.warn("⚠️ tableConfigs no es un array, devolviendo array vacío");
      return [];
    }

    // Por ahora, ordenamiento simple: tablas principales primero, luego detalles
    return tableConfigs.sort((a, b) => {
      // Tablas principales (no de detalle) van primero
      if (!a.isDetailTable && b.isDetailTable) return -1;
      if (a.isDetailTable && !b.isDetailTable) return 1;

      // Usar executionOrder si está definido
      const orderA = a.executionOrder || 0;
      const orderB = b.executionOrder || 0;

      return orderA - orderB;
    });
  }

  /**
   * ✅ CÓDIGO ORIGINAL: Marca documentos como procesados según la estrategia configurada
   */
  async markDocumentsAsProcessed(
    documentIds,
    mapping,
    connection,
    shouldMark = true
  ) {
    // Normalizar documentIds a array
    const docArray = Array.isArray(documentIds) ? documentIds : [documentIds];

    if (!mapping.markProcessedField) {
      logger.debug("Campo de marcado no configurado, omitiendo marcado");
      return { success: 0, failed: 0 };
    }

    const strategy = mapping.markProcessedStrategy || "individual";
    logger.debug(
      `Marcando documentos usando estrategia: ${strategy}, shouldMark: ${shouldMark}`
    );

    try {
      switch (strategy) {
        case "batch":
          return await this.markDocumentsBatch(
            docArray,
            mapping,
            connection,
            shouldMark
          );

        case "individual":
          let successCount = 0;
          let failCount = 0;

          for (const documentId of docArray) {
            try {
              const marked = await this.markSingleDocument(
                documentId,
                mapping,
                connection,
                shouldMark
              );
              if (marked) successCount++;
              else failCount++;
            } catch (error) {
              logger.error(
                `Error marcando documento individual ${documentId}: ${error.message}`
              );
              failCount++;
            }
          }

          return { success: successCount, failed: failCount };

        case "none":
          logger.debug("Estrategia 'none' - no se marcan documentos");
          return { success: 0, failed: 0 };

        default:
          logger.warn(`Estrategia desconocida: ${strategy}, usando individual`);
          return await this.markDocumentsAsProcessed(
            docArray,
            { ...mapping, markProcessedStrategy: "individual" },
            connection,
            shouldMark
          );
      }
    } catch (error) {
      logger.error(`Error general en marcado de documentos: ${error.message}`);
      return { success: 0, failed: docArray.length };
    }
  }

  /**
   * ✅ CÓDIGO ORIGINAL: Marca documentos en lote
   * @private
   */
  async markDocumentsBatch(documentIds, mapping, connection, shouldMark) {
    const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
    if (!mainTable) {
      throw new Error("No se encontró tabla principal para marcado en lote");
    }

    const config = mapping.markProcessedConfig || {};
    const primaryKey = mainTable.primaryKey || "NUM_PED";
    const batchSize = config.batchSize || 100;

    let totalSuccess = 0;
    let totalFailed = 0;

    // Procesar en lotes
    for (let i = 0; i < documentIds.length; i += batchSize) {
      const batch = documentIds.slice(i, i + batchSize);

      try {
        const result = await this.markBatch(
          batch,
          mapping,
          connection,
          shouldMark
        );
        totalSuccess += result.success;
        totalFailed += result.failed;
      } catch (batchError) {
        logger.error(
          `Error en lote ${i / batchSize + 1}: ${batchError.message}`
        );
        totalFailed += batch.length;
      }
    }

    return { success: totalSuccess, failed: totalFailed };
  }

  /**
   * ✅ CÓDIGO ORIGINAL: Marca un lote específico
   * @private
   */
  async markBatch(documentIds, mapping, connection, shouldMark) {
    const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
    const config = mapping.markProcessedConfig || {};
    const primaryKey = mainTable.primaryKey || "NUM_PED";

    // Construir placeholders
    const placeholders = documentIds
      .map((_, index) => `@doc${index}`)
      .join(", ");

    // Construir campos a actualizar
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
   * ✅ CÓDIGO ORIGINAL: Marca un documento individual
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
   * 🟢 AGREGADO ÚNICAMENTE: Validar configuración de bonificaciones
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
   * ✅ CÓDIGO ORIGINAL: Agrupa datos por campo específico
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

  // ✅ RESTO DE MÉTODOS ORIGINALES (getMappings, createMapping, etc.)

  async getMappings() {
    try {
      const mappings = await TransferMapping.find().sort({ name: 1 });
      return mappings;
    } catch (error) {
      logger.error(
        `Error obteniendo configuraciones de mapeo: ${error.message}`
      );
      throw error;
    }
  }

  async getMappingById(mappingId) {
    try {
      const mapping = await TransferMapping.findById(mappingId);
      if (!mapping) {
        throw new Error(`Configuración de mapeo ${mappingId} no encontrada`);
      }
      return mapping;
    } catch (error) {
      logger.error(`Error obteniendo configuración de mapeo: ${error.message}`);
      throw error;
    }
  }

  async createMapping(mappingData) {
    try {
      const mapping = new TransferMapping(mappingData);
      await mapping.save();
      logger.info(`✅ Configuración de mapeo creada: ${mapping.name}`);
      return mapping;
    } catch (error) {
      logger.error(`Error creando configuración de mapeo: ${error.message}`);
      throw error;
    }
  }

  async updateMapping(mappingId, updateData) {
    try {
      const mapping = await TransferMapping.findByIdAndUpdate(
        mappingId,
        { ...updateData, updatedAt: new Date() },
        { new: true }
      );

      if (!mapping) {
        throw new Error(`Configuración de mapeo ${mappingId} no encontrada`);
      }

      logger.info(`✅ Configuración de mapeo actualizada: ${mapping.name}`);
      return mapping;
    } catch (error) {
      logger.error(
        `Error actualizando configuración de mapeo: ${error.message}`
      );
      throw error;
    }
  }

  async deleteMapping(mappingId) {
    try {
      const mapping = await TransferMapping.findByIdAndDelete(mappingId);
      if (!mapping) {
        throw new Error(`Configuración de mapeo ${mappingId} no encontrada`);
      }

      logger.info(`✅ Configuración de mapeo eliminada: ${mapping.name}`);
      return {
        success: true,
        message: "Configuración eliminada correctamente",
      };
    } catch (error) {
      logger.error(`Error eliminando configuración de mapeo: ${error.message}`);
      throw error;
    }
  }

  /**
   * 📋 Obtiene documentos con filtros aplicados
   * @param {Object} mapping - Configuración de mapeo
   * @param {Object} filters - Filtros a aplicar
   * @param {Object} connection - Conexión a la base de datos
   * @returns {Promise<Array>} - Lista de documentos
   */
  async getDocuments(mapping, filters, connection) {
    try {
      logger.info("📋 Obteniendo documentos con filtros:", filters);

      // ✅ VALIDACIONES INICIALES
      if (!mapping) {
        throw new Error("Mapping es requerido");
      }

      if (!connection) {
        throw new Error("Conexión a base de datos es requerida");
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

      // Buscar la tabla principal (no de detalle)
      const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
      if (!mainTable) {
        throw new Error(
          "No se encontró tabla principal en la configuración de mapeo"
        );
      }

      logger.debug(
        `📋 Tabla principal encontrada: ${mainTable.name}, sourceTable: ${mainTable.sourceTable}`
      );

      // ✅ VERIFICAR TABLA DISPONIBLE
      try {
        logger.info("🔍 Verificando disponibilidad de tabla...");
        const listTablesQuery = `
        SELECT TOP 50 TABLE_SCHEMA, TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = @tableName
        ORDER BY TABLE_SCHEMA, TABLE_NAME
      `;

        const tablesResult = await SqlService.query(
          connection,
          listTablesQuery,
          {
            tableName: mainTable.sourceTable,
          }
        );

        if (!tablesResult.recordset || tablesResult.recordset.length === 0) {
          throw new Error(
            `Tabla ${mainTable.sourceTable} no encontrada en la base de datos`
          );
        }

        logger.info(
          `✅ Tabla ${mainTable.sourceTable} verificada exitosamente`
        );
      } catch (tableError) {
        logger.error(`❌ Error verificando tabla: ${tableError.message}`);
        throw new Error(`Error verificando tabla: ${tableError.message}`);
      }

      // ✅ VERIFICAR COLUMNAS DISPONIBLES
      let availableColumns = [];
      try {
        const columnsQuery = `
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = @tableName
        ORDER BY ORDINAL_POSITION
      `;

        const columnsResult = await SqlService.query(connection, columnsQuery, {
          tableName: mainTable.sourceTable,
        });

        availableColumns = columnsResult.recordset.map(
          (row) => row.COLUMN_NAME
        );
        logger.debug(
          `📋 Columnas disponibles en ${
            mainTable.sourceTable
          }: ${availableColumns.join(", ")}`
        );

        if (availableColumns.length === 0) {
          throw new Error(
            `No se pudieron obtener columnas de la tabla ${mainTable.sourceTable}`
          );
        }
      } catch (columnsError) {
        logger.error(`❌ Error obteniendo columnas: ${columnsError.message}`);
        throw new Error(`Error obteniendo columnas: ${columnsError.message}`);
      }

      // ✅ CONSTRUIR CONSULTA BASE
      const primaryKey = mainTable.primaryKey || "NUM_PED";
      let baseQuery = `SELECT ${primaryKey}`;

      // Agregar campos adicionales si están configurados y existen
      const additionalFields = [];

      // Campo de fecha
      const dateField = filters.dateField || "FECHA_PEDIDO";
      if (
        dateField &&
        dateField !== primaryKey &&
        availableColumns.includes(dateField)
      ) {
        additionalFields.push(dateField);
      }

      // Campo de estado
      const statusField = filters.statusField || "ESTADO";
      if (
        statusField &&
        statusField !== primaryKey &&
        availableColumns.includes(statusField)
      ) {
        additionalFields.push(statusField);
      }

      // Campo de bodega
      const warehouseField = filters.warehouseField || "COD_BOD";
      if (
        warehouseField &&
        warehouseField !== primaryKey &&
        availableColumns.includes(warehouseField)
      ) {
        additionalFields.push(warehouseField);
      }

      // Campo de procesado
      if (
        mapping.markProcessedField &&
        mapping.markProcessedField !== primaryKey &&
        availableColumns.includes(mapping.markProcessedField)
      ) {
        additionalFields.push(mapping.markProcessedField);
      }

      // Agregar campos únicos
      const uniqueFields = [...new Set(additionalFields)];
      if (uniqueFields.length > 0) {
        baseQuery += `, ${uniqueFields.join(", ")}`;
      }

      baseQuery += ` FROM ${mainTable.sourceTable}`;

      // ✅ CONSTRUIR CONDICIONES WHERE
      const whereConditions = [];
      const params = {};

      // Filtro por fechas
      if (
        filters.dateFrom &&
        filters.dateTo &&
        availableColumns.includes(dateField)
      ) {
        whereConditions.push(`${dateField} BETWEEN @dateFrom AND @dateTo`);
        params.dateFrom = filters.dateFrom;
        params.dateTo = filters.dateTo;
        logger.debug(
          `📅 Filtro de fecha aplicado: ${filters.dateFrom} - ${filters.dateTo}`
        );
      }

      // Filtro por estado
      if (
        filters.status &&
        filters.status !== "all" &&
        availableColumns.includes(statusField)
      ) {
        whereConditions.push(`${statusField} = @status`);
        params.status = filters.status;
        logger.debug(`📋 Filtro de estado aplicado: ${filters.status}`);
      }

      // Filtro por bodega
      if (
        filters.warehouse &&
        filters.warehouse !== "all" &&
        availableColumns.includes(warehouseField)
      ) {
        whereConditions.push(`${warehouseField} = @warehouse`);
        params.warehouse = filters.warehouse;
        logger.debug(`🏪 Filtro de bodega aplicado: ${filters.warehouse}`);
      }

      // Filtro por procesados/no procesados
      if (
        !filters.showProcessed &&
        mapping.markProcessedField &&
        availableColumns.includes(mapping.markProcessedField)
      ) {
        whereConditions.push(
          `(${mapping.markProcessedField} IS NULL OR ${mapping.markProcessedField} = 0)`
        );
        logger.debug(`🔄 Filtro de no procesados aplicado`);
      }

      // Agregar condición de filtro de tabla si existe
      if (mainTable.filterCondition) {
        whereConditions.push(`(${mainTable.filterCondition})`);
        logger.debug(
          `🔍 Condición adicional aplicada: ${mainTable.filterCondition}`
        );
      }

      // ✅ ENSAMBLAR CONSULTA FINAL
      let finalQuery = baseQuery;
      if (whereConditions.length > 0) {
        finalQuery += ` WHERE ${whereConditions.join(" AND ")}`;
      }

      // Ordenamiento
      if (availableColumns.includes(dateField)) {
        finalQuery += ` ORDER BY ${dateField} DESC`;
      } else {
        finalQuery += ` ORDER BY ${primaryKey} DESC`;
      }

      // Limitar resultados para evitar sobrecarga
      finalQuery = `SELECT TOP 1000 ${finalQuery.substring(
        finalQuery.indexOf("SELECT ") + 7
      )}`;

      logger.debug(`🔍 Consulta final: ${finalQuery}`);
      logger.debug(`📋 Parámetros: ${JSON.stringify(params)}`);

      // ✅ EJECUTAR CONSULTA
      try {
        const result = await SqlService.query(connection, finalQuery, params);
        const documents = result.recordset || [];

        logger.info(
          `📋 Documentos obtenidos exitosamente: ${documents.length} registros`
        );

        return documents;
      } catch (queryError) {
        logger.error(`❌ Error ejecutando consulta: ${queryError.message}`);
        logger.error(`Query problemática: ${finalQuery}`);
        logger.error(`Parámetros: ${JSON.stringify(params)}`);
        throw new Error(`Error ejecutando consulta: ${queryError.message}`);
      }
    } catch (error) {
      logger.error(`❌ Error en getDocuments: ${error.message}`);
      logger.error(`Stack trace: ${error.stack}`);
      throw error;
    }
  }
  /**
   * 📥 Inserta datos en lotes para mejor rendimiento
   * @param {Array} data - Datos a insertar
   * @param {Object} tableConfig - Configuración de la tabla
   * @param {Object} connection - Conexión a base de datos
   * @returns {Object} - Resultado de la inserción
   */
  async insertDataBatch(data, tableConfig, connection) {
    let inserted = 0;
    let errors = 0;

    try {
      logger.info(
        `📥 Insertando ${data.length} registros en tabla ${tableConfig.targetTable}`
      );

      // ✅ VALIDACIONES INICIALES
      if (!Array.isArray(data) || data.length === 0) {
        logger.warn("⚠️ No hay datos para insertar");
        return { inserted: 0, errors: 0 };
      }

      if (!tableConfig) {
        throw new Error("Configuración de tabla es requerida");
      }

      if (!connection) {
        throw new Error("Conexión a base de datos es requerida");
      }

      // ✅ PROCESAR EN LOTES PEQUEÑOS para evitar problemas de memoria/timeout
      const batchSize = 50; // Procesar de 50 en 50
      const totalBatches = Math.ceil(data.length / batchSize);

      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const startIndex = batchIndex * batchSize;
        const endIndex = Math.min(startIndex + batchSize, data.length);
        const batch = data.slice(startIndex, endIndex);

        logger.debug(
          `📦 Procesando lote ${batchIndex + 1}/${totalBatches} (${
            batch.length
          } registros)`
        );

        try {
          const batchResult = await this.processBatch(
            batch,
            tableConfig,
            connection
          );
          inserted += batchResult.inserted;
          errors += batchResult.errors;

          logger.debug(
            `✅ Lote ${batchIndex + 1} completado: ${
              batchResult.inserted
            } inserciones, ${batchResult.errors} errores`
          );
        } catch (batchError) {
          logger.error(
            `❌ Error en lote ${batchIndex + 1}: ${batchError.message}`
          );
          errors += batch.length; // Contar todos los registros del lote como errores
        }
      }

      logger.info(
        `📊 Inserción completada - Tabla: ${tableConfig.targetTable}, Insertados: ${inserted}, Errores: ${errors}`
      );

      return { inserted, errors };
    } catch (error) {
      logger.error(`❌ Error en insertDataBatch: ${error.message}`);
      return { inserted, errors: data.length }; // Todos como errores
    }
  }

  /**
   * 🔧 Procesa un lote individual de registros
   * @private
   */
  async processBatch(batch, tableConfig, connection) {
    let inserted = 0;
    let errors = 0;

    try {
      // ✅ INSERTAR CADA REGISTRO DEL LOTE
      for (const record of batch) {
        try {
          await this.insertSingleRecord(record, tableConfig, connection);
          inserted++;
        } catch (recordError) {
          logger.error(`❌ Error insertando registro: ${recordError.message}`);
          logger.debug(`Registro problemático:`, record);
          errors++;
        }
      }

      return { inserted, errors };
    } catch (error) {
      logger.error(`❌ Error procesando lote: ${error.message}`);
      return { inserted, errors: batch.length };
    }
  }

  /**
   * 🔧 Inserta un registro individual
   * @private
   */
  async insertSingleRecord(record, tableConfig, connection) {
    try {
      // ✅ PROCESAR FUNCIONES SQL NATIVAS
      const processedRecord = {};
      const sqlFunctions = new Set();

      for (const [key, value] of Object.entries(record)) {
        if (typeof value === "string" && this.isSqlFunction(value)) {
          processedRecord[key] = value;
          sqlFunctions.add(key);
        } else {
          processedRecord[key] = value;
        }
      }

      // ✅ CONSTRUIR QUERY DE INSERCIÓN
      const fields = Object.keys(processedRecord);
      const values = fields.map((field) => {
        return sqlFunctions.has(field) ? processedRecord[field] : `@${field}`;
      });

      const query = `
      INSERT INTO ${tableConfig.targetTable} (${fields.join(", ")})
      VALUES (${values.join(", ")})
    `;

      // ✅ PREPARAR PARÁMETROS (excluir funciones SQL)
      const params = {};
      fields.forEach((field) => {
        if (!sqlFunctions.has(field)) {
          params[field] = processedRecord[field];
        }
      });

      logger.debug(`🔧 Insertando en ${tableConfig.targetTable}:`, {
        query: query.substring(0, 100) + "...",
        paramCount: Object.keys(params).length,
        sqlFunctions: Array.from(sqlFunctions),
      });

      // ✅ EJECUTAR INSERCIÓN
      await SqlService.query(connection, query, params);
    } catch (error) {
      logger.error(`❌ Error en insertSingleRecord: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ MÉTODO AUXILIAR: Verificar si un valor es una función SQL
   * @private
   */
  isSqlFunction(value) {
    if (typeof value !== "string") return false;

    const sqlFunctions = [
      "GETDATE()",
      "CURRENT_TIMESTAMP",
      "NEWID()",
      "SYSUTCDATETIME()",
      "SYSDATETIME()",
      "GETUTCDATE()",
      "GETDATE",
      "DATEADD",
      "DATEDIFF",
    ];

    const upperValue = value.toUpperCase();
    return sqlFunctions.some((func) => upperValue.includes(func));
  }
}

module.exports = new DynamicTransferService();
