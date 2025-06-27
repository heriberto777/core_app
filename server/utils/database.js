// config/database.js
const MongoDbService = require("../services/mongoDbService");

class DatabaseConfig {
  constructor() {
    this.isConnected = false;
  }

  // ⭐ CONECTAR USANDO TU SERVICIO EXISTENTE ⭐
  async connect(customConnectionString = null) {
    try {
      if (MongoDbService.isConnected()) {
        console.log("🔗 Ya conectado a la base de datos");
        this.isConnected = true;
        return true;
      }

      console.log("🔄 Conectando a la base de datos...");

      // Si se proporciona un string personalizado, temporalmente actualizar las variables de entorno
      if (customConnectionString) {
        const originalUri = process.env.MONGO_URI;
        process.env.MONGO_URI = customConnectionString;

        try {
          const connected = await MongoDbService.connect();
          this.isConnected = connected;
          return connected;
        } finally {
          // Restaurar URI original
          if (originalUri) {
            process.env.MONGO_URI = originalUri;
          } else {
            delete process.env.MONGO_URI;
          }
        }
      }

      const connected = await MongoDbService.connect();
      this.isConnected = connected;

      if (connected) {
        console.log("✅ Conectado exitosamente a la base de datos");
        const connectionInfo = MongoDbService.getConnectionState();
        console.log(`📊 Estado: ${connectionInfo.stateName}`);
        console.log(`🖥️ Host: ${connectionInfo.host}:${connectionInfo.port}`);
        console.log(`🗄️ Base de datos: ${connectionInfo.name}`);
      }

      return connected;
    } catch (error) {
      console.error("❌ Error conectando a la base de datos:", error.message);
      this.isConnected = false;
      throw error;
    }
  }

  // ⭐ DESCONECTAR USANDO TU SERVICIO EXISTENTE ⭐
  async disconnect() {
    try {
      const disconnected = await MongoDbService.disconnect();
      this.isConnected = false;
      return disconnected;
    } catch (error) {
      console.error(
        "❌ Error desconectando de la base de datos:",
        error.message
      );
      throw error;
    }
  }

  // ⭐ VERIFICAR ESTADO DE CONEXIÓN ⭐
  isConnectedToDatabase() {
    return MongoDbService.isConnected();
  }

  // ⭐ OBTENER INFORMACIÓN DE CONEXIÓN ⭐
  getConnectionInfo() {
    if (!this.isConnectedToDatabase()) {
      return {
        connected: false,
        state: "disconnected",
      };
    }

    const connectionState = MongoDbService.getConnectionState();
    return {
      connected: true,
      state: connectionState.stateName,
      stateCode: connectionState.state,
      host: connectionState.host,
      port: connectionState.port,
      database: connectionState.name,
    };
  }

  // ⭐ VERIFICAR SALUD DE LA BASE DE DATOS ⭐
  async healthCheck() {
    try {
      const healthResult = await MongoDbService.healthCheck();

      if (healthResult.healthy) {
        return {
          healthy: true,
          message: "Base de datos funcionando correctamente",
          info: this.getConnectionInfo(),
          uptime: healthResult.uptime,
        };
      } else {
        return {
          healthy: false,
          message: "Base de datos no saludable",
          error: healthResult.error,
          info: this.getConnectionInfo(),
        };
      }
    } catch (error) {
      return {
        healthy: false,
        message: "Error en verificación de salud de BD",
        error: error.message,
      };
    }
  }

  // ⭐ MÉTODO PARA EJECUTAR CON CONEXIÓN GARANTIZADA ⭐
  async withConnection(callback, autoDisconnect = false) {
    try {
      // Asegurar conexión
      if (!this.isConnectedToDatabase()) {
        await this.connect();
      }

      // Ejecutar callback con el objeto de conexión de mongoose
      const mongoose = require("mongoose");
      const result = await callback(mongoose.connection);

      // Desconectar si se requiere
      if (autoDisconnect) {
        await this.disconnect();
      }

      return result;
    } catch (error) {
      if (autoDisconnect) {
        try {
          await this.disconnect();
        } catch (disconnectError) {
          console.error(
            "Error desconectando después de error:",
            disconnectError
          );
        }
      }
      throw error;
    }
  }

  // ⭐ OBTENER ESTADÍSTICAS DE LA BASE DE DATOS ⭐
  async getConnectionStats() {
    try {
      if (!this.isConnectedToDatabase()) {
        return null;
      }

      const mongoose = require("mongoose");
      const db = mongoose.connection.db;
      const stats = await db.stats();

      return {
        database: mongoose.connection.name,
        collections: stats.collections,
        dataSize: stats.dataSize,
        storageSize: stats.storageSize,
        indexes: stats.indexes,
        indexSize: stats.indexSize,
        objects: stats.objects,
        avgObjSize: stats.avgObjSize,
      };
    } catch (error) {
      console.error("Error obteniendo estadísticas:", error);
      return null;
    }
  }

  // ⭐ FUNCIONES AUXILIARES ⭐
  extractHostFromConnectionString(connectionString) {
    try {
      // Tu servicio maneja esto internamente
      const connectionInfo = this.getConnectionInfo();
      return connectionInfo.host
        ? `${connectionInfo.host}:${connectionInfo.port}`
        : "localhost";
    } catch (error) {
      return "localhost";
    }
  }

  getReadyStateDescription(state) {
    const states = {
      0: "disconnected",
      1: "connected",
      2: "connecting",
      3: "disconnecting",
    };
    return states[state] || "unknown";
  }
}

// ⭐ INSTANCIA SINGLETON ⭐
const databaseConfig = new DatabaseConfig();

// ⭐ FUNCIONES DE CONVENIENCIA ⭐
const connectToDatabase = async (customConnectionString = null) => {
  return await databaseConfig.connect(customConnectionString);
};

const disconnectFromDatabase = async () => {
  return await databaseConfig.disconnect();
};

const getDatabaseInfo = () => {
  return databaseConfig.getConnectionInfo();
};

const isDatabaseConnected = () => {
  return databaseConfig.isConnectedToDatabase();
};

const withDatabaseConnection = async (callback, autoDisconnect = false) => {
  return await databaseConfig.withConnection(callback, autoDisconnect);
};

const checkDatabaseHealth = async () => {
  return await databaseConfig.healthCheck();
};

const getDatabaseStats = async () => {
  return await databaseConfig.getConnectionStats();
};

module.exports = {
  // Clase principal
  DatabaseConfig,
  databaseConfig,

  // Funciones de conveniencia
  connectToDatabase,
  disconnectFromDatabase,
  getDatabaseInfo,
  isDatabaseConnected,
  withDatabaseConnection,
  checkDatabaseHealth,
  getDatabaseStats,

  // Alias para compatibilidad con código existente
  connectWithMyConfig: connectToDatabase,

  // Exponer el servicio MongoDB original por si se necesita
  MongoDbService,
};
