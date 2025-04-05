const express = require("express");
const { getTransferStats } = require("../controllers/statsController");
const router = express.Router();

// Ruta para obtener estadísticas generales
router.get("/", getTransferStats);

module.exports = router;
