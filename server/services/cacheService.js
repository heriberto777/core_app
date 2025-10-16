const NodeCache = require("node-cache");
const logger = require("./logger");

class CacheService {
  constructor() {
    // Configurar caché con TTL por defecto de 1 hora
    this.cache = new NodeCache({
      stdTTL: 3600, // 1 hora en segundos
      checkperiod: 600, // Verificar elementos expirados cada 10 minutos
      useClones: false,
    });

    // Escuchar eventos del caché
    this.cache.on("set", (key, value) => {
      logger.debug(`Caché SET: ${key}`);
    });

    this.cache.on("del", (key, value) => {
      logger.debug(`Caché DEL: ${key}`);
    });

    this.cache.on("expired", (key, value) => {
      logger.debug(`Caché EXPIRED: ${key}`);
    });
  }

  // ⭐ OBTENER VALOR DEL CACHÉ ⭐
  async get(key) {
    try {
      const value = this.cache.get(key);
      if (value === undefined) {
        logger.debug(`Caché MISS: ${key}`);
        return null;
      }
      logger.debug(`Caché HIT: ${key}`);
      return value;
    } catch (error) {
      logger.error(`Error al obtener del caché: ${key}`, error);
      return null;
    }
  }

  // ⭐ ESTABLECER VALOR EN EL CACHÉ ⭐
  async set(key, value, ttl = null) {
    try {
      const success = this.cache.set(key, value, ttl);
      if (success) {
        logger.debug(`Caché SET exitoso: ${key} (TTL: ${ttl || "default"})`);
      } else {
        logger.warn(`Caché SET falló: ${key}`);
      }
      return success;
    } catch (error) {
      logger.error(`Error al establecer en caché: ${key}`, error);
      return false;
    }
  }

  // ⭐ ELIMINAR VALOR DEL CACHÉ ⭐
  async delete(key) {
    try {
      const deleted = this.cache.del(key);
      logger.debug(`Caché DELETE: ${key} (eliminados: ${deleted})`);
      return deleted > 0;
    } catch (error) {
      logger.error(`Error al eliminar del caché: ${key}`, error);
      return false;
    }
  }

  // ⭐ ELIMINAR MÚLTIPLES CLAVES ⭐
  async deleteMany(keys) {
    try {
      const deleted = this.cache.del(keys);
      logger.debug(
        `Caché DELETE MANY: ${keys.join(", ")} (eliminados: ${deleted})`
      );
      return deleted;
    } catch (error) {
      logger.error(`Error al eliminar múltiples del caché:`, error);
      return 0;
    }
  }

  // ⭐ VERIFICAR SI EXISTE UNA CLAVE ⭐
  async has(key) {
    try {
      return this.cache.has(key);
    } catch (error) {
      logger.error(`Error al verificar clave en caché: ${key}`, error);
      return false;
    }
  }

  // ⭐ LIMPIAR TODO EL CACHÉ ⭐
  async flush() {
    try {
      this.cache.flushAll();
      logger.info("Caché completamente limpiado");
      return true;
    } catch (error) {
      logger.error("Error al limpiar el caché:", error);
      return false;
    }
  }

  // ⭐ OBTENER ESTADÍSTICAS DEL CACHÉ ⭐
  getStats() {
    try {
      return this.cache.getStats();
    } catch (error) {
      logger.error("Error al obtener estadísticas del caché:", error);
      return null;
    }
  }

  // ⭐ OBTENER TODAS LAS CLAVES ⭐
  getKeys() {
    try {
      return this.cache.keys();
    } catch (error) {
      logger.error("Error al obtener claves del caché:", error);
      return [];
    }
  }

  // ⭐ INVALIDAR CACHÉ POR PATRÓN ⭐
  async invalidatePattern(pattern) {
    try {
      const keys = this.cache.keys();
      const keysToDelete = keys.filter(
        (key) => key.includes(pattern) || key.match(new RegExp(pattern))
      );

      if (keysToDelete.length > 0) {
        const deleted = await this.deleteMany(keysToDelete);
        logger.info(
          `Invalidados ${deleted} elementos del caché con patrón: ${pattern}`
        );
        return deleted;
      }

      return 0;
    } catch (error) {
      logger.error(`Error al invalidar por patrón: ${pattern}`, error);
      return 0;
    }
  }

  // ⭐ MÉTODO PARA OBTENER O ESTABLECER (GET OR SET) ⭐
  async getOrSet(key, fetchFunction, ttl = null) {
    try {
      // Intentar obtener del caché
      let value = await this.get(key);

      if (value !== null) {
        return value;
      }

      // Si no está en caché, ejecutar función para obtener datos
      logger.debug(`Caché MISS: ${key}, ejecutando función fetch`);
      value = await fetchFunction();

      // Guardar en caché
      await this.set(key, value, ttl);

      return value;
    } catch (error) {
      logger.error(`Error en getOrSet para clave: ${key}`, error);
      // Si hay error, intentar ejecutar la función directamente
      try {
        return await fetchFunction();
      } catch (fetchError) {
        logger.error(`Error en función fetch para clave: ${key}`, fetchError);
        throw fetchError;
      }
    }
  }
}

module.exports = new CacheService();
