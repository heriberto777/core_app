// services/tediousService.js
const { Connection, Request, TYPES } = require("tedious");
const fs = require("fs");
const path = require("path");

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
   * Ejecuta una consulta SQL evitando los problemas de validación de parámetros
   * @param {Connection} connection - Conexión a SQL Server
   * @param {string} sql - Consulta SQL
   * @param {Object} params - Parámetros para la consulta
   * @param {Object} paramTypes - Tipos explícitos para los parámetros (opcional)
   * @returns {Promise<Object>} - Resultado de la consulta
   */
  static async query(connection, sql, params = {}, paramTypes = {}) {
    // Sanitizar los parámetros
    const sanitizedParams = this.sanitizeParams(params);

    return new Promise((resolve, reject) => {
      const rows = [];

      // SOLUCIÓN CLAVE: Crear la consulta con manejo especial para evitar validación
      let modifiedSql = sql;

      try {
        // Reemplazar parámetros en la consulta directamente en lugar de usar la validación
        // de Tedious que está causando problemas
        if (Object.keys(sanitizedParams).length > 0) {
          // Construir los valores de parámetros directamente en la consulta SQL
          for (const [name, value] of Object.entries(sanitizedParams)) {
            if (value === null || value === undefined) {
              // Reemplazar parámetros nulos con NULL literal
              const regex = new RegExp(`@${name}\\b`, "g");
              modifiedSql = modifiedSql.replace(regex, "NULL");
            } else if (typeof value === "string") {
              // Escapar strings y ponerlos entre comillas
              const escapedValue = value.replace(/'/g, "''");
              const regex = new RegExp(`@${name}\\b`, "g");
              modifiedSql = modifiedSql.replace(regex, `'${escapedValue}'`);
            } else if (typeof value === "number") {
              // Números se insertan directamente
              const regex = new RegExp(`@${name}\\b`, "g");
              modifiedSql = modifiedSql.replace(regex, value);
            } else if (typeof value === "boolean") {
              // Convertir booleanos a 1/0
              const regex = new RegExp(`@${name}\\b`, "g");
              modifiedSql = modifiedSql.replace(regex, value ? "1" : "0");
            } else if (value instanceof Date) {
              // Formatear fechas a formato SQL Server
              const isoString = value.toISOString();
              const formattedDate = isoString.slice(0, 19).replace("T", " ");
              const regex = new RegExp(`@${name}\\b`, "g");
              modifiedSql = modifiedSql.replace(regex, `'${formattedDate}'`);
            } else {
              // Para cualquier otro tipo, convertir a string seguro
              const safeValue = String(value).replace(/'/g, "''");
              const regex = new RegExp(`@${name}\\b`, "g");
              modifiedSql = modifiedSql.replace(regex, `'${safeValue}'`);
            }
          }
        }
      } catch (paramError) {
        console.error("Error al procesar parámetros:", paramError);
        this.logQueryError(
          "param_processing",
          sql,
          sanitizedParams,
          paramError
        );
        reject(paramError);
        return;
      }

      // Crear la solicitud sin parámetros
      const request = new Request(modifiedSql, (err, rowCount) => {
        if (err) {
          console.error("Error en ejecución SQL:", err);
          this.logQueryError("execution", modifiedSql, {}, err);
          reject(err);
          return;
        }

        resolve({
          recordset: rows,
          rowsAffected: rowCount || 0,
        });
      });

      // Manejar eventos de filas
      request.on("row", (columns) => {
        const row = {};
        columns.forEach((column) => {
          row[column.metadata.colName] = column.value;
        });
        rows.push(row);
      });

      // Manejar errores durante la ejecución
      request.on("error", (err) => {
        console.error("Error en la ejecución de la consulta SQL:", err);
        this.logQueryError("request_error", modifiedSql, {}, err);
        reject(err);
      });

      // Ejecutar la consulta modificada sin parámetros
      connection.execSql(request);
    });
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

  /**
   * Infiere los tipos de parámetros SQL para un objeto de registro basado en metadatos de columnas
   * @param {Connection} connection - Conexión a la base de datos
   * @param {string} tableName - Nombre de la tabla
   * @returns {Promise<Object>} - Objeto con los tipos de columnas
   */
  static async getColumnTypes(connection, tableName) {
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
          tbl.name = @tableName
      ORDER BY 
          c.column_id;
    `;

    const result = await this.query(connection, query, { tableName });

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

      typeMap[col.column_name] = sqlType;
    }

    return typeMap;
  }

  /**
   * Determina el tipo de datos de Tedious basado en el valor
   * Versión mejorada con manejo más robusto de tipos
   * @param {any} value - Valor a evaluar
   * @returns {Object} - Tipo de datos de Tedious
   */
  static determineType(value) {
    if (value === null || value === undefined || value === "") {
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
   * Valida un registro completo antes de insertarlo, sanitizando todos los campos
   * @param {Object} record - Registro a validar y sanitizar
   * @param {Array} requiredFields - Campos que deben existir (opcional)
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
      // Validación genérica basada en el tipo de dato, no en el nombre del campo
      if (value === undefined) {
        // Reemplazar undefined con null para SQL
        sanitized[key] = null;
      } else if (value === null) {
        // Mantener valores null
        sanitized[key] = null;
      } else if (value === "") {
        // IMPORTANTE: Convertir cadenas vacías a NULL
        sanitized[key] = null;
      } else if (typeof value === "string" && value.trim() === "") {
        // También convertir strings que solo tienen espacios a NULL
        sanitized[key] = null;
      } else if (typeof value === "number") {
        // Para números, asegurarse que sean válidos
        sanitized[key] = Number.isFinite(value) ? value : 0;
      } else if (value instanceof Date) {
        // Para fechas, verificar que sean válidas
        sanitized[key] = isNaN(value.getTime()) ? null : value;
      } else if (typeof value === "string") {
        // Para strings normales
        sanitized[key] = value.trim();
      } else if (typeof value === "boolean") {
        // Mantener booleanos sin cambios
        sanitized[key] = value;
      } else if (Array.isArray(value)) {
        // Convertir arrays a JSON strings
        sanitized[key] = JSON.stringify(value);
      } else if (typeof value === "object") {
        // Convertir objetos a JSON strings
        sanitized[key] = JSON.stringify(value);
      } else {
        // Para cualquier otro tipo, convertir a string
        sanitized[key] = String(value);
      }
    }

    return sanitized;
  }

  /**
   * Inserta un registro en la base de datos con tipos explícitos
   * @param {Connection} connection - Conexión a la base de datos
   * @param {string} tableName - Nombre de la tabla
   * @param {Object} record - Datos a insertar
   * @returns {Promise<Object>} - Resultado de la operación
   */
  static async insertWithExplicitTypes(connection, tableName, record) {
    try {
      // Verificar si la tabla existe antes de intentar insertar
      const tableNameClean = tableName.replace(/[\[\]]/g, "");
      const exists = await this.tableExists(connection, tableNameClean);

      if (!exists) {
        const error = new Error(
          `La tabla ${tableNameClean} no existe en la base de datos`
        );
        this.logValidationError(
          tableNameClean,
          "table_not_found",
          record,
          error
        );

        // Corregir errores comunes de ortografía en nombres de tablas
        let suggestedName = tableNameClean;
        if (tableNameClean.includes("conctacts")) {
          suggestedName = tableNameClean.replace("conctacts", "contacts");
          console.warn(
            `⚠️ Posible error ortográfico en nombre de tabla. ¿Querías decir "${suggestedName}"?`
          );
        }

        // Si no existe la tabla, no continuar
        throw error;
      }

      if (process.env.NODE_ENV !== "production") {
        console.log(
          "Record antes de sanitizar:",
          JSON.stringify(record, null, 2)
        );
      }

      // Validar y sanitizar el registro con mejor manejo de nulos y undefined
      const sanitizedRecord = this.validateRecord(record);

      if (process.env.NODE_ENV !== "production") {
        console.log(
          "Record después de sanitizar:",
          JSON.stringify(sanitizedRecord, null, 2)
        );
      }

      // Verificar que no haya valores undefined en el registro sanitizado
      for (const key in sanitizedRecord) {
        if (sanitizedRecord[key] === undefined) {
          sanitizedRecord[key] = null; // Convertir undefined a null explícitamente
        }
      }

      // Preparar la consulta
      const columns = Object.keys(sanitizedRecord)
        .map((k) => `[${k}]`)
        .join(", ");
      const paramNames = Object.keys(sanitizedRecord)
        .map((k) => `@${k}`)
        .join(", ");

      if (process.env.NODE_ENV !== "production") {
        console.log("Columnas:", columns);
        console.log("Parámetros:", paramNames);
      }

      const sql = `
        INSERT INTO ${tableName} (${columns})
        VALUES (${paramNames});
        
        SELECT @@ROWCOUNT AS rowsAffected;
      `;

      // Ejecutar la consulta con la nueva implementación que evita problemas de validación
      return await this.query(connection, sql, sanitizedRecord);
    } catch (error) {
      console.error(
        `Error en insertWithExplicitTypes para tabla ${tableName}:`,
        error
      );
      // Registrar el error para análisis posterior
      this.logValidationError(tableName, "insert_error", record, error);
      throw error;
    }
  }

  /**
   * Método auxiliar para registrar errores de validación para análisis posterior
   * @param {string} tableName - Nombre de la tabla
   * @param {string} paramName - Nombre del parámetro
   * @param {any} value - Valor original
   * @param {Error} error - Error ocurrido
   */
  static logValidationError(tableName, paramName, value, error) {
    try {
      const logDir = path.join(process.cwd(), "logs");
      const logPath = path.join(logDir, "validation_errors.log");

      // Crear directorio de logs si no existe
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] Error en tabla ${tableName}, parámetro ${paramName}: ${
        error.message
      }\nValor: ${JSON.stringify(value)}\n\n`;

      fs.appendFile(logPath, logEntry, (err) => {
        if (err) console.error("Error al escribir log de validación:", err);
      });
    } catch (logError) {
      console.error("Error al registrar error de validación:", logError);
    }
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
