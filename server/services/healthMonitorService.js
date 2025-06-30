// services/healthMonitorService.js - TU CÓDIGO ORIGINAL CON CAMBIOS MÍNIMOS
const logger = require("./logger");
const ConnectionCentralService = require("./ConnectionCentralService");
const MongoDbService = require("./mongoDbService");
const ConnectionDiagnostic = require("./connectionDiagnostic");

// TU CONFIGURACIÓN ORIGINAL - SIN CAMBIOS
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

// TU VARIABLE ORIGINAL - SIN CAMBIOS
let monitorInterval = null;

/**
 * TU FUNCIÓN ORIGINAL - SIN CAMBIOS
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
 * TU FUNCIÓN ORIGINAL - SIN CAMBIOS
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
 * TU FUNCIÓN ORIGINAL CON CAMBIO MÍNIMO
 */
async function checkSystemHealth() {
  logger.debug("Iniciando comprobación completa de salud del sistema...");

  try {
    // TU LÓGICA ORIGINAL DE MONGODB - SIN CAMBIOS
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

    // TU LÓGICA ORIGINAL DE POOLS - SIN CAMBIOS
    let poolStatus = {};
    try {
      poolStatus = ConnectionCentralService.getConnectionStats();
    } catch (error) {
      logger.warn("Error al obtener estado de pools:", error);
      poolStatus = {};
    }

    // Verificar si hay pools activos
    const hasActivePools =
      poolStatus.pools && Object.keys(poolStatus.pools).length > 0;

    if (!hasActivePools) {
      logger.warn(
        "No hay pools de conexión activos, intentando inicializar..."
      );

      let initialized = false;
      try {
        const init1 = await ConnectionCentralService.initPool("server1");
        const init2 = await ConnectionCentralService.initPool("server2");
        initialized = init1 && init2;
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

    // ✅ CAMBIO MÍNIMO: Solo cambiar método de diagnóstico
    const healthResults = {};

    // Verificar server1
    try {
      const server1Result = await ConnectionCentralService.diagnoseConnection(
        "server1"
      );
      healthResults.server1 = {
        connected: server1Result.success,
        error: server1Result.success ? null : server1Result.error,
      };
    } catch (error) {
      healthResults.server1 = {
        connected: false,
        error: error.message,
      };
    }

    // Verificar server2
    try {
      const server2Result = await ConnectionCentralService.diagnoseConnection(
        "server2"
      );
      healthResults.server2 = {
        connected: server2Result.success,
        error: server2Result.success ? null : server2Result.error,
      };
    } catch (error) {
      healthResults.server2 = {
        connected: false,
        error: error.message,
      };
    }

    // Agregar estado de MongoDB
    healthResults.mongodb = {
      connected: mongoConnected,
    };

    // TU LÓGICA ORIGINAL - SIN CAMBIOS
    const allOk =
      healthResults.mongodb?.connected &&
      healthResults.server1?.connected &&
      healthResults.server2?.connected;

    if (!allOk) {
      logger.warn("Problemas detectados en la comprobación de conexiones:");
      logger.warn(JSON.stringify(healthResults, null, 2));

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

      // ✅ CAMBIO MÍNIMO: Solo cambiar método de debug
      if (!healthResults.server2?.connected) {
        logger.info("🔧 Server2 falló, ejecutando debug automático...");

        try {
          const debugResult =
            await ConnectionCentralService.debugServer2Authentication();
          logger.info(
            "📋 Resultado del debug server2:",
            JSON.stringify(debugResult, null, 2)
          );

          // Si el debug encontró una solución, reintentar diagnóstico
          if (debugResult.success) {
            logger.info(
              "🎉 Debug encontró solución, reintentando diagnóstico server2..."
            );

            const retryResult =
              await ConnectionCentralService.diagnoseConnection("server2");
            if (retryResult.success) {
              logger.info("✅ Server2 ahora funciona después del debug!");
              healthResults.server2.connected = true;
              healthResults.server2.error = null;
              healthResults.server2.debugFixed = true;
            } else {
              logger.warn("⚠️ Server2 sigue fallando después del debug");
              healthResults.server2.debugExecuted = true;
              healthResults.server2.debugResult = debugResult;
            }
          } else {
            logger.warn("⚠️ Debug no pudo resolver el problema de server2");
            healthResults.server2.debugExecuted = true;
            healthResults.server2.debugResult = debugResult;
          }
        } catch (debugError) {
          logger.error(
            "❌ Error ejecutando debug automático de server2:",
            debugError
          );
          healthResults.server2.debugError = debugError.message;
        }
      }
    } else {
      // TU LÓGICA ORIGINAL - SIN CAMBIOS
      logger.debug(
        "Comprobación de salud exitosa, todo funciona correctamente"
      );
      HEALTH_CONFIG.errorCounters.database = 0;
      HEALTH_CONFIG.errorCounters.connection = 0;
    }

    // TU LOG ORIGINAL - SIN CAMBIOS
    logger.info(
      "Estado de salud del sistema:",
      JSON.stringify(healthResults, null, 2)
    );
  } catch (error) {
    logger.error("Error durante comprobación de salud:", error);
  }
}

/**
 * TU FUNCIÓN ORIGINAL - SIN CAMBIOS
 */
async function attemptDatabaseRecovery() {
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
      await ConnectionCentralService.closePools();
      logger.info("Pools cerrados correctamente");
    } catch (closeError) {
      logger.error("Error al cerrar pools:", closeError);
    }

    let poolsInitialized = false;
    try {
      const init1 = await ConnectionCentralService.initPool("server1");
      const init2 = await ConnectionCentralService.initPool("server2");
      poolsInitialized = init1 && init2;
    } catch (initError) {
      logger.error("Error al inicializar pools:", initError);
      poolsInitialized = false;
    }

    if (poolsInitialized) {
      logger.info("Pools reinicializados correctamente");

      // ✅ CAMBIO MÍNIMO: Solo cambiar método de diagnóstico
      const server1Result = await ConnectionCentralService.diagnoseConnection(
        "server1"
      );
      const server2Result = await ConnectionCentralService.diagnoseConnection(
        "server2"
      );

      const allOk =
        server1Result.success &&
        server2Result.success &&
        MongoDbService.isConnected();

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
 * TU FUNCIÓN ORIGINAL - SIN CAMBIOS
 */
async function attemptConnectionRecovery() {
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
      await ConnectionCentralService.closePools();
      logger.info("Pools cerrados correctamente");
    } catch (closeError) {
      logger.error("Error al cerrar pools:", closeError);
    }

    // 2. Esperar un momento para que las conexiones se liberen completamente
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // 3. Reinicializar pools
    let poolsInitialized = false;
    try {
      const init1 = await ConnectionCentralService.initPool("server1");
      const init2 = await ConnectionCentralService.initPool("server2");
      poolsInitialized = init1 && init2;
    } catch (initError) {
      logger.error("Error al inicializar pools:", initError);
      poolsInitialized = false;
    }

    if (poolsInitialized) {
      logger.info("Pools reinicializados correctamente");

      // ✅ CAMBIO MÍNIMO: Solo cambiar método de diagnóstico
      const server1Result = await ConnectionCentralService.diagnoseConnection(
        "server1"
      );
      const server2Result = await ConnectionCentralService.diagnoseConnection(
        "server2"
      );

      const connectionsOk = server1Result.success && server2Result.success;

      if (connectionsOk) {
        logger.info("✅ Recuperación de conexiones completada con éxito");
        // Reiniciar contador de errores de conexión
        HEALTH_CONFIG.errorCounters.connection = 0;
        return true;
      } else {
        logger.warn(
          "La recuperación no resolvió todos los problemas de conexión"
        );
        logger.warn("Server1:", server1Result);
        logger.warn("Server2:", server2Result);
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
 * TU FUNCIÓN ORIGINAL CON CAMBIO MÍNIMO
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

    // ✅ CAMBIO MÍNIMO: Solo cambiar método de diagnóstico
    let server1Diag;
    try {
      server1Diag = await ConnectionCentralService.diagnoseConnection(
        "server1"
      );
    } catch (error) {
      server1Diag = {
        success: false,
        error: error.message,
      };
    }

    // 3. Diagnóstico de Server2 usando método directo
    let server2Diag;
    try {
      server2Diag = await ConnectionCentralService.diagnoseConnection(
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
      poolStatus = ConnectionCentralService.getConnectionStats();
    } catch (poolError) {
      logger.warn("Error al obtener estado de pools:", poolError);
      poolStatus = { error: poolError.message };
    }

    // TU ESTRUCTURA ORIGINAL - SIN CAMBIOS
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
 * TU FUNCIÓN ORIGINAL - SIN CAMBIOS
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

// TU EXPORT ORIGINAL - SIN CAMBIOS
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
