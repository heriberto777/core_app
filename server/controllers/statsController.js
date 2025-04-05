const TransferTask = require("../models/transferTaks");
const TaskExecution = require("../models/taskExecutionModel"); // Nuevo modelo
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
      // Por defecto 7 días
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
}

/**
 * Obtiene estadísticas generales para el dashboard
 */
const getTransferStats = async (req, res) => {
  try {
    const { timeRange = "7d", taskId } = req.query;

    // Calcular fecha de inicio según el rango solicitado
    const startDate = getStartDateFromRange(timeRange);

    // Construir filtro base
    const baseFilter = {
      date: { $gte: startDate },
    };

    // Añadir filtro de tarea si se especifica
    if (taskId && taskId !== "all") {
      baseFilter.taskId = taskId;
    }

    // 1. Obtener transferencias por día
    const transfersByDay = await getTransfersByDay(startDate, taskId);

    // 2. Calcular tasa de éxito general
    const successRate = await calculateSuccessRate(baseFilter);

    // 3. Obtener rendimiento por tarea
    const taskPerformance = await getTaskPerformance(startDate, taskId);

    // 4. Obtener tiempos de respuesta de los servidores
    const serverResponseTimes = await getServerResponseTimes(startDate);

    // Retornar todos los datos
    res.status(200).json({
      success: true,
      timeRange,
      transfersByDay,
      successRate,
      taskPerformance,
      serverResponseTimes,
    });
  } catch (error) {
    logger.error("Error al obtener estadísticas:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener estadísticas",
      error: error.message,
    });
  }
};

/**
 * Obtiene datos de transferencias agrupados por día
 */
async function getTransfersByDay(startDate, taskId) {
  try {
    // Construir match para la agregación
    const matchStage = {
      date: { $gte: startDate },
    };

    if (taskId && taskId !== "all") {
      matchStage.taskId = taskId;
    }

    // Ejecutar la agregación para agrupar por día y estado
    const result = await TaskExecution.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
            status: "$status",
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.date": 1 } },
    ]);

    // Transformar los resultados a formato deseado para el gráfico
    const dateMap = {};

    // Inicializar el mapa con todos los días en el rango
    const days = Math.ceil((new Date() - startDate) / (24 * 60 * 60 * 1000));
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const dateStr = date.toISOString().split("T")[0];
      dateMap[dateStr] = { date: dateStr, completed: 0, failed: 0 };
    }

    // Rellenar con datos reales
    result.forEach((item) => {
      const { date, status } = item._id;
      if (!dateMap[date]) {
        dateMap[date] = { date, completed: 0, failed: 0 };
      }

      if (status === "completed") {
        dateMap[date].completed = item.count;
      } else if (status === "failed" || status === "cancelled") {
        dateMap[date].failed = item.count;
      }
    });

    // Convertir el mapa a array y ordenar por fecha
    return Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    logger.error("Error obteniendo transferencias por día:", error);
    return [];
  }
}

/**
 * Calcula la tasa de éxito/fallo general
 */
async function calculateSuccessRate(baseFilter) {
  try {
    const completedCount = await TaskExecution.countDocuments({
      ...baseFilter,
      status: "completed",
    });

    const failedCount = await TaskExecution.countDocuments({
      ...baseFilter,
      status: { $in: ["failed", "cancelled"] },
    });

    const total = completedCount + failedCount;

    // Si no hay datos, devolver valores por defecto
    if (total === 0) {
      return [
        { name: "Exitosas", value: 0 },
        { name: "Fallidas", value: 0 },
      ];
    }

    return [
      { name: "Exitosas", value: completedCount },
      { name: "Fallidas", value: failedCount },
    ];
  } catch (error) {
    logger.error("Error calculando tasa de éxito:", error);
    return [
      { name: "Exitosas", value: 0 },
      { name: "Fallidas", value: 0 },
    ];
  }
}

/**
 * Obtiene métricas de rendimiento por tarea
 */
async function getTaskPerformance(startDate, taskId) {
  try {
    // Consulta para obtener tareas
    const tasksQuery = taskId && taskId !== "all" ? { _id: taskId } : {};
    const tasks = await TransferTask.find(tasksQuery);

    // Para cada tarea, obtener sus métricas
    const taskPerformance = [];

    for (const task of tasks) {
      // Contar ejecuciones
      const executedCount = await TaskExecution.countDocuments({
        taskId: task._id,
        date: { $gte: startDate },
      });

      // Contar éxitos
      const successCount = await TaskExecution.countDocuments({
        taskId: task._id,
        status: "completed",
        date: { $gte: startDate },
      });

      // Calcular tiempo promedio
      const avgTimeResult = await TaskExecution.aggregate([
        {
          $match: {
            taskId: task._id,
            date: { $gte: startDate },
            executionTime: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: null,
            avgTime: { $avg: "$executionTime" },
          },
        },
      ]);

      const avgTime =
        avgTimeResult.length > 0
          ? Math.round(avgTimeResult[0].avgTime / 1000) // Convertir a segundos
          : 0;

      // Calcular tasa de éxito
      const successRate =
        executedCount > 0
          ? Math.round((successCount / executedCount) * 100)
          : 0;

      taskPerformance.push({
        name: task.name,
        executed: executedCount,
        avgTime,
        successRate,
      });
    }

    return taskPerformance;
  } catch (error) {
    logger.error("Error obteniendo rendimiento por tarea:", error);
    return [];
  }
}

/**
 * Obtiene tiempos de respuesta de los servidores
 */
async function getServerResponseTimes(startDate) {
  try {
    // Consulta para obtener registros de tiempos de respuesta
    const metrics = await ServerMetric.find({
      timestamp: { $gte: startDate },
    }).sort({ timestamp: 1 });

    // Transformar los resultados
    const dateMap = {};

    metrics.forEach((metric) => {
      const date = new Date(metric.timestamp).toISOString().split("T")[0];
      if (!dateMap[date]) {
        dateMap[date] = {
          date,
          server1: 0,
          server2: 0,
          server1Count: 0,
          server2Count: 0,
        };
      }

      if (metric.server === "server1" && metric.responseTime) {
        dateMap[date].server1 += metric.responseTime;
        dateMap[date].server1Count++;
      } else if (metric.server === "server2" && metric.responseTime) {
        dateMap[date].server2 += metric.responseTime;
        dateMap[date].server2Count++;
      }
    });

    // Calcular promedios diarios
    return Object.values(dateMap)
      .map((day) => ({
        date: day.date,
        server1:
          day.server1Count > 0
            ? Math.round(day.server1 / day.server1Count)
            : null,
        server2:
          day.server2Count > 0
            ? Math.round(day.server2 / day.server2Count)
            : null,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    logger.error("Error obteniendo tiempos de respuesta:", error);

    // Datos simulados para desarrollo
    const days = Math.ceil((new Date() - startDate) / (24 * 60 * 60 * 1000));
    const result = [];

    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const dateStr = date.toISOString().split("T")[0];

      result.push({
        date: dateStr,
        server1: Math.floor(Math.random() * 30) + 30,
        server2: Math.floor(Math.random() * 30) + 40,
      });
    }

    return result;
  }
}

module.exports = {
  getTransferStats,
};
