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
   * Ejecuta una consulta SQL y devuelve un conjunto de registros
   * Con manejo mejorado de parámetros undefined
   * @param {Connection} connection - Conexión a SQL Server
   * @param {string} sql - Consulta SQL
   * @param {Object} params - Parámetros para la consulta
   * @returns {Promise<{recordset: Array, rowsAffected: number}>} - Registros obtenidos
   */
  static async query(connection, sql, params = {}) {
    // Sanitizar los parámetros antes de usarlos
    const sanitizedParams = this.sanitizeParams(params);

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

      // Añadir parámetros sanitizados con logs para depuración
      try {
        Object.entries(sanitizedParams).forEach(([name, value]) => {
          // IMPORTANTE: Si el valor es una cadena vacía, conviértelo a null
          if (value === "") {
            value = null;
          }

          let type = this.determineType(value);
          request.addParameter(name, type, value);
        });
      } catch (paramError) {
        console.error(
          `Error al añadir parámetros en consulta: ${sql.substring(0, 100)}...`
        );
        console.error("Parámetros problemáticos:", sanitizedParams);
        console.error("Error específico:", paramError);
        reject(paramError);
        return;
      }

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
   * Versión mejorada con manejo más robusto de tipos
   * @param {any} value - Valor a evaluar
   * @returns {Object} - Tipo de datos de Tedious
   */
  static determineType(value) {
    if (value === null || value === undefined) {
      return TYPES.Null;
    } else if (typeof value === "number") {
      if (Number.isInteger(value)) {
        return TYPES.Int;
      } else {
        return TYPES.Float; // Más seguro que Decimal para valores de punto flotante
      }
    } else if (value instanceof Date) {
      return TYPES.DateTime;
    } else if (typeof value === "boolean") {
      return TYPES.Bit;
    } else if (typeof value === "string") {
      // Determinar si es una fecha en formato de string
      if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
        try {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            return TYPES.DateTime;
          }
        } catch (e) {
          // Si no es una fecha válida, tratarlo como string
        }
      }

      // Evitar enviar strings vacíos, mejor enviar NULL
      if (value.trim() === "") {
        return TYPES.Null;
      }

      return TYPES.NVarChar;
    }

    // Por defecto usar NVarChar
    return TYPES.NVarChar;
  }

  /**
   * Utilidad para validar y sanitizar un registro completo antes de insertarlo
   * @param {Object} record - Registro a validar
   * @param {Array} requiredFields - Campos requeridos (opcional)
   * @returns {Object} - Registro sanitizado
   */
  static validateRecord(record, requiredFields = []) {
    if (!record || typeof record !== "object") {
      throw new Error("El registro debe ser un objeto válido");
    }

    // Verificar campos requeridos
    if (requiredFields.length > 0) {
      const missingFields = requiredFields.filter((field) => {
        const value = record[field];
        return value === undefined || value === null || value === "";
      });

      if (missingFields.length > 0) {
        throw new Error(
          `Campos requeridos faltantes: ${missingFields.join(", ")}`
        );
      }
    }

    // Sanitizar todos los campos
    const sanitized = {};

    for (const [key, value] of Object.entries(record)) {
      // Validaciones específicas por tipo de datos
      if (key.includes("Latitude") || key.includes("Longitude")) {
        // Para coordenadas geográficas
        sanitized[key] =
          value !== undefined && value !== null ? parseFloat(value) : null;
      } else if (key.includes("Date") || key.includes("Time")) {
        // Para fechas
        if (value instanceof Date) {
          sanitized[key] = value;
        } else if (typeof value === "string" && value.trim() !== "") {
          try {
            const date = new Date(value);
            sanitized[key] = !isNaN(date.getTime()) ? date : null;
          } catch (e) {
            sanitized[key] = null;
          }
        } else {
          sanitized[key] = null;
        }
      } else if (typeof value === "number") {
        // Para números
        sanitized[key] = Number.isFinite(value) ? value : 0;
      } else if (typeof value === "string") {
        // Para textos
        sanitized[key] = value.trim();
      } else {
        // Otros tipos (booleanos, null, etc.)
        sanitized[key] = value === undefined ? null : value;
      }
    }

    return sanitized;
  }

  /**
   * Ejecuta una consulta de inserción con validación de datos
   * @param {Connection} connection - Conexión activa a la base de datos
   * @param {string} tableName - Nombre de la tabla
   * @param {Object} record - Datos a insertar
   * @param {Array} requiredFields - Campos obligatorios
   * @returns {Promise<Object>} - Resultado de la inserción
   */
  static async insert(connection, tableName, record, requiredFields = []) {
    // Validar y sanitizar el registro
    const validatedRecord = this.validateRecord(record, requiredFields);

    // Preparar la consulta
    const columns = Object.keys(validatedRecord)
      .map((k) => `[${k}]`)
      .join(", ");
    const paramNames = Object.keys(validatedRecord)
      .map((k) => `@${k}`)
      .join(", ");

    const sql = `
      INSERT INTO ${tableName} (${columns})
      VALUES (${paramNames});
      
      SELECT @@ROWCOUNT AS rowsAffected;
    `;

    // Ejecutar la consulta
    return await this.query(connection, sql, validatedRecord);
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
