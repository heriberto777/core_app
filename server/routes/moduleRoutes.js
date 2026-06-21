const express = require("express");
const router = express.Router();
const moduleController = require("../controllers/moduleController");
const { verifyToken, checkPermission } = require("../middlewares/authMiddleware");

// Todas las rutas requieren autenticación
router.use(verifyToken);

// Configuración pública (dentro de la app)
router.get("/config", moduleController.getModulesConfig);

// Gestión de Módulos (Admin/Manage)
router.get("/categories", checkPermission("modules", "read"), moduleController.getCategories);
router.get("/available-actions", checkPermission("modules", "read"), moduleController.getAvailableActions);
router.post("/get-all", checkPermission("modules", "read"), moduleController.getAllModules);
router.get("/:id", checkPermission("modules", "read"), moduleController.getModuleById);
router.post("/", checkPermission("modules", "create"), moduleController.createModule);
router.put("/:id", checkPermission("modules", "update"), moduleController.updateModule);
router.patch("/:id/toggle-status", checkPermission("modules", "update"), moduleController.toggleModuleStatus);
router.delete("/:id", checkPermission("modules", "delete"), moduleController.deleteModule);

// Utilitarios
router.post("/cache/invalidate", checkPermission("modules", "manage"), moduleController.invalidateCache);

module.exports = router;
