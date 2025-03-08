const mongoose = require("mongoose");
const logger = require("./logger");

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

      logger.info(
        `Conectando a MongoDB: ${MONGO_URI.replace(/:[^:]*@/, ":****@")}`
      );

      if (mongoose.connection.readyState === 1) {
        logger.info("La conexión a MongoDB ya está establecida");
        return true;
      }

      await mongoose.connect(MONGO_URI, {
        authSource: "admin",
      });

      logger.info("Conexión a MongoDB establecida");
      return true;
    } catch (error) {
      logger.error("Error al conectar a MongoDB:", error.message);
      return false;
    }
  }

  static async disconnect() {
    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
        logger.info("Conexión a MongoDB cerrada");
      }
      return true;
    } catch (error) {
      logger.error("Error al cerrar conexión a MongoDB:", error.message);
      return false;
    }
  }

  static isConnected() {
    return mongoose.connection.readyState === 1;
  }
}

module.exports = MongoDbService;
