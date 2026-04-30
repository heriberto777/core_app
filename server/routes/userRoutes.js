"use strict";

const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { upload } = require("../utils/images");

// ⭐ IMPORTAR CONTROLADORES ⭐
const {
  getMe,
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  changePassword,
  ActiveInactiveUser,
  getUserPermissions,
  updateUserRoles,
  searchUsers,
  getUserStats,
  updateUserSpecificPermissions,
  getUsersWithRoles,
  getUserAllPermissions,
  validateRoleSystem,
} = require("../controllers/userController");

// ⭐ IMPORTAR MIDDLEWARE Y VALIDATORES ⭐
const { validate } = require("../middlewares/validator");
const {
  createUserSchema,
  updateUserSchema,
  getUsersSchema,
  updateRolesSchema
} = require("../validators/userValidator");
const {
  verifyToken,
  checkPermission,
} = require("../middlewares/authMiddleware");

// ⭐ MIDDLEWARE GLOBAL ⭐
router.use(verifyToken);

// =====================================================
// ⭐ RUTAS ESPECÍFICAS PRIMERO (ORDEN IMPORTANTE) ⭐
// =====================================================

// GET /api/v1/users/user/me - Perfil del usuario actual
router.get("/user/me", getMe);

// GET /api/v1/users/user/permissions - Permisos del usuario actual
router.get("/user/permissions", getUserPermissions);

// GET /api/v1/users/stats - Estadísticas de usuarios
router.get("/stats", checkPermission("users", "read"), getUserStats);

router.get(
  "/system/validate",
  checkPermission("users", "manage"),
  validateRoleSystem
);

// =====================================================
// ⭐ RUTAS POST PARA LISTAS Y BÚSQUEDAS ⭐
// =====================================================

// POST /api/v1/users/search - Búsqueda avanzada
router.post("/search", checkPermission("users", "read"), searchUsers);

// POST /api/v1/users/lists - Lista paginada de usuarios
router.post("/lists", checkPermission("users", "read"), getUsersSchema, validate, getUsers);

router.post("/with-roles", checkPermission("users", "read"), getUsersWithRoles);

// =====================================================
// ⭐ RUTAS DE GESTIÓN DE USUARIOS ⭐
// =====================================================

// POST /api/v1/users/user/create - Crear usuario
router.post(
  "/user/create",
  checkPermission("users", "create"),
  upload.single("avatar"),
  createUserSchema,
  validate,
  createUser
);

// PATCH /api/v1/users/user/update/:id - Actualizar usuario
router.patch(
  "/user/update/:id",
  checkPermission("users", "update"),
  upload.single("avatar"),
  updateUserSchema,
  validate,
  updateUser
);

// PATCH /api/v1/users/user/active/:id - Activar/desactivar usuario
router.patch(
  "/user/active/:id",
  checkPermission("users", "update"),
  ActiveInactiveUser
);

// PATCH /api/v1/users/user/password/:id - Cambiar contraseña
router.patch(
  "/user/password/:id",
  changePassword
);

// DELETE /api/v1/users/user/delete/:id - Eliminar usuario
router.delete(
  "/user/delete/:id",
  checkPermission("users", "delete"),
  deleteUser
);

// =====================================================
// ⭐ RUTAS DE GESTIÓN DE ROLES ⭐
// =====================================================

// PATCH /api/v1/users/:id/roles - Actualizar roles de usuario
router.patch("/:id/roles", checkPermission("users", "update"), updateRolesSchema, validate, updateUserRoles);

// POST /api/v1/users/:id/permissions - Actualizar permisos específicos
router.post(
  "/:id/permissions",
  checkPermission("users", "update"),
  updateUserSpecificPermissions
);

router.get(
  "/:id/all-permissions",
  checkPermission("users", "read"),
  getUserAllPermissions
);

// =====================================================
// ⭐ RUTAS LEGACY PARA COMPATIBILIDAD ⭐
// =====================================================

// POST /api/v1/users/validate-route - Validar ruta (legacy)
// router.post("/validate-route", validateisRuta);

// POST /api/v1/users/validate-user-active - Validar usuario activo (legacy)
// router.post("/validate-user-active", validateuserActive);

// =====================================================
// ⭐ MIDDLEWARE DE MANEJO DE ERRORES ⭐
// =====================================================

// Middleware para rutas no encontradas
router.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
    availableRoutes: [
      "GET /user/me",
      "GET /user/permissions",
      "GET /stats",
      "GET /system/validate",
      "POST /search",
      "POST /lists",
      "POST /with-roles",
      "POST /user/create",
      "PATCH /user/update/:id",
      "PATCH /user/active/:id",
      "DELETE /user/delete/:id",
      "PATCH /:id/roles",
      "POST /:id/permissions",
      "GET /:id/all-permissions",
      "POST /validate-route",
      "POST /validate-user-active",
    ],
  });
});

// Middleware de manejo de errores
router.use((error, req, res, next) => {
  console.error("❌ Error en userRoutes:", error);
  res.status(500).json({
    success: false,
    message: "Error interno del servidor en userRoutes",
    error:
      process.env.NODE_ENV === "development" ? error.message : "Error interno",
  });
});

module.exports = router;
