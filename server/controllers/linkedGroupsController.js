const TransferTask = require("../models/transferTaks");
const logger = require("../services/logger");

/**
 * Obtener todos los grupos vinculados
 */

const getLinkedGroups = async (req, res) => {
  try {
    const groups = await TransferTask.aggregate([
      {
        $match: {
          linkedGroup: {
            $exists: true,
            $ne: null,
            $ne: "",
            $type: "string", // 👈 AGREGAR: Asegurar que sea string
          },
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
              linkedGroup: "$linkedGroup", // 👈 AGREGAR: Para debug
              isCoordinator: {
                $cond: [
                  {
                    $and: [
                      { $ne: ["$postUpdateQuery", null] },
                      { $ne: ["$postUpdateQuery", ""] },
                    ],
                  },
                  true,
                  false,
                ],
              },
              lastExecutionDate: "$lastExecutionDate",
              status: "$status",
              type: "$type",
            },
          },
          totalTasks: { $sum: 1 },
          coordinatorCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$postUpdateQuery", null] },
                    { $ne: ["$postUpdateQuery", ""] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      {
        $match: {
          _id: { $ne: null }, // 👈 AGREGAR: Filtrar grupos nulos
        },
      },
      {
        $project: {
          groupName: "$_id",
          tasks: {
            $sortArray: {
              input: "$tasks",
              sortBy: { linkedExecutionOrder: 1 },
            },
          },
          totalTasks: 1,
          coordinatorCount: 1,
          _id: 0,
        },
      },
      {
        $sort: { groupName: 1 },
      },
    ]);

    // 👈 AGREGAR: Log para debug
    console.log("🔍 Grupos encontrados:", groups.length);
    groups.forEach((group) => {
      console.log(`📁 Grupo: ${group.groupName}, Tareas: ${group.totalTasks}`);
    });

    res.json({
      success: true,
      groups,
    });
  } catch (error) {
    logger.error("Error al obtener grupos vinculados:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener grupos vinculados",
      error: error.message,
    });
  }
};

/**
 * Obtener detalles de un grupo específico
 */
const getGroupDetails = async (req, res) => {
  try {
    const { groupName } = req.params;

    const tasks = await TransferTask.find({
      linkedGroup: groupName,
      active: true,
    })
      .sort({ linkedExecutionOrder: 1 })
      .select(
        "name linkedExecutionOrder postUpdateQuery postUpdateMapping type lastExecutionDate status"
      );

    if (tasks.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No se encontraron tareas para el grupo "${groupName}"`,
      });
    }

    const coordinator = tasks.find(
      (task) => task.postUpdateQuery && task.postUpdateQuery.trim() !== ""
    );

    res.json({
      success: true,
      groupName,
      totalTasks: tasks.length,
      coordinator: coordinator
        ? {
            id: coordinator._id,
            name: coordinator.name,
            postUpdateQuery: coordinator.postUpdateQuery,
            postUpdateMapping: coordinator.postUpdateMapping,
          }
        : null,
      tasks: tasks.map((task) => ({
        id: task._id,
        name: task.name,
        order: task.linkedExecutionOrder,
        isCoordinator: !!(
          task.postUpdateQuery && task.postUpdateQuery.trim() !== ""
        ),
        type: task.type,
        lastExecutionDate: task.lastExecutionDate,
        status: task.status,
      })),
    });
  } catch (error) {
    logger.error(
      `Error al obtener detalles del grupo ${req.params.groupName}:`,
      error
    );
    res.status(500).json({
      success: false,
      message: "Error al obtener detalles del grupo",
      error: error.message,
    });
  }
};

/**
 * Eliminar completamente un grupo vinculado
 */
const deleteLinkedGroup = async (req, res) => {
  try {
    const { groupName } = req.params;
    const { confirmDelete } = req.body;

    if (!confirmDelete) {
      return res.status(400).json({
        success: false,
        message: "Debe confirmar la eliminación del grupo",
      });
    }

    logger.info(`🗑️ Iniciando eliminación del grupo vinculado: ${groupName}`);

    // Buscar todas las tareas del grupo
    const tasksInGroup = await TransferTask.find({
      linkedGroup: groupName,
    });

    if (tasksInGroup.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No se encontraron tareas en el grupo "${groupName}"`,
      });
    }

    // Actualizar todas las tareas para quitar la vinculación
    const updateResult = await TransferTask.updateMany(
      { linkedGroup: groupName },
      {
        $unset: {
          linkedGroup: 1,
          postUpdateQuery: 1,
        },
        $set: {
          executeLinkedTasks: false,
          linkedExecutionOrder: 0,
          postUpdateMapping: {
            viewKey: null,
            tableKey: null,
          },
          coordinationConfig: {
            waitForLinkedTasks: false,
            maxWaitTime: 300000,
            postUpdateStrategy: "individual",
          },
          linkingMetadata: {
            isCoordinator: false,
            lastGroupExecution: null,
            lastGroupExecutionId: null,
          },
        },
      }
    );

    logger.info(
      `✅ Grupo "${groupName}" eliminado: ${updateResult.modifiedCount} tareas actualizadas`
    );

    res.json({
      success: true,
      message: `Grupo "${groupName}" eliminado correctamente`,
      tasksUpdated: updateResult.modifiedCount,
      taskNames: tasksInGroup.map((t) => t.name),
    });
  } catch (error) {
    logger.error(`Error al eliminar grupo ${req.params.groupName}:`, error);
    res.status(500).json({
      success: false,
      message: "Error al eliminar el grupo vinculado",
      error: error.message,
    });
  }
};

