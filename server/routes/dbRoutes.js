const express = require("express");
const router = express.Router();
const { validate } = require("../middlewares/validator");
const { upsertDBConfigSchema } = require("../validators/configValidator");
const { verifyToken, checkPermission } = require("../middlewares/authMiddleware");
const {
  getDBConfigs,
  upsertDBConfig,
  deleteDBConfig,
  testDBConnection,
} = require("../controllers/dbConfigController");

// Todas las rutas requieren autenticación: exponen credenciales de conexión a BD
router.use(verifyToken);

// 📌 Obtener todas las configuraciones de base de datos
router.get("/db", checkPermission("settings", "read"), getDBConfigs);

// 📌 Crear o actualizar una configuración de base de datos
router.post(
  "/create/db",
  checkPermission("settings", "manage"),
  upsertDBConfigSchema,
  validate,
  upsertDBConfig
);

// 📌 Eliminar una configuración de base de datos
router.delete(
  "/delete/db/:serverName",
  checkPermission("settings", "manage"),
  deleteDBConfig
);

// 📌 Probar conexión a base de datos
router.post(
  "/test/db",
  checkPermission("settings", "manage"),
  upsertDBConfigSchema,
  validate,
  testDBConnection
);

module.exports = router;
