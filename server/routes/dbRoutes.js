const express = require("express");
const router = express.Router();
const {
  getDBConfigs,
  upsertDBConfig,
  deleteDBConfig,
  testDBConnection,
} = require("../controllers/dbConfigController");

// 📌 Obtener todas las configuraciones de base de datos
router.get("/db", getDBConfigs);

// 📌 Crear o actualizar una configuración de base de datos
router.post("/create/db", upsertDBConfig);

// 📌 Eliminar una configuración de base de datos
router.delete("/delete/db/:serverName", deleteDBConfig);

// ⭐ 📌 Probar conexión a base de datos
router.post("/test/db", testDBConnection);

module.exports = router;
