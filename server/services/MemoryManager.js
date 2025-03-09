// services/MemoryManager.js
const logger = require("./logger");

/**
 * Servicio para gestión y monitoreo de memoria
 */
class MemoryManager {
  constructor() {
    // Configuración
    this.config = {
      gcThreshold: 100, // Ejecutar GC cada X operaciones
      warningThreshold: 0.7, // Advertencia cuando uso de memoria > 70%
      criticalThreshold: 0.85, // Nivel crítico cuando uso > 85%
      logInterval: 50, // Registrar uso de memoria cada X operaciones
    };

    // Contadores
    this.counters = {
      operations: 0,
      gcCalls: 0,
      warnings: 0,
      criticals: 0,
    };

    // Historial de uso para detección de fugas
    this.memoryHistory = [];
    this.maxHistoryLength = 100;

    // Registrar uso inicial
    this.logMemoryUsage("Inicialización MemoryManager");
  }

  /**
   * Verifica y registra el uso actual de memoria
   * @param {string} contextLabel - Etiqueta para identificar el contexto
   * @returns {Object} - Métricas de uso de memoria
   */
  checkMemory(contextLabel = "") {
    const memUsage = process.memoryUsage();

    // Calcular porcentaje de uso de heap
    const heapTotal = memUsage.heapTotal;
    const heapUsed = memUsage.heapUsed;
    const heapUsedPercentage = heapUsed / heapTotal;

    // Convertir a MB para logging
    const rssInMB = Math.round(memUsage.rss / 1024 / 1024);
    const heapTotalInMB = Math.round(heapTotal / 1024 / 1024);
    const heapUsedInMB = Math.round(heapUsed / 1024 / 1024);

    // Detectar niveles de uso problemáticos
    const isWarningLevel = heapUsedPercentage > this.config.warningThreshold;
    const isCriticalLevel = heapUsedPercentage > this.config.criticalThreshold;

    // Actualizar contadores
    if (isWarningLevel) this.counters.warnings++;
    if (isCriticalLevel) this.counters.criticals++;

    // Guardar en historial para análisis de tendencias
    this.memoryHistory.push({
      timestamp: Date.now(),
      heapUsed: heapUsedInMB,
      heapTotal: heapTotalInMB,
      rss: rssInMB,
      percentage: heapUsedPercentage,
    });

    // Limitar tamaño del historial
    if (this.memoryHistory.length > this.maxHistoryLength) {
      this.memoryHistory.shift();
    }

    // Recolección de basura forzada en puntos críticos
    if (isCriticalLevel && global.gc) {
      logger.warn(
        `Uso de memoria crítico (${(heapUsedPercentage * 100).toFixed(
          1
        )}%), forzando GC`
      );
      this.forceGC();
    }

    // Crear objeto con métricas
    const metrics = {
      heapUsedMB: heapUsedInMB,
      heapTotalMB: heapTotalInMB,
      rssMB: rssInMB,
      heapUsedPercentage: heapUsedPercentage,
      isWarning: isWarningLevel,
      isCritical: isCriticalLevel,
      context: contextLabel || "general",
    };

    return metrics;
  }

  /**
   * Registra el uso de memoria actual en logs
   * @param {string} context - Contexto o identificador de la operación
   */
  logMemoryUsage(context = "general") {
    const metrics = this.checkMemory(context);

    if (metrics.isCritical) {
      logger.warn(
        `Memoria [${context}]: ${metrics.heapUsedMB}MB/${
          metrics.heapTotalMB
        }MB (${(metrics.heapUsedPercentage * 100).toFixed(1)}%) - CRÍTICO`
      );
    } else if (metrics.isWarning) {
      logger.warn(
        `Memoria [${context}]: ${metrics.heapUsedMB}MB/${
          metrics.heapTotalMB
        }MB (${(metrics.heapUsedPercentage * 100).toFixed(1)}%) - ALTO`
      );
    } else {
      logger.debug(
        `Memoria [${context}]: ${metrics.heapUsedMB}MB/${
          metrics.heapTotalMB
        }MB (${(metrics.heapUsedPercentage * 100).toFixed(1)}%)`
      );
    }

    return metrics;
  }

  /**
   * Trackea una operación y realiza verificaciones periódicas
   * @param {string} operationType - Tipo de operación (opcional)
   * @returns {Object|null} - Métricas si se realizó verificación, null en caso contrario
   */
  trackOperation(operationType = "general") {
    this.counters.operations++;

    // GC periódico si está disponible
    if (global.gc && this.counters.operations % this.config.gcThreshold === 0) {
      this.forceGC();
    }

    // Verificar memoria periódicamente
    if (this.counters.operations % this.config.logInterval === 0) {
      return this.logMemoryUsage(
        `Operación #${this.counters.operations} (${operationType})`
      );
    }

    return null;
  }

  /**
   * Fuerza la recolección de basura si está disponible
   */
  forceGC() {
    if (global.gc) {
      const before = this.checkMemory("antes-gc");

      try {
        global.gc();
        this.counters.gcCalls++;

        const after = this.checkMemory("después-gc");
        const freedMB = before.heapUsedMB - after.heapUsedMB;

        if (freedMB > 5) {
          // Si se liberaron más de 5MB, loguear
          logger.info(
            `GC llamado manualmente: ${freedMB.toFixed(1)}MB liberados`
          );
        }
      } catch (error) {
        logger.error(`Error al forzar GC: ${error.message}`);
      }

      return true;
    }

    return false;
  }

  /**
   * Detecta posibles fugas de memoria basándose en tendencias históricas
   * @returns {Object} - Resultado del análisis
   */
  detectMemoryLeaks() {
    if (this.memoryHistory.length < 10) {
      return { possibleLeak: false, message: "Datos insuficientes" };
    }

    // Analizar tendencia en los últimos N registros
    const recentHistory = this.memoryHistory.slice(-10);
    const firstUsage = recentHistory[0].heapUsed;
    const lastUsage = recentHistory[recentHistory.length - 1].heapUsed;
    const growthRate = lastUsage / firstUsage;

    // Si ha crecido más de un 20% en 10 muestras, considerar posible fuga
    if (growthRate > 1.2) {
      return {
        possibleLeak: true,
        growthRate: growthRate.toFixed(2),
        initialMemory: firstUsage,
        currentMemory: lastUsage,
        message: `Posible fuga de memoria detectada (crecimiento ${(
          (growthRate - 1) *
          100
        ).toFixed(1)}%)`,
      };
    }

    return { possibleLeak: false };
  }

  /**
   * Obtiene estadísticas de uso de memoria
   * @returns {Object} - Estadísticas completas
   */
  getStats() {
    const currentMetrics = this.checkMemory("stats");
    const leakAnalysis = this.detectMemoryLeaks();

    return {
      current: {
        heapUsedMB: currentMetrics.heapUsedMB,
        heapTotalMB: currentMetrics.heapTotalMB,
        rssMB: currentMetrics.rssMB,
        usagePercentage:
          (currentMetrics.heapUsedPercentage * 100).toFixed(1) + "%",
      },
      counters: this.counters,
      leakAnalysis,
      thresholds: {
        warning: this.config.warningThreshold * 100 + "%",
        critical: this.config.criticalThreshold * 100 + "%",
      },
      gcAvailable: typeof global.gc === "function",
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Reestablece contadores
   */
  reset() {
    this.counters = {
      operations: 0,
      gcCalls: 0,
      warnings: 0,
      criticals: 0,
    };

    this.memoryHistory = [];
    this.forceGC();

    return this.getStats();
  }
}

// Exportar instancia singleton
module.exports = new MemoryManager();
