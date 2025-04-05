// services/connectionDiagnostic.js - VERSIÓN CORREGIDA
const { Connection, Request } = require("tedious");
const mongoose = require("mongoose");
const logger = require("./logger");
const DBConfig = require("../models/dbConfigModel");
const MongoDbService = require("./mongoDbService");

/**
 * Herramienta para diagnosticar problemas de conexión a SQL Server
 */
class ConnectionDiagnostic {
  /**
   * Diagnóstico completo de la configuración de conexión a SQL Server
   * @param {string} serverKey - Servidor a diagnosticar ("server1" o "server2")
   * @returns {Promise<Object>} - Resultados del diagnóstico
   */
  static async diagnoseServerConnection(serverKey) {
    logger.info(`📊 Iniciando diagnóstico completo para ${serverKey}...`);

    const results = {
      serverKey,
      timestamp: new Date().toISOString(),
      success: false,
      steps: [],
      config: null,
      recommendations: [],
      error: null,
    };

    try {
      // 1. Comprobar conexión a MongoDB
      results.steps.push({
        name: "MongoDB Connection Check",
        status: "running",
      });

      // const mongoConnected = MongoDbService.isConnected();
      const mongoConnected = mongoose.connection.readyState === 1;

      if (!mongoConnected) {
        logger.info("MongoDB no está conectado, intentando conectar...");
        const connected = await MongoDbService.connect();

        if (!connected) {
          results.steps[0].status = "failed";
          results.steps[0].error = "No se pudo conectar a MongoDB";
          results.recommendations.push(
            "Verificar credenciales y conectividad a MongoDB"
          );
          results.error = "MongoDB connection failed";
          return results;
        }
      }

      results.steps[0].status = "success";
      results.steps[0].details = "Conexión a MongoDB exitosa";

      // 2. Cargar configuración desde MongoDB
      results.steps.push({
        name: "SQL Server Configuration Load",
        status: "running",
      });

      const dbConfig = await DBConfig.findOne({ serverName: serverKey }).lean();

      if (!dbConfig) {
        results.steps[1].status = "failed";
        results.steps[1].error = `No se encontró configuración para ${serverKey} en MongoDB`;
        results.recommendations.push(
          `Ejecutar script updateDBConfig.js para crear configuración de ${serverKey}`
        );
        results.error = "SQL Server configuration not found";
        return results;
      }

      results.steps[1].status = "success";
      results.steps[1].details = `Configuración para ${serverKey} cargada correctamente`;

      // Guardar configuración sin contraseña
      const safeConfig = { ...dbConfig };
      delete safeConfig.password;
      results.config = safeConfig;

      // 3. Validar configuración
      results.steps.push({
        name: "Configuration Validation",
        status: "running",
      });

      // Verificar si es una dirección IP
      const isIpAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(dbConfig.host);

      if (isIpAddress && dbConfig.options?.encrypt) {
        results.steps[2].status = "warning";
        results.steps[2].details =
          "La configuración usa una dirección IP con encrypt=true, lo que puede causar advertencias TLS";
        results.recommendations.push(
          "Para conexiones con IP, establecer encrypt: false en la configuración"
        );
      } else {
        results.steps[2].status = "success";
        results.steps[2].details = `Configuración de ${serverKey} es válida`;
      }

      // 4. Intentar conexión directa (sin pool)
      results.steps.push({
        name: "Direct SQL Connection Test",
        status: "running",
      });

      try {
        const connectionResult = await this.testDirectConnection(dbConfig);
        results.steps[3].status = "success";
        results.steps[3].details = `Conexión directa exitosa a ${serverKey}: ${connectionResult.serverName}`;
        results.steps[3].serverInfo = connectionResult;
      } catch (connError) {
        results.steps[3].status = "failed";
        results.steps[3].error = connError.message;

        // Analizar el error para dar recomendaciones específicas
        if (connError.message.includes("timeout")) {
          results.recommendations.push(
            "El timeout de conexión expiró. Verificar si el servidor SQL está accesible desde esta red"
          );
          results.recommendations.push(
            "Comprobar configuración de firewall y reglas de acceso al servidor SQL"
          );
        } else if (connError.message.includes("login failed")) {
          results.recommendations.push(
            "Error de autenticación. Verificar usuario y contraseña"
          );
        } else if (connError.message.includes("connect ECONNREFUSED")) {
          results.recommendations.push(
            "Conexión rechazada. Verificar que el host y puerto sean correctos"
          );
          results.recommendations.push(
            "Comprobar que el servidor SQL esté en ejecución"
          );
        }

        results.error = "SQL Server direct connection failed";
        return results;
      }

      // 5. Verificar configuración de la base de datos
      results.steps.push({
        name: "Database Configuration Check",
        status: "running",
      });

      try {
        const connection = await this.createTestConnection(dbConfig);

        // Verificar acceso a la base de datos específica
        const dbResult = await this.simpleQuery(
          connection,
          `SELECT DB_NAME() AS current_database, @@version AS sql_version`
        );

        const dbInfo = dbResult[0];
        results.steps[4].status = "success";
        results.steps[4].details = `Base de datos "${dbInfo.current_database}" accesible correctamente`;
        results.steps[4].dbInfo = dbInfo;

        // 6. Verificar rendimiento de consultas básicas
        results.steps.push({
          name: "Query Performance Test",
          status: "running",
        });

        // Medir tiempo de respuesta
        const startTime = Date.now();
        await this.simpleQuery(connection, "SELECT TOP 1 * FROM sys.tables");
        const endTime = Date.now();
        const responseTime = endTime - startTime;

        try {
          connection.close();
        } catch (e) {}

        if (responseTime > 1000) {
          results.steps[5].status = "warning";
          results.steps[5].details = `La consulta básica tardó ${responseTime}ms, lo que indica posible latencia alta`;
          results.recommendations.push(
            "La conexión funciona pero es lenta. Verificar latencia de red y carga del servidor SQL"
          );
        } else {
          results.steps[5].status = "success";
          results.steps[5].details = `Rendimiento de consulta aceptable: ${responseTime}ms`;
        }
      } catch (dbError) {
        results.steps[4].status = "failed";
        results.steps[4].error = dbError.message;
        results.recommendations.push(
          `Verificar que la base de datos "${dbConfig.database}" exista y que el usuario tenga permisos`
        );
        results.error = "Database configuration error";
        return results;
      }

      // Todo ha ido bien
      results.success = true;
      logger.info(
        `✅ Diagnóstico completo para ${serverKey} finalizado con éxito`
      );
    } catch (error) {
      logger.error(`❌ Error durante el diagnóstico de ${serverKey}:`, error);
      results.error = error.message;
      results.recommendations.push(
        "Error inesperado durante el diagnóstico. Revisar logs para más detalles."
      );
    }

    return results;
  }

