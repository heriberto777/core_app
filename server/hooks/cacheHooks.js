const cacheService = require("../utils/cacheService");
const logger = require("../services/logger");
const {
  invalidateUserCache,
  invalidateModulesCache,
  invalidateUserCacheOnModuleChange,
  invalidateUserCacheOnRoleChange,
} = require("../controllers/userController");

function setupCacheHooks() {
  const ModuleConfig = require("../models/ModuleConfig");
  const User = require("../models/User");
  const Role = require("../models/roleModel");

  // ⭐ HOOKS PARA MÓDULOS ⭐
  ModuleConfig.schema.post("save", async function (doc) {
    logger.info(`🔄 Módulo guardado: ${doc.name}, invalidando caches...`);
    await invalidateUserCacheOnModuleChange();
  });

  ModuleConfig.schema.post("findOneAndUpdate", async function (doc) {
    if (doc) {
      logger.info(`🔄 Módulo actualizado: ${doc.name}, invalidando caches...`);
      await invalidateUserCacheOnModuleChange();
    }
  });

  ModuleConfig.schema.post("findOneAndDelete", async function (doc) {
    if (doc) {
      logger.info(`🔄 Módulo eliminado: ${doc.name}, invalidando caches...`);
      await invalidateUserCacheOnModuleChange();
    }
  });

  // ⭐ HOOKS PARA USUARIOS ⭐
  User.schema.post("save", async function (doc) {
    if (doc && doc._id) {
      logger.info(`🔄 Usuario guardado: ${doc.email}, invalidando cache...`);
      await invalidateUserCache(doc._id.toString());
    }
  });

  User.schema.post("findOneAndUpdate", async function (doc) {
    if (doc && doc._id) {
      logger.info(`🔄 Usuario actualizado: ${doc.email}, invalidando cache...`);
      await invalidateUserCache(doc._id.toString());

      // Invalidar estadísticas de usuarios
      await cacheService.delete("user_stats");
    }
  });

  // ⭐ HOOKS PARA ROLES ⭐
  Role.schema.post("save", async function (doc) {
    logger.info(
      `🔄 Rol guardado: ${doc.displayName}, invalidando caches de usuarios...`
    );
    await invalidateUserCacheOnRoleChange(doc._id);
    await cacheService.delete("role_system_validation");
  });

  Role.schema.post("findOneAndUpdate", async function (doc) {
    if (doc) {
      logger.info(
        `🔄 Rol actualizado: ${doc.displayName}, invalidando caches de usuarios...`
      );
      await invalidateUserCacheOnRoleChange(doc._id);
      await cacheService.delete("role_system_validation");
    }
  });

  Role.schema.post("findOneAndDelete", async function (doc) {
    if (doc) {
      logger.info(
        `🔄 Rol eliminado: ${doc.displayName}, invalidando todos los caches...`
      );
      await cacheService.invalidatePattern("user_permissions_");
      await cacheService.delete("role_system_validation");
    }
  });

  logger.info("✅ Hooks de cache configurados correctamente");
}

module.exports = { setupCacheHooks };
