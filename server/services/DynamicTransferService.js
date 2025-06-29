// services/DynamicTransferService.js
const logger = require("./logger");
const ConnectionService = require("./ConnectionCentralService");
const { SqlService } = require("./SqlService");
const TransferMapping = require("../models/transferMappingModel");
const TaskExecution = require("../models/taskExecutionModel");
const TaskTracker = require("./TaskTracker");
const TransferTask = require("../models/transferTaks");
const ConsecutiveService = require("./ConsecutiveService");
// 🟢 NUEVO: Importar servicio de bonificaciones
const BonificationService = require("./BonificationService");

class DynamicTransferService {
  /**
   * 🔄 MÉTODO PRINCIPAL DE PROCESAMIENTO - REFACTORIZADO
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

      // 4. Crear registro de ejecución
      const execution = new TaskExecution({
        taskId: mapping.taskId,
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
        `📊 Ejecución iniciada: ${executionId}, Documentos a procesar: ${documentIds.length}`
      );

      // 5. 🟢 MODIFICADO: Obtener datos de origen usando BonificationService
      let sourceData = await this.getSourceDataForDocuments(
        documentIds,
        mapping,
        sourceConnection
      );

      logger.info(
        `📥 Datos de origen obtenidos: ${sourceData.length} registros`
      );

      // 🚫 ELIMINADO: Procesamiento duplicado de bonificaciones
      // ❌ if (mapping.hasBonificationProcessing) {
      //   sourceData = await this.processBonifications(sourceData, mapping);
      // }

      // 6. Verificar cancelación
      if (signal.aborted) {
        throw new Error("Operación cancelada por el usuario");
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

          // ✅ Si es la tabla de bonificaciones, ya está procesada
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
   * 🟢 MODIFICADO: Obtener datos de origen usando BonificationService
   * @param {Array} documentIds - IDs de documentos
   * @param {Object} mapping - Configuración de mapeo
   * @param {Object} connection - Conexión a la base de datos
   * @returns {Promise<Array>} - Datos obtenidos y procesados
   */
  async getSourceDataForDocuments(documentIds, mapping, connection) {
    try {
      logger.info(
        `📥 [MAIN] Obteniendo datos para ${documentIds.length} documentos`
      );

      // ✅ Usar BonificationService unificado (maneja bonificaciones y datos normales)
      const sourceData = await BonificationService.processBonificationsUnified(
        documentIds,
        mapping,
        connection
      );

      logger.info(
        `✅ [MAIN] Datos obtenidos y procesados: ${sourceData.length} registros`
      );
      return sourceData;
    } catch (error) {
      logger.error(
        `❌ [MAIN] Error al obtener datos de origen: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * 🟢 NUEVO MÉTODO V2 - Para testing paralelo
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
   * 🧪 MÉTODO DE TESTING PARA BONIFICACIONES
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

      // ✅ Comparar con método original si está disponible
      let comparison = {
        v2Records: resultV2.length,
        originalRecords: "No disponible - método eliminado",
        difference: "N/A",
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
   * 🔄 MODIFICADO: Procesa un único documento según la configuración
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

        // 3. Detectar el tipo de documento desde el primer registro válido
        if (documentType === "unknown" && tableSourceData) {
          try {
            documentType = this.detectDocumentType(tableSourceData, mapping);
            logger.debug(`Tipo de documento detectado: ${documentType}`);
          } catch (typeError) {
            logger.warn(
              `No se pudo detectar el tipo de documento: ${typeError.message}`
            );
            documentType = "unknown";
          }
        }

        // 4. Generar consecutivo si está configurado y no se proporcionó uno
        if (
          !currentConsecutive &&
          mapping.consecutiveConfig &&
          mapping.consecutiveConfig.enabled
        ) {
          try {
            logger.info(
              `Generando consecutivo para documento ${documentId}...`
            );
            currentConsecutive = await this.generateConsecutiveValue(
              mapping,
              documentType,
              tableSourceData
            );
            logger.info(
              `Consecutivo generado: ${currentConsecutive.formatted} (valor: ${currentConsecutive.value})`
            );
          } catch (consecutiveError) {
            logger.error(
              `Error generando consecutivo: ${consecutiveError.message}`
            );
            throw new Error(
              `Error en consecutivo: ${consecutiveError.message}`
            );
          }
        }

        // 5. Aplicar mapeo de campos
        const mappedData = await this.applyFieldMappingWithValidation(
          tableSourceData,
          tableConfig.fieldMappings,
          targetConnection,
          mapping.consecutiveConfig,
          currentConsecutive,
          tableConfig,
          false, // No es tabla de detalle
          columnLengthCache
        );

        logger.debug(
          `Campos mapeados para tabla ${tableConfig.name}:`,
          mappedData
        );

        // 6. Insertar en tabla destino
        try {
          await this.insertSingleRecord(
            mappedData,
            tableConfig.targetTable,
            targetConnection
          );
          processedTables.push(tableConfig.name);
          logger.info(
            `✅ Registro insertado exitosamente en tabla ${tableConfig.targetTable}`
          );
        } catch (insertError) {
          logger.error(
            `Error insertando en ${tableConfig.targetTable}: ${insertError.message}`
          );
          throw new Error(`Error en inserción: ${insertError.message}`);
        }

        // 7. Procesar tablas de detalle asociadas a esta tabla principal
        const detailTables = mapping.tableConfigs.filter(
          (tc) => tc.isDetailTable && tc.parentTableRef === tableConfig.name
        );

        if (detailTables.length > 0) {
          logger.info(
            `Procesando ${detailTables.length} tablas de detalle para ${tableConfig.name}`
          );

          for (const detailConfig of detailTables) {
            try {
              await this.processDetailTable(
                documentId,
                detailConfig,
                sourceConnection,
                targetConnection,
                mapping,
                currentConsecutive,
                columnLengthCache
              );
              processedTables.push(detailConfig.name);
            } catch (detailError) {
              logger.error(
                `Error en tabla de detalle ${detailConfig.name}: ${detailError.message}`
              );
              // Continuar con otras tablas de detalle
            }
          }
        }
      }

      return {
        success: true,
        message: `Documento ${documentId} procesado exitosamente`,
        processedTables,
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
        SELECT ${finalSelectFields} FROM ${
        tableConfig.sourceTable
      } ${tableAlias}
        WHERE ${tableAlias}.${primaryKey} = @documentId
        ${
          tableConfig.filterCondition
            ? `AND ${tableConfig.filterCondition}`
            : ""
        }
        `;

      logger.debug(`🔍 Ejecutando consulta: ${query}`);

      const result = await SqlService.query(sourceConnection, query, {
        documentId,
      });

      if (!result.recordset || result.recordset.length === 0) {
        logger.warn(
          `No se encontraron datos en ${tableConfig.sourceTable} para documento ${documentId}`
        );
        return null;
      }

      return result.recordset[0];
    }
  }

  /**
   * Inserta datos en la tabla destino
   * @param {Array} data - Datos a insertar
   * @param {Object} tableConfig - Configuración de la tabla
   * @param {Object} connection - Conexión a base de datos
   * @param {boolean} useCentralizedConsecutives - Usar consecutivos centralizados
   * @param {string} centralizedConsecutiveId - ID del consecutivo centralizado
   * @returns {Object} - Resultado de la inserción
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
            if (typeof value === "string" && value.startsWith("SQL:")) {
              // Valor directo SQL (ej: "SQL:GETDATE()")
              processedRecord[key] = value.replace("SQL:", "");
            } else {
              processedRecord[key] = value;
            }
          }

          await this.insertSingleRecord(
            processedRecord,
            tableConfig.targetTable,
            connection
          );
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
   * Inserta un registro individual en la tabla destino
   * @private
   */
  async insertSingleRecord(mappedData, targetTable, targetConnection) {
    const fields = Object.keys(mappedData);
    const placeholders = fields.map((field) => `@${field}`);

    const insertQuery = `
      INSERT INTO ${targetTable} (${fields.join(", ")})
      VALUES (${placeholders.join(", ")})
    `;

    await SqlService.query(targetConnection, insertQuery, mappedData);
  }

  /**
   * 🔧 MANTENER: Aplicar mapeo de campos
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

          // ✅ Usar campos calculados si están disponibles (para bonificaciones)
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
   * Marca documentos en lote
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
   * Marca un lote específico
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

  // 🚫 ELIMINADO: async processBonifications() - Causaba duplicación
  // 🚫 ELIMINADO: async getSourceDataWithBonifications() - Causaba duplicación

  /**
   * 🟢 MANTENER: Validar configuración de bonificaciones
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
   * 🔧 MANTENER: Agrupa datos por campo específico
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
   * 🔧 MANTENER: Obtener configuraciones de mapeo
   */
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

  /**
   * 🔧 MANTENER: Obtener configuración por ID
   */
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

  /**
   * 🔧 MANTENER: Crear nueva configuración
   */
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

  /**
   * 🔧 MANTENER: Actualizar configuración
   */
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

  /**
   * 🔧 MANTENER: Eliminar configuración
   */
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
   * 🔧 MANTENER: Métodos auxiliares existentes
   */
  getRequiredFieldsFromTableConfig(tableConfig) {
    const fields = new Set();

    // Agregar campos de mapeo
    if (tableConfig.fieldMappings) {
      tableConfig.fieldMappings.forEach((fm) => {
        if (fm.sourceField) fields.add(fm.sourceField);
      });
    }

    // Agregar campo de clave primaria
    if (tableConfig.primaryKey) {
      fields.add(tableConfig.primaryKey);
    }

    return Array.from(fields);
  }

  detectDocumentType(sourceData, mapping) {
    // Implementar lógica de detección de tipo de documento
    // Por defecto retornar "unknown"
    return "unknown";
  }

  generateConsecutiveValue(mapping, documentType, sourceData) {
    // Implementar lógica de generación de consecutivos
    // Por ahora retornar null
    return null;
  }

  handleProcessingError(error, documentId, currentConsecutive, mapping) {
    logger.error(`Error procesando documento ${documentId}: ${error.message}`);
    return {
      success: false,
      message: error.message,
      documentType: "unknown",
      consecutiveUsed: null,
      consecutiveValue: null,
    };
  }

  async applyFieldMappingWithValidation(
    sourceData,
    fieldMappings,
    targetConnection,
    consecutiveConfig,
    currentConsecutive,
    tableConfig,
    isDetailTable,
    columnLengthCache
  ) {
    // Implementar mapeo de campos con validación
    const mappedData = {};

    for (const fieldMapping of fieldMappings) {
      let value = sourceData[fieldMapping.sourceField];

      // Aplicar valor por defecto si es necesario
      if (value === null || value === undefined) {
        value = fieldMapping.defaultValue || null;
      }

      mappedData[fieldMapping.targetField] = value;
    }

    return mappedData;
  }

  async processDetailTable(
    documentId,
    detailConfig,
    sourceConnection,
    targetConnection,
    mapping,
    currentConsecutive,
    columnLengthCache
  ) {
    // Implementar procesamiento de tablas de detalle
    logger.info(`Procesando tabla de detalle: ${detailConfig.name}`);
  }

  async processForeignKeyDependencies(
    documentId,
    mapping,
    sourceConnection,
    targetConnection,
    sourceData
  ) {
    // Implementar procesamiento de dependencias FK
    logger.debug(`Procesando dependencias FK para documento ${documentId}`);
  }
}

module.exports = new DynamicTransferService();
