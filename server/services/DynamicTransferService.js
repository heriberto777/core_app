const logger = require("./logger");
const ConnectionService = require("./ConnectionCentralService");
const { SqlService } = require("./SqlService");
const TransferMapping = require("../models/transferMappingModel");
const TaskExecution = require("../models/taskExecutionModel");
const TaskTracker = require("./TaskTracker");
const TransferTask = require("../models/transferTaks");
const ConsecutiveService = require("./ConsecutiveService");

class DynamicTransferService {
  /**
   * 🟢 NUEVO: Procesa bonificaciones dinámicamente
   * @param {Array} sourceData - Datos originales de FAC_DET_PED
   * @param {Object} mapping - Configuración de mapeo
   * @returns {Array} - Datos procesados con líneas de bonificación
   */
  async processBonifications(sourceData, mapping) {
    if (!mapping.hasBonificationProcessing || !mapping.bonificationConfig) {
      return sourceData; // Sin procesamiento especial
    }

    const config = mapping.bonificationConfig;
    logger.info(
      `🎯 Procesando bonificaciones para ${sourceData.length} registros`
    );

    // Agrupar por pedido (NUM_PED)
    const groupedByOrder = this.groupByField(sourceData, config.orderField);
    const processedData = [];
    let bonificationsProcessed = 0;
    let regularArticlesProcessed = 0;

    for (const [orderNumber, records] of groupedByOrder) {
      logger.debug(
        `📦 Procesando pedido ${orderNumber} con ${records.length} registros`
      );

      const lineMapping = new Map(); // Mapear artículos regulares a líneas
      const bonificationQueue = [];
      let lineCounter = 1;

      // PRIMERA PASADA: Procesar artículos regulares y asignar líneas
      records.forEach((record) => {
        const isBonification =
          record[config.bonificationIndicatorField] ===
          config.bonificationIndicatorValue;

        if (!isBonification) {
          // Artículo regular
          const processedRecord = {
            ...record,
            [config.lineNumberField]: lineCounter,
            [config.bonificationLineReferenceField]: null, // Los regulares no tienen referencia
          };

          // Guardar mapeo: COD_ART -> línea asignada
          lineMapping.set(record[config.regularArticleField], lineCounter);
          processedData.push(processedRecord);
          lineCounter++;
          regularArticlesProcessed++;

          logger.debug(
            `✅ Artículo regular: ${
              record[config.regularArticleField]
            } -> Línea ${lineCounter - 1}`
          );
        } else {
          // Es bonificación, agregar a cola para procesar después
          bonificationQueue.push(record);
        }
      });

      // SEGUNDA PASADA: Procesar bonificaciones y asignar referencias
      bonificationQueue.forEach((bonification) => {
        const referencedArticle =
          bonification[config.bonificationReferenceField]; // COD_ART_RFR
        const referencedLine = lineMapping.get(referencedArticle);

        const processedBonification = {
          ...bonification,
          [config.lineNumberField]: lineCounter,
          [config.bonificationLineReferenceField]: referencedLine || null,
          [config.bonificationReferenceField]: null, // Limpiar COD_ART_RFR original
        };

        if (!referencedLine) {
          logger.warn(
            `⚠️ Bonificación huérfana en pedido ${orderNumber}: ${referencedArticle} no encontrado`
          );
        } else {
          logger.debug(
            `🎁 Bonificación: ${
              bonification[config.regularArticleField]
            } -> Línea ${lineCounter}, referencia línea ${referencedLine}`
          );
        }

        processedData.push(processedBonification);
        lineCounter++;
        bonificationsProcessed++;
      });
    }

    logger.info(
      `✅ Bonificaciones procesadas: ${regularArticlesProcessed} regulares, ${bonificationsProcessed} bonificaciones`
    );
    return processedData;
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
      errors.push("Campo de referencia requerido");
    if (!config.lineNumberField)
      errors.push("Campo de número de línea requerido");

    return { valid: errors.length === 0, errors };
  }

