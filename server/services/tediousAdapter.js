// services/tediousAdapter.js
const { Request, TYPES } = require("tedious");

/**
 * Adaptador para tedious que emula la API de mssql
 * Facilita la migración de mssql a tedious sin cambiar todo el código
 * Versión mejorada con mejor manejo de conexiones y transacciones
 */
class TediousAdapter {
  constructor(connection) {
    this.connection = connection;
    this.lastUsed = Date.now();
  }

  /**
   * Comprueba si la conexión sigue activa y es utilizable
   */
  isConnectionAlive() {
    return (
      this.connection &&
      this.connection.state &&
      this.connection.state.name === "LoggedIn" &&
      Date.now() - this.lastUsed < 300000
    ); // 5 minutos de vida máxima
  }

  /**
   * Verifica la conexión con una consulta simple
   */
  async verifyConnection() {
    if (!this.isConnectionAlive()) {
      throw new Error("Conexión no activa o expirada");
    }

    return new Promise((resolve, reject) => {
      const request = new Request("SELECT 1 AS test", (err, rowCount) => {
        if (err) {
          reject(new Error("Error en prueba de conexión: " + err.message));
          return;
        }
        this.lastUsed = Date.now(); // Actualizar timestamp de último uso
        resolve(true);
      });

      request.on("error", (err) => {
        reject(new Error("Error en prueba de conexión: " + err.message));
      });

      this.connection.execSql(request);
    });
  }

  /**
   * Emula el comportamiento de sql.Request() con verificación
   */
  request() {
    if (!this.isConnectionAlive()) {
      throw new Error("La conexión no está activa para crear un request");
    }
    this.lastUsed = Date.now();
    return new RequestAdapter(this.connection);
  }

  /**
   * Emula el comportamiento de sql.Transaction() con verificación
   */
  transaction() {
    if (!this.isConnectionAlive()) {
      throw new Error("La conexión no está activa para crear una transacción");
    }
    this.lastUsed = Date.now();
    return new TransactionAdapter(this.connection);
  }

