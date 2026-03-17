const cacheService = require("../services/cacheService");
const logger = require("../services/logger");

/**
 * Obtiene el estado detallado del cache
 */
async function getCacheStatus(req, res) {
  try {
    const stats = cacheService.getStats();
    const keys = cacheService.getKeys();

    // Agrupar claves por tipo para el reporte
    const keyDistribution = {
      userPermissions: keys.filter((k) => k.startsWith("user_permissions_")).length,
      userProfiles: keys.filter((k) => k.startsWith("user_profile_")).length,
      modules: keys.filter((k) => k === "active_modules").length,
      stats: keys.filter((k) => k.includes("stats")).length,
      other: keys.filter((k) =>
        !k.startsWith("user_permissions_") &&
        !k.startsWith("user_profile_") &&
        !k.includes("stats") &&
        k !== "active_modules"
      ).length,
    };

    return res.status(200).json({
      success: true,
      data: {
        cacheStats: stats,
        keyDistribution,
        totalKeys: keys.length,
        timestamp: new Date(),
      },
    });
  } catch (error) {
    logger.error("Error en getCacheStatus:", error);
    return res.status(500).json({ success: false, message: "Error al obtener estado del cache", error: error.message });
  }
}

/**
 * Invalida partes específicas o todo el cache
 */
async function invalidateCache(req, res) {
  try {
    const { type, userId, pattern } = req.body;
    let invalidatedCount = 0;
    let message = "";

    switch (type) {
      case "user":
        if (userId) {
          const userKeys = [`user_permissions_${userId}`, `user_profile_${userId}`, `user_roles_${userId}`];
          invalidatedCount = await cacheService.deleteMany(userKeys);
          message = `Cache invalidado para usuario ${userId}`;
        } else {
          invalidatedCount = await cacheService.invalidatePattern("user_");
          message = "Cache invalidado para todos los usuarios";
        }
        break;

      case "permissions":
        invalidatedCount = await cacheService.invalidatePattern("user_permissions_");
        message = "Cache de permisos invalidado";
        break;

      case "modules":
        await cacheService.delete("active_modules");
        invalidatedCount = (await cacheService.invalidatePattern("user_permissions_")) + 1;
        message = "Cache de módulos y permisos invalidado";
        break;

      case "stats":
        invalidatedCount = await cacheService.invalidatePattern("stats");
        await cacheService.deleteMany(["user_stats", "role_system_validation"]);
        message = "Cache de estadísticas invalidado";
        break;

      case "pattern":
        if (!pattern) return res.status(400).json({ success: false, message: "Patrón requerido" });
        invalidatedCount = await cacheService.invalidatePattern(pattern);
        message = `Cache invalidado con patrón: ${pattern}`;
        break;

      case "all":
        await cacheService.flush();
        invalidatedCount = "all";
        message = "Todo el cache invalidado";
        break;

      default:
        return res.status(400).json({ success: false, message: "Tipo de invalidación no válido" });
    }

    logger.info(`🗑️ Cache invalidado: ${message} por ${req.user?._id}`);

    return res.status(200).json({
      success: true,
      message,
      data: { type, invalidatedCount, timestamp: new Date() },
    });
  } catch (error) {
    logger.error("Error en invalidateCache:", error);
    return res.status(500).json({ success: false, message: "Error al invalidar cache", error: error.message });
  }
}

module.exports = {
  getCacheStatus,
  invalidateCache,
};
