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
          case "date":
            sqlType = TYPES.Date;
            break;
          case "datetime":
          case "datetime2":
          case "smalldatetime":
            sqlType = TYPES.DateTime;
            break;
          case "uniqueidentifier":
            sqlType = TYPES.UniqueIdentifier;
            break;
          default:
            sqlType = TYPES.NVarChar; // Tipo predeterminado
        }

        typeMap[col.column_name] = {
          type: sqlType,
          maxLength: col.max_length,
          precision: col.precision,
          scale: col.scale,
          nullable: col.is_nullable,
        };
      }

      const duration = Date.now() - startTime;
      logger.info(
        `Tipos de columnas obtenidos para ${tableName} en ${duration}ms: ${
          Object.keys(typeMap).length
        } columnas`
      );

      return typeMap;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(
        `No se pudieron obtener los tipos de columnas para ${tableName} (${duration}ms): ${error.message}`
      );
      return {}; // Devolver un objeto vacío para continuar funcionando
    }
  }

  /**
   * Determina el tipo SQL basado en el valor
   * @param {any} value - Valor a evaluar
   * @returns {Object} - Tipo Tedious correspondiente
   */
  _getSqlType(value) {
    if (value === null || value === undefined || value === "") {
      return TYPES.NVarChar; // Cambio: usar NVarChar en lugar de Null para mejor compatibilidad
    } else if (typeof value === "number") {
      if (Number.isInteger(value)) {
        return TYPES.Int;
      } else {
        return TYPES.Float;
      }
    } else if (value instanceof Date) {
      return TYPES.DateTime;
    } else if (typeof value === "boolean") {
      return TYPES.Bit;
    } else if (typeof value === "string") {
      // Verificar si es fecha en formato string
      if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
        try {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            return TYPES.DateTime;
          }
        } catch (e) {
          // Ignorar error, tratar como string
        }
      }

      return value.trim() === "" ? TYPES.NVarChar : TYPES.NVarChar;
    }

    // Por defecto
    return TYPES.NVarChar;
  }

  // Método legacy mantenido para compatibilidad
  determineType(value) {
    return this._getSqlType(value);
  }

  /**
   * Valida y sanitiza un registro completo
   * @param {Object} record - Registro a validar
   * @returns {Object} - Registro sanitizado
   */
  validateRecord(record) {
    return ValidationService.sanitizeRecord(record);
  }

  /**
   * Sanitiza parámetros para consulta SQL
   * @param {Object} params - Parámetros a sanitizar
   * @returns {Object} - Parámetros sanitizados
   */
  sanitizeParams(params) {
    const sanitized = {};

    for (const [key, value] of Object.entries(params)) {
      // Convertir undefined o cadenas vacías a null
      if (value === undefined || value === "") {
        sanitized[key] = null;
      } else if (typeof value === "string" && value.trim() === "") {
        sanitized[key] = null;
      } else {
        sanitized[key] = value;
      }
    }

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
    const startTime = Date.now();
    const insertId = `INS-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    try {
      logger.debug(`[${insertId}] Iniciando inserción en ${tableName}`);

      // Si pasaron un serverKey en lugar de una conexión, obtener la conexión
      if (typeof connection === "string") {
        const serverKey = connection;
        connection = await ConnectionCentralService.getConnection(serverKey);
      }

      // Validar y sanitizar el registro
      const sanitizedRecord = this.validateRecord(record);

      // Asegurar que no haya valores undefined
      Object.keys(sanitizedRecord).forEach((key) => {
        if (sanitizedRecord[key] === undefined) {
          sanitizedRecord[key] = null;
        }
      });

      // MEJORA: Asegurar que los tipos de datos sean compatibles
      for (const key in sanitizedRecord) {
        // Conversiones específicas para tipos problemáticos
        if (sanitizedRecord[key] === "") {
          sanitizedRecord[key] = null; // Convertir cadenas vacías a NULL
        }

        // Si hay tipos específicos definidos para esta columna
        if (columnTypes[key] && columnTypes[key].type) {
          const colType = columnTypes[key];

          // Manejo específico por tipo
          if (
            colType.type === TYPES.Int ||
            colType.type === TYPES.SmallInt ||
            colType.type === TYPES.TinyInt ||
            colType.type === TYPES.BigInt
          ) {
            // Conversión segura a número entero
            if (
              sanitizedRecord[key] !== null &&
              sanitizedRecord[key] !== undefined
            ) {
              const numValue = Number(sanitizedRecord[key]);
              sanitizedRecord[key] = isNaN(numValue)
                ? null
                : Math.floor(numValue);
            }
          } else if (
            colType.type === TYPES.Float ||
            colType.type === TYPES.Decimal ||
            colType.type === TYPES.Money ||
            colType.type === TYPES.SmallMoney
          ) {
            // Conversión segura a número decimal
            if (
              sanitizedRecord[key] !== null &&
              sanitizedRecord[key] !== undefined
            ) {
              const numValue = Number(sanitizedRecord[key]);
              sanitizedRecord[key] = isNaN(numValue) ? null : numValue;
            }
          } else if (
            colType.type === TYPES.DateTime &&
            sanitizedRecord[key] !== null &&
            sanitizedRecord[key] !== undefined
          ) {
            // Asegurar que las fechas sean válidas
            try {
              if (typeof sanitizedRecord[key] === "string") {
                const date = new Date(sanitizedRecord[key]);
                if (isNaN(date.getTime())) {
                  sanitizedRecord[key] = null; // Fecha inválida
                  logger.warn(
                    `[${insertId}] Fecha inválida convertida a NULL para campo ${key}: ${sanitizedRecord[key]}`
                  );
                }
              }
            } catch (e) {
              sanitizedRecord[key] = null;
              logger.warn(
                `[${insertId}] Error procesando fecha para campo ${key}: ${e.message}`
              );
            }
          } else if (
            (colType.type === TYPES.NVarChar ||
              colType.type === TYPES.VarChar ||
              colType.type === TYPES.Char ||
              colType.type === TYPES.NChar) &&
            sanitizedRecord[key] !== null &&
            sanitizedRecord[key] !== undefined
          ) {
            // Asegurar que los strings tengan la longitud correcta
            if (typeof sanitizedRecord[key] !== "string") {
              // Convertir a string si no lo es
              sanitizedRecord[key] = String(sanitizedRecord[key]);
            }

            // Truncar según maxLength si está definido
            if (
              colType.maxLength &&
              colType.maxLength > 0 &&
              sanitizedRecord[key].length > colType.maxLength
            ) {
              const originalLength = sanitizedRecord[key].length;
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
            } else if (typeof sanitizedRecord[key] !== "boolean") {
              sanitizedRecord[key] = Boolean(sanitizedRecord[key]);
            }
          }
        }
      }

      // Preparar la consulta
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

      logger.debug(
        `[${insertId}] Consulta de inserción para ${tableName}:`,
        sql
      );
      logger.debug(
        `[${insertId}] Parámetros:`,
        JSON.stringify(sanitizedRecord)
      );

      // Ejecutar la consulta con tipos explícitos
      const result = await this.query(
        connection,
        sql,
        sanitizedRecord,
        columnTypes,
        transaction
      );

      const duration = Date.now() - startTime;
      logger.debug(`[${insertId}] Inserción completada en ${duration}ms`);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(
        `[${insertId}] Error en insertWithExplicitTypes para tabla ${tableName} (${duration}ms):`,
        error
      );
      logger.error(`[${insertId}] Detalles del error: ${error.message}`);

      if (error.number) {
        logger.error(`[${insertId}] Código de error SQL: ${error.number}`);
        logger.error(`[${insertId}] Estado SQL: ${error.state || "N/A"}`);
      }

      logger.error(
        `[${insertId}] Registro problemático:`,
        JSON.stringify(record, null, 2)
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
    try {
      // Si pasaron un serverKey en lugar de una conexión, obtener la conexión
      let connectionObj = connection;
      if (typeof connection === "string") {
        const serverKey = connection;
        connectionObj = await ConnectionCentralService.getConnection(serverKey);
      }

      // Limpiar el nombre de la tabla
      const cleanTableName = tableName.replace(/[\[\]]/g, "");

      // Verificar si la tabla existe
      const tableExists = await this.tableExists(connectionObj, cleanTableName);
      if (!tableExists) {
        throw new Error(`La tabla ${cleanTableName} no existe`);
      }

      // Obtener conteo antes del borrado
      const countSql = `SELECT COUNT(*) AS record_count FROM ${tableName} WITH (NOLOCK)`;
      const countResult = await this.query(
        connectionObj,
        countSql,
        {},
        null,
        transaction
      );
      const recordCount = countResult.recordset[0]?.record_count || 0;

      // Si no hay registros, no es necesario borrar
      if (recordCount === 0) {
        logger.info(
          `Tabla ${cleanTableName} ya está vacía, no se requiere borrado`
        );
        return 0;
      }

      // Ejecutar borrado
      const deleteSql = `DELETE FROM ${tableName}`;
      const result = await this.query(
        connectionObj,
        deleteSql,
        {},
        null,
        transaction
      );
      const deletedCount = result.rowsAffected || 0;

      logger.info(
        `Borrado completado en ${cleanTableName}: ${deletedCount} registros eliminados`
      );
      return deletedCount;
    } catch (error) {
      logger.error(
        `Error al borrar registros de la tabla ${tableName}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Verifica si una tabla existe
   * @param {Connection|string} connection - Conexión a SQL Server o serverKey
   * @param {string} tableName - Nombre de la tabla
   * @returns {Promise<boolean>} - true si existe
   */
  async tableExists(connection, tableName) {
    try {
      // Si pasaron un serverKey en lugar de una conexión, obtener la conexión
      let connectionObj = connection;
      if (typeof connection === "string") {
        const serverKey = connection;
        connectionObj = await ConnectionCentralService.getConnection(serverKey);
      }

      // Extraer esquema y nombre
      let schema = "dbo";
      let table = tableName;

      if (tableName.includes(".")) {
        const parts = tableName.replace(/[\[\]]/g, "").split(".");
        schema = parts[0];
        table = parts[1];
      } else {
        table = table.replace(/[\[\]]/g, "");
      }

      const sql = `
        SELECT COUNT(*) AS exists_count
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = '${schema}'
        AND TABLE_NAME = '${table}'
      `;

      const result = await this.query(connectionObj, sql);
      return result.recordset[0].exists_count > 0;
    } catch (error) {
      logger.error(
        `Error verificando existencia de tabla ${tableName}:`,
        error
      );
      return false;
    }
  }

  /**
   * Ejecuta una consulta SQL con manejo mejorado de errores y reintentos para AggregateError
   * @param {Connection|string} connection - Conexión a SQL Server o serverKey
   * @param {string} sql - Consulta SQL
   * @param {Object} params - Parámetros para la consulta (opcional)
   * @param {Object|string} columnTypesOrServerKey - Tipos de columnas o clave de servidor
   * @param {Object} transaction - Transacción SQL (opcional)
   * @returns {Promise<Object>} - Resultado de la consulta
   */
  async query(
    connection,
    sql,
    params = {},
    columnTypesOrServerKey = null,
    transaction = null
  ) {
    let serverKey = null;
    let columnTypes = null;
    let connectionObj = connection;
    let needToRelease = false;

    // Determinar si el 4º parámetro es serverKey o columnTypes
    if (typeof columnTypesOrServerKey === "string") {
      serverKey = columnTypesOrServerKey;
    } else if (
      columnTypesOrServerKey &&
      typeof columnTypesOrServerKey === "object"
    ) {
      columnTypes = columnTypesOrServerKey;
    }

    // Si pasaron un serverKey en lugar de una conexión, obtener la conexión
    if (typeof connection === "string") {
      serverKey = connection;
      try {
        connectionObj = await ConnectionCentralService.getConnection(serverKey);
        needToRelease = true; // Necesitamos liberar esta conexión al finalizar
      } catch (connError) {
        throw new Error(
          `Error al obtener conexión para ${serverKey}: ${connError.message}`
        );
      }
    } else if (connection && connection._serverKey) {
      // Si la conexión tiene _serverKey, usarlo para telemetría
      serverKey = connection._serverKey;
    }

    // NUEVO: Ejecutar con reintentos para AggregateError
    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount <= maxRetries) {
      try {
        return await this._executeQueryWithRetries(
          connectionObj,
          sql,
          params,
          columnTypes,
          transaction,
          serverKey,
          needToRelease
        );
      } catch (error) {
        retryCount++;

        logger.error(`Query attempt ${retryCount}/${maxRetries + 1} failed:`, {
          message: error.message,
          code: error.code,
          name: error.name,
          isAggregateError: error.name === "AggregateError",
        });

        // NUEVO: Manejo específico para AggregateError
        if (
          error.name === "AggregateError" ||
          error.message?.includes("AggregateError") ||
          error.code === "ECONNRESET" ||
          error.code === "ETIMEOUT"
        ) {
          if (retryCount <= maxRetries) {
            const delay = Math.min(2000 * Math.pow(2, retryCount - 1), 10000); // Backoff exponencial
            logger.info(
              `Waiting ${delay}ms before retry ${
                retryCount + 1
              } due to AggregateError`
            );

            // Marcar conexión como no saludable
            if (connectionObj) {
              connectionObj._isHealthy = false;
            }

            await new Promise((resolve) => setTimeout(resolve, delay));

            // Intentar obtener nueva conexión si la actual falló
            if (
              needToRelease &&
              connectionObj &&
              connectionObj._isHealthy === false &&
              serverKey
            ) {
              try {
                logger.info(
                  `Getting new connection for retry ${retryCount + 1}`
                );

                // Liberar conexión problemática
                await ConnectionCentralService.releaseConnection(connectionObj);

                // Obtener nueva conexión
                connectionObj = await ConnectionCentralService.getConnection(
                  serverKey,
                  { timeout: 30000 }
                );
                logger.info(
                  `New connection obtained for retry ${retryCount + 1}`
                );
              } catch (connectionError) {
                logger.error(
                  `Error getting new connection for retry:`,
                  connectionError
                );

                if (retryCount > maxRetries) {
                  throw error; // Lanzar error original si no quedan reintentos
                }
                continue; // Continuar con la siguiente iteración
              }
            }

            continue; // Reintentar con la nueva conexión
          }
        }

        // Para otros tipos de error, lanzar inmediatamente
        if (retryCount > maxRetries) {
          logger.error(`All retries exhausted. Final error:`, error);
          throw error;
        }

        // Pausa breve para otros errores antes de reintentar
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  /**
   * Ejecuta una consulta SQL con manejo robusto de AggregateError
   * @private
   */
  async _executeQueryWithRetries(
    connectionObj,
    sql,
    params,
    columnTypes,
    transaction,
    serverKey,
    needToRelease
  ) {
    const queryId = `Q-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    const startTime = Date.now();

    // Medir tiempo para métricas
    Telemetry.startTimer(`query_exec_${queryId}`);

    try {
      logger.debug(
        `[${queryId}] Iniciando consulta SQL${
          serverKey ? ` en ${serverKey}` : ""
        }`
      );

      // Verificar operaciones para gestión de memoria
      MemoryManager.trackOperation("sql_query");

      // Incrementar contador de operaciones de la conexión
      if (connectionObj) {
        ConnectionCentralService.incrementOperationCount(connectionObj);
      }

      // Sanitizar parámetros
      const sanitizedParams = this.sanitizeParams(params);

      // Registrar métricas
      if (serverKey) {
        Telemetry.trackQuery(serverKey);
      }

      // Verificar estado de la conexión antes de usar
      if (connectionObj && connectionObj._isHealthy === false) {
        throw new Error("Connection marked as unhealthy");
      }

      // Ejecutar la consulta
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
      logger.error(
        `[${queryId}] SQL problemático: ${sql.substring(0, 200)}...`
      );
      logger.error(
        `[${queryId}] Parámetros problemáticos: ${JSON.stringify(params)}`
      );
      this.logQueryError("execution", sql, params, error);
      throw error;
    } finally {
      // Finalizar medición de tiempo
      logger.debug(`[${queryId}] Finalizando medición de tiempo de telemetría`);
      const queryTime = Telemetry.endTimer(`query_exec_${queryId}`);
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
   * Implementación interna de ejecución de consulta mejorada para AggregateError
   * @param {Connection} connection - Conexión a SQL Server
   * @param {string} sql - Consulta SQL
   * @param {Object} params - Parámetros sanitizados
   * @param {Object} columnTypes - Tipos de columnas (opcional)
   * @param {Object} transaction - Transacción SQL (opcional)
   * @returns {Promise<Object>} - Resultado de la consulta
   */
  executeQuery(connection, sql, params, columnTypes, transaction = null) {
    return new Promise((resolve, reject) => {
      try {
        // Validar la conexión
        if (!connection && !transaction) {
          return reject(new Error("La conexión es nula y no hay transacción"));
        }

        if (!transaction && typeof connection.execSql !== "function") {
          // Proporcionar información detallada para diagnóstico
          const connType = typeof connection;
          const connKeys = Object.keys(connection || {}).join(", ");
          return reject(
            new Error(
              `La conexión no tiene la función execSql. Tipo: ${connType}, propiedades: ${connKeys}`
            )
          );
        }

        const rows = [];

        // Crear la request directamente con la función de callback
        const request = new Request(sql, (err, rowCount) => {
          if (err) {
            // NUEVO: Manejo específico para AggregateError en el callback
            if (err.name === "AggregateError") {
              logger.error(`AggregateError en callback de Request:`, {
                message: err.message,
                code: err.code,
                originalErrors: err.errors || [],
                sql: sql.substring(0, 200) + "...",
              });

              if (Telemetry && typeof Telemetry.trackError === "function") {
                Telemetry.trackError("query_execsql_aggregate_error", {
                  sqlPreview: sql.substring(0, 100),
                });
              }
            }

            reject(err);
            return;
          }

          resolve({
            recordset: rows,
            rowsAffected: rowCount || 0,
          });
        });

        // NUEVO: Configurar timeouts específicos en el request para AggregateError
        request.setTimeout(120000); // 2 minutos

        // Configurar parámetros manualmente sin llamar a validateParameters
        for (const [key, value] of Object.entries(params)) {
          try {
            // Determinar tipo
            let paramType = this._getSqlType(value);
            let paramValue = value;

            // Si tenemos tipos de columnas explícitos, usarlos
            if (columnTypes && columnTypes[key]) {
              const colType = columnTypes[key];
              paramType = typeof colType === "object" ? colType.type : colType;

              // Sanitizar según el tipo
              if (paramValue !== null && paramValue !== undefined) {
                // Truncar strings si exceden maxLength
                if (
                  paramType === TYPES.NVarChar &&
                  typeof paramValue === "string" &&
                  colType.maxLength &&
                  paramValue.length > colType.maxLength
                ) {
                  paramValue = paramValue.substring(0, colType.maxLength);
                }
              }
            }

            // Manejo específico para el literal "NULL"
            if (paramValue === "NULL") {
              paramValue = null;
            }

            // Manejo específico para valores null mejorado para AggregateError
            if (paramValue === null) {
              // Para los valores null, usar un tipo específico en lugar de Null general
              // Esto es clave - algunos controladores no manejan bien TYPES.Null

              // Si tenemos el tipo de columna, usar ese tipo para el null
              if (columnTypes && columnTypes[key] && columnTypes[key].type) {
                request.addParameter(key, columnTypes[key].type, null);
              } else {
                // De lo contrario, usar NVarChar como tipo seguro para null
                request.addParameter(key, TYPES.NVarChar, null);
              }
            } else {
              // Para valores no nulos, añadir normalmente
              request.addParameter(key, paramType, paramValue);
            }
          } catch (paramError) {
            logger.error(
              `Error al añadir parámetro ${key}: ${paramError.message}`
            );
            // Intentar una última alternativa segura
            try {
              // Convertir cualquier valor a string como último recurso
              const safeValue =
                value === null || value === undefined ? null : String(value);
              request.addParameter(key, TYPES.NVarChar, safeValue);
            } catch (finalError) {
              // Si incluso esto falla, propagar el error original
              throw paramError;
            }
          }
        }

        // NUEVO: Manejar eventos específicos del request para AggregateError
        request.on("error", (err) => {
          if (err.name === "AggregateError") {
            logger.error(`AggregateError en request event:`, err);

            if (Telemetry && typeof Telemetry.trackError === "function") {
              Telemetry.trackError("query_execsql_aggregate_error", {
                sqlPreview: sql.substring(0, 100),
              });
            }
          }
        });

        // Manejar filas
        request.on("row", (columns) => {
          const row = {};

          // Manejar diferentes formatos de columnas según la versión de Tedious
          if (Array.isArray(columns)) {
            // Formato de versiones anteriores (array de columnas)
            columns.forEach((column) => {
              row[column.metadata.colName] = column.value;
            });
          } else if (columns && typeof columns === "object") {
            // Formato de versiones más recientes (objeto con propiedades)
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
          }
        });

        try {
          // Usar la transacción si está disponible, de lo contrario la conexión
          if (transaction) {
            transaction.execSql(request);
          } else {
            connection.execSql(request);
          }
        } catch (execError) {
          // NUEVO: Manejo específico para AggregateError en execSql
          if (execError.name === "AggregateError") {
            logger.error(`AggregateError en execSql:`, execError);

            if (Telemetry && typeof Telemetry.trackError === "function") {
              Telemetry.trackError("query_execsql_aggregate_error", {
                sqlPreview: sql.substring(0, 100),
              });
            }
          }

          reject(
            new Error(`Error al ejecutar SQL (execSql): ${execError.message}`)
          );
        }
      } catch (error) {
        // NUEVO: Manejo específico para AggregateError en el catch general
        if (error.name === "AggregateError") {
          logger.error(`AggregateError en executeQuery:`, error);

          if (Telemetry && typeof Telemetry.trackError === "function") {
            Telemetry.trackError("query_execsql_aggregate_error", {
              sqlPreview: sql.substring(0, 100),
            });
          }
        }

        reject(error);
      }
    });
  }

  /**
   * Inicia una nueva transacción en la conexión dada
   * Adaptado para usar ConnectionCentralService
   * @param {Connection|string} connection - Conexión a SQL Server o serverKey
   * @returns {Promise<Object>} - Objeto con conexión y transacción
   */
  async beginTransaction(connection) {
    let connectionObj = connection;
    let needToRelease = false;

    try {
      // Si pasaron un serverKey en lugar de una conexión, obtener la conexión
      if (typeof connection === "string") {
        const serverKey = connection;
        connectionObj = await ConnectionCentralService.getConnection(
          serverKey,
          { useTransaction: true }
        );
        needToRelease = false; // ConnectionCentralService ya maneja la liberación

        // La conexión ya debería tener la transacción
        if (ConnectionCentralService.activeTransactions.has(connectionObj)) {
          const transaction =
            ConnectionCentralService.activeTransactions.get(connectionObj);
          return { connection: connectionObj, transaction };
        }
      }

      // Usar el servicio centralizado
      const result = await ConnectionCentralService.beginTransaction(
        connectionObj
      );
      return result;
    } catch (error) {
      // Si obtuvimos una conexión y hubo error, liberarla
      if (needToRelease && connectionObj) {
        try {
          await ConnectionCentralService.releaseConnection(connectionObj);
        } catch (e) {
          // Ignorar error al liberar
        }
      }

      logger.error(`Error al iniciar transacción: ${error.message}`);
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
    if (!transaction) {
      throw new Error("Se requiere una transacción válida para confirmar");
    }

    return ConnectionCentralService.commitTransaction(transaction);
  }

  /**
   * Revierte una transacción
   * Adaptado para usar ConnectionCentralService
   * @param {Transaction} transaction - Objeto de transacción
   * @returns {Promise<void>}
   */
  async rollbackTransaction(transaction) {
    if (!transaction) return;

    return ConnectionCentralService.rollbackTransaction(transaction);
  }

  /**
   * Registra errores de consulta SQL para análisis posterior
   * @param {string} errorType - Tipo de error
   * @param {string} sql - Consulta SQL
   * @param {Object} params - Parámetros
   * @param {Error} error - Error ocurrido
   */
  logQueryError(errorType, sql, params, error) {
    try {
      const logDir = path.join(process.cwd(), "logs");
      const logPath = path.join(logDir, "sql_errors.log");

      // Crear directorio si no existe
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] Error tipo: ${errorType}\nError: ${
        error.message
      }\nSQL: ${sql}\nParámetros: ${JSON.stringify(params)}\nStack: ${
        error.stack
      }\n`;

      // NUEVO: Añadir información específica de AggregateError
      if (error.name === "AggregateError") {
        const aggregateInfo = `AggregateError Details:\n- Code: ${
          error.code
        }\n- Original Errors: ${JSON.stringify(error.errors || [])}\n`;
        const finalEntry = logEntry + aggregateInfo + "\n";

        fs.appendFile(logPath, finalEntry, (err) => {
          if (err) logger.error("Error al escribir log de error SQL:", err);
        });
      } else {
        fs.appendFile(logPath, logEntry + "\n", (err) => {
          if (err) logger.error("Error al escribir log de error SQL:", err);
        });
      }
    } catch (logError) {
      logger.error("Error al registrar error SQL:", logError);
    }
  }

  /**
   * Cierra una conexión de forma segura
   * Adaptado para usar ConnectionCentralService
   * @param {Connection} connection - Conexión a cerrar
   */
  async close(connection) {
    if (!connection) return;

    return await ConnectionCentralService.releaseConnection(connection);
  }
}

// Exportar instancia singleton
module.exports = {
  SqlService: new SqlService(),
};
