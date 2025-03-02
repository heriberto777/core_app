const express = require("express");
const router = express.Router();
const { getConfig, updateConfig } = require("../controllers/configController");
const { transferData } = require("../controllers/transferController");

// Rutas para configuración
// router.get("/config", getConfig);
// router.post("/config", updateConfig);

// // Ruta para transferencia manual
// router.post("/transfer", transferData);

module.exports = router;
