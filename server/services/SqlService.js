// services/SqlService.js - Versión adaptada para usar ConnectionCentralService
const { Request, TYPES } = require("tedious");
const logger = require("./logger");
const fs = require("fs");
const path = require("path");
const ConnectionCentralService = require("./ConnectionCentralService");
const ValidationService = require("./ValidationService");
const Telemetry = require("./Telemetry");
const MemoryManager = require("./MemoryManager");

/**
 * Servicio optimizado para operaciones SQL que usa ConnectionCentralService
 */
class SqlService {
  constructor() {
    logger.info("SqlService inicializado correctamente");
  }

  /**
   * Obtiene los tipos de columnas de una tabla
   * @param {Connection} connection - Conexión a SQL Server
   * @param {string} tableName - Nombre de la tabla
   * @returns {Promise<Object>} - Mapa de columnas a tipos
   */
  async getColumnTypes(connection, tableName) {
    const startTime = Date.now();
    logger.info(
      `Iniciando obtención de tipos de columnas para tabla: ${tableName}`
    );

    try {
      // Limpiar nombre de tabla (quitar esquema y corchetes)
      const cleanTableName = tableName
        .replace(/[\[\]]/g, "")
        .split(".")
        .pop();

      logger.debug(`Nombre de tabla limpio: ${cleanTableName}`);

      const query = `
      SELECT
          c.name AS column_name,
          t.name AS data_type,
          c.max_length,
          c.precision,
          c.scale,
          c.is_nullable
      FROM
          sys.columns c
      JOIN
          sys.types t ON c.user_type_id = t.user_type_id
      JOIN
          sys.tables tbl ON c.object_id = tbl.object_id
      WHERE
          tbl.name = '${cleanTableName}'
      ORDER BY
          c.column_id;
      `;

      logger.debug(
        `Ejecutando consulta de tipos de columnas para: ${cleanTableName}`
      );
      const result = await this.query(connection, query);

      // Convertir resultados en un mapa de tipos
      const typeMap = {};
      for (const col of result.recordset) {
        let sqlType;

        switch (col.data_type.toLowerCase()) {
          case "varchar":
          case "nvarchar":
          case "char":
          case "nchar":
          case "text":
          case "ntext":
            sqlType = TYPES.NVarChar;
            break;
          case "int":
          case "smallint":
          case "tinyint":
            sqlType = TYPES.Int;
            break;
          case "bigint":
            sqlType = TYPES.BigInt;
            break;
          case "decimal":
          case "numeric":
          case "money":
          case "smallmoney":
            sqlType = TYPES.Decimal;
            break;
          case "float":
          case "real":
            sqlType = TYPES.Float;
            break;
          case "bit":
            sqlType = TYPES.Bit;
            break;
          case "datetime":
          case "datetime2":
          case "smalldatetime":
            sqlType = TYPES.DateTime;
            break;
          case "date":
            sqlType = TYPES.Date;
            break;
          case "time":
            sqlType = TYPES.Time;
            break;
          case "uniqueidentifier":
            sqlType = TYPES.UniqueIdentifier;
            break;
          default:
            sqlType = TYPES.NVarChar;
            logger.warn(
              `Tipo de dato no reconocido: ${col.data_type}, usando NVarChar por defecto`
            );
        }

        typeMap[col.column_name] = {
          type: sqlType,
          maxLength: col.max_length,
          precision: col.precision,
          scale: col.scale,
          isNullable: col.is_nullable,
        };
      }

      const duration = Date.now() - startTime;
      logger.info(
        `Tipos de columnas obtenidos exitosamente para ${tableName}. Columnas: ${
          Object.keys(typeMap).length
        }, Tiempo: ${duration}ms`
      );
      logger.debug(`Tipos obtenidos: ${JSON.stringify(Object.keys(typeMap))}`);

      return typeMap;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(
        `Error al obtener tipos de columnas para ${tableName}. Tiempo: ${duration}ms`,
        error
      );
      throw error;
    }
  }