  /**
   * 🔄 MODIFICADO: Procesa documentos según una configuración de mapeo - VERSIÓN MEJORADA
   * @param {Array} documentIds - IDs de los documentos a procesar
   * @param {string} mappingId - ID de la configuración de mapeo
   * @param {Object} signal - Señal de AbortController para cancelación
   * @returns {Promise<Object>} - Resultado del procesamiento
   */
  async processDocuments(documentIds, mappingId, signal = null) {
    const localAbortController = !signal ? new AbortController() : null;
    signal = signal || localAbortController.signal;
    const cancelTaskId = `dynamic_process_${mappingId}_${Date.now()}`;

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

    // Variables para consecutivos centralizados
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
        mapping.markProcessedStrategy = "individual";
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

      if (mapping.transferType === "down") {
        sourceConnection = await ConnectionService.getConnection("server2");
        targetConnection = await ConnectionService.getConnection("server1");
      } else {
        sourceConnection = await ConnectionService.getConnection("server1");
        targetConnection = await ConnectionService.getConnection("server2");
      }

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

      const execution = new TaskExecution({
        taskId: mapping.taskId,
        taskName: taskName, // ✅ CAMPO REQUERIDO AGREGADO
        mappingId: mappingId,
        startTime: new Date(),
        status: "running",
        documentIds: documentIds,
        processedDocuments: 0,
        totalDocuments: documentIds.length,
      });

      await execution.save();
      executionId = execution._id;

      logger.info(
        `📊 Ejecución iniciada: ${executionId}, Tarea: ${taskName}, Documentos: ${documentIds.length}`
      );

      // 5. 🟢 MODIFICADO: Obtener datos de origen con procesamiento especial
      let sourceData = await this.getSourceDataForDocuments(
        documentIds,
        mapping,
        sourceConnection
      );

      logger.info(
        `📥 Datos de origen obtenidos: ${sourceData.length} registros`
      );

      // 6. 🟢 NUEVO: Procesar bonificaciones si está configurado
      if (mapping.hasBonificationProcessing) {
        logger.info(`🎁 Iniciando procesamiento de bonificaciones...`);
        sourceData = await this.processBonifications(sourceData, mapping);
        logger.info(
          `🎯 Bonificaciones procesadas: ${sourceData.length} registros finales`
        );
      }

      // 7. Verificar cancelación
      if (signal.aborted) {
        throw new Error("Operación cancelada por el usuario");
      }

      // 8. Procesar cada tabla configurada
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

          // 🟢 NUEVO: Si es la tabla de bonificaciones, ya está procesada
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
            logger.debug(
              `📝 Condición de filtro configurada: ${tableConfig.filterCondition}`
            );
          }

          // 9. Aplicar mapeo de campos
          const mappedData = await this.applyFieldMapping(
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

          // 10. Insertar datos
          const insertResult = await this.insertMappedData(
            mappedData,
            tableConfig.targetTable,
            targetConnection
          );

          totalInserted += insertResult.inserted;
          totalErrors += insertResult.errors;

          results.push({
            table: tableConfig.name,
            inserted: insertResult.inserted,
            errors: insertResult.errors,
          });

          logger.info(
            `✅ Tabla ${tableConfig.name}: ${insertResult.inserted} insertados, ${insertResult.errors} errores`
          );
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

      // 11. Actualizar registro de ejecución y tarea
      const executionTime = Date.now() - startTime;

      // Determinar estado final
      let finalStatus = "completed";
      if (totalInserted === 0 && totalErrors > 0) {
        finalStatus = "failed";
      } else if (totalErrors > 0) {
        finalStatus = "partial";
      }

      // Actualizar TaskExecution
      await TaskExecution.findByIdAndUpdate(executionId, {
        status: finalStatus,
        executionTime,
        totalRecords: documentIds.length,
        successfulRecords: totalInserted,
        failedRecords: totalErrors,
      });

      clearTimeout(timeoutId);
      TaskTracker.completeTask(cancelTaskId, finalStatus);

      return {
        success: totalErrors === 0,
        executionId,
        totalInserted,
        totalErrors,
        results,
        message: `Procesamiento ${finalStatus}: ${totalInserted} registros procesados, ${totalErrors} errores`,
      };
    } catch (error) {
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

        TaskTracker.completeTask(cancelTaskId, "cancelled");

        return {
          success: false,
          message: "Tarea cancelada por el usuario",
          executionId,
        };
      }

      logger.error(`Error al procesar documentos: ${error.message}`);

      // Actualizar registro de ejecución en caso de error
      if (executionId) {
        await TaskExecution.findByIdAndUpdate(executionId, {
          status: "failed",
          executionTime: Date.now() - startTime,
          errorMessage: error.message,
        });
      }

