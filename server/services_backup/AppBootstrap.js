// services/AppBootstrap.js - Versión refactorizada
const logger = require("./logger");
const MongoDbService = require("./mongoDbService");
const HealthMonitor = require("./healthMonitorService");
const Telemetry = require("./Telemetry");
const UnifiedCancellationService = require("./UnifiedCancellationService");

/**
 * Clase encargada de inicializar los servicios principales de la aplicación
 */
class AppBootstrap {
  constructor() {
    this.initialized = false;
    this.state = {
      mongodb: false,
      healthMonitor: false,
      telemetry: false,
      cancellationService: false,
      cronService: false,
    };
  }

  /**
   * Método para compatibilidad con el código existente
   */
  async initialize() {
    try {
      const result = await this.init();
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

      // 1. Inicializar servicio de cancelación primero
      await this.initializeCancellationService();

      // 2. Conectar a MongoDB
      await this.initializeMongoDB();

      // 3. Iniciar telemetría
      await this.initializeTelemetry();

      // 4. Iniciar monitor de salud
      await this.initializeHealthMonitor();

      // 5. Iniciar cron service
      await this.initializeCronService();

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
   * Inicializa el servicio de cancelación
   */
  async initializeCancellationService() {
    try {
      UnifiedCancellationService.initialize();
      this.state.cancellationService = true;
      logger.info("✅ Servicio de cancelación inicializado");
    } catch (error) {
      logger.error("Error al inicializar servicio de cancelación:", error);
    }
  }

  /**
   * Inicializa la conexión a MongoDB
   */
  async initializeMongoDB() {
    try {
      logger.info("📊 Conectando a MongoDB...");
      const mongoConnected = await MongoDbService.connect();

      if (!mongoConnected) {
        logger.error(
          "❌ Error al conectar a MongoDB. La aplicación puede no funcionar correctamente."
        );
        process.env.DISABLE_MONGO_LOGS = "true";
        logger.info(
          "⚠️ Se ha desactivado el registro en MongoDB debido a error de conexión"
        );
        this.state.mongodb = false;
        return;
      }

      this.state.mongodb = true;
      logger.info("✅ Conexión a MongoDB establecida correctamente");

      // Verificar modelo de logs
      await this.verifyLogModel();
    } catch (error) {
      logger.error("Error en inicialización de MongoDB:", error);
      this.state.mongodb = false;
    }
  }

  /**
   * Verifica el modelo de logs en MongoDB
   */
  async verifyLogModel() {
    try {
      const Log = require("../models/loggerModel");

      // Crear log de prueba con timeout
      const testLog = new Log({
        level: "info",
        message: "🧪 Test de conexión a MongoDB para logs",
        source: "system",
        timestamp: new Date(),
      });

      await Promise.race([
        testLog.save(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout al verificar logs")), 5000)
        ),
      ]);

      logger.info("✅ Sistema de logs en MongoDB verificado correctamente");

      // Registrar log de inicio si todo está bien
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
    }
  }

  /**
   * Inicializa el monitor de salud
   */
  async initializeHealthMonitor() {
    try {
      logger.info("🔍 Iniciando monitor de salud del sistema...");
      const healthStarted = HealthMonitor.startHealthMonitor();

      if (healthStarted) {
        this.state.healthMonitor = true;
        logger.info("✅ Monitor de salud iniciado correctamente");
      } else {
        logger.warn("⚠️ No se pudo iniciar el monitor de salud");
      }
    } catch (healthError) {
      logger.error("❌ Error al iniciar monitor de salud:", healthError);
    }
  }

  /**
   * Inicializa la telemetría
   */
  async initializeTelemetry() {
    try {
      logger.info("📈 Inicializando telemetría...");
      Telemetry.resetHourly();
      this.state.telemetry = true;
      logger.info("✅ Telemetría inicializada correctamente");
    } catch (telemetryError) {
      logger.error("❌ Error al inicializar telemetría:", telemetryError);
    }
  }

  /**
   * Inicializa el servicio de cron
   */
  async initializeCronService() {
    try {
      const { startCronJob } = require("./cronService");
      const Config = require("../models/configModel");

      const config = await Config.findOne();
      const cronTime = config?.hour || "02:00";

      logger.info(
        `⏰ Configurando tareas programadas para ejecutarse diariamente a las ${cronTime}...`
      );
      startCronJob(cronTime);
      this.state.cronService = true;
      logger.info("✅ Tareas programadas configuradas correctamente");
    } catch (cronError) {
      logger.warn(
        "⚠️ No se pudo iniciar el servicio de tareas programadas:",
        cronError.message
      );
    }
  }

  /**
   * Detiene todos los servicios de la aplicación de manera ordenada
   */
  async shutdown() {
    logger.info("🛑 Iniciando cierre ordenado de la aplicación...");
    let shutdownSuccess = true;

    try {
      // 1. Detener servicio de cancelación
      if (this.state.cancellationService) {
        try {
          UnifiedCancellationService.shutdown();
          logger.info("✅ Servicio de cancelación detenido");
        } catch (error) {
          logger.warn(
            "⚠️ Error al detener servicio de cancelación:",
            error.message
          );
          shutdownSuccess = false;
        }
      }

      // 2. Detener monitor de salud
      if (this.state.healthMonitor) {
        try {
          HealthMonitor.stopHealthMonitor();
          logger.info("✅ Monitor de salud detenido");
        } catch (error) {
          logger.warn("⚠️ Error al detener monitor de salud:", error.message);
          shutdownSuccess = false;
        }
      }

      // 3. Registrar log de cierre en MongoDB si es posible
      if (this.state.mongodb && MongoDbService.isConnected()) {
        try {
          const Log = require("../models/loggerModel");
          await Log.createLog("info", "🛑 Cierre ordenado de la aplicación", {
            source: "system",
          });
        } catch (error) {
          logger.warn("⚠️ Error al registrar log de cierre:", error.message);
        }
      }

      // 4. Desconectar MongoDB al final
      if (this.state.mongodb) {
        try {
          logger.info("📊 Cerrando conexión a MongoDB...");
          await MongoDbService.disconnect();
          logger.info("✅ MongoDB desconectado correctamente");
        } catch (error) {
          logger.warn("⚠️ Error al desconectar MongoDB:", error.message);
          shutdownSuccess = false;
        }
      }

      logger.info(
        shutdownSuccess
          ? "✅ Aplicación cerrada correctamente"
          : "⚠️ Aplicación cerrada con advertencias"
      );

      return shutdownSuccess;
    } catch (error) {
      logger.error("❌ Error durante el cierre de la aplicación:", error);
      return false;
    }
  }

  /**
   * Obtiene el estado actual de los servicios
   */
  getState() {
    return {
      initialized: this.initialized,
      services: this.state,
    };
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
