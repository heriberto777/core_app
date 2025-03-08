const MongoDbService = require("./mongoDbService");
const logger = require("./logger");
const { initPools, getPoolsStatus } = require("./dbService");
const { startCronJob } = require("./cronService");

async function initializeServices() {
  try {
    logger.info("Iniciando servicios...");
    let allServicesOk = true;

    // 1. Conectar a MongoDB - CRÍTICO, debe completarse antes de continuar
    try {
      logger.info("Conectando a MongoDB...");
      const mongoConnected = await MongoDbService.connect();

      if (!mongoConnected) {
        logger.error("❌ No se pudo conectar a MongoDB");
        return false;
      }

      logger.info("✅ Conexión a MongoDB establecida correctamente");
    } catch (mongoError) {
      logger.error("❌ Error al conectar a MongoDB:", mongoError);
      return false;
    }

    // 2. Inicializar pools de conexiones SQL
    try {
      logger.info("Inicializando pools de conexiones SQL...");

      const DBConfig = require("../models/dbConfigModel");
      const configs = await DBConfig.find().lean();

      if (configs.length === 0) {
        logger.warn(
          "⚠️ No hay configuraciones de BD en MongoDB. Ejecute updateDBConfig.js"
        );
        allServicesOk = false;
      }

      const poolsInitialized = await initPools();

      if (poolsInitialized) {
        logger.info("✅ Pools de conexiones SQL inicializados correctamente");

        const poolStatus = getPoolsStatus();
        logger.info("Estado de los pools:", poolStatus);

        if (Object.keys(poolStatus).length === 0) {
          logger.warn("⚠️ Los pools se inicializaron pero están vacíos");
          allServicesOk = false;
        }
      } else {
        logger.error(
          "❌ No se pudieron inicializar los pools de conexiones SQL"
        );
        allServicesOk = false;
      }
    } catch (poolError) {
      logger.error(
        "❌ Error al inicializar pools de conexiones SQL:",
        poolError
      );
      allServicesOk = false;
    }

    // 3. Iniciar cron jobs
    try {
      logger.info("Configurando cronjob...");
      let executionHour = "03:00"; // Valor por defecto

      try {
        const Config = require("../models/configModel");
        const config = await Config.findOne();
        if (config && config.hour) {
          executionHour = config.hour;
        }
      } catch (configError) {
        logger.warn(
          "⚠️ Error al obtener configuración de hora, usando valor por defecto:",
          configError
        );
        allServicesOk = false;
      }

      logger.info(
        `⏰ Configurando transferencias programadas a las: ${executionHour}`
      );
      startCronJob(executionHour);
      logger.info("✅ Cronjob configurado correctamente");
    } catch (cronError) {
      logger.error("❌ Error al configurar cronjob:", cronError);
      allServicesOk = false;
    }

    logger.info(
      `✅ Inicialización de servicios completada (Estado general: ${
        allServicesOk ? "OK" : "Con advertencias"
      })`
    );
    return allServicesOk;
  } catch (error) {
    logger.error(
      "❌ Error general durante la inicialización de servicios:",
      error
    );
    return false;
  }
}

module.exports = {
  initializeServices,
};
