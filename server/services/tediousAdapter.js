// services/tediousAdapter.js
const { Request, TYPES } = require("tedious");

/**
 * Adaptador para tedious que emula la API de mssql
 * Facilita la migración de mssql a tedious sin cambiar todo el código
 */
class TediousAdapter {
  constructor(connection) {
    this.connection = connection;
  }

  /**
   * Emula el comportamiento de sql.Request()
   */
  request() {
    return new RequestAdapter(this.connection);
  }

  /**
   * Emula el comportamiento de sql.Transaction()
   */
  transaction() {
    return new TransactionAdapter(this.connection);
  }

  /**
   * Cierra la conexión
   */
  async close() {
    return new Promise((resolve, reject) => {
      if (this.connection) {
        this.connection.close();
      }
      resolve();
    });
  }

  /**
   * Verifica si la conexión está activa
   */
  get connected() {
    return (
      this.connection &&
      this.connection.state &&
      this.connection.state.name === "LoggedIn"
    );
  }
}

/**
 * Adaptador para Request de tedious
 */
class RequestAdapter {
  constructor(connection, transaction = null) {
    this.connection = connection;
    this.transaction = transaction;
    this.params = {};
    this.timeout = 30000; // Default timeout
  }

  /**
   * Emula request.input() de mssql
   */
  input(paramName, value) {
    // Determinar tipo de datos de tedious basado en el valor
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

    this.params[paramName] = {
      name: paramName,
      type: type,
      value: value,
    };

    return this;
  }

  /**
   * Emula request.query() de mssql pero usando tedious
   */
  async query(sqlString) {
    return new Promise((resolve, reject) => {
      const rows = [];
      const columns = {};
      let rowCount = 0;

      // Crear el objeto Request de tedious
      const request = new Request(sqlString, (err, rowCount) => {
        if (err) {
          reject(err);
          return;
        }

        // Convertir el formato de rows a un formato similar a mssql
        const recordset = rows.map((row) => {
          const record = {};
          Object.keys(row).forEach((key) => {
            record[key] = row[key].value;
          });
          return record;
        });

        resolve({
          recordset,
          rowsAffected: [rowCount],
          output: {},
          recordsets: [recordset],
        });
      });

      // Establecer timeout si está definido
      if (this.timeout) {
        request.setTimeout(this.timeout);
      }

      // Añadir parámetros a la consulta
      Object.values(this.params).forEach((param) => {
        request.addParameter(param.name, param.type, param.value);
      });

      // Manejar fila recibida
      request.on("row", (columns) => {
        const row = {};
        columns.forEach((column) => {
          row[column.metadata.colName] = column;
        });
        rows.push(row);
      });

      // Verificar si la conexión sigue activa antes de ejecutar la consulta
      if (
        !this.connection ||
        (this.connection.state && this.connection.state.name !== "LoggedIn")
      ) {
        return reject(
          new Error("La conexión no está activa para ejecutar la consulta")
        );
      }

      // Ejecutar la consulta usando el objeto de conexión o transacción apropiado
      if (
        this.transaction &&
        this.transaction._transaction &&
        this.transaction._transactionStarted
      ) {
        this.transaction._transaction.execSql(request);
      } else {
        this.connection.execSql(request);
      }
    });
  }
}

/**
 * Adaptador para Transaction de tedious
 */
class TransactionAdapter {
  constructor(connection) {
    this.connection = connection;
    this._transaction = null;
    this._transactionStarted = false;
    this._transactionFailed = false;
  }

  /**
   * Emula transaction.begin() de mssql pero usando tedious
   */
  async begin() {
    return new Promise((resolve, reject) => {
      // Verificar que no hay una transacción activa
      if (this._transactionStarted) {
        reject(new Error("Ya existe una transacción activa"));
        return;
      }

      // Verificar si la conexión está activa
      if (
        !this.connection ||
        (this.connection.state && this.connection.state.name !== "LoggedIn")
      ) {
        reject(
          new Error("La conexión no está activa para iniciar una transacción")
        );
        return;
      }

      // Timeout para evitar bloqueos
      const beginTimeout = setTimeout(() => {
        reject(new Error("Timeout al intentar iniciar la transacción"));
      }, 30000);

      try {
        const transaction = this.connection.beginTransaction((err) => {
          clearTimeout(beginTimeout);

          if (err) {
            this._transactionStarted = false;
            this._transactionFailed = true;
            reject(err);
            return;
          }

          this._transaction = transaction;
          this._transactionStarted = true;
          this._transactionFailed = false;
          resolve();
        });
      } catch (error) {
        clearTimeout(beginTimeout);
        this._transactionStarted = false;
        this._transactionFailed = true;
        reject(error);
      }
    });
  }

