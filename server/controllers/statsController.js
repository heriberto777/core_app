const TransferTask = require("../models/transferTaskModel");
const Log = require("../models/loggerModel");
const ServerMetric = require("../models/serverMetricModel");
const logger = require("../services/logger");

/**
 * Obtiene la fecha de inicio según el rango solicitado
 */
function getStartDateFromRange(timeRange) {
  const now = new Date();
  switch (timeRange) {
    case "24h":
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "90d":
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
}

/**
 * Obtiene estadísticas generales para el dashboard
 */
const getTransferStats = async (req, res) => {
  try {
    const { timeRange = "7d", taskId } = req.query;
    const startDate = getStartDateFromRange(timeRange);

    const baseFilter = { 
      timestamp: { $gte: startDate },
      operationType: "TRANSFER"
    };
    if (taskId && taskId !== "all") {
      baseFilter.taskId = taskId.toString();
    }

    logger.info(`Generando estadísticas para el rango: ${timeRange}${taskId ? ` (Tarea: ${taskId})` : ""} por ${req.user?._id}`);

    const [transfersByDay, successRate, taskPerformance, serverResponseTimes] = await Promise.all([
      getTransfersByDay(startDate, taskId),
      calculateSuccessRate(baseFilter),
      getTaskPerformance(startDate, taskId),
      getServerResponseTimes(startDate),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        timeRange,
        transfersByDay,
        successRate,
        taskPerformance,
        serverResponseTimes,
      }
    });
  } catch (error) {
    logger.error("Error en getTransferStats:", error);
    return res.status(500).json({ success: false, message: "Error al generar estadísticas del sistema", error: error.message });
  }
};

/**
 * Obtiene datos de transferencias agrupados por día
 */
async function getTransfersByDay(startDate, taskId) {
  try {
    const matchStage = { 
      timestamp: { $gte: startDate },
      operationType: "TRANSFER",
      "metadata.status": { $exists: true }
    };
    if (taskId && taskId !== "all") matchStage.taskId = taskId.toString();

    const result = await Log.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
            status: "$metadata.status",
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.date": 1 } },
    ]);

    const dateMap = {};
    const days = Math.ceil((new Date() - startDate) / (24 * 60 * 60 * 1000));

    for (let i = 0; i < days; i++) {
      const date = new Date(startDate.getTime());
      date.setDate(startDate.getDate() + i);
      const dateStr = date.toISOString().split("T")[0];
      dateMap[dateStr] = { date: dateStr, completed: 0, failed: 0 };
    }

    result.forEach((item) => {
      const { date, status } = item._id;
      if (!dateMap[date]) return; // Ignorar fechas fuera del rango de reconstrucción
      if (status === "completed") dateMap[date].completed = item.count;
      else if (status === "failed" || status === "cancelled") dateMap[date].failed += item.count;
    });

    return Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    logger.error("Error en getTransfersByDay aggregation:", error);
    return [];
  }
}

async function calculateSuccessRate(baseFilter) {
  try {
    const completedCount = await Log.countDocuments({ ...baseFilter, "metadata.status": "completed" });
    const failedCount = await Log.countDocuments({ ...baseFilter, "metadata.status": { $in: ["failed", "cancelled"] } });
    const total = completedCount + failedCount;

    if (total === 0) return [{ name: "Exitosas", value: 0 }, { name: "Fallidas", value: 0 }];

    return [
      { name: "Exitosas", value: completedCount },
      { name: "Fallidas", value: failedCount },
    ];
  } catch (error) {
    logger.error("Error en calculateSuccessRate:", error);
    return [{ name: "Exitosas", value: 0 }, { name: "Fallidas", value: 0 }];
  }
}

async function getTaskPerformance(startDate, taskId) {
  try {
    const tasksQuery = taskId && taskId !== "all" ? { _id: taskId } : {};
    const tasks = await TransferTask.find(tasksQuery).lean();
    const taskPerformance = [];

    for (const task of tasks) {
      const taskFilter = { taskId: task._id.toString(), timestamp: { $gte: startDate }, operationType: "TRANSFER" };
      
      const executedCount = await Log.countDocuments(taskFilter);
      const successCount = await Log.countDocuments({ ...taskFilter, "metadata.status": "completed" });

      const avgTimeResult = await Log.aggregate([
        { $match: { ...taskFilter, durationMs: { $exists: true, $ne: null } } },
        { $group: { _id: null, avgTime: { $avg: "$durationMs" } } },
      ]);

      const avgTime = avgTimeResult.length > 0 ? Math.round(avgTimeResult[0].avgTime / 1000) : 0;
      const successRate = executedCount > 0 ? Math.round((successCount / executedCount) * 100) : 0;

      taskPerformance.push({
        name: task.name,
        executed: executedCount,
        avgTime,
        successRate,
      });
    }
    return taskPerformance;
  } catch (error) {
    logger.error("Error en getTaskPerformance:", error);
    return [];
  }
}

async function getServerResponseTimes(startDate) {
  try {
    const metrics = await ServerMetric.find({ timestamp: { $gte: startDate } }).sort({ timestamp: 1 }).lean();
    const dateMap = {};

    metrics.forEach((metric) => {
      const date = new Date(metric.timestamp).toISOString().split("T")[0];
      if (!dateMap[date]) {
        dateMap[date] = { date, server1: 0, server2: 0, server1Count: 0, server2Count: 0 };
      }
      if (metric.server === "server1" && metric.responseTime) {
        dateMap[date].server1 += metric.responseTime;
        dateMap[date].server1Count++;
      } else if (metric.server === "server2" && metric.responseTime) {
        dateMap[date].server2 += metric.responseTime;
        dateMap[date].server2Count++;
      }
    });

    return Object.values(dateMap)
      .map((day) => ({
        date: day.date,
        server1: day.server1Count > 0 ? Math.round(day.server1 / day.server1Count) : null,
        server2: day.server2Count > 0 ? Math.round(day.server2 / day.server2Count) : null,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    logger.error("Error en getServerResponseTimes:", error);
    return [];
  }
}

module.exports = {
  getTransferStats,
};
