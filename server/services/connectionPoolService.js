// services/connectionPoolService.js
const ConnectionPool = require("tedious-connection-pool");
const logger = require("./logger");

// Configuración del pool
const poolConfig = {
  min: 2, // Mínimo de conexiones en el pool
  max: 10, // Máximo de conexiones en el pool
  log: false, // Desactivar logs internos del pool
  acquireTimeout: 30000, // Timeout para adquirir conexión (30s)
  idleTimeoutMillis: 300000, // Timeout de conexiones inactivas (5min)
  retryDelay: 5000, // Delay entre reintentos (5s)
};

// Objeto para almacenar los pools
const pools = {};

/**
 * Inicializa los pools de conexiones para los servidores configurados
 */
function initPools() {
  if (!global.SQL_CONFIG) {
    logger.warn("SQL_CONFIG no está definido, no se pueden inicializar pools");
    return false;
  }

  try {
    // Crear pool para server1
    if (global.SQL_CONFIG.server1) {
      pools.server1 = new ConnectionPool(poolConfig, global.SQL_CONFIG.server1);

      pools.server1.on("error", (err) => {
        logger.error("Error en pool de server1:", err);
      });
    }

    // Crear pool para server2
    if (global.SQL_CONFIG.server2) {
      pools.server2 = new ConnectionPool(poolConfig, global.SQL_CONFIG.server2);

      pools.server2.on("error", (err) => {
        logger.error("Error en pool de server2:", err);
      });
    }

    logger.info("✅ Pools de conexiones inicializados correctamente");
    return true;
  } catch (error) {
    logger.error("❌ Error al inicializar pools de conexiones:", error);
    return false;
  }
}

/**
 * Obtiene una conexión del pool especificado
 * @param {string} serverKey - Clave del servidor (server1 o server2)
 * @returns {Promise<Connection>} - Conexión del pool
 */
async function getPoolConnection(serverKey) {
  return new Promise((resolve, reject) => {
    if (!pools[serverKey]) {
      return reject(new Error(`Pool para ${serverKey} no está inicializado`));
    }

    pools[serverKey].acquire((err, connection) => {
      if (err) {
        logger.error(`Error al obtener conexión de ${serverKey}:`, err);
        return reject(err);
      }

      // Agregar un manejador de error a la conexión
      connection.on("error", (err) => {
        logger.error(`Error en conexión de ${serverKey}:`, err);
      });

      logger.debug(`Conexión obtenida del pool para ${serverKey}`);
      resolve(connection);
    });
  });
}

/**
 * Devuelve una conexión al pool
 * @param {string} serverKey - Clave del servidor (server1 o server2)
 * @param {Connection} connection - Conexión a devolver
 */
function releaseConnection(serverKey, connection) {
  if (!pools[serverKey]) {
    logger.warn(
      `Pool para ${serverKey} no está inicializado, no se puede liberar la conexión`
    );
    return;
  }

  try {
    pools[serverKey].release(connection);
    logger.debug(`Conexión devuelta al pool para ${serverKey}`);
  } catch (error) {
    logger.warn(`Error al devolver conexión al pool para ${serverKey}:`, error);
  }
}

/**
 * Cierra todos los pools de conexiones
 */
function closePools() {
  Object.keys(pools).forEach((serverKey) => {
    if (pools[serverKey]) {
      try {
        pools[serverKey].drain();
        logger.info(`Pool para ${serverKey} cerrado correctamente`);
      } catch (error) {
        logger.error(`Error al cerrar pool para ${serverKey}:`, error);
      }
    }
  });
}

/**
 * Verifica el estado de los pools
 * @returns {Object} - Estado de los pools
 */
function getPoolsStatus() {
  const status = {};

  Object.keys(pools).forEach((serverKey) => {
    if (pools[serverKey]) {
      status[serverKey] = {
        available: pools[serverKey].availableObjectsCount(),
        used:
          pools[serverKey].getPoolSize() -
          pools[serverKey].availableObjectsCount(),
        total: pools[serverKey].getPoolSize(),
        pendingAcquires: pools[serverKey].waitingClientsCount(),
      };
    }
  });

  return status;
}

module.exports = {
  initPools,
  getPoolConnection,
  releaseConnection,
  closePools,
  getPoolsStatus,
};
