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
  getRoleStats,
  getAvailableResources,
  getAvailableActions,
  getAvailableRoles,
  getUsersByRole,
  assignUsersToRole,
  removeUsersFromRole,
  duplicateRole,
} = require("../controllers/roleController");

const { validate } = require("../middlewares/validator");
const {
  createRoleSchema,
  updateRoleSchema,
  assignUsersSchema,
  toggleStatusSchema,
} = require("../validators/roleValidator");
const {
  verifyToken,
  checkPermission,
} = require("../middlewares/authMiddleware");

// ⭐ MIDDLEWARE GLOBAL ⭐
router.use(verifyToken);

// =====================================================
// ⭐ RUTAS ESPECÍFICAS PRIMERO (ORDEN IMPORTANTE) ⭐
// =====================================================

router.get(
  "/resources",
  checkPermission("roles", "read"),
  getAvailableResources
);

router.get("/actions", checkPermission("roles", "read"), getAvailableActions);

router.get("/available", checkPermission("roles", "read"), getAvailableRoles);

// GET /api/v1/roles/role-stats - Obtener estadísticas de roles
router.get("/role-stats", checkPermission("roles", "read"), getRoleStats);

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
router.post("/create", checkPermission("roles", "create"), createRoleSchema, validate, createRole);

router.post(
  "/assign-users",
  checkPermission("users", "update"),
  assignUsersSchema,
  validate,
  assignUsersToRole
);

router.post(
  "/remove-users",
  checkPermission("users", "update"),
  assignUsersSchema,
  validate,
  removeUsersFromRole
);

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
router.put("/update/:id", checkPermission("roles", "update"), updateRoleSchema, validate, updateRole);

// DELETE /api/v1/roles/delete/:id - Eliminar rol
router.delete("/delete/:id", checkPermission("roles", "delete"), deleteRole);

// PATCH /api/v1/roles/update/:id/toggle - Cambiar estado de rol
router.patch(
  "/update/:id/toggle",
  checkPermission("roles", "update"),
  toggleStatusSchema,
  validate,
  toggleRoleStatus
);

// router.post(
//   "/update-modules-permissions",
//   checkPermission([{ resource: "roles", action: "update" }]),
//   updateRolesWithModulesPermission
// );

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