      TaskTracker.completeTask(cancelTaskId, "failed");
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
   * 🟢 MODIFICADO: Obtiene datos de origen para documentos específicos
   * Incluye lógica especial para bonificaciones
   * @param {Array} documentIds - IDs de documentos
   * @param {Object} mapping - Configuración de mapeo
   * @param {Object} connection - Conexión a la base de datos
   * @returns {Promise<Array>} - Datos obtenidos
   */
  async getSourceDataForDocuments(documentIds, mapping, connection) {
    try {
      // Determinar tabla principal para la consulta
      let sourceTable = "FAC_ENCABEZADO_PED"; // Tabla por defecto

      // Si hay configuración de bonificaciones, usar esa tabla
      if (
        mapping.hasBonificationProcessing &&
        mapping.bonificationConfig.sourceTable
      ) {
        sourceTable = mapping.bonificationConfig.sourceTable;
        logger.info(`🎁 Usando tabla de bonificaciones: ${sourceTable}`);
      } else {
        // Usar la primera tabla configurada
        const mainTableConfig = mapping.tableConfigs.find(
          (tc) => !tc.isDetailTable
        );
        if (mainTableConfig && mainTableConfig.sourceTable) {
          sourceTable = mainTableConfig.sourceTable;
        }
      }

      // Crear placeholders para los IDs
      const placeholders = documentIds
        .map((_, index) => `@doc${index}`)
        .join(", ");
      const params = {};
      documentIds.forEach((id, index) => {
        params[`doc${index}`] = id;
      });

      // Construir consulta
      const query = `
        SELECT * FROM ${sourceTable}
        WHERE NUM_PED IN (${placeholders})
        ORDER BY NUM_PED, PEDIDO_LINEA
      `;

      logger.debug(`Ejecutando consulta de origen: ${query}`);
      logger.debug(`Parámetros: ${JSON.stringify(params)}`);

      const result = await SqlService.query(connection, query, params);

      logger.info(
        `📥 Obtenidos ${result.recordset.length} registros de ${sourceTable}`
      );

      return result.recordset || [];
    } catch (error) {
      logger.error(`Error al obtener datos de origen: ${error.message}`);
      throw error;
    }
  }

  /**
   * 🔄 IMPLEMENTADO: Aplica mapeo de campos a los datos de origen
   * @param {Array} sourceData - Datos de origen
   * @param {Array} fieldMappings - Configuración de mapeo de campos
   * @param {Object} targetConnection - Conexión a la base de datos destino
   * @returns {Promise<Array>} - Datos mapeados listos para inserción
   */
  async applyFieldMapping(sourceData, fieldMappings, targetConnection) {
    try {
      logger.info(
        `🔄 Aplicando mapeo de campos a ${sourceData.length} registros`
      );

      const mappedData = [];

      for (const sourceRecord of sourceData) {
        const mappedRecord = {};

        // Procesar cada campo configurado
        for (const fieldMapping of fieldMappings) {
          let value = null;

          // Obtener valor del campo origen
          if (fieldMapping.sourceField) {
            value = sourceRecord[fieldMapping.sourceField];
          }

          // Aplicar valor por defecto si no hay valor
          if (
            (value === null || value === undefined) &&
            fieldMapping.defaultValue !== undefined
          ) {
            value = fieldMapping.defaultValue;
          }

          // Aplicar transformaciones si es necesario
          if (value !== null && value !== undefined) {
            // Eliminar prefijo si está configurado
            if (
              fieldMapping.removePrefix &&
              typeof value === "string" &&
              value.startsWith(fieldMapping.removePrefix)
            ) {
              value = value.substring(fieldMapping.removePrefix.length);
              logger.debug(
                `Prefijo '${fieldMapping.removePrefix}' eliminado de ${fieldMapping.sourceField}: ${value}`
              );
            }

            // Aplicar mapeo de valores si existe
            if (
              fieldMapping.valueMappings &&
              fieldMapping.valueMappings.length > 0
            ) {
              const valueMapping = fieldMapping.valueMappings.find(
                (vm) => vm.sourceValue === value
              );
              if (valueMapping) {
                value = valueMapping.targetValue;
                logger.debug(
                  `Mapeo de valor aplicado: ${fieldMapping.sourceField} -> ${value}`
                );
              }
            }

            // Truncar strings largos si es necesario
            if (typeof value === "string") {
              const maxLength = await this.getColumnMaxLength(
                targetConnection,
                fieldMapping.targetField
              );
              if (maxLength > 0 && value.length > maxLength) {
                logger.warn(
                  `Truncando ${fieldMapping.targetField} de ${value.length} a ${maxLength} caracteres`
                );
                value = value.substring(0, maxLength);
              }
            }

            // Convertir fechas
            if (value instanceof Date) {
              value = this.formatSqlDate(value);
            }
          }

          // Validar campos requeridos
          if (
            fieldMapping.isRequired &&
            (value === null || value === undefined)
          ) {
            throw new Error(
              `Campo requerido '${fieldMapping.targetField}' no tiene valor`
            );
          }

          mappedRecord[fieldMapping.targetField] = value;
        }

        mappedData.push(mappedRecord);
      }

      logger.info(
        `✅ Mapeo completado: ${mappedData.length} registros mapeados`
      );
      return mappedData;
    } catch (error) {
      logger.error(`Error aplicando mapeo de campos: ${error.message}`);
      throw error;
    }
  }

