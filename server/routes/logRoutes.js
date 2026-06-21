const express = require("express");
const logController = require("../controllers/logController");
const { verifyToken, checkPermission } = require("../middlewares/authMiddleware");

const router = express.Router();

// ⭐ MIDDLEWARE GLOBAL ⭐
router.use(verifyToken);

// Rutas para visualización y gestión de logs
router.get("/", checkPermission("loads", "read"), logController.getLogs);
router.get("/summary", checkPermission("loads", "read"), logController.getLogsSummary);
router.get("/detail/:id", checkPermission("loads", "read"), logController.getLogDetail);
router.delete("/clean", checkPermission("loads", "manage"), logController.cleanOldLogs);
router.get("/sources", checkPermission("loads", "read"), logController.getLogSources);
router.get("/diagnostic", checkPermission("loads", "read"), logController.getLogsDiagnostic);

module.exports = router;