  /**
   * Verifica si una tabla existe en la base de datos
   * @param {Connection} connection - Conexión a SQL Server
   * @param {string} tableName - Nombre de la tabla
   * @returns {Promise<boolean>} - True si existe, false si no
   */
  async tableExists(connection, tableName) {
    logger.info(`Verificando existencia de tabla: ${tableName}`);

    try {
      const cleanTableName = tableName.replace(/[\[\]]/g, "");
      const parts = cleanTableName.split(".");

      let schema = "dbo";
      let table = cleanTableName;

      if (parts.length === 2) {
        schema = parts[0];
        table = parts[1];
      }

      logger.debug(`Verificando tabla - Esquema: ${schema}, Tabla: ${table}`);

      const query = `
        SELECT COUNT(*) as count
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @table
      `;

      const result = await this.query(connection, query, {
        schema: schema,
        table: table,
      });

      const exists = result.recordset[0].count > 0;
      logger.info(`Tabla ${tableName} ${exists ? "existe" : "no existe"}`);

      return exists;
    } catch (error) {
      logger.error(
        `Error al verificar existencia de tabla ${tableName}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Ejecuta una consulta SQL con manejo de conexiones y errores optimizado
   * @param {Connection|string} connection - Conexión a SQL Server o serverKey
   * @param {string} sql - Consulta SQL
   * @param {Object} params - Parámetros (opcional)
   * @param {Object} columnTypes - Tipos de columnas (opcional)
   * @param {Object} transaction - Transacción SQL (opcional)
   * @returns {Promise<Object>} - Resultado de la consulta
   */
  async query(
    connection,
    sql,
    params = {},
    columnTypes = {},
    transaction = null
  ) {
    const queryId = `query_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    const startTime = Date.now();

    logger.info(`[${queryId}] Iniciando ejecución de consulta SQL`);
    logger.debug(
      `[${queryId}] SQL: ${sql.substring(0, 200)}${
        sql.length > 200 ? "..." : ""
      }`
    );
    logger.debug(`[${queryId}] Parámetros: ${JSON.stringify(params)}`);

    let connectionObj = connection;
    let needToRelease = false;
    let serverKey = null;

    // Manejar parámetros opcionales flexibles
    if (typeof columnTypes === "string") {
      // Si el cuarto parámetro es string, es un serverKey
      serverKey = columnTypes;
      columnTypes = {};
    } else if (typeof params === "string" && typeof columnTypes === "object") {
      // Si el tercer parámetro es string, reorganizar parámetros
      serverKey = params;
      params = columnTypes;
      columnTypes = {};
    }

    // Si pasaron un serverKey en lugar de una conexión, obtener la conexión
    if (typeof connection === "string") {
      serverKey = connection;
      logger.debug(
        `[${queryId}] Obteniendo conexión para serverKey: ${serverKey}`
      );
      try {
        connectionObj = await ConnectionCentralService.getConnection(serverKey);
        needToRelease = true; // Necesitamos liberar esta conexión al finalizar
        logger.debug(
          `[${queryId}] Conexión obtenida exitosamente para ${serverKey}`
        );
      } catch (connError) {
        logger.error(
          `[${queryId}] Error al obtener conexión para ${serverKey}:`,
          connError
        );
        throw new Error(
          `Error al obtener conexión para ${serverKey}: ${connError.message}`
        );
      }
    } else if (connection && connection._serverKey) {
      // Si la conexión tiene _serverKey, usarlo para telemetría
      serverKey = connection._serverKey;
      logger.debug(
        `[${queryId}] Usando serverKey de conexión existente: ${serverKey}`
      );
    }

    // Medir tiempo para métricas
    logger.debug(`[${queryId}] Iniciando medición de tiempo de telemetría`);
    Telemetry.startTimer(`query_exec_${Date.now()}`);

    try {
      // Verificar operaciones para gestión de memoria
      logger.debug(`[${queryId}] Registrando operación en MemoryManager`);
      MemoryManager.trackOperation("sql_query");

      // Incrementar contador de operaciones de la conexión
      logger.debug(
        `[${queryId}] Incrementando contador de operaciones de conexión`
      );
      ConnectionCentralService.incrementOperationCount(connectionObj);

      // Sanitizar parámetros
      logger.debug(`[${queryId}] Sanitizando parámetros`);
      const sanitizedParams = this.sanitizeParams(params);
      logger.debug(
        `[${queryId}] Parámetros sanitizados: ${JSON.stringify(
          sanitizedParams
        )}`
      );

      // Registrar métricas
      if (serverKey) {
        logger.debug(
          `[${queryId}] Registrando métricas para serverKey: ${serverKey}`
        );
        Telemetry.trackQuery(serverKey);
      }

      // Ejecutar la consulta
      logger.debug(`[${queryId}] Ejecutando consulta en base de datos`);
      const result = await this.executeQuery(
        connectionObj,
        sql,
        sanitizedParams,
        columnTypes,
        transaction
      );

      const duration = Date.now() - startTime;
      const recordCount = result.recordset ? result.recordset.length : 0;
      const affectedRows = result.rowsAffected || 0;

      logger.info(
        `[${queryId}] Consulta ejecutada exitosamente. Registros: ${recordCount}, Filas afectadas: ${affectedRows}, Tiempo: ${duration}ms`
      );

      // Registrar métricas de performance
      if (duration > 5000) {
        logger.warn(`[${queryId}] Consulta lenta detectada: ${duration}ms`);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(
        `[${queryId}] Error en ejecución de consulta. Tiempo: ${duration}ms`,
        error
      );

      // Registrar error en métricas
      if (serverKey) {
        logger.debug(
          `[${queryId}] Registrando error en métricas para serverKey: ${serverKey}`
        );
        Telemetry.trackQuery(serverKey, true);
      }

      // Registrar detalles del error para diagnóstico
      logger.error(`[${queryId}] SQL problemático: ${sql}`);
      logger.error(
        `[${queryId}] Parámetros problemáticos: ${JSON.stringify(params)}`
      );
      this.logQueryError("execution", sql, params, error);
      throw error;
    } finally {
      // Finalizar medición de tiempo
      logger.debug(`[${queryId}] Finalizando medición de tiempo de telemetría`);
      const queryTime = Telemetry.endTimer(`query_exec_${Date.now()}`);
      if (queryTime > 0) {
        Telemetry.updateAverage("avgQueryTime", queryTime);
        logger.debug(
          `[${queryId}] Tiempo de consulta registrado: ${queryTime}ms`
        );
      }

      // Si obtuvimos la conexión aquí, liberarla
      if (needToRelease && connectionObj) {
        try {
          logger.debug(`[${queryId}] Liberando conexión obtenida`);
          await ConnectionCentralService.releaseConnection(connectionObj);
          logger.debug(`[${queryId}] Conexión liberada exitosamente`);
        } catch (releaseError) {
          logger.warn(
            `[${queryId}] Error al liberar conexión: ${releaseError.message}`
          );
        }
      }

      const totalDuration = Date.now() - startTime;
      logger.debug(
        `[${queryId}] Consulta finalizada. Tiempo total: ${totalDuration}ms`
      );
    }
  }

  /**
   * Implementación interna de ejecución de consulta
   * @param {Connection} connection - Conexión a SQL Server
   * @param {string} sql - Consulta SQL
   * @param {Object} params - Parámetros sanitizados
   * @param {Object} columnTypes - Tipos de columnas (opcional)
   * @param {Object} transaction - Transacción SQL (opcional)
   * @returns {Promise<Object>} - Resultado de la consulta
   */
  executeQuery(connection, sql, params, columnTypes, transaction = null) {
    const requestId = `req_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 5)}`;
    logger.debug(`[${requestId}] Iniciando executeQuery`);

    return new Promise((resolve, reject) => {
      try {
        logger.debug(`[${requestId}] Validando conexión y transacción`);

        // Validar la conexión
        if (!connection && !transaction) {
          logger.error(
            `[${requestId}] Error: La conexión es nula y no hay transacción`
          );
          return reject(new Error("La conexión es nula y no hay transacción"));
        }

        if (!transaction && typeof connection.execSql !== "function") {
          // Proporcionar información detallada para diagnóstico
          const connType = typeof connection;
          const connKeys = Object.keys(connection || {}).join(", ");
          logger.error(
            `[${requestId}] Error: Conexión inválida. Tipo: ${connType}, propiedades: ${connKeys}`
          );
          return reject(
            new Error(
              `La conexión no tiene la función execSql. Tipo: ${connType}, propiedades: ${connKeys}`
            )
          );
        }

        const rows = [];

        logger.debug(`[${requestId}] Creando Request SQL`);
        // Crear la request directamente con la función de callback
        const request = new Request(sql, (err, rowCount) => {
          if (err) {
            logger.error(`[${requestId}] Error en callback de Request:`, err);
            reject(err);
            return;
          }

          logger.debug(
            `[${requestId}] Request completado exitosamente. Filas afectadas: ${rowCount}`
          );
          resolve({
            recordset: rows,
            rowsAffected: rowCount || 0,
          });
        });

        // Configurar parámetros manualmente sin llamar a validateParameters
        logger.debug(
          `[${requestId}] Configurando ${Object.keys(params).length} parámetros`
        );
        for (const [key, value] of Object.entries(params)) {
          try {
            logger.debug(
              `[${requestId}] Procesando parámetro: ${key} = ${value}`
            );

            // Determinar tipo
            let paramType = this.determineType(value);
            let paramValue = value;

            // Si tenemos tipos de columnas explícitos, usarlos
            if (columnTypes && columnTypes[key]) {
              const colType = columnTypes[key];
              paramType = typeof colType === "object" ? colType.type : colType;
              logger.debug(
                `[${requestId}] Usando tipo explícito para ${key}: ${
                  paramType.name || paramType
                }`
              );
            }

            // Validación y conversión de valores problemáticos
            if (paramValue === undefined) {
              paramValue = null;
              paramType = TYPES.Null;
              logger.debug(
                `[${requestId}] Parámetro ${key} convertido de undefined a null`
              );
            } else if (paramValue === "" && paramType !== TYPES.NVarChar) {
              paramValue = null;
              paramType = TYPES.Null;
              logger.debug(
                `[${requestId}] Parámetro ${key} convertido de string vacío a null`
              );
            }

            // Agregar parámetro con manejo de errores robusto
            try {
              request.addParameter(key, paramType, paramValue);
              logger.debug(
                `[${requestId}] Parámetro ${key} agregado exitosamente`
              );
            } catch (paramError) {
              logger.warn(
                `[${requestId}] Error agregando parámetro ${key} con tipo ${
                  paramType.name || paramType
                }, intentando con NVarChar`
              );

              // Intentar con NVarChar como fallback
              const safeValue = paramValue === null ? null : String(value);
              request.addParameter(key, TYPES.NVarChar, safeValue);
              logger.debug(
                `[${requestId}] Parámetro ${key} agregado como NVarChar: ${safeValue}`
              );
            }
          } catch (finalError) {
            logger.error(
              `[${requestId}] Error final al agregar parámetro ${key}:`,
              finalError
            );
            // Si incluso esto falla, propagar el error original
            throw paramError;
          }
        }

        logger.debug(`[${requestId}] Configurando manejo de filas`);
        // Manejar filas
        request.on("row", (columns) => {
          const row = {};

          logger.debug(
            `[${requestId}] Procesando fila. Tipo de columns: ${typeof columns}, Es array: ${Array.isArray(
              columns
            )}`
          );

          // Manejar diferentes formatos de columnas según la versión de Tedious
          if (Array.isArray(columns)) {
            // Formato de versiones anteriores (array de columnas)
            logger.debug(`[${requestId}] Procesando columns como array`);
            columns.forEach((column) => {
              row[column.metadata.colName] = column.value;
            });
          } else if (columns && typeof columns === "object") {
            // Formato de versiones más recientes (objeto con propiedades)
            logger.debug(`[${requestId}] Procesando columns como objeto`);
            Object.entries(columns).forEach(([key, column]) => {
              if (key !== "meta" && column !== undefined) {
                if (column && column.metadata && column.metadata.colName) {
                  row[column.metadata.colName] = column.value;
                } else {
                  row[key] = column;
                }
              }
            });
          }

          // Añadir solo si tiene datos
          if (Object.keys(row).length > 0) {
            rows.push(row);
            logger.debug(
              `[${requestId}] Fila agregada con ${
                Object.keys(row).length
              } campos`
            );
          } else {
            logger.debug(`[${requestId}] Fila vacía omitida`);
          }
        });

        // Configurar manejo de errores
        request.on("error", (err) => {
          logger.error(`[${requestId}] Error en evento de Request:`, err);
          reject(err);
        });

        logger.debug(`[${requestId}] Ejecutando Request SQL`);
        try {
          // Usar la transacción si está disponible, de lo contrario la conexión
          if (transaction) {
            logger.debug(`[${requestId}] Ejecutando con transacción`);
            transaction.execSql(request);
          } else {
            logger.debug(`[${requestId}] Ejecutando con conexión directa`);
            connection.execSql(request);
          }
        } catch (execError) {
          logger.error(`[${requestId}] Error en execSql:`, execError);
          reject(
            new Error(`Error al ejecutar SQL (execSql): ${execError.message}`)
          );
        }
      } catch (error) {
        logger.error(`[${requestId}] Error general en executeQuery:`, error);
        reject(error);
      }
    });
  }

  /**
   * Determina el tipo SQL apropiado para un valor
   * @param {*} value - Valor a analizar
   * @returns {Object} - Tipo SQL correspondiente
   */
  determineType(value) {
    logger.debug(
      `Determinando tipo para valor: ${value} (tipo JS: ${typeof value})`
    );

    if (value === null || value === undefined) {
      logger.debug(`Valor nulo/undefined, retornando TYPES.Null`);
      return TYPES.Null;
    }

    switch (typeof value) {
      case "number":
        if (Number.isInteger(value)) {
          if (value >= -2147483648 && value <= 2147483647) {
            logger.debug(`Número entero (Int): ${value}`);
            return TYPES.Int;
          } else {
            logger.debug(`Número entero grande (BigInt): ${value}`);
            return TYPES.BigInt;
          }
        } else {
          logger.debug(`Número decimal (Float): ${value}`);
          return TYPES.Float;
        }
      case "boolean":
        logger.debug(`Valor booleano (Bit): ${value}`);
        return TYPES.Bit;
      case "object":
        if (value instanceof Date) {
          logger.debug(`Fecha (DateTime): ${value}`);
          return TYPES.DateTime;
        }
        logger.debug(`Objeto convertido a NVarChar: ${value}`);
        return TYPES.NVarChar;
      case "string":
      default:
        logger.debug(`String (NVarChar): ${value}`);
        return value === null ? TYPES.Null : TYPES.NVarChar;
    }

    // Por defecto
    logger.debug(`Tipo por defecto (NVarChar) para: ${value}`);
    return TYPES.NVarChar;
  }

  /**
   * Valida y sanitiza un registro completo
   * @param {Object} record - Registro a validar
   * @returns {Object} - Registro sanitizado
   */
  validateRecord(record) {
    logger.debug(`Validando registro con ${Object.keys(record).length} campos`);
    const sanitized = ValidationService.sanitizeRecord(record);
    logger.debug(`Registro validado y sanitizado exitosamente`);
    return sanitized;
  }

  /**
   * Sanitiza parámetros para consulta SQL
   * @param {Object} params - Parámetros a sanitizar
   * @returns {Object} - Parámetros sanitizados
   */
  sanitizeParams(params) {
    logger.debug(`Sanitizando ${Object.keys(params).length} parámetros`);

    const sanitized = {};
    let nullCount = 0;

    for (const [key, value] of Object.entries(params)) {
      // Convertir undefined o cadenas vacías a null
      if (value === undefined || value === "") {
        sanitized[key] = null;
        nullCount++;
      } else if (typeof value === "string" && value.trim() === "") {
        sanitized[key] = null;
        nullCount++;
      } else {
        sanitized[key] = value;
      }
    }

    logger.debug(
      `Parámetros sanitizados: ${
        Object.keys(sanitized).length
      } total, ${nullCount} convertidos a null`
    );
    return sanitized;
  }

  /**
   * Inserta un registro con tipos explícitos
   * @param {Connection} connection - Conexión a SQL Server
   * @param {string} tableName - Nombre de la tabla
   * @param {Object} record - Datos a insertar
   * @param {Object} columnTypes - Tipos de columnas (opcional)
   * @param {Object} transaction - Transacción SQL (opcional)
   * @returns {Promise<Object>} - Resultado de la operación
   */
  async insertWithExplicitTypes(
    connection,
    tableName,
    record,
    columnTypes = {},
    transaction = null
  ) {
    const insertId = `insert_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 5)}`;
    logger.info(`[${insertId}] Iniciando inserción en tabla: ${tableName}`);
    logger.debug(`[${insertId}] Registro original: ${JSON.stringify(record)}`);

    try {
      // Si pasaron un serverKey en lugar de una conexión, obtener la conexión
      if (typeof connection === "string") {
        const serverKey = connection;
        logger.debug(
          `[${insertId}] Obteniendo conexión para serverKey: ${serverKey}`
        );
        connection = await ConnectionCentralService.getConnection(serverKey);
        logger.debug(`[${insertId}] Conexión obtenida exitosamente`);
      }

      // Validar y sanitizar el registro
      logger.debug(`[${insertId}] Validando y sanitizando registro`);
      const sanitizedRecord = this.validateRecord(record);

      // Asegurar que no haya valores undefined
      Object.keys(sanitizedRecord).forEach((key) => {
        if (sanitizedRecord[key] === undefined) {
          sanitizedRecord[key] = null;
          logger.debug(
            `[${insertId}] Campo ${key} convertido de undefined a null`
          );
        }
      });

      // Aplicar validaciones específicas por tipo de columna
      if (columnTypes && Object.keys(columnTypes).length > 0) {
        logger.debug(
          `[${insertId}] Aplicando validaciones específicas por tipo de columna`
        );
        for (const [key, colType] of Object.entries(columnTypes)) {
          if (sanitizedRecord.hasOwnProperty(key) && colType) {
            if (
              colType.type === TYPES.NVarChar &&
              colType.maxLength &&
              sanitizedRecord[key] &&
              typeof sanitizedRecord[key] === "string"
            ) {
              // Truncar strings que excedan la longitud máxima
              const originalLength = sanitizedRecord[key].length;
              if (originalLength > colType.maxLength) {
                sanitizedRecord[key] = sanitizedRecord[key].substring(
                  0,
                  colType.maxLength
                );
                logger.warn(
                  `[${insertId}] Campo ${key} truncado de ${originalLength} a ${colType.maxLength} caracteres`
                );
              }
            } else if (
              colType.type === TYPES.Bit &&
              sanitizedRecord[key] !== null &&
              sanitizedRecord[key] !== undefined
            ) {
              // Conversión a booleano
              if (typeof sanitizedRecord[key] === "string") {
                const value = sanitizedRecord[key].toLowerCase();
                if (
                  value === "true" ||
                  value === "1" ||
                  value === "yes" ||
                  value === "s" ||
                  value === "y"
                ) {
                  sanitizedRecord[key] = true;
                } else if (
                  value === "false" ||
                  value === "0" ||
                  value === "no" ||
                  value === "n"
                ) {
                  sanitizedRecord[key] = false;
                } else {
                  sanitizedRecord[key] = null;
                }
                logger.debug(
                  `[${insertId}] Campo booleano ${key} convertido a: ${sanitizedRecord[key]}`
                );
              } else if (typeof sanitizedRecord[key] !== "boolean") {
                sanitizedRecord[key] = Boolean(sanitizedRecord[key]);
                logger.debug(
                  `[${insertId}] Campo ${key} convertido a booleano: ${sanitizedRecord[key]}`
                );
              }
            }
          }
        }
      }

      // Preparar la consulta
      logger.debug(`[${insertId}] Preparando consulta INSERT`);
      const columns = Object.keys(sanitizedRecord)
        .map((k) => `[${k}]`)
        .join(", ");

      const paramNames = Object.keys(sanitizedRecord)
        .map((k) => `@${k}`)
        .join(", ");

      const sql = `
      INSERT INTO ${tableName} (${columns})
      VALUES (${paramNames});

      SELECT @@ROWCOUNT AS rowsAffected;
    `;

      // MEJORA: Depuración
      logger.debug(
        `[${insertId}] Consulta de inserción para ${tableName}: ${sql}`
      );
      logger.debug(
        `[${insertId}] Parámetros para inserción en ${tableName}: ${JSON.stringify(
          sanitizedRecord
        )}`
      );

      // Ejecutar la consulta con tipos explícitos
      logger.debug(`[${insertId}] Ejecutando consulta de inserción`);
      const result = await this.query(
        connection,
        sql,
        sanitizedRecord,
        columnTypes,
        transaction
      );

      logger.info(
        `[${insertId}] Inserción completada exitosamente. Filas afectadas: ${result.rowsAffected}`
      );
      return result;
    } catch (error) {
      // MEJORA: Captura detallada de errores
      logger.error(
        `[${insertId}] Error en insertWithExplicitTypes para tabla ${tableName}:`,
        error
      );
      logger.error(`[${insertId}] Detalles del error: ${error.message}`);

      if (error.number) {
        logger.error(`[${insertId}] Código de error SQL: ${error.number}`);
        logger.error(`[${insertId}] Estado SQL: ${error.state || "N/A"}`);
      }

      logger.error(
        `[${insertId}] Registro problemático: ${JSON.stringify(
          record,
          null,
          2
        )}`
      );

      throw error;
    }
  }

  /**
   * Borra todos los registros de una tabla
   * @param {Connection|string} connection - Conexión a SQL Server o serverKey
   * @param {string} tableName - Nombre de la tabla
   * @param {Object} transaction - Transacción SQL (opcional)
   * @returns {Promise<number>} - Número de registros eliminados
   */
  async clearTableData(connection, tableName, transaction = null) {
    const clearId = `clear_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 5)}`;
    logger.info(`[${clearId}] Iniciando limpieza de tabla: ${tableName}`);

    try {
      // Si pasaron un serverKey en lugar de una conexión, obtener la conexión
      let connectionObj = connection;
      if (typeof connection === "string") {
        const serverKey = connection;
        logger.debug(
          `[${clearId}] Obteniendo conexión para serverKey: ${serverKey}`
        );
        connectionObj = await ConnectionCentralService.getConnection(serverKey);
        logger.debug(`[${clearId}] Conexión obtenida exitosamente`);
      }

      // Limpiar el nombre de la tabla
      const cleanTableName = tableName.replace(/[\[\]]/g, "");
      logger.debug(`[${clearId}] Nombre de tabla limpio: ${cleanTableName}`);

      // Verificar si la tabla existe
      logger.debug(`[${clearId}] Verificando existencia de tabla`);
      const tableExists = await this.tableExists(connectionObj, cleanTableName);
      if (!tableExists) {
        logger.error(`[${clearId}] La tabla ${cleanTableName} no existe`);
        throw new Error(`La tabla ${cleanTableName} no existe`);
      }

      // Obtener conteo inicial
      logger.debug(`[${clearId}] Obteniendo conteo inicial de registros`);
      const countQuery = `SELECT COUNT(*) as total FROM ${cleanTableName}`;
      const countResult = await this.query(
        connectionObj,
        countQuery,
        {},
        {},
        transaction
      );
      const initialCount = countResult.recordset[0].total;

      logger.info(
        `[${clearId}] Registros encontrados antes de limpieza: ${initialCount}`
      );

      if (initialCount === 0) {
        logger.info(`[${clearId}] La tabla ya está vacía`);
        return 0;
      }

      // Ejecutar DELETE
      logger.debug(`[${clearId}] Ejecutando DELETE en tabla`);
      const deleteQuery = `DELETE FROM ${cleanTableName}`;
      const result = await this.query(
        connectionObj,
        deleteQuery,
        {},
        {},
        transaction
      );

      const deletedCount = result.rowsAffected || 0;
      logger.info(
        `[${clearId}] Limpieza completada. Registros eliminados: ${deletedCount}`
      );

      return deletedCount;
    } catch (error) {
      logger.error(`[${clearId}] Error al limpiar tabla ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Inicia una nueva transacción en la conexión dada
   * Adaptado para usar ConnectionCentralService
   * @param {Connection|string} connection - Conexión a SQL Server o serverKey
   * @returns {Promise<Object>} - Objeto con conexión y transacción
   */
  async beginTransaction(connection) {
    const transactionId = `trans_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 5)}`;
    logger.info(`[${transactionId}] Iniciando nueva transacción`);

    let connectionObj = connection;
    let needToRelease = false;

    try {
      // Si pasaron un serverKey en lugar de una conexión, obtener la conexión
      if (typeof connection === "string") {
        const serverKey = connection;
        logger.debug(
          `[${transactionId}] Obteniendo conexión para serverKey: ${serverKey}`
        );
        connectionObj = await ConnectionCentralService.getConnection(
          serverKey,
          { useTransaction: true }
        );
        needToRelease = false; // ConnectionCentralService ya maneja la liberación
        logger.debug(`[${transactionId}] Conexión obtenida para transacción`);

        // La conexión ya debería tener la transacción
        if (ConnectionCentralService.activeTransactions.has(connectionObj)) {
          const transaction =
            ConnectionCentralService.activeTransactions.get(connectionObj);
          logger.info(
            `[${transactionId}] Transacción existente encontrada y retornada`
          );
          return { connection: connectionObj, transaction };
        }
      }

      // Usar el servicio centralizado
      logger.debug(
        `[${transactionId}] Creando transacción en ConnectionCentralService`
      );
      const result = await ConnectionCentralService.beginTransaction(
        connectionObj
      );

      logger.info(`[${transactionId}] Transacción creada exitosamente`);
      return result;
    } catch (error) {
      // Si obtuvimos una conexión y hubo error, liberarla
      if (needToRelease && connectionObj) {
        try {
          logger.debug(`[${transactionId}] Liberando conexión debido a error`);
          await ConnectionCentralService.releaseConnection(connectionObj);
        } catch (e) {
          logger.warn(`[${transactionId}] Error al liberar conexión:`, e);
        }
      }

      logger.error(
        `[${transactionId}] Error al iniciar transacción: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Confirma una transacción
   * Adaptado para usar ConnectionCentralService
   * @param {Transaction} transaction - Objeto de transacción
   * @returns {Promise<void>}
   */
  async commitTransaction(transaction) {
    const commitId = `commit_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 5)}`;
    logger.info(`[${commitId}] Iniciando commit de transacción`);

    if (!transaction) {
      logger.error(
        `[${commitId}] Error: Se requiere una transacción válida para confirmar`
      );
      throw new Error("Se requiere una transacción válida para confirmar");
    }

    try {
      logger.debug(
        `[${commitId}] Ejecutando commit en ConnectionCentralService`
      );
      const result = await ConnectionCentralService.commitTransaction(
        transaction
      );
      logger.info(`[${commitId}] Transacción confirmada exitosamente`);
      return result;
    } catch (error) {
      logger.error(`[${commitId}] Error al confirmar transacción:`, error);
      throw error;
    }
  }

  /**
   * Revierte una transacción
   * Adaptado para usar ConnectionCentralService
   * @param {Transaction} transaction - Objeto de transacción
   * @returns {Promise<void>}
   */
  async rollbackTransaction(transaction) {
    const rollbackId = `rollback_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 5)}`;
    logger.info(`[${rollbackId}] Iniciando rollback de transacción`);

    if (!transaction) {
      logger.warn(`[${rollbackId}] No hay transacción para revertir`);
      return;
    }

    try {
      logger.debug(
        `[${rollbackId}] Ejecutando rollback en ConnectionCentralService`
      );
      const result = await ConnectionCentralService.rollbackTransaction(
        transaction
      );
      logger.info(`[${rollbackId}] Transacción revertida exitosamente`);
      return result;
    } catch (error) {
      logger.error(`[${rollbackId}] Error al revertir transacción:`, error);
      throw error;
    }
  }

  /**
   * Registra errores de consulta SQL para análisis posterior
   * @param {string} errorType - Tipo de error
   * @param {string} sql - Consulta SQL
   * @param {Object} params - Parámetros
   * @param {Error} error - Error ocurrido
   */
  logQueryError(errorType, sql, params, error) {
    const errorId = `error_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 5)}`;
    logger.info(`[${errorId}] Registrando error SQL en archivo de log`);

    try {
      const logDir = path.join(process.cwd(), "logs");
      const logPath = path.join(logDir, "sql_errors.log");

      logger.debug(`[${errorId}] Directorio de logs: ${logDir}`);
      logger.debug(`[${errorId}] Archivo de log: ${logPath}`);

      // Crear directorio si no existe
      if (!fs.existsSync(logDir)) {
        logger.debug(`[${errorId}] Creando directorio de logs`);
        fs.mkdirSync(logDir, { recursive: true });
      }

      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] ID: ${errorId}\nError tipo: ${errorType}\nError: ${
        error.message
      }\nSQL: ${sql}\nParámetros: ${JSON.stringify(params)}\nStack: ${
        error.stack
      }\n${"=".repeat(80)}\n\n`;

      fs.appendFile(logPath, logEntry, (err) => {
        if (err) {
          logger.error(`[${errorId}] Error al escribir log de error SQL:`, err);
        } else {
          logger.debug(
            `[${errorId}] Error SQL registrado exitosamente en archivo`
          );
        }
      });
    } catch (logError) {
      logger.error(`[${errorId}] Error al registrar error SQL:`, logError);
    }
  }

  /**
   * Cierra una conexión de forma segura
   * Adaptado para usar ConnectionCentralService
   * @param {Connection} connection - Conexión a cerrar
   */
  async close(connection) {
    const closeId = `close_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 5)}`;
    logger.info(`[${closeId}] Iniciando cierre de conexión`);

    if (!connection) {
      logger.warn(`[${closeId}] No hay conexión para cerrar`);
      return;
    }

    try {
      logger.debug(
        `[${closeId}] Liberando conexión en ConnectionCentralService`
      );
      const result = await ConnectionCentralService.releaseConnection(
        connection
      );
      logger.info(`[${closeId}] Conexión cerrada exitosamente`);
      return result;
    } catch (error) {
      logger.error(`[${closeId}] Error al cerrar conexión:`, error);
      throw error;
    }
  }
}

// Exportar instancia singleton
logger.info("Creando y exportando instancia singleton de SqlService");
module.exports = {
  SqlService: new SqlService(),
};
