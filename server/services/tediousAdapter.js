// services/tediousAdapter.js
const { Request, TYPES } = require('tedious');

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
      this.connection.close();
      resolve();
    });
  }

  /**
   * Verifica si la conexión está activa
   */
  get connected() {
    return this.connection && this.connection.state && this.connection.state.name === 'LoggedIn';
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
    } else if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        type = TYPES.Int;
      } else {
        type = TYPES.Decimal;
      }
    } else if (value instanceof Date) {
      type = TYPES.DateTime;
    } else if (typeof value === 'boolean') {
      type = TYPES.Bit;
    }
    
    this.params[paramName] = {
      name: paramName,
      type: type,
      value: value
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
        const recordset = rows.map(row => {
          const record = {};
          Object.keys(row).forEach(key => {
            record[key] = row[key].value;
          });
          return record;
        });
        
        resolve({
          recordset,
          rowsAffected: [rowCount],
          output: {},
          recordsets: [recordset]
        });
      });
      
      // Establecer timeout si está definido
      if (this.timeout) {
        request.setTimeout(this.timeout);
      }
      
      // Añadir parámetros a la consulta
      Object.values(this.params).forEach(param => {
        request.addParameter(param.name, param.type, param.value);
      });
      
      // Manejar fila recibida
      request.on('row', (columns) => {
        const row = {};
        columns.forEach(column => {
          row[column.metadata.colName] = column;
        });
        rows.push(row);
      });
      
      // Ejecutar la consulta usando el objeto de conexión o transacción apropiado
      if (this.transaction && this.transaction._transaction) {
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
  }

  /**
   * Emula transaction.begin() de mssql pero usando tedious
   */
  async begin() {
    return new Promise((resolve, reject) => {
      const transaction = this.connection.beginTransaction((err) => {
        if (err) {
          reject(err);
          return;
        }
        
        this._transaction = transaction;
        this._transactionStarted = true;
        resolve();
      });
    });
  }

  /**
   * Emula transaction.commit() de mssql pero usando tedious
   */
  async commit() {
    if (!this._transaction || !this._transactionStarted) {
      throw new Error('No hay una transacción activa para confirmar');
    }
    
    return new Promise((resolve, reject) => {
      this._transaction.commitTransaction((err) => {
        if (err) {
          reject(err);
          return;
        }
        
        this._transactionStarted = false;
        resolve();
      });
    });
  }

  /**
   * Emula transaction.rollback() de mssql pero usando tedious
   */
  async rollback() {
    if (!this._transaction || !this._transactionStarted) {
      throw new Error('No hay una transacción activa para revertir');
    }
    
    return new Promise((resolve, reject) => {
      this._transaction.rollbackTransaction((err) => {
        if (err) {
          reject(err);
          return;
        }
        
        this._transactionStarted = false;
        resolve();
      });
    });
  }

  /**
   * Emula transaction.request() de mssql
   */
  request() {
    if (!this._transaction || !this._transactionStarted) {
      throw new Error('La transacción no ha sido iniciada');
    }
    
    return new RequestAdapter(this.connection, this);
  }
}

/**
 * Función para envolver una conexión tedious con el adaptador
 */
function wrapConnection(connection) {
  return new TediousAdapter(connection);
}

module.exports = { wrapConnection };