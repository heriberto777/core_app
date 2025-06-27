// config/database.js - TU ARCHIVO CON PEQUEÑOS AJUSTES
const MongoDbService = require("../services/mongoDbService");

class DatabaseConfig {
  constructor() {
    this.isConnected = false;
    this.gracefulShutdownSetup = false; // ⭐ NUEVO: Para evitar múltiples registros
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

        // ⭐ CONFIGURAR MANEJO DE SEÑALES SOLO UNA VEZ ⭐
        this.setupGracefulShutdown();
      }

      return connected;
    } catch (error) {
      console.error("❌ Error conectando a la base de datos:", error.message);
      this.isConnected = false;
      throw error;
    }
  }

  // ⭐ DESCONECTAR USANDO TU SERVICIO EXISTENTE (MEJORADO) ⭐
  async disconnect() {
    try {
      if (!MongoDbService.isConnected()) {
        console.log("ℹ️ MongoDB ya está desconectado");
        this.isConnected = false;
        return true;
      }

      console.log("🔌 Desconectando de MongoDB...");

      // ⭐ DAR TIEMPO PARA OPERACIONES PENDIENTES ⭐
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const disconnected = await MongoDbService.disconnect();
      this.isConnected = false;

      if (disconnected) {
        console.log("✅ MongoDB desconectado correctamente");
      }

      return disconnected;
    } catch (error) {
      console.error(
        "❌ Error desconectando de la base de datos:",
        error.message
      );
      this.isConnected = false;
      throw error;
    }
  }

  // ⭐ NUEVO: CONFIGURAR MANEJO LIMPIO DE CIERRE ⭐
  setupGracefulShutdown() {
    if (this.gracefulShutdownSetup) {
      return; // Ya está configurado
    }

    const gracefulShutdown = async (signal) => {
      console.log(`\n🛑 Recibida señal ${signal}, cerrando aplicación...`);

      try {
        // Dar tiempo para operaciones pendientes
        console.log("⏳ Esperando operaciones pendientes...");
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Desconectar base de datos
        if (this.isConnectedToDatabase()) {
          await this.disconnect();
        }

        console.log("✅ Aplicación cerrada correctamente");
        process.exit(0);
      } catch (error) {
        console.error("❌ Error durante el cierre:", error.message);
        process.exit(1);
      }
    };

    // Solo registrar si no existen listeners
    if (process.listenerCount("SIGINT") === 0) {
      process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    }
    if (process.listenerCount("SIGTERM") === 0) {
      process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    }
    if (process.listenerCount("SIGUSR2") === 0) {
      process.on("SIGUSR2", () => gracefulShutdown("SIGUSR2")); // Para nodemon
    }

    this.gracefulShutdownSetup = true;
  }

  // ⭐ RESTO DE TUS MÉTODOS SIN CAMBIOS ⭐
  isConnectedToDatabase() {
    return MongoDbService.isConnected();
  }

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

  async withConnection(callback, autoDisconnect = false) {
    try {
      if (!this.isConnectedToDatabase()) {
        await this.connect();
      }

      const mongoose = require("mongoose");
      const result = await callback(mongoose.connection);

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

  extractHostFromConnectionString(connectionString) {
    try {
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

// ⭐ FUNCIONES DE CONVENIENCIA (SIN CAMBIOS) ⭐
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

// ⭐ NUEVO: FUNCIÓN PARA CIERRE LIMPIO ⭐
const gracefulShutdown = async (signal = "MANUAL") => {
  console.log(`\n🛑 Iniciando cierre limpio (${signal})...`);

  try {
    // Dar tiempo para operaciones pendientes
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Desconectar base de datos
    if (isDatabaseConnected()) {
      await disconnectFromDatabase();
    }

    console.log("✅ Cierre limpio completado");
    return true;
  } catch (error) {
    console.error("❌ Error durante cierre limpio:", error.message);
    throw error;
  }
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
  gracefulShutdown, // ⭐ NUEVO

  // Alias para compatibilidad con código existente
  connectWithMyConfig: connectToDatabase,

  // Exponer el servicio MongoDB original por si se necesita
  MongoDbService,
};
