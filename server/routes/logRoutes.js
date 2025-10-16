const express = require("express");
const router = express.Router();
const logController = require("../controllers/logController");

// Rutas para visualización y gestión de logs
router.get("/", logController.getLogs);
router.get("/summary", logController.getLogsSummary);
router.get("/detail/:id", logController.getLogDetail);
router.delete("/clean", logController.cleanOldLogs);
router.get("/sources", logController.getLogSources);

module.exports = router;
