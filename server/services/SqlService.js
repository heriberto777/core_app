// services/SqlService.js - Versión adaptada para usar ConnectionCentralService con logging mejorado
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

    try {
      // Iniciar medición de telemetría
      Telemetry.startTimer(`query_exec_${queryId}`);

      // Si pasaron un serverKey en lugar de una conexión, obtener la conexión
      if (typeof connection === "string") {
        const serverKey = connection;
        logger.debug(
          `[${queryId}] Obteniendo conexión para serverKey: ${serverKey}`
        );
        connectionObj = await ConnectionCentralService.getConnection(serverKey);
        needToRelease = true;
        logger.debug(`[${queryId}] Conexión obtenida exitosamente`);
      }

      // Validar parámetros
      const sanitizedParams = this.sanitizeParams(params);
      logger.debug(
        `[${queryId}] Parámetros sanitizados: ${JSON.stringify(
          sanitizedParams
        )}`
      );

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
      logger.error(`[${queryId}] SQL problemático: ${sql}`);
      logger.error(
        `[${queryId}] Parámetros problemáticos: ${JSON.stringify(params)}`
      );

      // Registrar error para análisis
      this.logQueryError("query_execution", sql, params, error);
      throw error;
    } finally {
      // Finalizar medición de tiempo
      const queryTime = Telemetry.endTimer(`query_exec_${queryId}`);
      if (queryTime > 0) {
        Telemetry.updateAverage("avgQueryTime", queryTime);
      }

      // Si obtuvimos la conexión aquí, liberarla
      if (needToRelease && connectionObj) {
        try {
          logger.debug(`[${queryId}] Liberando conexión`);
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

    return new Promise((resolve, reject) => {
      try {
        logger.debug(`[${requestId}] Creando request SQL`);

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

        // Crear la request directamente con la función de callback
        const request = new Request(sql, (err, rowCount) => {
          if (err) {
            logger.error(`[${requestId}] Error en callback de request:`, err);
            reject(err);
            return;
          }

          logger.debug(
            `[${requestId}] Request completado. Filas afectadas: ${rowCount}`
          );
          resolve({
            recordset: rows,
            rowsAffected: rowCount || 0,
          });
        });

        // Configurar parámetros manualmente
        logger.debug(
          `[${requestId}] Configurando parámetros: ${
            Object.keys(params).length
          } parámetros`
        );
        for (const [key, value] of Object.entries(params)) {
          try {
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

            // Agregar parámetro
            request.addParameter(key, paramType, paramValue);
            logger.debug(
              `[${requestId}] Parámetro agregado: ${key} = ${paramValue} (tipo: ${
                paramType.name || paramType
              })`
            );
          } catch (paramError) {
            logger.error(
              `[${requestId}] Error al agregar parámetro ${key}:`,
              paramError
            );
            return reject(
              new Error(
                `Error al agregar parámetro ${key}: ${paramError.message}`
              )
            );
          }
        }

        // Configurar manejo de filas
        request.on("row", (columns) => {
          const row = {};
          columns.forEach((column) => {
            row[column.metadata.colName] = column.value;
          });
          rows.push(row);
        });

        // Configurar manejo de errores
        request.on("error", (err) => {
          logger.error(`[${requestId}] Error en evento de request:`, err);
          reject(err);
        });

        // Ejecutar el request
        logger.debug(`[${requestId}] Ejecutando request SQL`);
        if (transaction) {
          logger.debug(`[${requestId}] Ejecutando con transacción`);
          transaction.execSql(request);
        } else {
          connection.execSql(request);
        }
      } catch (error) {
        logger.error(`[${requestId}] Error al configurar request:`, error);
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
      logger.debug(`Valor nulo/undefined, usando Null`);
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
          logger.debug(`Objeto Date (DateTime): ${value}`);
          return TYPES.DateTime;
        }
        logger.debug(`Objeto (convirtiendo a NVarChar): ${value}`);
        return TYPES.NVarChar;
      case "string":
      default:
        logger.debug(`String o tipo por defecto (NVarChar): ${value}`);
        return value === null ? TYPES.Null : TYPES.NVarChar;
    }
  }

  /**
   * Valida y sanitiza un registro completo
   * @param {Object} record - Registro a validar
   * @returns {Object} - Registro sanitizado
   */
  validateRecord(record) {
    logger.debug(`Validando registro con ${Object.keys(record).length} campos`);
    const sanitized = ValidationService.sanitizeRecord(record);
    logger.debug(`Registro sanitizado exitosamente`);
    return sanitized;
  }

  /**
   * Sanitiza parámetros para consulta SQL
   * @param {Object} params - Parámetros a sanitizar
   * @returns {Object} - Parámetros sanitizados
   */
  sanitizeParams(params) {
    logger.debug(
      `Sanitizando parámetros: ${Object.keys(params).length} parámetros`
    );

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
      } total, ${nullCount} valores nulos`
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
    logger.debug(
      `[${insertId}] Registro a insertar: ${JSON.stringify(record)}`
    );

    try {
      // Si pasaron un serverKey en lugar de una conexión, obtener la conexión
      if (typeof connection === "string") {
        const serverKey = connection;
        logger.debug(
          `[${insertId}] Obteniendo conexión para serverKey: ${serverKey}`
        );
        connection = await ConnectionCentralService.getConnection(serverKey);
      }

      // Validar y sanitizar el registro
      logger.debug(`[${insertId}] Validando y sanitizando registro`);
      const sanitizedRecord = this.validateRecord(record);

      // Asegurar que no haya valores undefined
      Object.keys(sanitizedRecord).forEach((key) => {
        if (sanitizedRecord[key] === undefined) {
          sanitizedRecord[key] = null;
        }
      });

      // Construir la consulta INSERT
      const columns = Object.keys(sanitizedRecord);
      const values = columns.map((col) => `@${col}`);

      const sql = `INSERT INTO ${tableName} (${columns.join(
        ", "
      )}) VALUES (${values.join(", ")})`;

      logger.debug(`[${insertId}] SQL generado: ${sql}`);
      logger.debug(
        `[${insertId}] Parámetros para inserción en ${tableName}: ${JSON.stringify(
          sanitizedRecord
        )}`
      );

      // Ejecutar la consulta con tipos explícitos
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
   * Inicia una nueva transacción
   * Adaptado para usar ConnectionCentralService
   * @param {Connection|string} connection - Conexión a SQL Server o serverKey
   * @returns {Promise<Transaction>} - Objeto de transacción
   */
  async beginTransaction(connection) {
    const transactionId = `trans_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 5)}`;
    logger.info(`[${transactionId}] Iniciando nueva transacción`);

    try {
      // Si pasaron un serverKey en lugar de una conexión, obtener la conexión
      if (typeof connection === "string") {
        const serverKey = connection;
        logger.debug(
          `[${transactionId}] Obteniendo conexión para serverKey: ${serverKey}`
        );
        connection = await ConnectionCentralService.getConnection(serverKey);
      }

      logger.debug(
        `[${transactionId}] Creando transacción en ConnectionCentralService`
      );
      const transaction = await ConnectionCentralService.beginTransaction(
        connection
      );

      logger.info(`[${transactionId}] Transacción iniciada exitosamente`);
      return transaction;
    } catch (error) {
      logger.error(`[${transactionId}] Error al iniciar transacción:`, error);
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

    try {
      if (!transaction) {
        logger.warn(`[${commitId}] No hay transacción para confirmar`);
        return;
      }

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

    try {
      if (!transaction) {
        logger.warn(`[${rollbackId}] No hay transacción para revertir`);
        return;
      }

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

      logger.debug(`[${errorId}] Ruta de log de errores: ${logPath}`);

      // Crear directorio si no existe
      if (!fs.existsSync(logDir)) {
        logger.debug(`[${errorId}] Creando directorio de logs: ${logDir}`);
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
            `[${errorId}] Error SQL registrado en archivo exitosamente`
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

    try {
      if (!connection) {
        logger.warn(`[${closeId}] No hay conexión para cerrar`);
        return;
      }

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
logger.info("Exportando instancia singleton de SqlService");
module.exports = {
  SqlService: new SqlService(),
};
