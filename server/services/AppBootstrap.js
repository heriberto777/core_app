// services/AppBootstrap.js
const logger = require("./logger");
const MongoDbService = require("./mongoDbService");
const HealthMonitor = require("./healthMonitorService");
const Telemetry = require("./Telemetry");

/**
 * Clase encargada de inicializar los servicios principales de la aplicación
 */
class AppBootstrap {
  constructor() {
    this.initialized = false;
  }

  /**
   * Método para compatibilidad con el código existente
   * Devuelve un objeto con propiedad success
   */
  async initialize() {
    try {
      const result = await this.init();
      // Convertir boolean a objeto { success: true/false }
      return { success: result };
    } catch (error) {
      logger.error("Error en initialize():", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Inicializa todos los servicios necesarios para la aplicación
   */
  async init() {
    if (this.initialized) {
      logger.warn("AppBootstrap: La aplicación ya ha sido inicializada");
      return true;
    }

    try {
      logger.info("🚀 Iniciando servicios de la aplicación...");

      // 1. Conectar a MongoDB
      logger.info("📊 Conectando a MongoDB...");
      const mongoConnected = await MongoDbService.connect();

      if (!mongoConnected) {
        logger.error(
          "❌ Error al conectar a MongoDB. La aplicación puede no funcionar correctamente."
        );
        // Desactivar el transporte MongoDB en caso de fallo de conexión
        process.env.DISABLE_MONGO_LOGS = "true";
        logger.info(
          "⚠️ Se ha desactivado el registro en MongoDB debido a error de conexión"
        );
      } else {
        logger.info("✅ Conexión a MongoDB establecida correctamente");

        // Verificar que el modelo de logs funciona correctamente
        try {
          const Log = require("../models/loggerModel");

          // Crear log de prueba para verificar que funciona
          const testLog = new Log({
            level: "info",
            message: "🧪 Test de conexión a MongoDB para logs",
            source: "system",
            timestamp: new Date(),
          });

          await testLog.save();

          // Si llegamos aquí, el log se guardó correctamente
          logger.info("✅ Sistema de logs en MongoDB verificado correctamente");

          // Ahora registrar el log real de inicio
          await Log.createLog("info", "🚀 Aplicación iniciada", {
            source: "system",
            metadata: {
              version: process.env.npm_package_version || "unknown",
              environment: process.env.NODE_ENV || "development",
            },
          });
        } catch (logError) {
          logger.error(
            "❌ Error al verificar el sistema de logs en MongoDB:",
            logError
          );
          logger.warn(
            "⚠️ El registro en MongoDB puede no estar funcionando correctamente"
          );

          // No desactivamos completamente para seguir intentando
          // Si hay problemas persistentes, se pueden manejar en el transporte
        }
      }

      // 2. Iniciar monitoreo de salud del sistema
      try {
        logger.info("🔍 Iniciando monitor de salud del sistema...");
        const healthStarted = HealthMonitor.startHealthMonitor();

        if (healthStarted) {
          logger.info("✅ Monitor de salud iniciado correctamente");
        } else {
          logger.warn("⚠️ No se pudo iniciar el monitor de salud");
        }
      } catch (healthError) {
        logger.error("❌ Error al iniciar monitor de salud:", healthError);
      }

      // 3. Resetear telemetría al inicio
      try {
        logger.info("📈 Inicializando telemetría...");
        Telemetry.resetHourly();
        logger.info("✅ Telemetría inicializada correctamente");
      } catch (telemetryError) {
        logger.error("❌ Error al inicializar telemetría:", telemetryError);
      }

      // 4. Iniciar cron service si está disponible
      try {
        const { startCronJob } = require("./cronService");
        const Config = require("../models/configModel");

        const config = await Config.findOne();
        const cronTime = config?.hour || "02:00"; // Hora por defecto 2 AM

        logger.info(
          `⏰ Configurando tareas programadas para ejecutarse diariamente a las ${cronTime}...`
        );
        startCronJob(cronTime);
        logger.info("✅ Tareas programadas configuradas correctamente");
      } catch (cronError) {
        logger.warn(
          "⚠️ No se pudo iniciar el servicio de tareas programadas:",
          cronError.message
        );
      }

      this.initialized = true;
      logger.info(
        "✅ Todos los servicios han sido inicializados correctamente"
      );

      return true;
    } catch (error) {
      logger.error(
        "❌ Error durante la inicialización de la aplicación:",
        error
      );
      return false;
    }
  }

  /**
   * Detiene todos los servicios de la aplicación de manera ordenada
   */
  async shutdown() {
    logger.info("🛑 Iniciando cierre ordenado de la aplicación...");

    try {
      // 1. Detener monitoreo de salud
      try {
        logger.info("🔍 Deteniendo monitor de salud...");
        HealthMonitor.stopHealthMonitor();
      } catch (error) {
        logger.warn("⚠️ Error al detener monitor de salud:", error.message);
      }

      // 2. Registrar log de cierre en MongoDB si es posible
      if (MongoDbService.isConnected()) {
        try {
          const Log = require("../models/loggerModel");
          await Log.createLog("info", "🛑 Cierre ordenado de la aplicación", {
            source: "system",
          });
        } catch (error) {
          logger.warn("⚠️ Error al registrar log de cierre:", error.message);
        }
      }

      // 3. Desconectar MongoDB al final
      try {
        logger.info("📊 Cerrando conexión a MongoDB...");
        await MongoDbService.disconnect();
      } catch (error) {
        logger.warn("⚠️ Error al desconectar MongoDB:", error.message);
      }

      logger.info("✅ Aplicación cerrada correctamente");
      return true;
    } catch (error) {
      logger.error("❌ Error durante el cierre de la aplicación:", error);
      return false;
    }
  }
}

// Crear instancia singleton
const instance = new AppBootstrap();

// Configurar manejadores para cierre ordenado
process.on("SIGTERM", async () => {
  logger.info("Señal SIGTERM recibida, iniciando cierre ordenado...");
  await instance.shutdown();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("Señal SIGINT recibida, iniciando cierre ordenado...");
  await instance.shutdown();
  process.exit(0);
});

// Exportar instancia singleton
module.exports = instance;
