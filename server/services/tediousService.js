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
   * Ejecuta una consulta SQL con tipos de parámetros explícitos
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

      const request = new Request(sql, (err, rowCount) => {
        if (err) {
          reject(err);
          return;
        }

        resolve({
          recordset: rows,
          rowsAffected: rowCount || 0,
        });
      });

      // Añadir parámetros con tipos explícitos si están disponibles
      try {
        Object.entries(sanitizedParams).forEach(([name, value]) => {
          // Si el valor es undefined o null, usar explícitamente null
          if (value === undefined || value === null) {
            request.addParameter(name, TYPES.Null, null);
          } else {
            // Usar tipo explícito si está disponible, o inferir automáticamente
            const type = paramTypes[name] || this.determineType(value);
            request.addParameter(name, type, value);
          }
        });
      } catch (paramError) {
        console.error(
          `Error al añadir parámetros en consulta: ${sql.substring(0, 100)}...`
        );
        console.error(
          "Parámetros problemáticos:",
          JSON.stringify(sanitizedParams, null, 2)
        );
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

      // Manejar errores durante la ejecución
      request.on("error", (err) => {
        console.error("Error en la ejecución de la consulta SQL:", err);
        reject(err);
      });

      // Ejecutar la consulta
      connection.execSql(request);
    });
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
      if (process.env.NODE_ENV !== "production") {
        console.log(
          "Record antes de sanitizar:",
          JSON.stringify(record, null, 2)
        );
      }

      // Obtener tipos de columnas
      const columnTypes = await this.getColumnTypes(connection, tableName);

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

      // SOLUCIÓN GENERAL: Asegurar que todos los campos de tipo string tengan valores válidos
      for (const key in sanitizedRecord) {
        // Si el valor no es null pero debería ser string (o no sabemos qué tipo es)
        if (sanitizedRecord[key] !== null) {
          const paramType =
            columnTypes[key] || this.determineType(sanitizedRecord[key]);

          // Si es un tipo string o si no conocemos el tipo, asegurar que sea un string válido
          if (
            paramType?.name === "NVarChar" ||
            paramType?.name === "VarChar" ||
            paramType?.name === "Char" ||
            paramType?.name === "NChar" ||
            paramType?.name === "Text" ||
            paramType?.name === "NText" ||
            typeof sanitizedRecord[key] === "string"
          ) {
            // Asegurar que sea un string y recortar su longitud si es necesario
            sanitizedRecord[key] = String(sanitizedRecord[key]).substring(
              0,
              4000
            );
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

      if (process.env.NODE_ENV !== "production") {
        console.log("Columnas:", columns);
        console.log("Parámetros:", paramNames);
      }

      const sql = `
      INSERT INTO ${tableName} (${columns})
      VALUES (${paramNames});
      
      SELECT @@ROWCOUNT AS rowsAffected;
    `;

      // Ejecutar la consulta con manejo mejorado de errores
      try {
        return await this.query(connection, sql, sanitizedRecord, columnTypes);
      } catch (queryError) {
        console.error(
          `Error en la consulta SQL para inserción: ${queryError.message}`
        );

        // Si es un error de validación de parámetros, intentar recuperación
        if (
          queryError.code === "EPARAM" &&
          queryError.message.includes("Validation failed")
        ) {
          // Extraer el nombre del parámetro problemático
          const paramMatch = queryError.message.match(/parameter '([^']+)'/);
          const problemParam = paramMatch ? paramMatch[1] : null;

          if (problemParam && problemParam in sanitizedRecord) {
            console.warn(
              `Parámetro problemático: ${problemParam}, intentando manejo alternativo`
            );

            // Crear nuevo conjunto de parámetros con el valor problemático como null
            const recoveryParams = { ...sanitizedRecord };

            // Guardar valor original para diagnóstico
            const originalValue = recoveryParams[problemParam];

            // Establecer el valor problemático como null
            recoveryParams[problemParam] = null;

            console.warn(
              `Valor original de ${problemParam}: ${JSON.stringify(
                originalValue
              )}, cambiado a null`
            );

            try {
              // Reintentar la consulta con el valor corregido
              const result = await this.query(
                connection,
                sql,
                recoveryParams,
                columnTypes
              );
              console.warn(
                `Inserción recuperada exitosamente después de establecer ${problemParam} a null`
              );
              return result;
            } catch (recoveryError) {
              console.error(
                `Error en intento de recuperación: ${recoveryError.message}`
              );
              // Registrar detalles del error para diagnóstico posterior
              this.logValidationError(
                tableName,
                problemParam,
                originalValue,
                queryError
              );
              throw recoveryError;
            }
          }
        }

        // Si no es un error de validación o no pudimos recuperar, registrar detalles y relanzar
        console.error(`Tabla: ${tableName}`);
        console.error(`SQL: ${sql}`);
        console.error(
          `Parámetros: ${JSON.stringify(sanitizedRecord, null, 2)}`
        );
        throw queryError;
      }
    } catch (error) {
      console.error(
        `Error en insertWithExplicitTypes para tabla ${tableName}:`,
        error
      );
      throw error;
    }
  }

  // Método auxiliar para registrar errores de validación para análisis posterior
  static logValidationError(tableName, paramName, value, error) {
    try {
      const fs = require("fs");
      const path = require("path");
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
