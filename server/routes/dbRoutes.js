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

// 📌 Probar conexión a servidor configurado (server1 o server2)
router.get("/test/db/:serverName", testConfiguredServer);

module.exports = router;
