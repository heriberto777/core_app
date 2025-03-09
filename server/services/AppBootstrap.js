// services/AppBootstrap.js
const fs = require("fs");
const logger = require("./logger");
const MongoDbService = require("./mongoDbService");
const ConnectionManager = require("./ConnectionManager");
const MemoryManager = require("./MemoryManager");
const HealthMonitor = require("./healthMonitorService");
const { startCronJob } = require("./cronService");

/**
 * Servicio para arranque y configuración ordenada de la aplicación
 */
class AppBootstrap {
  /**
   * Inicializa la aplicación y todos sus servicios
   */
  async initialize() {
    try {
      logger.info("===== INICIANDO APLICACIÓN =====");
      const startTime = Date.now();

      // Crear estructura de directorios necesaria
      this.ensureDirectories();

      // 1. Inicializar MongoDB (prerrequisito para otros servicios)
      logger.info("1. Conectando a MongoDB...");
      const mongoConnected = await this.initMongoDB();

      if (!mongoConnected) {
        logger.error(
          "❌ No se pudo conectar a MongoDB, intentando continuar con funcionalidad limitada..."
        );
      } else {
        logger.info("✅ Conexión a MongoDB establecida correctamente");
      }

      // 2. Inicializar pools de conexión SQL
      logger.info("2. Inicializando pools de conexión SQL...");
      const dbConnected = await this.initDatabasePools();

      if (!dbConnected) {
        logger.warn(
          "⚠️ No se pudieron inicializar completamente los pools de conexión SQL"
        );
      } else {
        logger.info("✅ Pools de conexión SQL inicializados correctamente");
      }

      // 3. Inicializar monitor de salud
      logger.info("3. Iniciando monitor de salud del sistema...");
      const healthMonitorStarted = await this.initHealthMonitor();

      if (!healthMonitorStarted) {
        logger.warn("⚠️ No se pudo iniciar el monitor de salud del sistema");
      } else {
        logger.info("✅ Monitor de salud iniciado correctamente");
      }

      // 4. Iniciar tareas programadas
      logger.info("4. Configurando tareas programadas...");
      const cronStarted = await this.startScheduledTasks();

      if (!cronStarted) {
        logger.warn("⚠️ No se pudieron iniciar todas las tareas programadas");
      } else {
        logger.info("✅ Tareas programadas configuradas correctamente");
      }

      // 5. Verificar estado general del sistema
      logger.info("5. Verificando estado general del sistema...");
      const systemHealth = await this.checkSystemHealth();

      // 6. Registrar tiempo de arranque
      const bootTime = Date.now() - startTime;
      logger.info(`===== APLICACIÓN INICIADA EN ${bootTime}ms =====`);

      // Devolver estado general de la inicialización
      return {
        success: mongoConnected && dbConnected,
        mongodb: mongoConnected,
        database: dbConnected,
        healthMonitor: healthMonitorStarted,
        cronTasks: cronStarted,
        systemHealth,
        bootTime,
      };
    } catch (error) {
      logger.error(
        "Error fatal durante la inicialización de la aplicación:",
        error
      );
      return {
        success: false,
        error: error.message,
        stack: error.stack,
      };
    }
  }

  /**
   * Asegura que existan los directorios necesarios
   */
  ensureDirectories() {
    const dirs = ["./logs", "./temp", "./uploads"];

    dirs.forEach((dir) => {
      if (!fs.existsSync(dir)) {
        try {
          fs.mkdirSync(dir, { recursive: true });
          logger.info(`Directorio creado: ${dir}`);
        } catch (error) {
          logger.warn(`No se pudo crear directorio ${dir}: ${error.message}`);
        }
      }
    });
  }

  /**
   * Inicializa conexión a MongoDB
   */
  async initMongoDB() {
    try {
      // Intentar conexión con reintentos internos
      const connected = await MongoDbService.connect();

      if (!connected) {
        logger.error(
          "No se pudo conectar a MongoDB después de reintentos internos"
        );
        return false;
      }

      return true;
    } catch (error) {
      logger.error("Error al conectar a MongoDB:", error);
      return false;
    }
  }

