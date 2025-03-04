// services/tediousService.js
const { Connection, Request, TYPES } = require("tedious");

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
   * Ejecuta una consulta SQL y devuelve un conjunto de registros
   * @param {Connection} connection - Conexión a SQL Server
   * @param {string} sql - Consulta SQL
   * @param {Object} params - Parámetros para la consulta
   * @returns {Promise<Array>} - Registros obtenidos
   */
  static async query(connection, sql, params = {}) {
    return new Promise((resolve, reject) => {
      const rows = [];

      const request = new Request(sql, (err, rowCount) => {
        if (err) {
          reject(err);
          return;
        }

        resolve({
          recordset: rows,
          rowsAffected: rowCount,
        });
      });

      // Añadir parámetros
      Object.entries(params).forEach(([name, value]) => {
        let type = this.determineType(value);
        request.addParameter(name, type, value);
      });

      // Manejar eventos de filas
      request.on("row", (columns) => {
        const row = {};
        columns.forEach((column) => {
          row[column.metadata.colName] = column.value;
        });
        rows.push(row);
      });

      // Ejecutar la consulta
      connection.execSql(request);
    });
  }

  /**
   * Determina el tipo de datos de Tedious basado en el valor
   * @param {any} value - Valor a evaluar
   * @returns {Object} - Tipo de datos de Tedious
   */
  static determineType(value) {
    if (value === null || value === undefined) {
      return TYPES.Null;
    } else if (typeof value === "number") {
      return Number.isInteger(value) ? TYPES.Int : TYPES.Decimal;
    } else if (value instanceof Date) {
      return TYPES.DateTime;
    } else if (typeof value === "boolean") {
      return TYPES.Bit;
    }
    return TYPES.NVarChar;
  }

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
