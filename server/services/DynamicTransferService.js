const logger = require("./logger");
const ConnectionManager = require("./ConnectionManager");
const { SqlService } = require("./SqlService");
const TransferMapping = require("../models/transferMappingModel");
const TaskExecution = require("../models/taskExecutionModel");
const TaskTracker = require("./TaskTracker");
const TransferTask = require("../models/transferTaks");

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

    let sourceConnection = null;
    let targetConnection = null;
    let executionId = null;
    let mapping = null;
    const startTime = Date.now();

    try {
      // 1. Cargar configuración de mapeo
      mapping = await TransferMapping.findById(mappingId);
      if (!mapping) {
        throw new Error(`Configuración de mapeo ${mappingId} no encontrada`);
      }

      // 2. Registrar en TaskTracker para permitir cancelación
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

      // 3. Crear registro de ejecución
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

      // 4. Establecer conexiones
      const sourceServerName = mapping.sourceServer;
      const targetServerName = mapping.targetServer;

      logger.info(`Estableciendo conexión a ${sourceServerName} (origen)...`);
      const sourceResult = await ConnectionManager.enhancedRobustConnect(
        sourceServerName
      );
      if (!sourceResult.success) {
        throw new Error(
          `No se pudo conectar a ${sourceServerName}: ${
            sourceResult.error?.message || "Error desconocido"
          }`
        );
      }
      sourceConnection = sourceResult.connection;

      logger.info(`Estableciendo conexión a ${targetServerName} (destino)...`);
      const targetResult = await ConnectionManager.enhancedRobustConnect(
        targetServerName
      );
      if (!targetResult.success) {
        throw new Error(
          `No se pudo conectar a ${targetServerName}: ${
            targetResult.error?.message || "Error desconocido"
          }`
        );
      }
      targetConnection = targetResult.connection;

      // 5. Procesar documentos
      const results = {
        processed: 0,
        failed: 0,
        skipped: 0,
        byType: {},
        details: [],
      };

      let hasErrors = false; // Variable para rastrear si hubo errores

      for (let i = 0; i < documentIds.length; i++) {
        // Verificar si se ha cancelado la tarea
        if (signal.aborted) {
          throw new Error("Tarea cancelada por el usuario");
        }

        const documentId = documentIds[i];

        try {
          // Procesar documento
          const docResult = await this.processSingleDocument(
            documentId,
            mapping,
            sourceConnection,
            targetConnection
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

            // Marcar como procesado si está configurado
            if (mapping.markProcessedField) {
              await this.markAsProcessed(documentId, mapping, sourceConnection);
            }
          } else {
            hasErrors = true; // Marcar que hubo errores
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
          if (signal.aborted) {
            throw new Error("Tarea cancelada por el usuario");
          }

          hasErrors = true; // Marcar que hubo errores
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

      // 6. Actualizar registro de ejecución y tarea
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

      TaskTracker.completeTask(cancelTaskId, finalStatus);

      return {
        success: true, // La operación en sí fue exitosa aunque algunos documentos fallaron
        executionId,
        status: finalStatus, // Añadimos el status para que el frontend pueda mostrarlo correctamente
        ...results,
      };
    } catch (error) {
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

      throw error;
    } finally {
      // Cerrar conexiones
      if (sourceConnection) {
        try {
          await ConnectionManager.releaseConnection(sourceConnection);
        } catch (e) {
          logger.error(`Error al cerrar conexión origen: ${e.message}`);
        }
      }

      if (targetConnection) {
        try {
          await ConnectionManager.releaseConnection(targetConnection);
        } catch (e) {
          logger.error(`Error al cerrar conexión destino: ${e.message}`);
        }
      }
    }
  }

  /**
   * Procesa un único documento según la configuración
   * @param {string} documentId - ID del documento
   * @param {Object} mapping - Configuración de mapeo
   * @param {Object} sourceConnection - Conexión a servidor origen
   * @param {Object} targetConnection - Conexión a servidor destino
   * @returns {Promise<Object>} - Resultado del procesamiento
   */
  async processSingleDocument(
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

          targetData[fieldMapping.targetField] = value;
          targetFields.push(fieldMapping.targetField);
          targetValues.push(`@${fieldMapping.targetField}`);
        }

        // 6. Insertar en tabla principal
        const insertQuery = `
        INSERT INTO ${tableConfig.targetTable} (${targetFields.join(", ")})
        VALUES (${targetValues.join(", ")})
      `;

        await SqlService.query(targetConnection, insertQuery, targetData);
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
            const query = `
            SELECT * FROM ${detailConfig.sourceTable} 
            WHERE ${detailConfig.primaryKey || "NUM_PED"} = @documentId
            ${
              detailConfig.filterCondition
                ? ` AND ${detailConfig.filterCondition}`
                : ""
            }
            ORDER BY SECUENCIA
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
              if (
                (value === undefined || value === null) &&
                fieldMapping.defaultValue !== undefined
              ) {
                value = fieldMapping.defaultValue;
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

              detailTargetData[fieldMapping.targetField] = value;
              detailFields.push(fieldMapping.targetField);
              detailValues.push(`@${fieldMapping.targetField}`);
            }

            const insertDetailQuery = `
            INSERT INTO ${detailConfig.targetTable} (${detailFields.join(", ")})
            VALUES (${detailValues.join(", ")})
          `;

            await SqlService.query(
              targetConnection,
              insertDetailQuery,
              detailTargetData
            );
          }

          processedTables.push(detailConfig.name);
        }
      }

      if (processedTables.length === 0) {
        return {
          success: false,
          message: "No se procesó ninguna tabla para este documento",
          documentType,
        };
      }

      return {
        success: true,
        message: `Documento procesado correctamente en ${processedTables.join(
          ", "
        )}`,
        documentType,
        processedTables,
      };
    } catch (error) {
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
        message: `Error: ${error.message}`,
        documentType: "unknown",
        errorDetails: error.stack,
      };
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
}

module.exports = new DynamicTransferService();