/**
 * Quitar una tarea específica de un grupo
 */
const removeTaskFromGroup = async (req, res) => {
  try {
    const { taskId } = req.params;

    const task = await TransferTask.findById(taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Tarea no encontrada",
      });
    }

    const originalGroup = task.linkedGroup;

    // Actualizar la tarea para quitar vinculación
    await TransferTask.findByIdAndUpdate(taskId, {
      $unset: {
        linkedGroup: 1,
        postUpdateQuery: 1,
      },
      $set: {
        executeLinkedTasks: false,
        linkedExecutionOrder: 0,
        postUpdateMapping: {
          viewKey: null,
          tableKey: null,
        },
        linkingMetadata: {
          isCoordinator: false,
          lastGroupExecution: null,
          lastGroupExecutionId: null,
        },
      },
    });

    logger.info(
      `✅ Tarea "${task.name}" removida del grupo "${originalGroup}"`
    );

    res.json({
      success: true,
      message: `Tarea "${task.name}" removida del grupo "${originalGroup}"`,
      taskName: task.name,
      originalGroup,
    });
  } catch (error) {
    logger.error(
      `Error al remover tarea ${req.params.taskId} del grupo:`,
      error
    );
    res.status(500).json({
      success: false,
      message: "Error al remover la tarea del grupo",
      error: error.message,
    });
  }
};

/**
 * Reordenar tareas en un grupo
 */
const reorderGroupTasks = async (req, res) => {
  try {
    const { groupName } = req.params;
    const { taskOrders } = req.body; // [{ taskId, newOrder }, ...]

    if (!Array.isArray(taskOrders)) {
      return res.status(400).json({
        success: false,
        message: "taskOrders debe ser un array",
      });
    }

    logger.info(`🔄 Reordenando tareas del grupo: ${groupName}`);

    // Actualizar cada tarea con su nuevo orden
    const updatePromises = taskOrders.map(({ taskId, newOrder }) =>
      TransferTask.findByIdAndUpdate(taskId, {
        linkedExecutionOrder: newOrder,
      })
    );

    await Promise.all(updatePromises);

    logger.info(`✅ Tareas del grupo "${groupName}" reordenadas correctamente`);

    res.json({
      success: true,
      message: `Tareas del grupo "${groupName}" reordenadas correctamente`,
      updatedTasks: taskOrders.length,
    });
  } catch (error) {
    logger.error(`Error al reordenar grupo ${req.params.groupName}:`, error);
    res.status(500).json({
      success: false,
      message: "Error al reordenar las tareas del grupo",
      error: error.message,
    });
  }
};

/**
 * FUNCIÓN DE DEBUG: Encontrar tareas problemáticas
 */
const debugProblematicTasks = async (req, res) => {
  try {
    // Buscar tareas que podrían estar causando problemas
    const problematicTasks = await TransferTask.find({
      $or: [
        // Tareas con linkedGroup vacío pero executeLinkedTasks true
        { linkedGroup: { $in: [null, ""] }, executeLinkedTasks: true },

        // Tareas con postUpdateQuery pero no marcadas como coordinadoras
        {
          postUpdateQuery: { $exists: true, $ne: null, $ne: "" },
          "linkingMetadata.isCoordinator": { $ne: true },
        },

        // Tareas con linkedGroup pero executeLinkedTasks false
        {
          linkedGroup: { $exists: true, $ne: null, $ne: "" },
          executeLinkedTasks: false,
        },
      ],
    }).select(
      "name linkedGroup executeLinkedTasks postUpdateQuery linkingMetadata"
    );

    console.log(
      "🔍 Tareas problemáticas encontradas:",
      problematicTasks.length
    );

    const analysis = problematicTasks.map((task) => ({
      name: task.name,
      linkedGroup: task.linkedGroup,
      executeLinkedTasks: task.executeLinkedTasks,
      hasPostUpdate: !!(task.postUpdateQuery && task.postUpdateQuery.trim()),
      isCoordinator: task.linkingMetadata?.isCoordinator || false,
      problem: determineTaskProblem(task),
    }));

    res.json({
      success: true,
      problematicTasks: analysis,
      total: problematicTasks.length,
    });
  } catch (error) {
    logger.error("Error en debug de tareas problemáticas:", error);
    res.status(500).json({
      success: false,
      message: "Error en debug",
      error: error.message,
    });
  }
};

function determineTaskProblem(task) {
  const problems = [];

  if (
    (!task.linkedGroup || task.linkedGroup === "") &&
    task.executeLinkedTasks
  ) {
    problems.push("executeLinkedTasks=true sin grupo");
  }

  if (
    task.postUpdateQuery &&
    task.postUpdateQuery.trim() &&
    !task.linkingMetadata?.isCoordinator
  ) {
    problems.push("Tiene postUpdate pero no es coordinadora");
  }

  if (task.linkedGroup && task.linkedGroup.trim() && !task.executeLinkedTasks) {
    problems.push("Tiene grupo pero executeLinkedTasks=false");
  }

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
