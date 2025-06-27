const cacheService = require("../services/cacheService");
const logger = require("../services/logger");

async function getCacheStatus(req, res) {
  try {
    const stats = cacheService.getStats();
    const keys = cacheService.getKeys();

    // Agrupar claves por tipo
    const keysByType = {
      userPermissions: keys.filter((k) => k.startsWith("user_permissions_"))
        .length,
      userProfiles: keys.filter((k) => k.startsWith("user_profile_")).length,
      modules: keys.filter((k) => k === "active_modules").length,
      stats: keys.filter((k) => k.includes("stats")).length,
      other: keys.filter(
        (k) =>
          !k.startsWith("user_permissions_") &&
          !k.startsWith("user_profile_") &&
          !k.includes("stats") &&
          k !== "active_modules"
      ).length,
    };

    res.json({
      success: true,
      data: {
        cacheStats: stats,
        keyDistribution: keysByType,
        totalKeys: keys.length,
        timestamp: new Date(),
      },
    });
  } catch (error) {
    logger.error("Error obteniendo estado del cache:", error);
    res.status(500).json({
      success: false,
      message: "Error obteniendo estado del cache",
      error: error.message,
    });
  }
}

async function invalidateCache(req, res) {
  try {
    const { type, userId, pattern } = req.body;

    let invalidatedCount = 0;
    let message = "";

    switch (type) {
      case "user":
        if (userId) {
          const userKeys = [
            `user_permissions_${userId}`,
            `user_profile_${userId}`,
            `user_roles_${userId}`,
          ];
          invalidatedCount = await cacheService.deleteMany(userKeys);
          message = `Cache invalidado para usuario ${userId}`;
        } else {
          invalidatedCount = await cacheService.invalidatePattern("user_");
          message = "Cache invalidado para todos los usuarios";
        }
        break;

      case "permissions":
        invalidatedCount = await cacheService.invalidatePattern(
          "user_permissions_"
        );
        message = "Cache de permisos invalidado";
        break;

      case "modules":
        await cacheService.delete("active_modules");
        invalidatedCount = await cacheService.invalidatePattern(
          "user_permissions_"
        );
        message = "Cache de módulos y permisos invalidado";
        break;

      case "stats":
        invalidatedCount = await cacheService.invalidatePattern("stats");
        await cacheService.delete("user_stats");
        await cacheService.delete("role_system_validation");
        message = "Cache de estadísticas invalidado";
        break;

      case "pattern":
        if (pattern) {
          invalidatedCount = await cacheService.invalidatePattern(pattern);
          message = `Cache invalidado con patrón: ${pattern}`;
        } else {
          return res.status(400).json({
            success: false,
            message: "Patrón requerido para invalidación por patrón",
          });
        }
        break;

      case "all":
        await cacheService.flush();
        invalidatedCount = "all";
        message = "Todo el cache invalidado";
        break;

      default:
        return res.status(400).json({
          success: false,
          message: "Tipo de invalidación no válido",
        });
    }

    logger.info(
      `🗑️ Cache invalidado: ${message} (${invalidatedCount} elementos)`
    );

    res.json({
      success: true,
      message: message,
      data: {
        type: type,
        invalidatedCount: invalidatedCount,
        timestamp: new Date(),
      },
    });
  } catch (error) {
    logger.error("Error invalidando cache:", error);
    res.status(500).json({
      success: false,
      message: "Error invalidando cache",
      error: error.message,
    });
  }
}

module.exports = {
  getCacheStatus,
  invalidateCache,
};
