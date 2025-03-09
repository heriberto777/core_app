// services/SqlService.js
const { Request, TYPES } = require("tedious");
const logger = require("./logger");
const fs = require("fs");
const path = require("path");
const ConnectionManager = require("./ConnectionManager");
const ValidationService = require("./ValidationService");
const Telemetry = require("./Telemetry");
const MemoryManager = require("./MemoryManager");

/**
 * Servicio optimizado para operaciones SQL
 */
class SqlService {
  /**
   * Obtiene los tipos de columnas de una tabla
   * @param {Connection} connection - Conexión a SQL Server
   * @param {string} tableName - Nombre de la tabla
   * @returns {Promise<Object>} - Mapa de columnas a tipos
   */
  async getColumnTypes(connection, tableName) {
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

      return typeMap;
    } catch (error) {
      logger.warn(
        `No se pudieron obtener los tipos de columnas: ${error.message}`
      );
      return {}; // Devolver un objeto vacío para continuar funcionando
    }
  }

  /**
   * Determina el tipo SQL basado en el valor
   * @param {any} value - Valor a evaluar
   * @returns {Object} - Tipo Tedious correspondiente
   */
  determineType(value) {
    if (value === null || value === undefined || value === "") {
      return TYPES.Null;
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

      return value.trim() === "" ? TYPES.Null : TYPES.NVarChar;
    }

    // Por defecto
    return TYPES.NVarChar;
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
   * @returns {Promise<Object>} - Resultado de la operación
   */
  async insertWithExplicitTypes(
    connection,
    tableName,
    record,
    columnTypes = {}
  ) {
    try {
      // Validar y sanitizar el registro
      const sanitizedRecord = this.validateRecord(record);

      // Asegurar que no haya valores undefined
      Object.keys(sanitizedRecord).forEach((key) => {
        if (sanitizedRecord[key] === undefined) {
          sanitizedRecord[key] = null;
        }
      });

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

      // Ejecutar la consulta con tipos explícitos
      return await this.query(connection, sql, sanitizedRecord, columnTypes);
    } catch (error) {
      logger.error(
        `Error en insertWithExplicitTypes para tabla ${tableName}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Borra todos los registros de una tabla
   * @param {Connection} connection - Conexión a SQL Server
   * @param {string} tableName - Nombre de la tabla
   * @returns {Promise<number>} - Número de registros eliminados
   */
  async clearTableData(connection, tableName) {
    try {
      // Limpiar el nombre de la tabla
      const cleanTableName = tableName.replace(/[\[\]]/g, "");

      // Verificar si la tabla existe
      const tableExists = await this.tableExists(connection, cleanTableName);
      if (!tableExists) {
        throw new Error(`La tabla ${cleanTableName} no existe`);
      }

      // Obtener conteo antes del borrado
      const countSql = `SELECT COUNT(*) AS record_count FROM ${tableName} WITH (NOLOCK)`;
      const countResult = await this.query(connection, countSql);
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
      const result = await this.query(connection, deleteSql);
      const deletedCount = result.rowsAffected || 0;

      logger.info(
        `Borrado completado en ${cleanTableName}: ${deletedCount} registros eliminados`
      );
      return deletedCount;
    } catch (error) {
      logger.error(`Error al borrar registros de ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Verifica si una tabla existe
   * @param {Connection} connection - Conexión a SQL Server
   * @param {string} tableName - Nombre de la tabla
   * @returns {Promise<boolean>} - true si existe
   */
  async tableExists(connection, tableName) {
    try {
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

      const result = await this.query(connection, sql);
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
   * Ejecuta una consulta SQL con manejo mejorado de errores y reintentos
   * @param {Connection} connection - Conexión a SQL Server
   * @param {string} sql - Consulta SQL
   * @param {Object} params - Parámetros para la consulta (opcional)
   * @param {Object|string} columnTypesOrServerKey - Tipos de columnas o clave de servidor
   * @returns {Promise<Object>} - Resultado de la consulta
   */
  async query(connection, sql, params = {}, columnTypesOrServerKey = null) {
    let serverKey = null;
    let columnTypes = null;

    // Determinar si el 4º parámetro es serverKey o columnTypes
    if (typeof columnTypesOrServerKey === "string") {
      serverKey = columnTypesOrServerKey;
    } else if (
      columnTypesOrServerKey &&
      typeof columnTypesOrServerKey === "object"
    ) {
      columnTypes = columnTypesOrServerKey;
    }

    // Medir tiempo para métricas
    Telemetry.startTimer(`query_exec_${Date.now()}`);

    try {
      // Verificar operaciones para gestión de memoria
      MemoryManager.trackOperation("sql_query");

      // Sanitizar parámetros
      const sanitizedParams = this.sanitizeParams(params);

      // Registrar métricas
      if (serverKey) {
        Telemetry.trackQuery(serverKey);
      }

      // Ejecutar la consulta
      return await this.executeQuery(
        connection,
        sql,
        sanitizedParams,
        columnTypes
      );
    } catch (error) {
      // Registrar error en métricas
      if (serverKey) {
        Telemetry.trackQuery(serverKey, true);
      }

      // Registrar detalles del error para diagnóstico
      this.logQueryError("execution", sql, params, error);
      throw error;
    } finally {
      // Finalizar medición de tiempo
      const queryTime = Telemetry.endTimer(`query_exec_${Date.now()}`);
      if (queryTime > 0) {
        Telemetry.updateAverage("avgQueryTime", queryTime);
      }
    }
  }

  /**
   * Implementación interna de ejecución de consulta
   * @param {Connection} connection - Conexión a SQL Server
   * @param {string} sql - Consulta SQL
   * @param {Object} params - Parámetros sanitizados
   * @param {Object} columnTypes - Tipos de columnas (opcional)
   * @returns {Promise<Object>} - Resultado de la consulta
   */
  executeQuery(connection, sql, params, columnTypes) {
    return new Promise((resolve, reject) => {
      try {
        // Validar la conexión
        if (!connection) {
          return reject(new Error("La conexión es nula"));
        }

        if (typeof connection.execSql !== "function") {
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
            reject(err);
            return;
          }

          resolve({
            recordset: rows,
            rowsAffected: rowCount || 0,
          });
        });

        // Configurar parámetros manualmente sin llamar a validateParameters
        for (const [key, value] of Object.entries(params)) {
          // Determinar tipo
          let paramType = this.determineType(value);
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

          // Añadir el parámetro directamente
          request.addParameter(key, paramType, paramValue);
        }

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
          connection.execSql(request);
        } catch (execError) {
          reject(
            new Error(`Error al ejecutar SQL (execSql): ${execError.message}`)
          );
        }
      } catch (error) {
        reject(error);
      }
    });
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
      }\n\n`;

      fs.appendFile(logPath, logEntry, (err) => {
        if (err) logger.error("Error al escribir log de error SQL:", err);
      });
    } catch (logError) {
      logger.error("Error al registrar error SQL:", logError);
    }
  }

  /**
   * Cierra una conexión de forma segura
   * @param {Connection} connection - Conexión a cerrar
   */
  async close(connection) {
    if (!connection) return;

    return await ConnectionManager.releaseConnection(connection);
  }
}

// Exportar instancia singleton
module.exports = {
  SqlService: new SqlService(),
};