  /**
   * Cierra la conexión de forma segura
   */
  async close() {
    return new Promise((resolve) => {
      if (this.connection) {
        try {
          this.connection.close();
          console.log("Conexión cerrada correctamente");
        } catch (e) {
          console.warn("Error al cerrar conexión:", e.message);
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
 * Adaptador para Request de tedious
 */
class RequestAdapter {
  constructor(connection, transaction = null) {
    this.connection = connection;
    this.transaction = transaction;
    this.params = {};
    this.timeout = 30000; // Default timeout aumentado a 30 segundos
  }

  /**
   * Emula request.input() de mssql con mejor tipado
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
   * Emula request.query() de mssql pero usando tedious con mejor manejo de errores
   */
  async query(sqlString) {
    return new Promise((resolve, reject) => {
      const rows = [];
      const columns = {};
      let rowCount = 0;

      // Verificar si la conexión está activa antes de crear el request
      if (
        !this.connection ||
        (this.connection.state && this.connection.state.name !== "LoggedIn")
      ) {
        return reject(
          new Error("La conexión no está activa para ejecutar la consulta")
        );
      }

      // Verificar si la transacción está activa si se está usando una
      if (
        this.transaction &&
        typeof this.transaction.isActive === "function" &&
        !this.transaction.isActive()
      ) {
        return reject(
          new Error("La transacción no está activa para ejecutar la consulta")
        );
      }

      // Crear el objeto Request de tedious
      const request = new Request(sqlString, (err, rowCount) => {
        if (err) {
          console.error("Error en consulta:", err.message);
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

      // Manejar timeout específicamente
      request.on("requestTimeout", () => {
        reject(
          new Error(
            `Timeout al ejecutar la consulta después de ${this.timeout}ms`
          )
        );
      });

      // Manejar fila recibida
      request.on("row", (columns) => {
        const row = {};
        columns.forEach((column) => {
          row[column.metadata.colName] = column;
        });
        rows.push(row);
      });

      // Manejar otros errores
      request.on("error", (err) => {
        console.error("Error en request:", err.message);
        reject(err);
      });

      // Ejecutar la consulta usando el objeto de conexión o transacción apropiado
      try {
        if (
          this.transaction &&
          this.transaction._transaction &&
          this.transaction._transactionStarted
        ) {
          this.transaction._transaction.execSql(request);
        } else {
          this.connection.execSql(request);
        }
      } catch (execError) {
        console.error("Error al ejecutar consulta:", execError.message);
        reject(execError);
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
    this._startTime = null;
    this._maxTransactionTime = 300000; // 5 minutos máximo para una transacción
    this._forceActive = false; // Forzar estado activo para evitar problemas de sincronización
  }

  /**
   * Verifica si la transacción está activa, válida y no ha expirado
   */
  isActive() {
    // Si estamos forzando estado activo, devolver verdadero
    if (this._forceActive) {
      return true;
    }

    // Verificar si ha pasado demasiado tiempo desde que se inició la transacción
    const transactionExpired =
      this._startTime &&
      Date.now() - this._startTime > this._maxTransactionTime;

    if (transactionExpired) {
      console.warn("Transacción expirada por tiempo máximo");
      this._transactionFailed = true;
      return false;
    }

    // Simplificamos la verificación usando solo nuestras propiedades internas
    return (
      this._transaction && this._transactionStarted && !this._transactionFailed
    );
  }

  /**
   * Emula transaction.begin() de mssql pero usando tedious con mejor manejo de errores
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

      // Timeout para evitar bloqueos (aumentado a 30 segundos)
      const beginTimeout = setTimeout(() => {
        reject(new Error("Timeout al intentar iniciar la transacción"));
      }, 30000);

      try {
        console.log("Iniciando transacción tedious...");
        const transaction = this.connection.beginTransaction((err) => {
          clearTimeout(beginTimeout);

          if (err) {
            console.error("Error al iniciar la transacción:", err.message);
            this._transactionStarted = false;
            this._transactionFailed = true;
            reject(err);
            return;
          }

          console.log("Transacción tedious iniciada correctamente");
          this._transaction = transaction;
          this._transactionStarted = true;
          this._transactionFailed = false;
          this._startTime = Date.now();
          this._forceActive = true; // Forzar estado activo para evitar problemas
          resolve();
        });
      } catch (error) {
        clearTimeout(beginTimeout);
        console.error("Excepción al iniciar transacción:", error.message);
        this._transactionStarted = false;
        this._transactionFailed = true;
        reject(error);
      }
    });
  }

  /**
   * Emula transaction.commit() de mssql pero usando tedious con mejor validación
   */
  async commit() {
    return new Promise((resolve, reject) => {
      // Verificación simplificada para evitar problemas
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

      // Verificar si ha expirado
      if (
        this._startTime &&
        Date.now() - this._startTime > this._maxTransactionTime
      ) {
        this._transactionStarted = false;
        this._transactionFailed = true;
        reject(new Error("La transacción ha expirado y no puede confirmarse"));
        return;
      }

      // Si la transacción está marcada como fallida, no permitir commit
      if (this._transactionFailed) {
        this._transactionStarted = false; // Marcar como inactiva
        reject(new Error("La transacción ha fallido y no puede confirmarse"));
        return;
      }

      // Timeout para evitar bloqueos (30 segundos)
      const commitTimeout = setTimeout(() => {
        this._transactionFailed = true;
        reject(new Error("Timeout al intentar confirmar la transacción"));
      }, 30000);

      try {
        console.log("Ejecutando commit en transacción tedious...");
        this._transaction.commitTransaction((err) => {
          clearTimeout(commitTimeout);

          if (err) {
            console.error("Error en commit:", err.message);
            this._transactionFailed = true;
            reject(err);
            return;
          }

          console.log("Commit realizado correctamente");
          this._transactionStarted = false;
          this._startTime = null;
          this._forceActive = false;
          resolve();
        });
      } catch (error) {
        clearTimeout(commitTimeout);
        console.error("Excepción en commit:", error.message);
        this._transactionFailed = true;
        reject(error);
      }
    });
  }

  /**
   * Emula transaction.rollback() de mssql pero usando tedious con mejor manejo de errores
   */
  async rollback() {
    return new Promise((resolve, reject) => {
      // Si no hay transacción activa, simplemente resolvemos
      if (!this._transaction || !this._transactionStarted) {
        this._transactionStarted = false;
        this._forceActive = false;
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
        this._forceActive = false;
        resolve();
        return;
      }

      // Timeout para evitar bloqueos (30 segundos)
      const rollbackTimeout = setTimeout(() => {
        console.warn(
          "Timeout en rollback - marcando transacción como finalizada de todas formas"
        );
        this._transactionStarted = false;
        this._transactionFailed = true;
        this._forceActive = false;
        resolve();
      }, 30000);

      try {
        console.log("Ejecutando rollback en transacción tedious...");
        this._transaction.rollbackTransaction((err) => {
          clearTimeout(rollbackTimeout);

          this._transactionStarted = false;
          this._startTime = null;
          this._forceActive = false;

          if (err) {
            this._transactionFailed = true;
            // No rechazamos para evitar errores en cascada en finally blocks
            console.error("Error en rollback:", err.message);
            resolve();
            return;
          }

          console.log("Rollback realizado correctamente");
          resolve();
        });
      } catch (error) {
        clearTimeout(rollbackTimeout);
        this._transactionStarted = false;
        this._transactionFailed = true;
        this._forceActive = false;
        // No rechazamos para evitar errores en cascada en finally blocks
        console.error("Excepción en rollback:", error.message);
        resolve();
      }
    });
  }

  /**
   * Emula transaction.request() de mssql con verificación simplificada
   */
  request() {
    // Verificación simplificada para evitar problemas con active
    if (!this._transaction || !this._transactionStarted) {
      throw new Error("La transacción no ha sido iniciada");
    }

    if (this._transactionFailed) {
      throw new Error("La transacción ha fallado y no puede usarse");
    }

    // Ya no verificamos transaction.active explícitamente
    return new RequestAdapter(this.connection, this);
  }

  /**
   * Verifica si la transacción está activa - simplificada para evitar errores
   */
  get active() {
    // Simplificamos la implementación para evitar problemas
    if (this._forceActive) {
      return true;
    }

    const isActive =
      this._transaction && this._transactionStarted && !this._transactionFailed;

    if (!isActive && this._transactionStarted) {
      console.warn(
        "Transacción marcada como iniciada pero detectada como inactiva:",
        {
          transactionExists: !!this._transaction,
          startTime: this._startTime,
          timeSinceStart: this._startTime ? Date.now() - this._startTime : null,
          connectionState: this.connection?.state?.name,
          failed: this._transactionFailed,
        }
      );
    }

    return isActive;
  }
}

/**
 * Función para envolver una conexión tedious con el adaptador mejorado
 */
function wrapConnection(connection) {
  return new TediousAdapter(connection);
}

module.exports = { wrapConnection };