  /**
   * 🔄 IMPLEMENTADO: Inserta datos mapeados en la tabla destino
   * @param {Array} mappedData - Datos mapeados
   * @param {string} targetTable - Tabla destino
   * @param {Object} connection - Conexión a la base de datos
   * @returns {Promise<Object>} - Resultado de la inserción
   */
  async insertMappedData(mappedData, targetTable, connection) {
    let inserted = 0;
    let errors = 0;
    const errorDetails = [];

    try {
      logger.info(
        `📥 Insertando ${mappedData.length} registros en ${targetTable}`
      );

      for (const [index, record] of mappedData.entries()) {
        try {
          // Construir consulta de inserción
          const fields = Object.keys(record);
          const placeholders = fields.map((field) => `@${field}`).join(", ");

          const insertQuery = `
            INSERT INTO ${targetTable} (${fields.join(", ")})
            VALUES (${placeholders})
          `;

          await SqlService.query(connection, insertQuery, record);
          inserted++;

          if (index % 100 === 0) {
            logger.debug(
              `Progreso: ${index + 1}/${mappedData.length} registros procesados`
            );
          }
        } catch (recordError) {
          errors++;
          const errorMsg = `Error en registro ${index + 1}: ${
            recordError.message
          }`;
          logger.error(errorMsg);
          errorDetails.push({
            index: index + 1,
            record: record,
            error: recordError.message,
          });

          // Si hay demasiados errores, detener
          if (errors > 50) {
            logger.error("Demasiados errores, deteniendo inserción");
            break;
          }
        }
      }

      logger.info(
        `📊 Inserción completada: ${inserted} éxitos, ${errors} errores`
      );

      return {
        inserted,
        errors,
        errorDetails: errorDetails.slice(0, 10), // Solo primeros 10 errores para no saturar logs
      };
    } catch (error) {
      logger.error(`Error general en inserción: ${error.message}`);
      return {
        inserted: 0,
        errors: mappedData.length,
        errorDetails: [{ error: error.message }],
      };
    }
  }

  /**
   * 🔄 IMPLEMENTADO: Obtiene la longitud máxima de una columna
   * @param {Object} connection - Conexión a la base de datos
   * @param {string} columnName - Nombre de la columna
   * @returns {Promise<number>} - Longitud máxima o 0 si no hay límite
   */
  async getColumnMaxLength(connection, columnName) {
    try {
      const query = `
        SELECT CHARACTER_MAXIMUM_LENGTH
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE COLUMN_NAME = @columnName
      `;

      const result = await SqlService.query(connection, query, { columnName });

      if (result.recordset && result.recordset.length > 0) {
        return result.recordset[0].CHARACTER_MAXIMUM_LENGTH || 0;
      }

      return 0;
    } catch (error) {
      logger.warn(
        `Error obteniendo longitud de columna ${columnName}: ${error.message}`
      );
      return 0;
    }
  }

  /**
   * 🔄 IMPLEMENTADO: Formatea fechas para SQL Server
   * @param {Date|string} dateValue - Valor de fecha
   * @returns {string|null} - Fecha formateada o null
   */
  formatSqlDate(dateValue) {
    if (!dateValue) return null;

    try {
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

      // Formato YYYY-MM-DD para SQL Server
      return date.toISOString().split("T")[0];
    } catch (error) {
      logger.warn(`Error formateando fecha ${dateValue}: ${error.message}`);
      return null;
    }
  }

  /**
   * 🔄 IMPLEMENTADO: Obtiene documentos según filtros
   * @param {Object} mapping - Configuración de mapeo
   * @param {Object} filters - Filtros de búsqueda
   * @param {Object} connection - Conexión a la base de datos
   * @returns {Promise<Array>} - Documentos encontrados
   */
  async getDocuments(mapping, filters, connection) {
    try {
      logger.info(
        `🔍 Obteniendo documentos con filtros: ${JSON.stringify(filters)}`
      );

      // Determinar tabla principal
      const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
      if (!mainTable) {
        throw new Error("No se encontró configuración de tabla principal");
      }

      let sourceTable = mainTable.sourceTable;

      // Si hay bonificaciones configuradas, usar esa tabla como fuente
      if (
        mapping.hasBonificationProcessing &&
        mapping.bonificationConfig.sourceTable
      ) {
        sourceTable = mapping.bonificationConfig.sourceTable;
      }

      // Construir consulta base
      let query = `SELECT DISTINCT NUM_PED FROM ${sourceTable} WHERE 1=1`;
      const params = {};

      // Aplicar filtros de fecha
      if (filters.dateFrom) {
        query += ` AND FEC_PED >= @dateFrom`;
        params.dateFrom = new Date(filters.dateFrom);
      }

      if (filters.dateTo) {
        query += ` AND FEC_PED <= @dateTo`;
        params.dateTo = new Date(filters.dateTo);
      }

      // Filtrar por estado si se especifica
      if (filters.status && filters.status !== "all") {
        query += ` AND ESTADO = @status`;
        params.status = filters.status;
      }

      // Filtrar documentos ya procesados
      if (!filters.showProcessed && mapping.markProcessedField) {
        query += ` AND (${mapping.markProcessedField} IS NULL OR ${mapping.markProcessedField} = 0)`;
      }

      // Ordenar y limitar resultados
      query += ` ORDER BY NUM_PED DESC`;

      // Limitar para evitar sobrecarga
      if (filters.limit) {
        query = `SELECT TOP ${filters.limit} ${query.substring(6)}`;
      }

      logger.debug(`Ejecutando consulta de documentos: ${query}`);
      logger.debug(`Parámetros: ${JSON.stringify(params)}`);

      const result = await SqlService.query(connection, query, params);

      const documents = result.recordset || [];
      logger.info(`📋 Encontrados ${documents.length} documentos`);

      return documents;
    } catch (error) {
      logger.error(`Error obteniendo documentos: ${error.message}`);
      throw error;
    }
  }

