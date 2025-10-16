const logger = require("./logger");

/**
 * Servicio para recolección y análisis de métricas
 */
class Telemetry {
  constructor() {
    // Métricas generales
    this.metrics = {
      // Métricas de DB
      db: {
        connections: {
          acquired: 0,
          released: 0,
          errors: 0,
          reconnects: 0,
        },
        queries: {
          total: 0,
          errors: 0,
          server1: 0,
          server2: 0,
        },
      },

      // Métricas de transferencias
      transfers: {
        started: 0,
        completed: 0,
        failed: 0,
        retried: 0,
        cancelled: 0,
        recordsProcessed: 0,
        recordsInserted: 0,
        recordsDuplicated: 0,
      },

      // Métricas de rendimiento
      performance: {
        avgTransferTime: 0,
        avgQueryTime: 0,
        avgBatchSize: 0,
        maxTransferTime: 0,
        minTransferTime: Infinity,
      },
    };

    // Timestamps para medición de latencia
    this.timestamps = new Map();

    // Contadores para cálculo de promedios
    this._counts = {
      transferTime: 0,
      queryTime: 0,
      batchSize: 0,
    };

    // Historial para análisis
    this.history = {
      transferTimes: [], // Almacenar últimos N tiempos para análisis
      queryTimes: [],
      maxHistoryItems: 100,
    };

    // Intervalos para el reseteo periódico
    setInterval(() => this.resetHourly(), 60 * 60 * 1000); // Cada hora

    // Registro inicial
    logger.info("Servicio de telemetría iniciado");
  }

  /**
   * Registro de eventos de conexión a base de datos
   * @param {string} type - Tipo de evento (acquired, released, errors, reconnects)
   * @param {number} count - Cantidad a incrementar
   */
  trackDBConnection(type, count = 1) {
    if (this.metrics.db.connections[type] !== undefined) {
      this.metrics.db.connections[type] += count;
    }
  }

  /**
   * Registro de eventos de consulta
   * @param {string} serverKey - Servidor (server1, server2)
   * @param {boolean} isError - Si es un error
   */
  trackQuery(serverKey, isError = false) {
    this.metrics.db.queries.total++;

    if (serverKey === "server1" || serverKey === "server2") {
      this.metrics.db.queries[serverKey]++;
    }

    if (isError) {
      this.metrics.db.queries.errors++;
    }
  }

  /**
   * Registro de eventos de transferencia
   * @param {string} type - Tipo de evento
   * @param {number} count - Cantidad a incrementar
   */
  trackTransfer(type, count = 1) {
    if (this.metrics.transfers[type] !== undefined) {
      this.metrics.transfers[type] += count;
    }
  }

  /**
   * Inicia medición de tiempo para una operación
   * @param {string} id - Identificador único de la operación
   */
  startTimer(id) {
    this.timestamps.set(id, Date.now());
  }

  /**
   * Finaliza medición de tiempo y devuelve duración
   * @param {string} id - Identificador único de la operación
   * @returns {number} - Duración en milisegundos
   */
  endTimer(id) {
    const start = this.timestamps.get(id);
    if (!start) return 0;

    const duration = Date.now() - start;
    this.timestamps.delete(id);

    // Si el ID comienza con 'query_', registrar en historial de queries
    if (id.startsWith("query_")) {
      this.history.queryTimes.push({
        id,
        duration,
        timestamp: new Date().toISOString(),
      });

      // Limitar tamaño del historial
      if (this.history.queryTimes.length > this.history.maxHistoryItems) {
        this.history.queryTimes.shift();
      }
    }

    // Si el ID comienza con 'insert_' o 'transfer_', registrar en historial de transferencias
    if (id.startsWith("insert_") || id.startsWith("transfer_")) {
      this.history.transferTimes.push({
        id,
        duration,
        timestamp: new Date().toISOString(),
      });

      // Actualizar max/min
      if (duration > this.metrics.performance.maxTransferTime) {
        this.metrics.performance.maxTransferTime = duration;
      }

      if (duration < this.metrics.performance.minTransferTime) {
        this.metrics.performance.minTransferTime = duration;
      }

      // Limitar tamaño del historial
      if (this.history.transferTimes.length > this.history.maxHistoryItems) {
        this.history.transferTimes.shift();
      }
    }

    return duration;
  }