  /**
   * Ejecuta una consulta simple sin usar validateParameters
   * @param {Connection} connection - Conexión a SQL Server
   * @param {string} queryString - Consulta SQL
   * @returns {Promise<Array>} - Resultados de la consulta
   */
  static simpleQuery(connection, queryString) {
    return new Promise((resolve, reject) => {
      const results = [];

      // Crear Request sin parámetros
      const request = new Request(queryString, (err, rowCount) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(results);
      });

      // Manejar filas
      request.on("row", (columns) => {
        const row = {};

        // Manejar diferentes formatos según versión de Tedious
        if (Array.isArray(columns)) {
          columns.forEach((column) => {
            row[column.metadata.colName] = column.value;
          });
        } else if (columns && typeof columns === "object") {
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

        results.push(row);
      });

      // Ejecutar la consulta
      connection.execSql(request);
    });
  }

  /**
   * Prueba una conexión directa a SQL Server
   * @param {Object} dbConfig - Configuración de la base de datos
   * @returns {Promise<Object>} - Información del servidor
   */
  static async testDirectConnection(dbConfig) {
    // Convertir config de MongoDB a formato Tedious
    const config = this.convertToTediousConfig(dbConfig);

    return new Promise((resolve, reject) => {
      const connection = new Connection(config);
      let timeoutId = setTimeout(() => {
        try {
          connection.close();
        } catch (e) {}
        reject(new Error("Timeout al intentar conectar a SQL Server"));
      }, 20000);

      connection.on("connect", (err) => {
        clearTimeout(timeoutId);

        if (err) {
          reject(err);
          return;
        }

        // Realizar consulta básica para obtener información del servidor
        this.simpleQuery(
          connection,
          "SELECT @@SERVERNAME AS ServerName, @@VERSION AS Version, SERVERPROPERTY('ProductVersion') AS ProductVersion;"
        )
          .then((results) => {
            try {
              connection.close();
            } catch (e) {}

            if (results.length > 0) {
              const serverInfo = {
                serverName: results[0].ServerName,
                version: results[0].Version,
                productVersion: results[0].ProductVersion,
              };
              resolve(serverInfo);
            } else {
              reject(new Error("La consulta no devolvió resultados"));
            }
          })
          .catch((error) => {
            try {
              connection.close();
            } catch (e) {}
            reject(error);
          });
      });

      connection.on("error", (err) => {
        clearTimeout(timeoutId);
        try {
          connection.close();
        } catch (e) {}
        reject(err);
      });

      try {
        connection.connect();
      } catch (e) {
        clearTimeout(timeoutId);
        reject(e);
      }
    });
  }

