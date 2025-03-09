// services/healthMonitorService.js
const logger = require("./logger");
const ConnectionManager = require("./ConnectionManager");
const MongoDbService = require("./mongoDbService");
const ConnectionDiagnostic = require("./connectionDiagnostic");

// Configuración del monitor de salud
const HEALTH_CONFIG = {
  checkInterval: 5 * 60 * 1000, // Comprobar cada 5 minutos por defecto
  recoveryAttemptCount: 0,
  maxRecoveryAttempts: 3,
  lastIssueTime: null,
  cooldownPeriod: 30 * 60 * 1000, // 30 minutos entre recuperaciones
  isChecking: false,
  errorThreshold: {
    // Cantidad de errores necesarios para iniciar recuperación
    database: 3,
    connection: 5,
  },
  errorCounters: {
    database: 0,
    connection: 0,
  },
};

// Variable para almacenar el intervalo de monitoreo
let monitorInterval = null;

/**
 * Iniciar el servicio de monitoreo
 * @param {Number} interval - Intervalo de comprobación en ms
 */
function startHealthMonitor(interval = HEALTH_CONFIG.checkInterval) {
  if (monitorInterval) {
    clearInterval(monitorInterval);
  }

  logger.info(
    `Iniciando monitor de salud con intervalo de ${interval / 1000} segundos`
  );

  // Configurar el intervalo
  monitorInterval = setInterval(async () => {
    try {
      if (HEALTH_CONFIG.isChecking) {
        logger.debug(
          "Monitor de salud: ya hay una comprobación en curso, omitiendo..."
        );
        return;
      }

      HEALTH_CONFIG.isChecking = true;
      await checkSystemHealth();
      HEALTH_CONFIG.isChecking = false;
    } catch (error) {
      HEALTH_CONFIG.isChecking = false;
      logger.error("Error en monitor de salud:", error);
    }
  }, interval);

  // Ejecutar una comprobación inmediata
  setTimeout(async () => {
    try {
      HEALTH_CONFIG.isChecking = true;
      await checkSystemHealth();
      HEALTH_CONFIG.isChecking = false;
    } catch (error) {
      HEALTH_CONFIG.isChecking = false;
      logger.error("Error en comprobación inicial de salud:", error);
    }
  }, 5000);

  return true;
}

/**
 * Detener el servicio de monitoreo
 */
function stopHealthMonitor() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    logger.info("Monitor de salud detenido");
    return true;
  }
  return false;
}

/**
 * Realiza una comprobación completa del estado del sistema
 */
async function checkSystemHealth() {
  logger.debug("Iniciando comprobación completa de salud del sistema...");

  try {
    // 1. Verificar estado de MongoDB
    const mongoConnected = MongoDbService.isConnected();
    if (!mongoConnected) {
      logger.warn("MongoDB no está conectado, intentando reconectar...");
      const connected = await MongoDbService.connect();
      if (!connected) {
        logger.error("⚠️ No se pudo conectar a MongoDB");
        HEALTH_CONFIG.errorCounters.database++;

        if (
          HEALTH_CONFIG.errorCounters.database >=
          HEALTH_CONFIG.errorThreshold.database
        ) {
          logger.warn(
            `Umbral de errores de MongoDB alcanzado (${HEALTH_CONFIG.errorCounters.database}), intentando recuperación...`
          );
          await attemptDatabaseRecovery();
        }
        return;
      } else {
        logger.info("Conexión a MongoDB restablecida con éxito");
      }
    }

    // 2. Verificar estado de los pools
    let poolStatus = {};
    try {
      poolStatus = ConnectionManager.getPoolsStatus();
    } catch (error) {
      logger.warn("Error al obtener estado de pools:", error);
      poolStatus = {};
    }

    if (Object.keys(poolStatus).length === 0) {
      logger.warn(
        "No hay pools de conexión activos, intentando inicializar..."
      );

      let initialized = false;
      try {
        await ConnectionManager.initPool("server1");
        await ConnectionManager.initPool("server2");
        initialized = true;
      } catch (initError) {
        logger.error("Error al inicializar pools:", initError);
        initialized = false;
      }

      if (!initialized) {
        logger.error("⚠️ No se pudieron inicializar los pools de conexión");
        HEALTH_CONFIG.errorCounters.connection++;

        if (
          HEALTH_CONFIG.errorCounters.connection >=
          HEALTH_CONFIG.errorThreshold.connection
        ) {
          logger.warn(
            `Umbral de errores de conexión alcanzado (${HEALTH_CONFIG.errorCounters.connection}), intentando recuperación...`
          );
          await attemptConnectionRecovery();
        }
        return;
      } else {
        logger.info("Pools de conexión inicializados correctamente");
      }
    }

    // 3. Verificar conexiones a SQL Server
    const healthCheck = await ConnectionDiagnostic.checkConnectionHealth();

    const allOk =
      healthCheck.mongodb?.connected &&
      healthCheck.server1?.connected &&
      healthCheck.server2?.connected;

    if (!allOk) {
      logger.warn("Problemas detectados en la comprobación de conexiones:");
      logger.warn(JSON.stringify(healthCheck, null, 2));

      HEALTH_CONFIG.errorCounters.connection++;

      if (
        HEALTH_CONFIG.errorCounters.connection >=
        HEALTH_CONFIG.errorThreshold.connection
      ) {
        logger.warn(
          `Umbral de errores de conexión alcanzado (${HEALTH_CONFIG.errorCounters.connection}), intentando recuperación...`
        );
        await attemptConnectionRecovery();
      }
    } else {
      // Todo está bien, reiniciar contadores de error
      logger.debug(
        "Comprobación de salud exitosa, todo funciona correctamente"
      );
      HEALTH_CONFIG.errorCounters.database = 0;
      HEALTH_CONFIG.errorCounters.connection = 0;
    }
  } catch (error) {
    logger.error("Error durante comprobación de salud:", error);
  }
}