  /**
   * Actualiza una métrica de promedio
   * @param {string} metric - Nombre de la métrica en performance
   * @param {number} newValue - Nuevo valor a incorporar
   */
  updateAverage(metric, newValue) {
    if (!this.metrics.performance[metric]) {
      return;
    }

    // Determinar el contador correspondiente
    let counterKey;
    if (metric === "avgTransferTime") counterKey = "transferTime";
    else if (metric === "avgQueryTime") counterKey = "queryTime";
    else if (metric === "avgBatchSize") counterKey = "batchSize";
    else return;

    // Actualizar contador
    this._counts[counterKey]++;

    // Calcular nuevo promedio
    const count = this._counts[counterKey];
    const current = this.metrics.performance[metric];

    if (count === 1) {
      // Primer valor
      this.metrics.performance[metric] = newValue;
    } else {
      // Media móvil
      this.metrics.performance[metric] =
        (current * (count - 1) + newValue) / count;
    }
  }

  /**
   * Obtiene todas las métricas
   * @param {boolean} includeHistory - Si incluir historial detallado
   * @returns {Object} - Métricas actuales
   */
  getMetrics(includeHistory = false) {
    // Clonar para evitar modificaciones externas
    const metrics = JSON.parse(JSON.stringify(this.metrics));

    // Añadir timestamp
    metrics.timestamp = new Date().toISOString();

    // Calcular tasas
    const transferMetrics = this.metrics.transfers;

    if (transferMetrics.started > 0) {
      metrics.rates = {
        success:
          ((transferMetrics.completed / transferMetrics.started) * 100).toFixed(
            2
          ) + "%",
        failure:
          ((transferMetrics.failed / transferMetrics.started) * 100).toFixed(
            2
          ) + "%",
        cancellation:
          ((transferMetrics.cancelled / transferMetrics.started) * 100).toFixed(
            2
          ) + "%",
      };
    } else {
      metrics.rates = { success: "0%", failure: "0%", cancellation: "0%" };
    }

    // Incluir historial si se solicita
    if (includeHistory) {
      metrics.history = {
        transferTimes: this.history.transferTimes,
        queryTimes: this.history.queryTimes,
      };
    }

    // Corregir minTransferTime si no hay datos
    if (metrics.performance.minTransferTime === Infinity) {
      metrics.performance.minTransferTime = 0;
    }

    return metrics;
  }

  /**
   * Reseteo de métricas horarias
   */
  resetHourly() {
    // Guardar resumen antes de resetear (podría guardarse en DB)
    const hourlySnapshot = {
      timestamp: new Date().toISOString(),
      transfers: { ...this.metrics.transfers },
      performance: { ...this.metrics.performance },
      db: {
        connections: { ...this.metrics.db.connections },
        queries: { ...this.metrics.db.queries },
      },
    };

    // No resetear contadores totales/acumulados
    const started = this.metrics.transfers.started;
    const completed = this.metrics.transfers.completed;
    const failed = this.metrics.transfers.failed;

    // Resetear métricas de performance
    this.metrics.performance = {
      avgTransferTime: 0,
      avgQueryTime: 0,
      avgBatchSize: 0,
      maxTransferTime: 0,
      minTransferTime: Infinity,
    };

    // Reiniciar contadores de cálculo de promedio
    this._counts = {
      transferTime: 0,
      queryTime: 0,
      batchSize: 0,
    };

    // Mantener referencias a métricas totales
    this.metrics.transfers.started = started;
    this.metrics.transfers.completed = completed;
    this.metrics.transfers.failed = failed;

    // Resetear métricas de sesión
    this.metrics.transfers.retried = 0;
    this.metrics.transfers.cancelled = 0;
    this.metrics.transfers.recordsProcessed = 0;
    this.metrics.transfers.recordsInserted = 0;
    this.metrics.transfers.recordsDuplicated = 0;

    // Resetear métricas de DB de la sesión
    this.metrics.db.connections = {
      acquired: 0,
      released: 0,
      errors: 0,
      reconnects: 0,
    };

    this.metrics.db.queries = {
      total: 0,
      errors: 0,
      server1: 0,
      server2: 0,
    };

    logger.info("Métricas de telemetría reseteadas (reseteo horario)");

    return hourlySnapshot;
  }

  static trackError(operation, details) {
    try {
      const timestamp = new Date().toISOString();

      // Incrementar contador de errores
      if (!this.metrics.errors) {
        this.metrics.errors = 0;
      }
      this.metrics.errors++;

      // Registrar en log
      logger.error(`[Telemetry] Error en ${operation}:`, {
        operation,
        details,
        timestamp,
        errorCount: this.metrics.errors,
      });
    } catch (error) {
      // Si falla el tracking, no debe afectar la operación principal
      logger.warn(`Error en tracking de telemetría: ${error.message}`);
    }
  }
}

// Exportar instancia singleton
module.exports = new Telemetry();
