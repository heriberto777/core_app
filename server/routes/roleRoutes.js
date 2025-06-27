"use strict";

const express = require("express");
const router = express.Router();

const {
  getRoles,
  createRole,
  updateRole,
  deleteRole,
  toggleRoleStatus,
  getRoleById,
  getAvailableResources,
  getAvailableActions,
  getAvailableRoles,
  assignUsersToRole,
  removeUsersFromRole,
  duplicateRole,
  getRoleStats,
  getUsersByRole,
  updateRolesWithModulesPermission,
} = require("../controllers/roleController");

const {
  verifyToken,
  checkPermission,
} = require("../middlewares/authMiddleware");

// ⭐ MIDDLEWARE GLOBAL ⭐
router.use(verifyToken);

// ⭐ MIDDLEWARE DE DEBUG ⭐
router.use((req, res, next) => {
  console.log("🔍 ROLE ROUTE:", req.method, req.originalUrl);
  console.log("🔍 Params:", req.params);
  next();
});

// =====================================================
// ⭐ RUTAS ESPECÍFICAS PRIMERO (ORDEN IMPORTANTE) ⭐
// =====================================================

// GET /api/v1/roles/resources - Obtener recursos disponibles
router.get(
  "/resources",
  checkPermission("roles", "read"),
  getAvailableResources
);

// GET /api/v1/roles/actions - Obtener acciones disponibles
router.get("/actions", checkPermission("roles", "read"), getAvailableActions);

// GET /api/v1/roles/available - Obtener roles disponibles para asignación
router.get("/available", checkPermission("roles", "read"), getAvailableRoles);

// GET /api/v1/roles/role-stats - Obtener estadísticas de roles
router.get("/role-stats", checkPermission("roles", "read"), getRoleStats);

// GET /api/v1/roles/by-role/:roleName - Obtener usuarios por rol específico
router.get(
  "/by-role/:roleName",
  checkPermission("users", "read"),
  getUsersByRole
);

// =====================================================
// ⭐ RUTAS POST PARA LISTAS Y ACCIONES ⭐
// =====================================================

// POST /api/v1/roles/get - Obtener lista de roles (tu método existente)
router.post("/get", checkPermission("roles", "read"), getRoles);

// POST /api/v1/roles/create - Crear nuevo rol
router.post("/create", checkPermission("roles", "create"), createRole);

// POST /api/v1/roles/assign-users - Asignar usuarios a rol
router.post(
  "/assign-users",
  checkPermission("users", "update"),
  assignUsersToRole
);

// POST /api/v1/roles/remove-users - Remover usuarios de rol
router.post(
  "/remove-users",
  checkPermission("users", "update"),
  removeUsersFromRole
);

// POST /api/v1/roles/duplicate/:id - Duplicar rol
router.post(
  "/duplicate/:id",
  checkPermission("roles", "create"),
  duplicateRole
);

// =====================================================
// ⭐ RUTAS CON PARÁMETROS (AL FINAL) ⭐
// =====================================================

// GET /api/v1/roles/get/:id - Obtener rol por ID
router.get("/get/:id", checkPermission("roles", "read"), getRoleById);

// PUT /api/v1/roles/update/:id - Actualizar rol
router.put("/update/:id", checkPermission("roles", "update"), updateRole);

// DELETE /api/v1/roles/delete/:id - Eliminar rol
router.delete("/delete/:id", checkPermission("roles", "delete"), deleteRole);

// PATCH /api/v1/roles/update/:id/toggle - Cambiar estado de rol
router.patch(
  "/update/:id/toggle",
  checkPermission("roles", "update"),
  toggleRoleStatus
);

router.post(
  "/update-modules-permissions",
  checkPermission([{ resource: "roles", action: "update" }]),
  updateRolesWithModulesPermission
);

// =====================================================
// ⭐ MIDDLEWARE DE MANEJO DE ERRORES ⭐
// =====================================================

// Middleware para rutas no encontradas
router.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
    availableRoutes: [
      "GET /resources",
      "GET /actions",
      "GET /available",
      "GET /role-stats",
      "GET /by-role/:roleName",
      "POST /get",
      "POST /create",
      "POST /assign-users",
      "POST /remove-users",
      "POST /duplicate/:id",
      "GET /get/:id",
      "PUT /update/:id",
      "DELETE /delete/:id",
      "PATCH /update/:id/toggle",
    ],
  });
});

// Middleware de manejo de errores
router.use((error, req, res, next) => {
  console.error("❌ Error en roleRoutes:", error);
  res.status(500).json({
    success: false,
    message: "Error interno del servidor en roleRoutes",
    error:
      process.env.NODE_ENV === "development" ? error.message : "Error interno",
  });
});

module.exports = router;
