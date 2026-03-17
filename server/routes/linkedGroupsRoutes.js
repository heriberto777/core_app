const express = require("express");
const {
  getLinkedGroups,
  getGroupDetails,
  deleteLinkedGroup,
  removeTaskFromGroup,
  reorderGroupTasks,
  debugProblematicTasks,
} = require("../controllers/linkedGroupsController");
const { verifyToken, checkPermission } = require("../middlewares/authMiddleware");

const router = express.Router();

// ⭐ MIDDLEWARE GLOBAL ⭐
router.use(verifyToken);

// Obtener todos los grupos vinculados
router.get("/", checkPermission("loads", "read"), getLinkedGroups);

// Obtener detalles de un grupo específico
router.get("/:groupName", checkPermission("loads", "read"), getGroupDetails);

// Eliminar completamente un grupo vinculado
router.delete("/:groupName", checkPermission("loads", "delete"), deleteLinkedGroup);

// Quitar una tarea específica de un grupo
router.delete("/task/:taskId", checkPermission("loads", "manage"), removeTaskFromGroup);

// Reordenar tareas en un grupo
router.put("/:groupName/reorder", checkPermission("loads", "manage"), reorderGroupTasks);

// Agregar esta ruta temporal para debug:
router.get("/debug/problematic-tasks", checkPermission("loads", "read"), debugProblematicTasks);

module.exports = router;
