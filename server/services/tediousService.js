// services/tediousService.js - CORREGIDO
const { Connection, Request, TYPES } = require("tedious");
const fs = require("fs");
const path = require("path");
const logger = require("./logger");
// NUEVO: Importar funciones de dbService
const {
  incrementOperationCount,
  shouldRenewConnection,
  verifyAndRenewConnection,
  enhancedRobustConnect,
  closeConnection,
} = require("./dbService");

/**
 * Clase para gestionar conexiones y operaciones con Tedious de forma directa
 */
class SqlService {
  /**
   * Establece una conexión a SQL Server
   * @param {Object} config - Configuración de conexión
   * @returns {Promise<Connection>} - Conexión establecida
   */
  static async connect(config) {
    return new Promise((resolve, reject) => {
      const connection = new Connection(config);

      connection.on("connect", (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(connection);
      });

      connection.on("error", (err) => {
        reject(err);
      });

      connection.connect();
    });
  }

  /**
   * Borra todos los registros de una tabla antes de insertar
   * @param {Connection} connection - Conexión a la base de datos
   * @param {string} tableName - Nombre de la tabla a limpiar
   * @returns {Promise<number>} - Número de registros eliminados
   */
  static async clearTableData(connection, tableName) {
    try {
      // Limpiar el nombre de la tabla (quitar corchetes si existen)
      const cleanTableName = tableName.replace(/[\[\]]/g, "");

      // Verificar si la tabla existe
      const tableExists = await this.tableExists(connection, cleanTableName);
      if (!tableExists) {
        console.warn(
          `⚠️ La tabla ${cleanTableName} no existe, no se puede borrar`
        );
        return 0;
      }

      // Obtener conteo de registros antes del borrado
      const countSql = `SELECT COUNT(*) AS record_count FROM ${tableName} WITH (NOLOCK)`;
      const countResult = await this.query(connection, countSql);
      const recordCount = countResult.recordset[0]?.record_count || 0;

      // Si no hay registros, no es necesario borrar
      if (recordCount === 0) {
        console.log(
          `Tabla ${cleanTableName} ya está vacía, no se requiere borrado`
        );
        return 0;
      }

      // Ejecutar el borrado
      const deleteSql = `DELETE FROM ${tableName}`;
      const result = await this.query(connection, deleteSql);
      const deletedCount = result.rowsAffected || 0;

      console.log(
        `✅ Borrado completado en ${cleanTableName}: ${deletedCount} registros eliminados`
      );
      return deletedCount;
    } catch (error) {
      console.error(`Error al borrar registros de ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Verifica si una tabla existe en la base de datos
   * @param {Connection} connection - Conexión a la base de datos
   * @param {string} tableName - Nombre de la tabla a verificar
   * @returns {Promise<boolean>} - true si la tabla existe, false en caso contrario
   */
  static async tableExists(connection, tableName) {
    try {
      // Extraer esquema y nombre de tabla
      let schema = "dbo";
      let table = tableName;

      if (tableName.includes(".")) {
        const parts = tableName.replace(/[\[\]]/g, "").split(".");
        schema = parts[0];
        table = parts[1];
      } else {
        // Si no hay esquema, eliminar corchetes si existen
        table = table.replace(/[\[\]]/g, "");
      }

      const sql = `
      SELECT COUNT(*) AS exists_count
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = '${schema}' 
      AND TABLE_NAME = '${table}'
    `;

      const result = await this.query(connection, sql);
      return result.recordset[0].exists_count > 0;
    } catch (error) {
      console.error(
        `Error verificando existencia de tabla ${tableName}:`,
        error
      );
      return false;
    }
  }

  /**
   * Sanitiza un objeto de parámetros para evitar problemas con valores undefined y cadenas vacías
   * @param {Object} params - Objeto de parámetros original
   * @returns {Object} - Objeto de parámetros sanitizado
   */
  static sanitizeParams(params) {
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
   * Ejecuta una consulta SQL con parámetros
   * Implementación mejorada con reconexión automática y reintentos
   * @param {Connection} connection - Conexión a SQL Server
   * @param {string} sql - Consulta SQL
   * @param {Object} params - Parámetros para la consulta
   * @param {string} serverKey - Nombre del servidor (para reconexión)
   * @returns {Promise<Object>} - Resultado de la consulta
   */
  static async query(connection, sql, params = {}, serverKey = null) {
    let retryCount = 0;
    const maxRetries = 3;
    let connectionToUse = connection;

    while (retryCount <= maxRetries) {
      try {
        // Si tenemos serverKey, verificar si debemos renovar la conexión
        if (serverKey && connectionToUse) {
          // Incrementar contador de operaciones
          incrementOperationCount(connectionToUse);

          // Verificar si debemos renovar por número de operaciones
          const renewal = await shouldRenewConnection(
            connectionToUse,
            serverKey
          );
          if (renewal.renewed) {
            connectionToUse = renewal.connection;
            if (!connectionToUse) {
              throw new Error(`No se pudo renovar la conexión a ${serverKey}`);
            }
          }

          // Verificar si la conexión sigue activa
          connectionToUse = await verifyAndRenewConnection(
            connectionToUse,
            serverKey
          );
          if (!connectionToUse) {
            throw new Error(
              `No se pudo verificar o renovar la conexión a ${serverKey}`
            );
          }
        }

        return new Promise((resolve, reject) => {
          const rows = [];
          let rowCount = 0;

          // SOLUCIÓN: Usar un enfoque directo para la sustitución de parámetros
          // en lugar de depender de validateParameters
          let modifiedSql = sql;
          const sanitizedParams = this.sanitizeParams(params);

          try {
            // Reemplazar parámetros en la consulta SQL directamente
            if (Object.keys(sanitizedParams).length > 0) {
              for (const [paramName, paramValue] of Object.entries(
                sanitizedParams
              )) {
                const regex = new RegExp(`@${paramName}\\b`, "g");

                if (paramValue === null || paramValue === undefined) {
                  modifiedSql = modifiedSql.replace(regex, "NULL");
                } else if (typeof paramValue === "string") {
                  // Escapar comillas simples en strings
                  const escapedValue = paramValue.replace(/'/g, "''");
                  modifiedSql = modifiedSql.replace(regex, `'${escapedValue}'`);
                } else if (typeof paramValue === "number") {
                  modifiedSql = modifiedSql.replace(regex, paramValue);
                } else if (typeof paramValue === "boolean") {
                  modifiedSql = modifiedSql.replace(
                    regex,
                    paramValue ? "1" : "0"
                  );
                } else if (paramValue instanceof Date) {
                  // Formatear fechas correctamente para SQL Server
                  const isoString = paramValue.toISOString();
                  const formattedDate = isoString
                    .slice(0, 19)
                    .replace("T", " ");
                  modifiedSql = modifiedSql.replace(
                    regex,
                    `'${formattedDate}'`
                  );
                } else {
                  // Para cualquier otro tipo, convertir a string
                  const stringValue = String(paramValue).replace(/'/g, "''");
                  modifiedSql = modifiedSql.replace(regex, `'${stringValue}'`);
                }
              }
            }

            // Log de la consulta si estamos en desarrollo
            if (process.env.NODE_ENV === "development") {
              logger.debug(
                `SQL Query: ${modifiedSql.slice(0, 1000)}${
                  modifiedSql.length > 1000 ? "..." : ""
                }`
              );
            }

            // Añadir un timeout para la consulta
            const queryTimeout = setTimeout(() => {
              logger.warn(`Timeout en consulta SQL después de 60 segundos`);
              reject(new Error("La consulta SQL superó el tiempo de espera"));
            }, 60000);

            // Crear la solicitud con la consulta ya preparada
            const request = new Request(modifiedSql, (err, rowCount) => {
              clearTimeout(queryTimeout);

              if (err) {
                logger.error(`Error ejecutando consulta SQL: ${err.message}`);
                this.logQueryError(
                  "execution",
                  modifiedSql,
                  sanitizedParams,
                  err
                );
                reject(err);
                return;
              }

              resolve({
                recordset: rows,
                rowsAffected: rowCount || 0,
              });
            });

            // CORRECCIÓN CRÍTICA: Manejar diferentes estructuras de respuesta dependiendo de la versión de Tedious
            request.on("row", (columns) => {
              const row = {};

              // Manejar diferentes formatos dependiendo de la versión de Tedious
              if (Array.isArray(columns)) {
                // Formato de versiones anteriores (array de columnas)
                columns.forEach((column) => {
                  row[column.metadata.colName] = column.value;
                });
              } else if (columns && typeof columns === "object") {
                // Formato de versiones más recientes (objeto con propiedades)
                Object.keys(columns).forEach((key) => {
                  const column = columns[key];
                  if (column && column.metadata && column.metadata.colName) {
                    row[column.metadata.colName] = column.value;
                  } else if (key !== "meta" && column !== undefined) {
                    // Usar el nombre de la propiedad como nombre de columna si no hay metadata
                    row[key] = column;
                  }
                });
              }

              // Solo añadir la fila si tiene propiedades
              if (Object.keys(row).length > 0) {
                rows.push(row);
              } else {
                logger.warn(
                  "Recibida fila en formato inesperado - consultar logs"
                );
                logger.debug(
                  "Estructura de fila recibida: " + JSON.stringify(columns)
                );
              }
            });

            // Manejar errores
            request.on("error", (err) => {
              clearTimeout(queryTimeout);
              logger.error(`Error en request.on('error'): ${err.message}`);
              this.logQueryError(
                "request_error",
                modifiedSql,
                sanitizedParams,
                err
              );
              reject(err);
            });

            // Ejecutar la consulta
            connectionToUse.execSql(request);
          } catch (error) {
            logger.error(`Error en SqlService.query: ${error.message}`);
            this.logQueryError("general", sql, sanitizedParams, error);
            reject(error);
          }
        });
      } catch (error) {
        retryCount++;

        // Si es un error de conexión y tenemos serverKey, intentar reconectar
        if (
          serverKey &&
          (error.message.includes("connection") ||
            error.message.includes("state") ||
            error.message.includes("timeout") ||
            error.message.includes("network"))
        ) {
          logger.warn(
            `Error de conexión en intento ${retryCount}, reconectando a ${serverKey}...`
          );

          // Intentar cerrar la conexión actual
          if (connectionToUse) {
            try {
              await closeConnection(connectionToUse);
            } catch (e) {}
          }

          // Obtener una nueva conexión
          if (retryCount <= maxRetries) {
            const reconnect = await enhancedRobustConnect(serverKey);
            if (reconnect.success) {
              connectionToUse = reconnect.connection;
              logger.info(
                `Reconexión exitosa a ${serverKey} en intento ${retryCount}`
              );
              // Esperar un poco antes de reintentar
              await new Promise((resolve) =>
                setTimeout(resolve, 1000 * retryCount)
              );
              continue;
            }
          }
        }

        // Si hemos alcanzado el máximo de reintentos o no es un error de conexión, propagar el error
        if (retryCount > maxRetries) {
          throw error;
        }

        // Esperar antes de reintentar (con backoff exponencial)
        const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
        logger.debug(
          `Reintentando consulta en ${delay}ms (intento ${retryCount})...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Registra errores de consulta SQL para análisis posterior
   * @param {string} errorType - Tipo de error
   * @param {string} sql - Consulta SQL
   * @param {Object} params - Parámetros
   * @param {Error} error - Error ocurrido
   */
  static logQueryError(errorType, sql, params, error) {
    try {
      const logDir = path.join(process.cwd(), "logs");
      const logPath = path.join(logDir, "sql_errors.log");

      // Crear directorio de logs si no existe
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] Error tipo: ${errorType}\nError: ${
        error.message
      }\nSQL: ${sql}\nParámetros: ${JSON.stringify(params)}\nStack: ${
        error.stack
      }\n\n`;

      fs.appendFile(logPath, logEntry, (err) => {
        if (err) console.error("Error al escribir log de error SQL:", err);
      });
    } catch (logError) {
      console.error("Error al registrar error SQL:", logError);
    }
  }

  // Resto de los métodos de la clase SqlService

  /**
   * Cierra una conexión de forma segura
   * @param {Connection} connection - Conexión a cerrar
   */
  static async close(connection) {
    return new Promise((resolve) => {
      if (connection) {
        connection.close();
      }
      resolve();
    });
  }
}

module.exports = { SqlService };
