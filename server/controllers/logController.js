// controllers/logController.js
const Log = require("../models/loggerModel");
const logger = require("../services/logger");

/**
 * Obtener listado de logs con filtros y paginación
 * @route GET /api/v1/logs
 */
const getLogs = async (req, res) => {
  try {
    const {
      level,
      source,
      dateFrom,
      dateTo,
      search,
      limit = 50,
      page = 1,
      sort = "desc",
    } = req.query;

    // Construir filtros
    const filter = {};

    // Filtrar por nivel
    if (level && level !== "all") {
      filter.level = level;
    }

    // Filtrar por origen
    if (source && source !== "all") {
      filter.source = source;
    }

    // Filtrar por rango de fechas
    if (dateFrom || dateTo) {
      filter.timestamp = {};
      if (dateFrom) {
        filter.timestamp.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        // Agregar un día para incluir todo el día final
        const endDate = new Date(dateTo);
        endDate.setDate(endDate.getDate() + 1);
        filter.timestamp.$lt = endDate;
      }
    }

    // Búsqueda en texto
    if (search) {
      filter.$or = [
        { message: { $regex: search, $options: "i" } },
        { source: { $regex: search, $options: "i" } },
      ];
    }

    // Calcular skip para paginación
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Obtener logs con paginación
    const logs = await Log.find(filter)
      .sort({ timestamp: sort === "asc" ? 1 : -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Contar total para paginación
    const total = await Log.countDocuments(filter);

    // Obtener estadísticas por nivel
    const stats = {
      total: total,
      error: await Log.countDocuments({ ...filter, level: "error" }),
      warn: await Log.countDocuments({ ...filter, level: "warn" }),
      info: await Log.countDocuments({ ...filter, level: "info" }),
      debug: await Log.countDocuments({ ...filter, level: "debug" }),
    };

    res.json({
      success: true,
      logs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
      stats,
    });
  } catch (error) {
    logger.error("Error al obtener logs:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener logs",
      error: error.message,
    });
  }
};

/**
 * Obtener resumen de logs para dashboard
 * @route GET /api/v1/logs/summary
 */
const getLogsSummary = async (req, res) => {
  try {
    // Calcular fechas para diferentes períodos
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    // Obtener conteos por nivel para hoy
    const todayStats = {
      error: await Log.countDocuments({
        level: "error",
        timestamp: { $gte: today },
      }),
      warn: await Log.countDocuments({
        level: "warn",
        timestamp: { $gte: today },
      }),
      info: await Log.countDocuments({
        level: "info",
        timestamp: { $gte: today },
      }),
      debug: await Log.countDocuments({
        level: "debug",
        timestamp: { $gte: today },
      }),
    };

    // Obtener conteos por nivel para ayer
    const yesterdayStats = {
      error: await Log.countDocuments({
        level: "error",
        timestamp: { $gte: yesterday, $lt: today },
      }),
      warn: await Log.countDocuments({
        level: "warn",
        timestamp: { $gte: yesterday, $lt: today },
      }),
      info: await Log.countDocuments({
        level: "info",
        timestamp: { $gte: yesterday, $lt: today },
      }),
      debug: await Log.countDocuments({
        level: "debug",
        timestamp: { $gte: yesterday, $lt: today },
      }),
    };

    // Obtener tendencia diaria para la última semana
    const dailyTrend = await Log.aggregate([
      { $match: { timestamp: { $gte: weekAgo } } },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
            level: "$level",
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.date": 1 } },
    ]);

    // Formatear tendencia por día
    const trend = {};
    dailyTrend.forEach((item) => {
      const date = item._id.date;
      const level = item._id.level;
      const count = item.count;

      if (!trend[date]) {
        trend[date] = { error: 0, warn: 0, info: 0, debug: 0 };
      }

      trend[date][level] = count;
    });

    // Obtener los errores más recientes
    const recentErrors = await Log.find({ level: "error" })
      .sort({ timestamp: -1 })
      .limit(5);

    res.json({
      success: true,
      summary: {
        today: todayStats,
        yesterday: yesterdayStats,
        trend: trend,
      },
      recentErrors,
    });
  } catch (error) {
    logger.error("Error al obtener resumen de logs:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener resumen de logs",
      error: error.message,
    });
  }
};

/**
 * Obtener detalle de un log específico
 * @route GET /api/v1/logs/detail/:id
 */
const getLogDetail = async (req, res) => {
  try {
    const { id } = req.params;

    const log = await Log.findById(id);

    if (!log) {
      return res.status(404).json({
        success: false,
        message: "Log no encontrado",
      });
    }

    res.json({
      success: true,
      log,
    });
  } catch (error) {
    logger.error(`Error al obtener detalle del log ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: "Error al obtener detalle del log",
      error: error.message,
    });
  }
};

/**
 * Eliminar logs antiguos
 * @route DELETE /api/v1/logs/clean
 */
const cleanOldLogs = async (req, res) => {
  try {
    const { olderThan = 30 } = req.body; // Valor predeterminado: 30 días

    // Calcular fecha límite
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - parseInt(olderThan));

    // Eliminar logs anteriores a la fecha límite
    const result = await Log.deleteMany({ timestamp: { $lt: limitDate } });

    // Registrar acción en logs
    logger.info(
      `Limpieza de logs: ${result.deletedCount} registros eliminados (mayores a ${olderThan} días)`
    );

    res.json({
      success: true,
      message: `Se eliminaron ${result.deletedCount} logs antiguos`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    logger.error("Error al limpiar logs antiguos:", error);
    res.status(500).json({
      success: false,
      message: "Error al limpiar logs antiguos",
      error: error.message,
    });
  }
};

/**
 * Obtener fuentes distintas para filtrado
 * @route GET /api/v1/logs/sources
 */
const getLogSources = async (req, res) => {
  try {
    // Obtener fuentes distintas
    const sources = await Log.distinct("source");

    // Obtener niveles (no es necesario consultarlos, son fijos)
    const levels = ["error", "warn", "info", "debug"];

    res.json({
      success: true,
      sources: sources,
      levels: levels,
    });
  } catch (error) {
    logger.error("Error al obtener fuentes de logs:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener fuentes de logs",
      error: error.message,
    });
  }
};

module.exports = {
  getLogs,
  getLogsSummary,
  getLogDetail,
  cleanOldLogs,
  getLogSources,
};
