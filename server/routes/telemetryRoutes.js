const express = require("express");
const router = express.Router();
const telemetry = require("../services/Telemetry");
const { verifyToken, checkPermission } = require("../middlewares/authMiddleware");

// Todas las rutas de telemetría requieren autenticación y permisos de lectura en analítica/reportes
router.use(verifyToken);

/**
 * Obtiene métricas en tiempo real de la sesión actual
 */
router.get("/live", checkPermission("analytics", "read"), (req, res) => {
    try {
        const includeHistory = req.query.history === "true";
        const metrics = telemetry.getMetrics(includeHistory);

        res.json({
            success: true,
            data: metrics
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error al obtener métricas en vivo",
            error: error.message
        });
    }
});

/**
 * Obtiene tendencias históricas (snapshots persistidos)
 */
router.get("/trends", checkPermission("analytics", "read"), async (req, res) => {
    try {
        const hours = parseInt(req.query.hours) || 24;
        const trends = await telemetry.getTrends(hours);

        res.json({
            success: true,
            count: trends.length,
            data: trends
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error al recuperar tendencias históricas",
            error: error.message
        });
    }
});

module.exports = router;
