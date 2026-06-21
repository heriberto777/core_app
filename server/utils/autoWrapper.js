const { wrapService } = require("./serviceWrapper");
const logger = require("../services/logger");
const path = require("path");
const fs = require("fs");

/**
 * Sistema de auto-wrapping para todo el proyecto
 */
class AutoWrapper {
  static wrappedServices = new Map();
  static servicePatterns = [
    /Service$/,           // Clases que terminan en "Service"
    /Controller$/,        // Clases que terminan en "Controller"
    /Manager$/,           // Clases que terminan en "Manager"
    /Helper$/,            // Clases que terminan en "Helper"
    /Utils?$/,            // Clases que terminan en "Utils" o "Util"
    /Repository$/,        // Clases que terminan en "Repository"
    /Provider$/,          // Clases que terminan en "Provider"
  ];

  /**
   * Wrapper inteligente que detecta automáticamente qué clases wrappear
   */
  static smartWrap(exportedModule, modulePath = '') {
    const fileName = path.basename(modulePath, '.js');

    // Si ya está wrapped, retornar el wrapper existente
    if (this.wrappedServices.has(modulePath)) {
      return this.wrappedServices.get(modulePath);
    }

    // Verificar si debe ser wrapped
    if (this.shouldWrap(exportedModule, fileName)) {
      logger.debug(`🔧 Auto-wrapping: ${fileName}`, {
        source: "auto_wrapper",
        modulePath: modulePath
      });

      const wrapped = wrapService(exportedModule, fileName);
      this.wrappedServices.set(modulePath, wrapped);
      return wrapped;
    }

    return exportedModule;
  }

  /**
   * Determina si una clase/módulo debe ser wrapped
   */
  static shouldWrap(exportedModule, fileName) {
    // Si no es una función/clase, no wrappear
    if (typeof exportedModule !== 'function' && typeof exportedModule !== 'object') {
      return false;
    }

    // Si es una clase con métodos estáticos
    if (typeof exportedModule === 'function') {
      const staticMethods = Object.getOwnPropertyNames(exportedModule)
        .filter(prop => typeof exportedModule[prop] === 'function' &&
                       prop !== 'length' && prop !== 'name' && prop !== 'constructor');

      if (staticMethods.length > 0) {
        return this.matchesPattern(fileName);
      }
    }

    // Si es un objeto con métodos
    if (typeof exportedModule === 'object' && exportedModule !== null) {
      const methods = Object.getOwnPropertyNames(exportedModule)
        .filter(prop => typeof exportedModule[prop] === 'function');

      if (methods.length > 0) {
        return this.matchesPattern(fileName);
      }
    }

    return false;
  }

  /**
   * Verifica si el nombre del archivo coincide con los patrones
   */
  static matchesPattern(fileName) {
    return this.servicePatterns.some(pattern => pattern.test(fileName));
  }

  /**
   * Wrappea automáticamente todos los servicios en un directorio
   */
  static wrapDirectory(directoryPath, recursive = true) {
    try {
      const fullPath = path.resolve(directoryPath);

      if (!fs.existsSync(fullPath)) {
        logger.warn(`📁 Directorio no encontrado: ${directoryPath}`);
        return;
      }

      const files = fs.readdirSync(fullPath);

      files.forEach(file => {
        const filePath = path.join(fullPath, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory() && recursive) {
          // Recursivo en subdirectorios
          this.wrapDirectory(filePath, recursive);
        } else if (file.endsWith('.js')) {
          try {
            // Intentar cargar y wrappear el módulo
            const modulePath = filePath;
            delete require.cache[require.resolve(modulePath)]; // Limpiar cache
            const moduleExports = require(modulePath);

            if (this.shouldWrap(moduleExports, file)) {
              logger.info(`🔧 Auto-wrapped: ${file}`, {
                source: "auto_wrapper",
                path: filePath
              });
            }
          } catch (error) {
            // Silencioso - no todos los archivos son módulos válidos
          }
        }
      });

    } catch (error) {
      logger.error(`Error wrapping directory ${directoryPath}:`, error);
    }
  }

  /**
   * Obtiene estadísticas de wrapping
   */
  static getStats() {
    return {
      totalWrapped: this.wrappedServices.size,
      wrappedServices: Array.from(this.wrappedServices.keys()),
      patterns: this.servicePatterns.map(p => p.toString())
    };
  }
}

module.exports = AutoWrapper;