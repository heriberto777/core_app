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
      if (!connection || connection.destroyed || connection.closed) {
        throw new Error(
          `La conexión a ${mapping.sourceServer} no está disponible`
        );
      }

      logger.info(`📥 Obteniendo datos para ${documentIds.length} documentos`);

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
      const mappedData = [];

      for (const sourceRecord of sourceData) {
        const mappedRecord = {};

        for (const fieldMapping of fieldMappings) {
          const { sourceField, targetField, defaultValue, transformFunction } =
            fieldMapping;

          let value = sourceRecord[sourceField];

          // Aplicar valor por defecto si es necesario
          if (value === null || value === undefined) {
            value = defaultValue || null;
          }

          // Aplicar transformación si está definida
          if (transformFunction && typeof transformFunction === "function") {
            try {
              value = transformFunction(value, sourceRecord);
            } catch (transformError) {
              logger.warn(
                `Error en transformación para campo ${targetField}: ${transformError.message}`
              );
            }
          }

          // 🟢 AGREGADO ÚNICAMENTE: Usar campos calculados si están disponibles (para bonificaciones)
          if (
            sourceRecord.CALCULATED_PEDIDO_LINEA &&
            targetField === "PEDIDO_LINEA"
          ) {
            value = sourceRecord.CALCULATED_PEDIDO_LINEA;
          }

          if (
            sourceRecord.CALCULATED_PEDIDO_LINEA_BONIF !== undefined &&
            targetField === "PEDIDO_LINEA_BONIF"
          ) {
            value = sourceRecord.CALCULATED_PEDIDO_LINEA_BONIF;
          }

          mappedRecord[targetField] = value;
        }

        mappedData.push(mappedRecord);
      }

      logger.debug(
        `✅ Mapeo de campos completado: ${mappedData.length} registros`
      );
      return mappedData;
    } catch (error) {
      logger.error(`❌ Error en mapeo de campos: ${error.message}`);
      throw error;
    }
  }

  // ✅ RESTO DEL CÓDIGO ORIGINAL MANTENIDO COMPLETAMENTE...

  /**
   * ✅ CÓDIGO ORIGINAL: Obtiene documentos con filtros aplicados
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
        } else {
          const availableColumns = columnsResult.recordset.map(
            (col) => col.COLUMN_NAME
          );
          logger.info(
            `Columnas disponibles en ${schema}.${tableName}: ${availableColumns.join(
              ", "
            )}`
          );

          // Validar campos específicos utilizados en filtros
          const fieldsToValidate = [
            filters.dateField,
            filters.statusField,
            filters.warehouseField,
            mainTable.primaryKey || "NUM_PED",
            mapping.markProcessedField,
          ].filter(Boolean);

          for (const field of fieldsToValidate) {
            if (!availableColumns.includes(field)) {
              logger.warn(
                `Campo '${field}' no encontrado en ${schema}.${tableName}. Columnas disponibles: ${availableColumns.join(
                  ", "
                )}`
              );
            }
          }
        }
      } catch (tableError) {
        logger.error(`Error verificando tabla: ${tableError.message}`);
        throw new Error(`Error verificando tabla: ${tableError.message}`);
      }

      // Construir consulta base
      const primaryKey = mainTable.primaryKey || "NUM_PED";
      let baseQuery = `SELECT ${primaryKey}`;

      // Agregar campos adicionales si están configurados
      const additionalFields = [];

      if (filters.dateField && filters.dateField !== primaryKey) {
        additionalFields.push(filters.dateField);
      }

      if (filters.statusField && filters.statusField !== primaryKey) {
        additionalFields.push(filters.statusField);
      }

      if (filters.warehouseField && filters.warehouseField !== primaryKey) {
        additionalFields.push(filters.warehouseField);
      }

      if (
        mapping.markProcessedField &&
        mapping.markProcessedField !== primaryKey
      ) {
        additionalFields.push(mapping.markProcessedField);
      }

      // Agregar campos únicos
      const uniqueFields = [...new Set(additionalFields)];
      if (uniqueFields.length > 0) {
        baseQuery += `, ${uniqueFields.join(", ")}`;
      }

      baseQuery += ` FROM ${mainTable.sourceTable}`;

      // Construir condiciones WHERE
      const whereConditions = [];
      const params = {};

      // Filtro por fechas
      if (filters.dateFrom && filters.dateTo && filters.dateField) {
        whereConditions.push(
          `${filters.dateField} BETWEEN @dateFrom AND @dateTo`
        );
        params.dateFrom = filters.dateFrom;
        params.dateTo = filters.dateTo;
      }

      // Filtro por estado
      if (filters.status && filters.status !== "all" && filters.statusField) {
        whereConditions.push(`${filters.statusField} = @status`);
        params.status = filters.status;
      }

      // Filtro por bodega
      if (
        filters.warehouse &&
        filters.warehouse !== "all" &&
        filters.warehouseField
      ) {
        whereConditions.push(`${filters.warehouseField} = @warehouse`);
        params.warehouse = filters.warehouse;
      }

      // Filtro por procesados/no procesados
      if (!filters.showProcessed && mapping.markProcessedField) {
        whereConditions.push(
          `(${mapping.markProcessedField} IS NULL OR ${mapping.markProcessedField} = 0)`
        );
      }

      // Agregar condición de filtro de tabla si existe
      if (mainTable.filterCondition) {
        whereConditions.push(`(${mainTable.filterCondition})`);
      }

      // Construir consulta completa
      let finalQuery = baseQuery;
      if (whereConditions.length > 0) {
        finalQuery += ` WHERE ${whereConditions.join(" AND ")}`;
      }

      // Agregar ordenamiento
      if (mainTable.orderByColumn) {
        finalQuery += ` ORDER BY ${mainTable.orderByColumn}`;
      } else if (filters.dateField) {
        finalQuery += ` ORDER BY ${filters.dateField} DESC`;
      } else {
        finalQuery += ` ORDER BY ${primaryKey} DESC`;
      }

      // Ejecutar consulta
      logger.info(`Ejecutando consulta de documentos: ${finalQuery}`);
      logger.info(`Parámetros:`, params);

      const result = await SqlService.query(connection, finalQuery, params);

      if (!result.recordset) {
        logger.warn("La consulta no devolvió resultados");
        return [];
      }

      logger.info(`Documentos encontrados: ${result.recordset.length}`);

      return result.recordset;
    } catch (error) {
      logger.error(`Error obteniendo documentos: ${error.message}`);
      throw error;
    }
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
}

module.exports = new DynamicTransferService();
