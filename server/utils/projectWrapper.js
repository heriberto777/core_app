const { wrapService } = require("./serviceWrapper");
const logger = require("../services/logger");

/**
 * Configuración manual de wrapping para control total
 */
const PROJECT_WRAPPERS = {
  // Servicios
  services: [
    "loadsService",
    "traspasoService",
    "transferService",
    "emailService",
    "pdfService",
    "connectionService",
    "healthMonitorService",
    "cronService",
    "telemetryService",
  ],

  // Controladores
  controllers: [
    "loadsController",
    "transferTaskController",
    "moduleController",
    "dbConfigController",
    "userController",
    "authController",
  ],

  // Otros
  utils: ["dbUtils", "formatDate", "validation"],
};

/**
 * Applica wrapping a módulos específicos del proyecto
 */
function wrapProjectModules() {
  const wrappedModules = {};

  Object.keys(PROJECT_WRAPPERS).forEach((category) => {
    wrappedModules[category] = {};

    PROJECT_WRAPPERS[category].forEach((moduleName) => {
      try {
        const modulePath = getModulePath(category, moduleName);
        const originalModule = require(modulePath);

        if (shouldWrapModule(originalModule)) {
          wrappedModules[category][moduleName] = wrapService(
            originalModule,
            moduleName
          );
          logger.info(`✅ Wrapped ${category}/${moduleName}`);
        } else {
          wrappedModules[category][moduleName] = originalModule;
        }
      } catch (error) {
        logger.warn(
          `⚠️ No se pudo wrappear ${category}/${moduleName}: ${error.message}`
        );
      }
    });
  });

  return wrappedModules;
}

function getModulePath(category, moduleName) {
  const basePaths = {
    services: "../services/",
    controllers: "../controllers/",
    utils: "../utils/",
  };

  return basePaths[category] + moduleName;
}

function shouldWrapModule(moduleExports) {
  if (
    typeof moduleExports !== "function" &&
    typeof moduleExports !== "object"
  ) {
    return false;
  }

  if (moduleExports === null) return false;

  // Verificar si tiene métodos wrappables
  const methods = Object.getOwnPropertyNames(moduleExports).filter(
    (prop) =>
      typeof moduleExports[prop] === "function" &&
      !["length", "name", "constructor"].includes(prop)
  );

  return methods.length > 0;
}

module.exports = { wrapProjectModules, PROJECT_WRAPPERS };
