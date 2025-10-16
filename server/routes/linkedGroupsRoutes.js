const express = require("express");
const {
  getLinkedGroups,
  getGroupDetails,
  deleteLinkedGroup,
  removeTaskFromGroup,
  reorderGroupTasks,
  debugProblematicTasks,
} = require("../controllers/linkedGroupsController");

const router = express.Router();

// Obtener todos los grupos vinculados
router.get("/", getLinkedGroups);

// Obtener detalles de un grupo específico
router.get("/:groupName", getGroupDetails);

// Eliminar completamente un grupo vinculado
router.delete("/:groupName", deleteLinkedGroup);

// Quitar una tarea específica de un grupo
router.delete("/task/:taskId", removeTaskFromGroup);

// Reordenar tareas en un grupo
router.put("/:groupName/reorder", reorderGroupTasks);

// // Agregar esta ruta temporal para debug:
router.get("/debug/problematic-tasks", debugProblematicTasks);

module.exports = router;