/**
 * Intenta recuperar el sistema de la base de datos
 */
async function attemptDatabaseRecovery() {
  // Verificar si estamos en período de enfriamiento
  if (
    HEALTH_CONFIG.lastIssueTime &&
    Date.now() - HEALTH_CONFIG.lastIssueTime < HEALTH_CONFIG.cooldownPeriod
  ) {
    logger.info(
      `En período de enfriamiento, esperando hasta ${new Date(
        HEALTH_CONFIG.lastIssueTime + HEALTH_CONFIG.cooldownPeriod
      )}`
    );
    return;
  }

  // Verificar si excedimos intentos máximos
  if (HEALTH_CONFIG.recoveryAttemptCount >= HEALTH_CONFIG.maxRecoveryAttempts) {
    logger.warn(
      `Máximo número de intentos de recuperación alcanzado (${HEALTH_CONFIG.maxRecoveryAttempts}), necesita intervención manual`
    );
    return;
  }

  logger.info(
    `Iniciando intento de recuperación #${
      HEALTH_CONFIG.recoveryAttemptCount + 1
    }...`
  );
  HEALTH_CONFIG.recoveryAttemptCount++;
  HEALTH_CONFIG.lastIssueTime = Date.now();

  try {
    // 1. Reconectar MongoDB
    await MongoDbService.disconnect();
    const mongoConnected = await MongoDbService.connect();

    if (!mongoConnected) {
      logger.error("No se pudo reconectar a MongoDB durante recuperación");
      return;
    }

    logger.info("MongoDB reconectado correctamente");

    // 2. Reiniciar pools de conexión
    try {
      await ConnectionManager.closePools();
      logger.info("Pools cerrados correctamente");
    } catch (closeError) {
      logger.error("Error al cerrar pools:", closeError);
    }

    let poolsInitialized = false;
    try {
      await ConnectionManager.initPool("server1");
      await ConnectionManager.initPool("server2");
      poolsInitialized = true;
    } catch (initError) {
      logger.error("Error al inicializar pools:", initError);
      poolsInitialized = false;
    }

    if (poolsInitialized) {
      logger.info("Pools reinicializados correctamente");

      // Verificar si la recuperación fue exitosa
      const healthCheck = await ConnectionDiagnostic.checkConnectionHealth();
      const allOk =
        healthCheck.mongodb?.connected &&
        healthCheck.server1?.connected &&
        healthCheck.server2?.connected;

      if (allOk) {
        logger.info("✅ Recuperación completada con éxito");
        // Reiniciar contadores de error
        HEALTH_CONFIG.errorCounters.database = 0;
        HEALTH_CONFIG.errorCounters.connection = 0;
        return true;
      } else {
        logger.warn("La recuperación no resolvió todos los problemas");
      }
    } else {
      logger.error(
        "No se pudieron reinicializar los pools durante la recuperación"
      );
    }
  } catch (error) {
    logger.error("Error durante intento de recuperación:", error);
  }

  return false;
}

/**
 * Intenta recuperar conexiones a SQL Server
 */