  /**
   * Verifica si la transacción está activa y lista para operaciones
   */
  isActive() {
    // Verificación completa del estado de la transacción
    return (
      this._transaction &&
      this._transactionStarted &&
      !this._transactionFailed &&
      this.connection &&
      this.connection.state &&
      this.connection.state.name === "LoggedIn"
    );
  }

  /**
   * Emula transaction.commit() de mssql pero usando tedious
   */
  async commit() {
    return new Promise((resolve, reject) => {
      // Verificación más estricta
      if (!this._transaction || !this._transactionStarted) {
        reject(new Error("No hay una transacción activa para confirmar"));
        return;
      }

      // Verificar el estado de la conexión
      if (
        !this.connection ||
        (this.connection.state && this.connection.state.name !== "LoggedIn")
      ) {
        this._transactionStarted = false; // Marcar como inactiva
        reject(
          new Error("La conexión no está activa para confirmar la transacción")
        );
        return;
      }

      // Si la transacción está marcada como fallida, no permitir commit
      if (this._transactionFailed) {
        this._transactionStarted = false; // Marcar como inactiva
        reject(new Error("La transacción ha fallado y no puede confirmarse"));
        return;
      }

      // Timeout para evitar bloqueos
      const commitTimeout = setTimeout(() => {
        this._transactionFailed = true;
        reject(new Error("Timeout al intentar confirmar la transacción"));
      }, 30000);

      try {
        this._transaction.commitTransaction((err) => {
          clearTimeout(commitTimeout);

          if (err) {
            this._transactionFailed = true;
            reject(err);
            return;
          }

          this._transactionStarted = false;
          resolve();
        });
      } catch (error) {
        clearTimeout(commitTimeout);
        this._transactionFailed = true;
        reject(error);
      }
    });
  }

  /**
   * Emula transaction.rollback() de mssql pero usando tedious
   */
  async rollback() {
    return new Promise((resolve, reject) => {
      // Si no hay transacción activa, simplemente resolvemos
      if (!this._transaction || !this._transactionStarted) {
        this._transactionStarted = false;
        resolve();
        return;
      }

      // Verificar si la conexión está activa
      if (
        !this.connection ||
        (this.connection.state && this.connection.state.name !== "LoggedIn")
      ) {
        this._transactionStarted = false;
        this._transactionFailed = true;
        resolve();
        return;
      }

      // Timeout para evitar bloqueos
      const rollbackTimeout = setTimeout(() => {
        this._transactionStarted = false;
        this._transactionFailed = true;
        resolve();
      }, 30000);

      try {
        this._transaction.rollbackTransaction((err) => {
          clearTimeout(rollbackTimeout);

          this._transactionStarted = false;

          if (err) {
            this._transactionFailed = true;
            // No rechazamos para evitar errores en cascada en finally blocks
            console.error("Error en rollback:", err.message);
            resolve();
            return;
          }

          resolve();
        });
      } catch (error) {
        clearTimeout(rollbackTimeout);
        this._transactionStarted = false;
        this._transactionFailed = true;
        // No rechazamos para evitar errores en cascada en finally blocks
        console.error("Excepción en rollback:", error.message);
        resolve();
      }
    });
  }

  /**
   * Emula transaction.request() de mssql
   */
  request() {
    if (!this._transaction || !this._transactionStarted) {
      throw new Error("La transacción no ha sido iniciada");
    }

    if (this._transactionFailed) {
      throw new Error("La transacción ha fallado y no puede usarse");
    }

    return new RequestAdapter(this.connection, this);
  }

  /**
   * Verifica si la transacción está activa
   */
  get active() {
    return this._transactionStarted && !this._transactionFailed;
  }
}

/**
 * Función para envolver una conexión tedious con el adaptador
 */
function wrapConnection(connection) {
  return new TediousAdapter(connection);
}

module.exports = { wrapConnection };