  /**
   * 🔄 IMPLEMENTADO: Crea una nueva configuración de mapeo
   * @param {Object} mappingData - Datos de la configuración
   * @returns {Promise<Object>} - Configuración creada
   */
  async createMapping(mappingData) {
    try {
      logger.info(
        `🆕 Creando nueva configuración de mapeo: ${mappingData.name}`
      );

      // Validar datos básicos
      if (!mappingData.name) {
        throw new Error("El nombre del mapeo es requerido");
      }

      // Si no hay taskId, crear una tarea básica
      if (!mappingData.taskId) {
        const taskData = {
          name: `Task_${mappingData.name}`,
          type: "manual",
          active: true,
          transferType: mappingData.transferType || "down",
          query: "SELECT 1 as test",
          parameters: [],
          status: "pending",
        };

        const task = new TransferTask(taskData);
        await task.save();
        mappingData.taskId = task._id;
        logger.info(`Tarea automática creada: ${task._id}`);
      }

      // Crear el mapeo
      const mapping = new TransferMapping(mappingData);
      await mapping.save();

      logger.info(`✅ Configuración de mapeo creada: ${mapping._id}`);
      return mapping;
    } catch (error) {
      logger.error(`Error creando mapeo: ${error.message}`);
      throw error;
    }
  }

  /**
   * 🔄 IMPLEMENTADO: Actualiza una configuración de mapeo
   * @param {string} mappingId - ID de la configuración
   * @param {Object} mappingData - Datos actualizados
   * @returns {Promise<Object>} - Configuración actualizada
   */
  async updateMapping(mappingId, mappingData) {
    try {
      logger.info(`🔄 Actualizando configuración de mapeo: ${mappingId}`);

      const mapping = await TransferMapping.findByIdAndUpdate(
        mappingId,
        { ...mappingData, updatedAt: new Date() },
        { new: true }
      );

      if (!mapping) {
        throw new Error(`Configuración ${mappingId} no encontrada`);
      }

      logger.info(`✅ Configuración actualizada: ${mapping.name}`);
      return mapping;
    } catch (error) {
      logger.error(`Error actualizando mapeo: ${error.message}`);
      throw error;
    }
  }

  /**
   * 🔄 IMPLEMENTADO: Obtiene todas las configuraciones de mapeo
   * @returns {Promise<Array>} - Lista de configuraciones
   */
  async getMappings() {
    try {
      logger.info(`📋 Obteniendo todas las configuraciones de mapeo`);

      const mappings = await TransferMapping.find()
        .populate("taskId", "name type status")
        .sort({ name: 1 });

      logger.info(`✅ Obtenidas ${mappings.length} configuraciones`);
      return mappings;
    } catch (error) {
      logger.error(`Error obteniendo mapeos: ${error.message}`);
      throw error;
    }
  }

  /**
   * 🔄 IMPLEMENTADO: Obtiene una configuración de mapeo por ID
   * @param {string} mappingId - ID de la configuración
   * @returns {Promise<Object>} - Configuración de mapeo
   */
  async getMappingById(mappingId) {
    try {
      logger.info(`🔍 Obteniendo configuración de mapeo: ${mappingId}`);

      const mapping = await TransferMapping.findById(mappingId).populate(
        "taskId",
        "name type status query parameters"
      );

      if (!mapping) {
        throw new Error(`Configuración ${mappingId} no encontrada`);
      }

      logger.info(`✅ Configuración obtenida: ${mapping.name}`);
      return mapping;
    } catch (error) {
      logger.error(`Error obteniendo mapeo: ${error.message}`);
      throw error;
    }
  }