  /**
   * Crea una conexión de prueba a SQL Server
   * @param {Object} dbConfig - Configuración de la base de datos
   * @returns {Promise<Connection>} - Conexión establecida
   */
  static async createTestConnection(dbConfig) {
    // Convertir config de MongoDB a formato Tedious
    const config = this.convertToTediousConfig(dbConfig);

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
   * Convierte la configuración de MongoDB al formato de Tedious
   * @param {Object} dbConfig - Configuración de la base de datos
   * @returns {Object} - Configuración en formato Tedious
   */
  static convertToTediousConfig(dbConfig) {
    // Verificar si es una dirección IP
    const isIpAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(dbConfig.host);

    const config = {
      server: dbConfig.host,
      authentication: {
        type: "default",
        options: {
          userName: dbConfig.user,
          password: dbConfig.password,
        },
      },
      options: {
        encrypt: isIpAddress ? false : dbConfig.options?.encrypt || false,
        trustServerCertificate: true,
        enableArithAbort: true,
        database: dbConfig.database,
        connectTimeout: 20000,
        requestTimeout: 30000,
        rowCollectionOnRequestCompletion: true,
        useColumnNames: true,
      },
    };

    if (dbConfig.instance) {
      config.options.instanceName = dbConfig.instance;
    }

    if (dbConfig.port) {
      config.options.port = dbConfig.port;
    }

    return config;
  }

  /**
   * Realiza una comprobación rápida de salud de las conexiones a ambos servidores
   * @returns {Promise<Object>} - Estado de conexión a ambos servidores
   */
  static async checkConnectionHealth() {
    const results = {
      timestamp: new Date().toISOString(),
      mongodb: { connected: false },
      server1: { connected: false },
      server2: { connected: false },
    };

    try {
      // Comprobar MongoDB
      results.mongodb.connected = mongoose.connection.readyState === 1;

      if (!results.mongodb.connected) {
        const connected = await MongoDbService.connect();
        results.mongodb.connected = connected;
        results.mongodb.message = connected
          ? "Conexión establecida correctamente"
          : "No se pudo conectar a MongoDB";
      } else {
        results.mongodb.message = "Ya estaba conectado";
      }

      // Si MongoDB no está conectado, no podemos continuar
      if (!results.mongodb.connected) {
        return results;
      }

      // Comprobar server1
      const config1 = await DBConfig.findOne({ serverName: "server1" }).lean();

      if (config1) {
        try {
          const startTime = Date.now();
          const serverInfo = await this.testDirectConnection(config1);
          const endTime = Date.now();

          results.server1.connected = true;
          results.server1.responseTime = endTime - startTime;
          results.server1.serverName = serverInfo.serverName;
          results.server1.productVersion = serverInfo.productVersion;
        } catch (error) {
          results.server1.connected = false;
          results.server1.error = error.message;
        }
      } else {
        results.server1.message = "No hay configuración disponible";
      }

      // Comprobar server2
      const config2 = await DBConfig.findOne({ serverName: "server2" }).lean();

      if (config2) {
        try {
          const startTime = Date.now();
          const serverInfo = await this.testDirectConnection(config2);
          const endTime = Date.now();

          results.server2.connected = true;
          results.server2.responseTime = endTime - startTime;
          results.server2.serverName = serverInfo.serverName;
          results.server2.productVersion = serverInfo.productVersion;
        } catch (error) {
          results.server2.connected = false;
          results.server2.error = error.message;
        }
      } else {
        results.server2.message = "No hay configuración disponible";
      }
    } catch (error) {
      logger.error(
        "Error durante la comprobación de salud de conexiones:",
        error
      );
      results.error = error.message;
    }

    return results;
  }
}

module.exports = ConnectionDiagnostic;
