const TransferTask = require("../models/transferTaskModel");
const logger = require("../services/logger");

/**
 * Obtener todos los grupos vinculados
 */
const getLinkedGroups = async (req, res) => {
  try {
    const groups = await TransferTask.aggregate([
      {
        $match: {
          linkedGroup: { $exists: true, $nin: [null, ""], $type: "string" },
          active: true,
        },
      },
      {
        $group: {
          _id: "$linkedGroup",
          tasks: {
            $push: {
              id: "$_id",
              name: "$name",
              linkedExecutionOrder: "$linkedExecutionOrder",
              linkedGroup: "$linkedGroup",
              isCoordinator: {
                $cond: [{ $and: [{ $ne: ["$postUpdateQuery", null] }, { $ne: ["$postUpdateQuery", ""] }] }, true, false],
              },
              lastExecutionDate: "$lastExecutionDate",
              status: "$status",
              type: "$type",
            },
          },
          totalTasks: { $sum: 1 },
          coordinatorCount: {
            $sum: { $cond: [{ $and: [{ $ne: ["$postUpdateQuery", null] }, { $ne: ["$postUpdateQuery", ""] }] }, 1, 0] },
          },
        },
      },
      { $match: { _id: { $ne: null } } },
      {
        $project: {
          groupName: "$_id",
          tasks: { $sortArray: { input: "$tasks", sortBy: { linkedExecutionOrder: 1 } } },
          totalTasks: 1,
          coordinatorCount: 1,
          _id: 0,
        },
      },
      { $sort: { groupName: 1 } },
    ]);

    logger.info(`Grupos de tareas vinculadas encontrados: ${groups.length}`);
    return res.status(200).json({
      success: true,
      message: "Grupos vinculados obtenidos correctamente",
      data: groups,
    });
  } catch (error) {
    logger.error("Error en getLinkedGroups:", error);
    return res.status(500).json({ success: false, message: "Error al obtener grupos", error: error.message });
  }
};

/**
 * Obtener detalles de un grupo específico
 */
const getGroupDetails = async (req, res) => {
  try {
    const { groupName } = req.params;
    const tasks = await TransferTask.find({ linkedGroup: groupName, active: true })
      .sort({ linkedExecutionOrder: 1 })
      .select("name linkedExecutionOrder postUpdateQuery postUpdateMapping type lastExecutionDate status")
      .lean();

    if (tasks.length === 0) {
      return res.status(404).json({ success: false, message: `No se encontraron tareas para el grupo "${groupName}"` });
    }

    const coordinator = tasks.find(t => t.postUpdateQuery && t.postUpdateQuery.trim() !== "");

    return res.status(200).json({
      success: true,
      message: "Detalles del grupo obtenidos correctamente",
      data: {
        groupName,
        totalTasks: tasks.length,
        coordinator: coordinator ? {
          id: coordinator._id,
          name: coordinator.name,
          postUpdateQuery: coordinator.postUpdateQuery,
          postUpdateMapping: coordinator.postUpdateMapping,
        } : null,
        tasks: tasks.map(t => ({
          id: t._id,
          name: t.name,
          order: t.linkedExecutionOrder,
          isCoordinator: !!(t.postUpdateQuery && t.postUpdateQuery.trim() !== ""),
          type: t.type,
          lastExecutionDate: t.lastExecutionDate,
          status: t.status,
        })),
      }
    });
  } catch (error) {
    logger.error(`Error en getGroupDetails (${req.params.groupName}):`, error);
    return res.status(500).json({ success: false, message: "Error interno", error: error.message });
  }
};

/**
 * Eliminar completamente un grupo vinculado
 */
const deleteLinkedGroup = async (req, res) => {
  try {
    const { groupName } = req.params;
    const { confirmDelete } = req.body;
    const userId = req.user?.user_id || req.user?._id || "SYSTEM";

    if (!confirmDelete) return res.status(400).json({ success: false, message: "Debe confirmar la eliminación del grupo" });

    logger.info(`Iniciando eliminación del grupo vinculado: ${groupName} por ${userId}`);

    const tasksInGroup = await TransferTask.find({ linkedGroup: groupName }).select("name").lean();
    if (tasksInGroup.length === 0) return res.status(404).json({ success: false, message: "No se encontraron tareas en el grupo" });

    const updateResult = await TransferTask.updateMany(
      { linkedGroup: groupName },
      {
        $unset: { linkedGroup: 1, postUpdateQuery: 1 },
        $set: {
          executeLinkedTasks: false,
          linkedExecutionOrder: 0,
          postUpdateMapping: { viewKey: null, tableKey: null },
          coordinationConfig: { waitForLinkedTasks: false, maxWaitTime: 300000, postUpdateStrategy: "individual" },
          linkingMetadata: { isCoordinator: false, lastGroupExecution: null, lastGroupExecutionId: null },
        },
      }
    );

    logger.info(`Grupo "${groupName}" eliminado: ${updateResult.modifiedCount} tareas actualizadas por ${userId}`);
    return res.status(200).json({
      success: true,
      message: `Grupo "${groupName}" eliminado correctamente`,
      data: { tasksUpdated: updateResult.modifiedCount, taskNames: tasksInGroup.map(t => t.name) }
    });
  } catch (error) {
    logger.error(`Error en deleteLinkedGroup (${req.params.groupName}):`, error);
    return res.status(500).json({ success: false, message: "Error al eliminar el grupo", error: error.message });
  }
};

