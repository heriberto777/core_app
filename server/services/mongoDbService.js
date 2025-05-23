const mongoose = require("mongoose");

class MongoDbService {
  static async connect() {
    try {
      let MONGO_URI = process.env.MONGO_URI;

      if (!MONGO_URI) {
        const DB_USER = process.env.DB_USER || "heriberto777";
        const DB_PASS = process.env.DB_PASS || "eli112910";
        const DB_HOST = process.env.DB_HOST || "localhost";
        const DB_PORT = process.env.DB_PORT || "27017";
        const DB_NAME = process.env.DB_NAME || "core_app";

        if (DB_USER && DB_PASS) {
          MONGO_URI = `mongodb://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
        } else {
          MONGO_URI = `mongodb://${DB_HOST}:${DB_PORT}/${DB_NAME}`;
        }
      }

      console.log(
        `🔗 Conectando a MongoDB: ${MONGO_URI.replace(/:[^:]*@/, ":****@")}`
      );

      if (mongoose.connection.readyState === 1) {
        console.log("✅ La conexión a MongoDB ya está establecida");
        return true;
      }

      // ✅ Configuración mejorada para evitar problemas de sesiones
      const connectionOptions = {
        authSource: "admin",
        serverSelectionTimeoutMS: 10000, // 10 segundos
        connectTimeoutMS: 10000,
        socketTimeoutMS: 0, // Sin timeout para operaciones largas
        maxPoolSize: 5, // Reducido para evitar problemas de pool
        minPoolSize: 1,
        maxIdleTimeMS: 30000, // 30 segundos antes de cerrar conexiones inactivas
        heartbeatFrequencyMS: 10000, // Verificar cada 10 segundos
        retryWrites: false, // ✅ Desactivar para evitar problemas de sesión
        retryReads: false, // ✅ Desactivar para evitar problemas de sesión

        // ✅ Configuración específica para evitar sesiones automáticas
        readPreference: "primary",
        readConcern: { level: "local" },
        writeConcern: { w: 1, j: false },
      };

      // Event listeners mejorados
      mongoose.connection.on("connected", () => {
        console.log("✅ MongoDB conectado exitosamente");
      });

      mongoose.connection.on("error", (error) => {
        console.error("❌ Error MongoDB:", error.message);
      });

      mongoose.connection.on("disconnected", () => {
        console.warn("⚠️ MongoDB desconectado");
      });

      mongoose.connection.on("reconnected", () => {
        console.log("🔄 MongoDB reconectado");
      });

      mongoose.connection.on("close", () => {
        console.warn("⚠️ Conexión MongoDB cerrada");
      });

      await mongoose.connect(MONGO_URI, connectionOptions);

      // ✅ Configurar mongoose para evitar sesiones automáticas
      mongoose.set("autoCreate", false); // No crear colecciones automáticamente
      mongoose.set("autoIndex", false); // No crear índices automáticamente en producción

      // Inicializar servicios opcionales
      try {
        const serverMonitorService = require("./serverMonitorService");
        if (
          serverMonitorService &&
          typeof serverMonitorService.start === "function"
        ) {
          serverMonitorService.start();
        }
      } catch (monitorError) {
        console.warn("⚠️ Servicio de monitoreo no disponible");
      }

      return true;
    } catch (error) {
      console.error("❌ Error conectando a MongoDB:", error.message);
      return false;
    }
  }

  static async disconnect() {
    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
        console.log("✅ MongoDB desconectado correctamente");
      }
      return true;
    } catch (error) {
      console.error("❌ Error desconectando MongoDB:", error.message);
      return false;
    }
  }

  static isConnected() {
    return mongoose.connection.readyState === 1;
  }

  static getConnectionState() {
    const states = {
      0: "disconnected",
      1: "connected",
      2: "connecting",
      3: "disconnecting",
    };

    return {
      state: mongoose.connection.readyState,
      stateName: states[mongoose.connection.readyState],
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name,
    };
  }

  // ✅ Método para verificar salud de conexión sin usar sesiones
  static async healthCheck() {
    try {
      if (!this.isConnected()) {
        return { healthy: false, error: "No conectado" };
      }

      // Ping simple sin sesiones
      await mongoose.connection.db.admin().ping();

      return {
        healthy: true,
        state: this.getConnectionState(),
        uptime: process.uptime(),
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        state: this.getConnectionState(),
      };
    }
  }
}

module.exports = MongoDbService;
