// services/tediousAdapter.js - ENFOQUE SIMPLIFICADO SIN TRANSACCIONES EXPLÍCITAS
const { Request, TYPES } = require("tedious");

/**
 * Adaptador simplificado para tedious que emula la API de mssql
 * Esta versión evita el uso de transacciones explícitas para mayor estabilidad
 */
class TediousAdapter {
  constructor(connection) {
    this.connection = connection;
    this.lastUsed = Date.now();
    this.connectionId = Math.random().toString(36).substring(2, 10); // ID único para debugging
    console.log(`[${this.connectionId}] Conexión creada`);
  }

  /**
   * Comprueba si la conexión sigue activa
   */
  isConnectionAlive() {
    const alive =
      this.connection &&
      this.connection.state &&
      this.connection.state.name === "LoggedIn";

    console.log(
      `[${this.connectionId}] Verificando conexión: ${
        alive ? "Activa" : "Inactiva"
      }`
    );
    return alive;
  }

  /**
   * Método directo para ejecutar una consulta sin transacciones
   */
  async executeQuery(sqlString, params = {}) {
    console.log(
      `[${
        this.connectionId
      }] Ejecutando consulta directa: ${sqlString.substring(0, 50)}...`
    );

    if (!this.isConnectionAlive()) {
      throw new Error(
        `[${this.connectionId}] La conexión no está activa para ejecutar la consulta`
      );
    }

    return new Promise((resolve, reject) => {
      const rows = [];

      const request = new Request(sqlString, (err, rowCount) => {
        if (err) {
          console.error(
            `[${this.connectionId}] Error en consulta:`,
            err.message
          );
          reject(err);
          return;
        }

        // Convertir a formato mssql
        const recordset = rows.map((row) => {
          const record = {};
          Object.keys(row).forEach((key) => {
            record[key] = row[key].value;
          });
          return record;
        });

        console.log(
          `[${this.connectionId}] Consulta ejecutada exitosamente, ${rowCount} filas afectadas`
        );
        resolve({
          recordset,
          rowsAffected: [rowCount],
          output: {},
          recordsets: [recordset],
        });
      });

      // Establecer timeout
      request.setTimeout(30000); // 30 segundos

      // Añadir parámetros
      Object.entries(params).forEach(([name, value]) => {
        let type = TYPES.NVarChar;

        if (value === null || value === undefined) {
          type = TYPES.Null;
        } else if (typeof value === "number") {
          if (Number.isInteger(value)) {
            type = TYPES.Int;
          } else {
            type = TYPES.Decimal;
          }
        } else if (value instanceof Date) {
          type = TYPES.DateTime;
        } else if (typeof value === "boolean") {
          type = TYPES.Bit;
        }

        request.addParameter(name, type, value);
      });

      // Manejar timeout
      request.on("requestTimeout", () => {
        console.error(`[${this.connectionId}] Timeout en la consulta`);
        reject(new Error("Timeout al ejecutar la consulta"));
      });

      // Manejar filas
      request.on("row", (columns) => {
        const row = {};
        columns.forEach((column) => {
          row[column.metadata.colName] = column;
        });
        rows.push(row);
      });

      // Manejar errores
      request.on("error", (err) => {
        console.error(`[${this.connectionId}] Error en request:`, err.message);
        reject(err);
      });

      // Ejecutar la consulta
      try {
        this.connection.execSql(request);
      } catch (execError) {
        console.error(
          `[${this.connectionId}] Error ejecutando la consulta:`,
          execError.message
        );
        reject(execError);
      }
    });
  }

  /**
   * Emula el comportamiento de sql.Request()
   * Este método devuelve un objeto simplificado que solo admite query() con parámetros
   */
  request() {
    if (!this.isConnectionAlive()) {
      throw new Error(
        `[${this.connectionId}] La conexión no está activa para crear un request`
      );
    }

    console.log(`[${this.connectionId}] Creando request`);
    const adapter = this;
    const params = {};

    return {
      input(name, value) {
        params[name] = value;
        return this;
      },

      async query(sqlString) {
        return await adapter.executeQuery(sqlString, params);
      },
    };
  }

  /**
   * Esta implementación de transaction() no crea una transacción real,
   * sino que emula suficiente de la API para que el código existente funcione
   */
  transaction() {
    if (!this.isConnectionAlive()) {
      throw new Error(
        `[${this.connectionId}] La conexión no está activa para crear una transacción`
      );
    }

    console.log(`[${this.connectionId}] Creando pseudotransacción`);
    const adapter = this;

    // Devolver un objeto que emula el comportamiento de TransactionAdapter
    // pero en realidad solo pasa las consultas directamente
    return {
      // begin() siempre tiene éxito inmediatamente
      async begin() {
        console.log(
          `[${adapter.connectionId}] Pseudotransacción iniciada (no hace nada realmente)`
        );
        return Promise.resolve();
      },

      // commit() siempre tiene éxito inmediatamente
      async commit() {
        console.log(
          `[${adapter.connectionId}] Pseudotransacción confirmada (no hace nada realmente)`
        );
        return Promise.resolve();
      },

      // rollback() siempre tiene éxito inmediatamente
      async rollback() {
        console.log(
          `[${adapter.connectionId}] Pseudotransacción revertida (no hace nada realmente)`
        );
        return Promise.resolve();
      },

      // El request se pasa directamente a la conexión
      request() {
        return adapter.request();
      },

      // La transacción siempre se considera activa
      get active() {
        return true;
      },

      // Método isActive() siempre devuelve true
      isActive() {
        return true;
      },
    };
  }

  /**
   * Cierra la conexión de forma segura
   */
  async close() {
    return new Promise((resolve) => {
      console.log(`[${this.connectionId}] Intentando cerrar conexión...`);
      if (this.connection) {
        try {
          this.connection.close();
          console.log(`[${this.connectionId}] Conexión cerrada correctamente`);
        } catch (e) {
          console.warn(
            `[${this.connectionId}] Error al cerrar conexión:`,
            e.message
          );
        }
      }
      resolve();
    });
  }

  /**
   * Verifica si la conexión está activa
   */
  get connected() {
    return this.isConnectionAlive();
  }
}

/**
 * Función para envolver una conexión tedious con el adaptador simplificado
 */
function wrapConnection(connection) {
  return new TediousAdapter(connection);
}

module.exports = { wrapConnection };