async function attemptConnectionRecovery() {
  // Verificar si estamos en período de enfriamiento
  if (
    HEALTH_CONFIG.lastIssueTime &&
    Date.now() - HEALTH_CONFIG.lastIssueTime < HEALTH_CONFIG.cooldownPeriod
  ) {
    logger.info(
      `En período de enfriamiento, esperando hasta ${new Date(
        HEALTH_CONFIG.lastIssueTime + HEALTH_CONFIG.cooldownPeriod
      )}`
    );
    return;
  }

  // Verificar si excedimos intentos máximos
  if (HEALTH_CONFIG.recoveryAttemptCount >= HEALTH_CONFIG.maxRecoveryAttempts) {
    logger.warn(
      `Máximo número de intentos de recuperación alcanzado (${HEALTH_CONFIG.maxRecoveryAttempts}), necesita intervención manual`
    );
    return;
  }

  logger.info(
    `Iniciando intento de recuperación de conexiones #${
      HEALTH_CONFIG.recoveryAttemptCount + 1
    }...`
  );
  HEALTH_CONFIG.recoveryAttemptCount++;
  HEALTH_CONFIG.lastIssueTime = Date.now();

  try {
    // 1. Cerrar pools existentes
    try {
      await ConnectionManager.closePools();
      logger.info("Pools cerrados correctamente");
    } catch (closeError) {
      logger.error("Error al cerrar pools:", closeError);
    }

    // 2. Esperar un momento para que las conexiones se liberen completamente
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // 3. Reinicializar pools
    let poolsInitialized = false;
    try {
      await ConnectionManager.initPool("server1");
      await ConnectionManager.initPool("server2");
      poolsInitialized = true;
    } catch (initError) {
      logger.error("Error al inicializar pools:", initError);
      poolsInitialized = false;
    }

    if (poolsInitialized) {
      logger.info("Pools reinicializados correctamente");

      // 4. Verificar si la recuperación fue exitosa
      const healthCheck = await ConnectionDiagnostic.checkConnectionHealth();
      const connectionsOk =
        healthCheck.server1?.connected && healthCheck.server2?.connected;

      if (connectionsOk) {
        logger.info("✅ Recuperación de conexiones completada con éxito");
        // Reiniciar contador de errores de conexión
        HEALTH_CONFIG.errorCounters.connection = 0;
        return true;
      } else {
        logger.warn(
          "La recuperación no resolvió todos los problemas de conexión"
        );
      }
    } else {
      logger.error(
        "No se pudieron reinicializar los pools durante la recuperación"
      );
    }
  } catch (error) {
    logger.error("Error durante intento de recuperación de conexiones:", error);
  }

  return false;
}

/**
 * Diagnóstico detallado de ambos servidores
 */
async function performFullDiagnostic() {
  logger.info("Iniciando diagnóstico completo del sistema...");

  try {
    // 1. Diagnóstico de MongoDB
    const mongoConnected = MongoDbService.isConnected();
    const mongoDiag = {
      connected: mongoConnected,
      status: mongoConnected ? "OK" : "ERROR",
      timestamp: new Date().toISOString(),
    };

    if (!mongoConnected) {
      logger.info("MongoDB no está conectado, intentando conectar...");
      const connected = await MongoDbService.connect();
      mongoDiag.reconnectAttempt = connected ? "SUCCESS" : "FAILED";
    }

    // 2. Diagnóstico de Server1
    let server1Diag;
    try {
      server1Diag = await ConnectionDiagnostic.diagnoseServerConnection(
        "server1"
      );
    } catch (error) {
      server1Diag = {
        success: false,
        error: error.message,
      };
    }

    // 3. Diagnóstico de Server2
    let server2Diag;
    try {
      server2Diag = await ConnectionDiagnostic.diagnoseServerConnection(
        "server2"
      );
    } catch (error) {
      server2Diag = {
        success: false,
        error: error.message,
      };
    }

    // 4. Verificar estado de pools
    let poolStatus = {};
    try {
      poolStatus = ConnectionManager.getPoolsStatus();
    } catch (poolError) {
      logger.warn("Error al obtener estado de pools:", poolError);
      poolStatus = { error: poolError.message };
    }

    // 5. Recopilar diagnóstico completo
    const diagnosticResult = {
      timestamp: new Date().toISOString(),
      mongodb: mongoDiag,
      server1: server1Diag,
      server2: server2Diag,
      pools: poolStatus,
      systemInfo: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        nodeVersion: process.version,
        platform: process.platform,
      },
    };

    logger.info("Diagnóstico completo finalizado");
    return diagnosticResult;
  } catch (error) {
    logger.error("Error durante diagnóstico completo:", error);
    throw error;
  }
}

/**
 * Registrar un error en el monitor de salud
 * @param {String} type - Tipo de error ('database' o 'connection')
 * @param {Error} error - Objeto de error
 */
function registerError(type, error) {
  if (!["database", "connection"].includes(type)) {
    logger.warn(`Tipo de error no reconocido: ${type}`);
    return;
  }

  HEALTH_CONFIG.errorCounters[type]++;
  logger.warn(
    `Error de ${type} registrado (${HEALTH_CONFIG.errorCounters[type]}/${HEALTH_CONFIG.errorThreshold[type]}):`,
    error.message
  );

  // Si alcanzamos el umbral, programar una comprobación inmediata
  if (HEALTH_CONFIG.errorCounters[type] >= HEALTH_CONFIG.errorThreshold[type]) {
    logger.warn(
      `Umbral de errores de ${type} alcanzado, programando comprobación inmediata...`
    );

    setTimeout(async () => {
      try {
        if (!HEALTH_CONFIG.isChecking) {
          HEALTH_CONFIG.isChecking = true;
          await checkSystemHealth();
          HEALTH_CONFIG.isChecking = false;
        }
      } catch (checkError) {
        HEALTH_CONFIG.isChecking = false;
        logger.error("Error en comprobación programada:", checkError);
      }
    }, 1000);
  }
}

module.exports = {
  startHealthMonitor,
  stopHealthMonitor,
  checkSystemHealth,
  performFullDiagnostic,
  registerError,
  attemptDatabaseRecovery,
  attemptConnectionRecovery,
  getStatus: () => ({
    isMonitoring: !!monitorInterval,
    config: HEALTH_CONFIG,
    lastCheck: new Date().toISOString(),
  }),
};