  /**
   * Inicializa pools de conexión a SQL Server
   */
  async initDatabasePools() {
    try {
      // Verificar que MongoDB esté conectado primero
      if (!MongoDbService.isConnected()) {
        logger.warn(
          "MongoDB no está conectado, intentando conectar antes de inicializar pools..."
        );

        const connected = await MongoDbService.connect();
        if (!connected) {
          logger.error(
            "No se pudo conectar a MongoDB, no se pueden cargar configuraciones de BD"
          );
          return false;
        }
      }

      // Inicializar server1
      logger.info("Inicializando pool de conexiones para server1...");
      const server1Initialized = await ConnectionManager.initPool("server1");

      // Inicializar server2
      logger.info("Inicializando pool de conexiones para server2...");
      const server2Initialized = await ConnectionManager.initPool("server2");

      // Verificar si al menos uno se inicializó correctamente
      if (!server1Initialized && !server2Initialized) {
        logger.error("No se pudo inicializar ningún pool de conexiones");
        return false;
      }

      // Mostrar estado de los pools
      const poolStatus = ConnectionManager.getPoolsStatus();
      logger.info("Estado de los pools de conexión:", poolStatus);

      return true;
    } catch (error) {
      logger.error("Error al inicializar pools de conexión:", error);
      return false;
    }
  }

  /**
   * Inicia el monitor de salud del sistema
   */
  async initHealthMonitor() {
    try {
      // Iniciar con intervalo personalizado (cada 5 minutos)
      return await HealthMonitor.startHealthMonitor(5 * 60 * 1000);
    } catch (error) {
      logger.error("Error al iniciar monitor de salud:", error);
      return false;
    }
  }

  /**
   * Inicia las tareas programadas
   */
  async startScheduledTasks() {
    try {
      // Cargar hora desde configuración en MongoDB
      let executionHour = "03:00"; // Valor por defecto

      try {
        if (MongoDbService.isConnected()) {
          const Config = require("../models/configModel");
          const config = await Config.findOne();
          if (config && config.hour) {
            executionHour = config.hour;
          }
        }
      } catch (configError) {
        logger.warn(
          "⚠️ Error al obtener configuración de hora, usando valor por defecto:",
          configError
        );
      }

      logger.info(
        `⏰ Configurando transferencias programadas a las: ${executionHour}`
      );
      startCronJob(executionHour);

      return true;
    } catch (error) {
      logger.error("Error al iniciar tareas programadas:", error);
      return false;
    }
  }

  /**
   * Verifica el estado general del sistema
   */
  async checkSystemHealth() {
    try {
      // Obtener diagnóstico completo
      const fullDiagnostic = await HealthMonitor.performFullDiagnostic();

      // Verificar componentes críticos
      const critical = {
        mongodb: !fullDiagnostic.mongodb?.connected,
        server1: !fullDiagnostic.server1?.success,
        server2: !fullDiagnostic.server2?.success,
      };

      // Si hay componentes críticos fallando, programar verificación e intento de recuperación
      if (critical.mongodb || critical.server1 || critical.server2) {
        logger.warn(
          "Se detectaron problemas en componentes críticos, programando verificación..."
        );

        setTimeout(async () => {
          await HealthMonitor.checkSystemHealth();
        }, 60000); // Verificar en 1 minuto
      }

      // Registro de uso de memoria
      MemoryManager.logMemoryUsage("Bootstrap completion");

      return {
        mongodb: fullDiagnostic.mongodb,
        databases: {
          server1: fullDiagnostic.server1,
          server2: fullDiagnostic.server2,
        },
        pools: fullDiagnostic.pools,
        memory: MemoryManager.getStats().current,
        hasCriticalIssues:
          critical.mongodb || critical.server1 || critical.server2,
      };
    } catch (error) {
      logger.error("Error al verificar estado del sistema:", error);
      return {
        error: error.message,
        hasCriticalIssues: true,
      };
    }
  }

  /**
   * Cierre ordenado de la aplicación
   */
  async shutdown() {
    logger.info("===== INICIANDO CIERRE ORDENADO DE LA APLICACIÓN =====");

    try {
      // 1. Detener monitor de salud
      logger.info("1. Deteniendo monitor de salud...");
      HealthMonitor.stopHealthMonitor();

      // 2. Cerrar pools de conexiones
      logger.info("2. Cerrando pools de conexiones...");
      await ConnectionManager.closePools();

      // 3. Cerrar conexión a MongoDB
      logger.info("3. Cerrando conexión a MongoDB...");
      await MongoDbService.disconnect();

      // 4. Limpieza final
      logger.info("4. Realizando limpieza final...");
      if (global.gc) {
        global.gc();
        logger.info("   Recolección de basura forzada ejecutada");
      }

      logger.info("===== APLICACIÓN CERRADA CORRECTAMENTE =====");
      return true;
    } catch (error) {
      logger.error("Error durante el cierre de la aplicación:", error);
      return false;
    }
  }
}

// Exportar instancia singleton
module.exports = new AppBootstrap();
