const express = require("express");
const router = express.Router();
const moduleController = require("../controllers/moduleController");
const {
  verifyToken,
  checkPermission,
  checkPermissions,
} = require("../middlewares/authMiddleware");

// ⭐ MIDDLEWARE DE AUTENTICACIÓN PARA TODAS LAS RUTAS ⭐
router.use(verifyToken);

// ⭐ RUTAS PÚBLICAS (solo lectura para usuarios autenticados) ⭐
router.get("/config", moduleController.getModulesConfig);

router.get("/available-actions", moduleController.getAvailableActions);

router.get("/categories", moduleController.getCategories);

// ⭐ RUTAS DE LECTURA (requiere permisos de lectura) ⭐
router.post(
  "/get-all",
  checkPermission("modules", "read"),
  moduleController.getAllModules
);

router.get(
  "/get/:id",
  checkPermissions([{ resource: "modules", action: "read" }]),
  moduleController.getModuleById
);

router.get(
  "/search/:term",
  checkPermissions([{ resource: "modules", action: "read" }]),
  moduleController.searchModules
);

// ⭐ RUTAS DE ESCRITURA (requiere permisos específicos) ⭐
router.post(
  "/create",
  checkPermissions([{ resource: "modules", action: "create" }]),
  moduleController.createModule
);

router.put(
  "/update/:id",
  checkPermissions([{ resource: "modules", action: "update" }]),
  moduleController.updateModule
);

router.patch(
  "/update/:id/toggle-status",
  checkPermissions([{ resource: "modules", action: "update" }]),
  moduleController.toggleModuleStatus
);

router.delete(
  "/delete/:id",
  checkPermissions([{ resource: "modules", action: "delete" }]),
  moduleController.deleteModule
);

// ⭐ RUTAS ADMINISTRATIVAS (solo admin) ⭐
router.post(
  "/system/initialize",
  checkPermissions([{ resource: "modules", action: "manage" }]),
  moduleController.initializeSystemModules
);

router.post(
  "/system/validate",
  checkPermissions([{ resource: "modules", action: "manage" }]),
  moduleController.validateSystemIntegrity
);

router.post(
  "/cache/invalidate",
  checkPermissions([{ resource: "modules", action: "manage" }]),
  moduleController.invalidateCache
);

// ⭐ RUTAS DE CONFIGURACIÓN AVANZADA ⭐
router.put(
  "/update/actions/:id/actions",
  checkPermissions([{ resource: "modules", action: "update" }]),
  moduleController.updateModuleActions
);

router.put(
  "/update-route/:id/routes",
  checkPermissions([{ resource: "modules", action: "update" }]),
  moduleController.updateModuleRoutes
);

router.put(
  "/update-ui-config/:id/ui-config",
  checkPermissions([{ resource: "modules", action: "update" }]),
  moduleController.updateModuleUIConfig
);

router.put(
  "/update-restrictions/:id/restrictions",
  checkPermissions([{ resource: "modules", action: "update" }]),
  moduleController.updateModuleRestrictions
);

// ⭐ RUTAS DE CLONADO Y DUPLICACIÓN ⭐
router.post(
  "/duplicate/:id/duplicate",
  checkPermissions([{ resource: "modules", action: "create" }]),
  moduleController.duplicateModule
);

router.post(
  "/import",
  checkPermissions([{ resource: "modules", action: "create" }]),
  moduleController.importModules
);

router.get(
  "/export/:format",
  checkPermissions([{ resource: "modules", action: "read" }]),
  moduleController.exportModules
);

module.exports = router;
