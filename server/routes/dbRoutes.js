const express = require("express");
const router = express.Router();
const {
  getDBConfigs,
  upsertDBConfig,
  deleteDBConfig,
} = require("../controllers/dbConfigController");

// 📌 Obtener todas las configuraciones de base de datos
router.get("/config/db", getDBConfigs);

// 📌 Crear o actualizar una configuración de base de datos
router.post("/config/db", upsertDBConfig);

// 📌 Eliminar una configuración de base de datos
router.delete("/config/db/:serverName", deleteDBConfig);

module.exports = router;
