const Log = require("../models/loggerModel");
const logger = require("../services/logger");

/**
 * Obtener listado de logs con filtros y paginación
 */
const getLogs = async (req, res) => {
  try {
    const { level, source, dateFrom, dateTo, search, limit = 50, page = 1, sort = "desc",
            operationType, entityType, mappingId } = req.query;

    const filter = {};
    if (level && level !== "all") filter.level = level;
    if (source && source !== "all") filter.source = source;
    if (operationType && operationType !== "all") filter.operationType = operationType;
    if (entityType && entityType !== "all") filter.entityType = entityType;
    if (mappingId && mappingId !== "all") filter.mappingId = mappingId;

    if (dateFrom || dateTo) {
      filter.timestamp = {};
      if (dateFrom) filter.timestamp.$gte = new Date(dateFrom);
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setDate(endDate.getDate() + 1);
        filter.timestamp.$lt = endDate;
      }
    }

    if (search) {
      filter.$or = [
        { message: { $regex: search, $options: "i" } },
        { source: { $regex: search, $options: "i" } },
        { mappingName: { $regex: search, $options: "i" } },
        { fieldName: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const logs = await Log.find(filter).sort({ timestamp: sort === "asc" ? 1 : -1 }).skip(skip).limit(parseInt(limit)).lean();
    const total = await Log.countDocuments(filter);

    const stats = {
      total,
      error: await Log.countDocuments({ ...filter, level: "error" }),
      warn: await Log.countDocuments({ ...filter, level: "warn" }),
      info: await Log.countDocuments({ ...filter, level: "info" }),
      debug: await Log.countDocuments({ ...filter, level: "debug" }),
    };

    return res.status(200).json({
      success: true,
      message: "Registros de sistema obtenidos correctamente",
      data: {
        logs,
        pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
        stats
      }
    });
  } catch (error) {
    logger.error("Error en getLogs:", error);
    return res.status(500).json({ success: false, message: "Error al obtener registros", error: error.message });
  }
};

/**
 * Obtener resumen de logs para dashboard
 */
const getLogsSummary = async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const levels = ["error", "warn", "info", "debug"];
    const todayStats = {};
    const yesterdayStats = {};

    await Promise.all(levels.map(async (level) => {
      todayStats[level] = await Log.countDocuments({ level, timestamp: { $gte: today } });
      yesterdayStats[level] = await Log.countDocuments({ level, timestamp: { $gte: yesterday, $lt: today } });
    }));

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

    const trend = {};
    dailyTrend.forEach((item) => {
      const { date, level } = item._id;
      if (!trend[date]) trend[date] = { error: 0, warn: 0, info: 0, debug: 0 };
      trend[date][level] = item.count;
    });

    const recentErrors = await Log.find({ level: "error" }).sort({ timestamp: -1 }).limit(5).lean();

    return res.status(200).json({
      success: true,
      message: "Resumen de logs generado correctamente",
      data: {
        summary: { today: todayStats, yesterday: yesterdayStats, trend },
        recentErrors
      }
    });
  } catch (error) {
    logger.error("Error en getLogsSummary:", error);
    return res.status(500).json({ success: false, message: "Error al generar resumen", error: error.message });
  }
};

/**
 * Obtener detalle de un log específico
 */
const getLogDetail = async (req, res) => {
  try {
    const log = await Log.findById(req.params.id).lean();
    if (!log) return res.status(404).json({ success: false, message: "Registro no encontrado" });

    return res.status(200).json({
      success: true,
      message: "Detalle de registro obtenido",
      data: log,
    });
  } catch (error) {
    logger.error(`Error en getLogDetail (${req.params.id}):`, error);
    return res.status(500).json({ success: false, message: "Error interno", error: error.message });
  }
};

/**
 * Eliminar logs antiguos
 */
const cleanOldLogs = async (req, res) => {
  try {
    const { olderThan = 90 } = req.query;
    const daysToDelete = parseInt(olderThan);
    const userId = req.user?.user_id || req.user?._id || "SYSTEM";

    if (isNaN(daysToDelete) || daysToDelete < 1) {
      return res.status(400).json({ success: false, message: "El parámetro 'olderThan' debe ser un número positivo" });
    }

    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - daysToDelete);

    const totalLogs = await Log.countDocuments();
    const logsToDelete = await Log.countDocuments({ timestamp: { $lt: limitDate } });

    if (logsToDelete === 0) {
      return res.status(200).json({
        success: true,
        message: `No hay registros anteriores a ${daysToDelete} días para eliminar`,
        data: { deletedCount: 0, totalLogs }
      });
    }

    const result = await Log.deleteMany({ timestamp: { $lt: limitDate } });

    if (!result.acknowledged) throw new Error("Operación no reconocida por MongoDB");

    logger.info(`Limpieza manual de logs ejecutada por ${userId}: ${result.deletedCount} registros eliminados (> ${daysToDelete} días)`);

    return res.status(200).json({
      success: true,
      message: `Se eliminaron ${result.deletedCount} registros antiguos exitosamente`,
      data: {
        deletedCount: result.deletedCount,
        totalLogsBefore: totalLogs,
        daysDeleted: daysToDelete,
        cutoffDate: limitDate.toISOString()
      }
    });
  } catch (error) {
    logger.error("Error en cleanOldLogs:", error);
    return res.status(500).json({ success: false, message: "Error al limpiar registros", error: error.message });
  }
};

/**
 * Obtener fuentes distintas
 */
const getLogSources = async (req, res) => {
  try {
    const sources = await Log.distinct("source");
    const levels = ["error", "warn", "info", "debug"];

    return res.status(200).json({
      success: true,
      message: "Fuentes y niveles de log obtenidos",
      data: { sources, levels },
    });
  } catch (error) {
    logger.error("Error en getLogSources:", error);
    return res.status(500).json({ success: false, message: "Error al obtener fuentes", error: error.message });
  }
};

/**
 * Diagnosticar estado del sistema de logging
 */
const getLogsDiagnostic = async (req, res) => {
  try {
    const logger = require("../services/logger");
    const Log = require("../models/loggerModel");
    
    const diagnostics = logger.getDiagnostics();
    
    // Agregar estadísticas adicionales de MongoDB
    const mongoStats = {
      totalLogs: await Log.countDocuments(),
      logsLast24h: await Log.countDocuments({
        timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }),
      logsLastHour: await Log.countDocuments({
        timestamp: { $gte: new Date(Date.now() - 60 * 60 * 1000) }
      }),
      errorCount: await Log.countDocuments({ level: "error" }),
      warnCount: await Log.countDocuments({ level: "warn" }),
      infoCount: await Log.countDocuments({ level: "info" }),
      debugCount: await Log.countDocuments({ level: "debug" }),
    };
    
    // Obtener niveles disponibles en la colección
    const levels = await Log.distinct("level");
    const sources = await Log.distinct("source");
    const operationTypes = await Log.distinct("operationType").catch(() => []);
    const entityTypes = await Log.distinct("entityType").catch(() => []);
    
    return res.status(200).json({
      success: true,
      message: "Diagnóstico del sistema de logs",
      data: {
        ...diagnostics,
        mongoStats,
        availableFilters: {
          levels,
          sources,
          operationTypes,
          entityTypes,
        },
        timestamp: new Date().toISOString(),
      }
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: "Error al obtener diagnóstico", 
      error: error.message 
    });
  }
};

module.exports = {
  getLogs,
  getLogsSummary,
  getLogDetail,
  cleanOldLogs,
  getLogSources,
  getLogsDiagnostic,
};
