// Crear archivo: consecutiveMonitor.js
const Consecutive = require("../models/consecutiveModel");
const logger = require("./logger");

class ConsecutiveMonitor {
  static async getConsecutiveMetrics(consecutiveId, timeRange = "24h") {
    try {
      const consecutive = await Consecutive.findById(consecutiveId);
      if (!consecutive) {
        throw new Error("Consecutivo no encontrado");
      }

      // Calcular fecha de inicio según el rango
      const now = new Date();
      let startDate = new Date();
      switch (timeRange) {
        case "1h":
          startDate.setHours(now.getHours() - 1);
          break;
        case "24h":
          startDate.setHours(now.getHours() - 24);
          break;
        case "7d":
          startDate.setDate(now.getDate() - 7);
          break;
        case "30d":
          startDate.setDate(now.getDate() - 30);
          break;
        default:
          startDate.setHours(now.getHours() - 24);
      }

      // Métricas desde el historial
      const history = consecutive.history.filter((h) => h.date >= startDate);
      const incrementActions = history.filter(
        (h) => h.action === "incremented" || h.action === "committed"
      );
      const resetActions = history.filter((h) => h.action === "reset");

      // Métricas de reservas
      const activeReservations = consecutive.reservations.filter(
        (r) => r.status === "reserved" && new Date(r.expiresAt) > now
      );

      const expiredReservations = consecutive.reservations.filter(
        (r) => r.status === "reserved" && new Date(r.expiresAt) <= now
      );

      const committedReservations = consecutive.reservations.filter(
        (r) => r.status === "committed" && new Date(r.createdAt) >= startDate
      );

      return {
        consecutiveId,
        consecutiveName: consecutive.name,
        currentValue: consecutive.currentValue,
        timeRange,
        metrics: {
          totalIncrements: incrementActions.length,
          totalResets: resetActions.length,
          activeReservations: activeReservations.length,
          expiredReservations: expiredReservations.length,
          committedReservations: committedReservations.length,
          averageReservationDuration: this.calculateAverageReservationDuration(
            committedReservations
          ),
          valueRange: {
            min: this.getMinValue(incrementActions, startDate),
            max: this.getMaxValue(incrementActions, startDate),
            current: consecutive.currentValue,
          },
          bySegment: this.getSegmentMetrics(consecutive, startDate),
        },
      };
    } catch (error) {
      logger.error(`Error al obtener métricas: ${error.message}`);
      throw error;
    }
  }

  static calculateAverageReservationDuration(reservations) {
    if (reservations.length === 0) return 0;

    const durations = reservations
      .map((r) => {
        if (r.status === "committed" && r.expiresAt) {
          return (
            (new Date(r.expiresAt).getTime() -
              new Date(r.createdAt).getTime()) /
            1000
          );
        }
        return 0;
      })
      .filter((d) => d > 0);

    return durations.length > 0
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length
      : 0;
  }

  static getMinValue(actions, startDate) {
    const values = actions.map((a) => a.value).filter((v) => v !== undefined);
    return values.length > 0 ? Math.min(...values) : 0;
  }

  static getMaxValue(actions, startDate) {
    const values = actions.map((a) => a.value).filter((v) => v !== undefined);
    return values.length > 0 ? Math.max(...values) : 0;
  }

  static getSegmentMetrics(consecutive, startDate) {
    if (!consecutive.segments?.enabled) return null;

    const segmentMetrics = {};
    for (const [segment, value] of consecutive.segments.values.entries()) {
      const segmentHistory = consecutive.history.filter(
        (h) => h.segment === segment && h.date >= startDate
      );

      segmentMetrics[segment] = {
        currentValue: value,
        incrementCount: segmentHistory.filter((h) => h.action === "incremented")
          .length,
        lastUsed:
          segmentHistory.length > 0
            ? segmentHistory[segmentHistory.length - 1].date
            : null,
      };
    }

    return segmentMetrics;
  }

  // Monitoreo continuo de reservas expiradas
  static startReservationMonitor() {
    logger.info("Iniciando monitor de reservas...");

    // Cada 30 segundos, verificar reservas próximas a expirar
    setInterval(async () => {
      try {
        const now = new Date();
        const warningTime = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutos antes

        const consecutives = await Consecutive.find({ active: true });

        for (const consecutive of consecutives) {
          const expiringReservations = consecutive.reservations.filter(
            (r) =>
              r.status === "reserved" &&
              new Date(r.expiresAt) > now &&
              new Date(r.expiresAt) <= warningTime
          );

          if (expiringReservations.length > 0) {
            logger.warn(
              `${expiringReservations.length} reservas de ${consecutive.name} expirarán en los próximos 5 minutos`
            );
          }
        }
      } catch (error) {
        logger.error(`Error en monitor de reservas: ${error.message}`);
      }
    }, 30000);
  }
}

module.exports = ConsecutiveMonitor;