/**
 * Quitar una tarea específica de un grupo
 */
const removeTaskFromGroup = async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.user?.user_id || req.user?._id || "SYSTEM";

    const task = await TransferTask.findById(taskId);
    if (!task) return res.status(404).json({ success: false, message: "Tarea no encontrada" });

    const originalGroup = task.linkedGroup;

    await TransferTask.findByIdAndUpdate(taskId, {
      $unset: { linkedGroup: 1, postUpdateQuery: 1 },
      $set: {
        executeLinkedTasks: false,
        linkedExecutionOrder: 0,
        postUpdateMapping: { viewKey: null, tableKey: null },
        linkingMetadata: { isCoordinator: false, lastGroupExecution: null, lastGroupExecutionId: null },
      },
    });

    logger.info(`Tarea "${task.name}" removida del grupo "${originalGroup}" por ${userId}`);
    return res.status(200).json({
      success: true,
      message: `Tarea "${task.name}" removida del grupo "${originalGroup}"`,
      data: { taskName: task.name, originalGroup }
    });
  } catch (error) {
    logger.error(`Error en removeTaskFromGroup (${req.params.taskId}):`, error);
    return res.status(500).json({ success: false, message: "Error al remover tarea", error: error.message });
  }
};

/**
 * Reordenar tareas en un grupo
 */
const reorderGroupTasks = async (req, res) => {
  try {
    const { groupName } = req.params;
    const { taskOrders } = req.body;
    const userId = req.user?.user_id || req.user?._id || "SYSTEM";

    if (!Array.isArray(taskOrders)) return res.status(400).json({ success: false, message: "taskOrders debe ser un array" });

    logger.info(`Reordenando tareas del grupo: ${groupName} por ${userId}`);

    const updatePromises = taskOrders.map(({ taskId, newOrder }) =>
      TransferTask.findByIdAndUpdate(taskId, { linkedExecutionOrder: newOrder })
    );

    await Promise.all(updatePromises);

    logger.info(`Tareas del grupo "${groupName}" reordenadas correctamente por ${userId}`);
    return res.status(200).json({
      success: true,
      message: `Tareas del grupo "${groupName}" reordenadas correctamente`,
      data: { updatedTasks: taskOrders.length }
    });
  } catch (error) {
    logger.error(`Error en reorderGroupTasks (${req.params.groupName}):`, error);
    return res.status(500).json({ success: false, message: "Error al reordenar", error: error.message });
  }
};

/**
 * FUNCIÓN DE DEBUG: Encontrar tareas problemáticas
 */
const debugProblematicTasks = async (req, res) => {
  try {
    const problematicTasks = await TransferTask.find({
      $or: [
        { linkedGroup: { $exists: true, $nin: [null, ""] }, executeLinkedTasks: true },
        { postUpdateQuery: { $exists: true, $nin: [null, ""] }, "linkingMetadata.isCoordinator": { $ne: true } },
        { linkedGroup: { $exists: true, $nin: [null, ""] }, executeLinkedTasks: false },
      ],
    }).select("name linkedGroup executeLinkedTasks postUpdateQuery linkingMetadata").lean();

    const analysis = problematicTasks.map(task => ({
      name: task.name,
      linkedGroup: task.linkedGroup,
      executeLinkedTasks: task.executeLinkedTasks,
      hasPostUpdate: !!(task.postUpdateQuery && task.postUpdateQuery.trim()),
      isCoordinator: task.linkingMetadata?.isCoordinator || false,
      problem: determineTaskProblem(task),
    }));

    logger.info(`Análisis de tareas problemáticas realizado: ${analysis.length} encontradas`);
    return res.status(200).json({
      success: true,
      message: "Análisis de tareas problemáticas completado",
      data: { problematicTasks: analysis, total: problematicTasks.length },
    });
  } catch (error) {
    logger.error("Error en debugProblematicTasks:", error);
    return res.status(500).json({ success: false, message: "Error en debug", error: error.message });
  }
};

function determineTaskProblem(task) {
  const problems = [];
  if ((!task.linkedGroup || task.linkedGroup === "") && task.executeLinkedTasks) problems.push("executeLinkedTasks=true sin grupo");
  if (task.postUpdateQuery && task.postUpdateQuery.trim() && !task.linkingMetadata?.isCoordinator) problems.push("Tiene postUpdate pero no es coordinadora");
  if (task.linkedGroup && task.linkedGroup.trim() && !task.executeLinkedTasks) problems.push("Tiene grupo pero executeLinkedTasks=false");
  return problems.join(", ") || "Sin problemas detectados";
}

module.exports = {
  getLinkedGroups,
  getGroupDetails,
  deleteLinkedGroup,
  removeTaskFromGroup,
  reorderGroupTasks,
  debugProblematicTasks,
};
