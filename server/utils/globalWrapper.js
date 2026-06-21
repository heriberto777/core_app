const { wrapService } = require("./serviceWrapper");
const logger = require("../services/logger");
const Module = require("module");
const path = require("path");

/**
 * Interceptor global que wrappea automáticamente exports
 */
class GlobalWrapper {
  static initialized = false;
  static projectPath = "";

  static init(projectBasePath = "/server") {
    if (this.initialized) return;

    this.projectPath = projectBasePath;
    this.interceptModuleExports();
    this.initialized = true;

    logger.system.info("🌐 Global wrapper inicializado", {
      projectPath: projectBasePath,
      timestamp: new Date().toISOString(),
    });
  }

  static interceptModuleExports() {
    const originalLoad = Module._load;

    Module._load = function (id, parent) {
      const result = originalLoad.apply(this, arguments);

      // Solo procesar módulos de nuestro proyecto
      if (
        parent &&
        parent.filename &&
        parent.filename.includes(GlobalWrapper.projectPath) &&
        !id.includes("node_modules")
      ) {
        return GlobalWrapper.processModule(result, id, parent.filename);
      }

      return result;
    };
  }

  static processModule(moduleExports, moduleId, parentPath) {
    try {
      const fileName = path.basename(moduleId, ".js");

      // Patrones para auto-wrapping
      const shouldWrap =
        /Service$|Controller$|Manager$|Helper$|Utils?$|Repository$|Provider$/;

      if (shouldWrap.test(fileName)) {
        // Verificar si tiene métodos para wrappear
        if (this.hasWrappableMethods(moduleExports)) {
          logger.debug(`🔧 Global auto-wrap: ${fileName}`, {
            source: "global_wrapper",
            moduleId: moduleId,
            parentPath: parentPath,
          });

          return wrapService(moduleExports, fileName);
        }
      }

      return moduleExports;
    } catch (error) {
      // Si falla el wrapping, retornar el módulo original
      logger.warn(`⚠️ Error wrapping ${moduleId}: ${error.message}`);
      return moduleExports;
    }
  }

  static hasWrappableMethods(obj) {
    if (typeof obj !== "function" && typeof obj !== "object") return false;
    if (obj === null) return false;

    const methods = Object.getOwnPropertyNames(obj).filter(
      (prop) =>
        typeof obj[prop] === "function" &&
        prop !== "length" &&
        prop !== "name" &&
        prop !== "constructor"
    );

    return methods.length > 0;
  }
}

module.exports = GlobalWrapper;