  /**
   * 🔄 IMPLEMENTADO: Elimina una configuración de mapeo
   * @param {string} mappingId - ID de la configuración
   * @returns {Promise<boolean>} - true si se eliminó correctamente
   */
  async deleteMapping(mappingId) {
    try {
      logger.info(`🗑️ Eliminando configuración de mapeo: ${mappingId}`);

      // Obtener el mapeo antes de eliminarlo para limpiar dependencias
      const mapping = await TransferMapping.findById(mappingId);

      if (!mapping) {
        throw new Error(`Configuración ${mappingId} no encontrada`);
      }

      // Eliminar execuciones relacionadas
      await TaskExecution.deleteMany({ mappingId: mappingId });
      logger.info(`Eliminadas ejecuciones relacionadas con el mapeo`);

      // Eliminar el mapeo
      await TransferMapping.findByIdAndDelete(mappingId);

      logger.info(`✅ Configuración eliminada: ${mapping.name}`);
      return true;
    } catch (error) {
      logger.error(`Error eliminando mapeo: ${error.message}`);
      throw error;
    }
  }

  /**
   * 🔄 IMPLEMENTADO: Genera consecutivo según configuración local
   * @param {Object} mapping - Configuración de mapeo
   * @returns {Promise<Object>} - { value: number, formatted: string }
   */
  async generateConsecutive(mapping) {
    try {
      if (!mapping.consecutiveConfig || !mapping.consecutiveConfig.enabled) {
        return null;
      }

      logger.info(`🔢 Generando consecutivo para mapeo: ${mapping.name}`);

      // Obtener el último valor usado
      const lastValue = mapping.consecutiveConfig.lastValue || 0;
      const newValue = lastValue + 1;

      // Actualizar inmediatamente para evitar duplicados
      await this.updateLastConsecutive(mapping._id, newValue);

      // Formatear según configuración
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
        formattedValue = `${mapping.consecutiveConfig.prefix}${newValue}`;
      }

      logger.info(`✅ Consecutivo generado: ${formattedValue}`);

      return {
        value: newValue,
        formatted: formattedValue,
        isCentralized: false,
      };
    } catch (error) {
      logger.error(`Error generando consecutivo: ${error.message}`);
      throw error;
    }
  }

  /**
   * 🔄 IMPLEMENTADO: Formatea consecutivo según patrón
   * @param {string} pattern - Patrón de formato (ej: "{PREFIX}{YEAR}{VALUE:6}")
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
    result = result.replace(formatRegex, (match, key, digits) => {
      if (values[key] !== undefined) {
        return String(values[key]).padStart(parseInt(digits, 10), "0");
      }
      return match;
    });

    return result;
  }

  /**
   * 🔄 IMPLEMENTADO: Actualiza el último valor consecutivo
   * @param {string} mappingId - ID de la configuración
   * @param {number} lastValue - Último valor usado
   * @returns {Promise<boolean>} - true si se actualizó
   */
  async updateLastConsecutive(mappingId, lastValue) {
    try {
      // Actualización atómica para evitar condiciones de carrera
      const result = await TransferMapping.findOneAndUpdate(
        {
          _id: mappingId,
          "consecutiveConfig.lastValue": { $lt: lastValue },
        },
        {
          "consecutiveConfig.lastValue": lastValue,
          updatedAt: new Date(),
        },
        { new: true }
      );

      if (result) {
        logger.info(`Consecutivo actualizado para ${mappingId}: ${lastValue}`);
        return true;
      } else {
        logger.debug(
          `Consecutivo no actualizado (valor existente es mayor o igual)`
        );
        return false;
      }
    } catch (error) {
      logger.error(`Error actualizando consecutivo: ${error.message}`);
      return false;
    }
  }

  /**
   * 🔄 IMPLEMENTADO: Procesa dependencias de foreign key
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

    logger.info(
      `🔗 Procesando ${mapping.foreignKeyDependencies.length} dependencias FK`
    );

    // Ordenar dependencias por executionOrder
    const orderedDependencies = [...mapping.foreignKeyDependencies].sort(
      (a, b) => (a.executionOrder || 0) - (b.executionOrder || 0)
    );

    for (const dependency of orderedDependencies) {
      try {
        logger.info(
          `Procesando dependencia: ${dependency.fieldName} -> ${dependency.dependentTable}`
        );

        // Obtener valor del campo que causa la dependencia
        const fieldValue = sourceData[dependency.fieldName];

        if (!fieldValue) {
          logger.warn(
            `Campo ${dependency.fieldName} no tiene valor, omitiendo dependencia`
          );
          continue;
        }

        // Verificar si el registro ya existe
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
              `✅ Registro insertado en ${dependency.dependentTable}`
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
   * 🔄 IMPLEMENTADO: Marca documentos como procesados
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
    try {
      const docArray = Array.isArray(documentIds) ? documentIds : [documentIds];

      if (!mapping.markProcessedField || docArray.length === 0) {
        return {
          success: 0,
          failed: 0,
          message:
            "No hay campo de marcado configurado o documentos para procesar",
        };
      }

      logger.info(
        `📝 Marcando ${docArray.length} documentos como ${
          shouldMark ? "procesados" : "no procesados"
        }`
      );

      // Determinar tabla a actualizar
      const mainTable = mapping.tableConfigs.find((tc) => !tc.isDetailTable);
      if (!mainTable) {
        throw new Error("No se encontró configuración de tabla principal");
      }

      const strategy = mapping.markProcessedStrategy || "individual";

      if (strategy === "batch") {
        return await this.markBatchDocuments(
          docArray,
          mapping,
          mainTable,
          connection,
          shouldMark
        );
      } else {
        return await this.markIndividualDocuments(
          docArray,
          mapping,
          mainTable,
          connection,
          shouldMark
        );
      }
    } catch (error) {
      logger.error(`Error marcando documentos: ${error.message}`);
      throw error;
    }
  }

  /**
   * 🔄 IMPLEMENTADO: Marca documentos individualmente
   * @private
   */
  async markIndividualDocuments(
    documentIds,
    mapping,
    mainTable,
    connection,
    shouldMark
  ) {
    let success = 0;
    let failed = 0;
    const details = [];

    for (const documentId of documentIds) {
      try {
        const updateQuery = `
         UPDATE ${mainTable.sourceTable}
         SET ${mapping.markProcessedField} = @processedValue
         WHERE NUM_PED = @documentId
       `;

        const params = {
          documentId,
          processedValue: shouldMark ? mapping.markProcessedValue : null,
        };

        const result = await SqlService.query(connection, updateQuery, params);

        if (result.rowsAffected > 0) {
          success++;
          details.push({ documentId, success: true });
        } else {
          failed++;
          details.push({
            documentId,
            success: false,
            error: "Documento no encontrado",
          });
        }
      } catch (error) {
        failed++;
        details.push({ documentId, success: false, error: error.message });
        logger.error(
          `Error marcando documento ${documentId}: ${error.message}`
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
   * 🔄 IMPLEMENTADO: Marca documentos en lotes
   * @private
   */
  async markBatchDocuments(
    documentIds,
    mapping,
    mainTable,
    connection,
    shouldMark
  ) {
    try {
      const config = mapping.markProcessedConfig || {};
      const batchSize = config.batchSize || 100;

      let totalSuccess = 0;
      let totalFailed = 0;
      const batchDetails = [];

      // Procesar en lotes
      for (let i = 0; i < documentIds.length; i += batchSize) {
        const batch = documentIds.slice(i, i + batchSize);

        try {
          // Crear placeholders para IN clause
          const placeholders = batch
            .map((_, index) => `@doc${index}`)
            .join(", ");
          const params = {
            processedValue: shouldMark ? mapping.markProcessedValue : null,
          };

          batch.forEach((id, index) => {
            params[`doc${index}`] = id;
          });

          // Construir campos a actualizar
          let updateFields = `${mapping.markProcessedField} = @processedValue`;
          if (config.includeTimestamp && config.timestampField) {
            updateFields += `, ${config.timestampField} = GETDATE()`;
          }

          const updateQuery = `
           UPDATE ${mainTable.sourceTable}
           SET ${updateFields}
           WHERE NUM_PED IN (${placeholders})
         `;

          const result = await SqlService.query(
            connection,
            updateQuery,
            params
          );

          const batchSuccess = result.rowsAffected || 0;
          const batchFailed = batch.length - batchSuccess;

          totalSuccess += batchSuccess;
          totalFailed += batchFailed;

          batchDetails.push({
            batchNumber: Math.floor(i / batchSize) + 1,
            size: batch.length,
            success: batchSuccess,
            failed: batchFailed,
          });

          logger.info(
            `Lote ${Math.floor(i / batchSize) + 1}: ${batchSuccess}/${
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
            `Error en lote ${Math.floor(i / batchSize) + 1}: ${
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
        message: `Marcado en lotes: ${totalSuccess} éxitos, ${totalFailed} fallos`,
      };
    } catch (error) {
      logger.error(`Error en marcado por lotes: ${error.message}`);
      return {
        success: 0,
        failed: documentIds.length,
        strategy: "batch",
        error: error.message,
      };
    }
  }

  /**
   * 🔄 IMPLEMENTADO: Ordena tablas según sus dependencias
   * @param {Array} tableConfigs - Configuraciones de tablas
   * @returns {Array} - Tablas ordenadas por dependencias
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

    logger.info(
      `📋 Orden de ejecución de tablas: ${orderedTables
        .map((t) => t.name)
        .join(" -> ")}`
    );
    return orderedTables;
  }

  /**
   * 🔄 IMPLEMENTADO: Obtiene estadísticas de ejecuciones
   * @param {string} mappingId - ID del mapeo (opcional)
   * @param {Object} filters - Filtros adicionales
   * @returns {Promise<Object>} - Estadísticas
   */
  async getExecutionStats(mappingId = null, filters = {}) {
    try {
      logger.info(`📊 Obteniendo estadísticas de ejecuciones`);

      const matchConditions = {};
      if (mappingId) {
        matchConditions.mappingId = mappingId;
      }

      if (filters.dateFrom || filters.dateTo) {
        matchConditions.startTime = {};
        if (filters.dateFrom) {
          matchConditions.startTime.$gte = new Date(filters.dateFrom);
        }
        if (filters.dateTo) {
          matchConditions.startTime.$lte = new Date(filters.dateTo);
        }
      }

      // Estadísticas básicas
      const totalExecutions = await TaskExecution.countDocuments(
        matchConditions
      );

      const statusStats = await TaskExecution.aggregate([
        { $match: matchConditions },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]);

      // Ejecuciones recientes
      const recentExecutions = await TaskExecution.find(matchConditions)
        .populate("taskId", "name")
        .sort({ startTime: -1 })
        .limit(10);

      // Promedios
      const avgStats = await TaskExecution.aggregate([
        { $match: { ...matchConditions, status: "completed" } },
        {
          $group: {
            _id: null,
            avgExecutionTime: { $avg: "$executionTime" },
            avgProcessedRecords: { $avg: "$successfulRecords" },
            totalProcessedRecords: { $sum: "$successfulRecords" },
          },
        },
      ]);

      const stats = {
        totalExecutions,
        statusBreakdown: statusStats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {}),
        recentExecutions,
        averages: avgStats[0] || {
          avgExecutionTime: 0,
          avgProcessedRecords: 0,
          totalProcessedRecords: 0,
        },
      };

      logger.info(
        `✅ Estadísticas obtenidas: ${totalExecutions} ejecuciones totales`
      );
      return stats;
    } catch (error) {
      logger.error(`Error obteniendo estadísticas: ${error.message}`);
      throw error;
    }
  }

  /**
   * 🔄 IMPLEMENTADO: Valida configuración de mapeo antes de procesar
   * @param {Object} mapping - Configuración de mapeo
   * @returns {Object} - Resultado de validación
   */
  validateMappingConfiguration(mapping) {
    const errors = [];
    const warnings = [];

    try {
      // Validaciones básicas
      if (!mapping.name) {
        errors.push("Nombre del mapeo es requerido");
      }

      if (!mapping.tableConfigs || mapping.tableConfigs.length === 0) {
        errors.push("Al menos una configuración de tabla es requerida");
      }

      // Validar configuración de tablas
      if (mapping.tableConfigs) {
        const mainTables = mapping.tableConfigs.filter(
          (tc) => !tc.isDetailTable
        );
        if (mainTables.length === 0) {
          errors.push("Al menos una tabla principal es requerida");
        }

        mapping.tableConfigs.forEach((tableConfig, index) => {
          if (!tableConfig.name) {
            errors.push(`Tabla ${index + 1}: Nombre es requerido`);
          }

          if (!tableConfig.sourceTable) {
            errors.push(
              `Tabla ${tableConfig.name}: Tabla de origen es requerida`
            );
          }

          if (!tableConfig.targetTable) {
            errors.push(
              `Tabla ${tableConfig.name}: Tabla de destino es requerida`
            );
          }

          if (
            !tableConfig.fieldMappings ||
            tableConfig.fieldMappings.length === 0
          ) {
            warnings.push(
              `Tabla ${tableConfig.name}: No tiene mapeos de campos configurados`
            );
          }
        });
      }

      // Validar configuración de bonificaciones si está habilitada
      if (mapping.hasBonificationProcessing) {
        const bonifValidation = this.validateBonificationConfig(mapping);
        if (!bonifValidation.valid) {
          errors.push(
            ...bonifValidation.errors.map((e) => `Bonificaciones: ${e}`)
          );
        }
      }

      // Validar configuración de consecutivos
      if (mapping.consecutiveConfig && mapping.consecutiveConfig.enabled) {
        if (!mapping.consecutiveConfig.fieldName) {
          warnings.push("Consecutivos: Campo de aplicación no especificado");
        }
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        summary: {
          tablesConfigured: mapping.tableConfigs
            ? mapping.tableConfigs.length
            : 0,
          mainTables: mapping.tableConfigs
            ? mapping.tableConfigs.filter((tc) => !tc.isDetailTable).length
            : 0,
          detailTables: mapping.tableConfigs
            ? mapping.tableConfigs.filter((tc) => tc.isDetailTable).length
            : 0,
          hasBonifications: mapping.hasBonificationProcessing || false,
          hasConsecutives:
            (mapping.consecutiveConfig && mapping.consecutiveConfig.enabled) ||
            false,
        },
      };
    } catch (error) {
      logger.error(`Error validando configuración: ${error.message}`);
      return {
        valid: false,
        errors: [`Error en validación: ${error.message}`],
        warnings: [],
        summary: {},
      };
    }
  }
}

module.exports = new DynamicTransferService();
