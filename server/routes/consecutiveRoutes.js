const express = require("express");
const consecutiveController = require("../controllers/consecutiveController");
const { verifyToken, checkPermission } = require("../middlewares/authMiddleware");
const router = express.Router();

// ⭐ MIDDLEWARE GLOBAL ⭐
router.use(verifyToken);

// Rutas públicas (si las necesitas)
router.get("/public/:id/next", checkPermission("loads", "read"), consecutiveController.getNextConsecutiveValue);

// // Rutas protegidas
// router.use(authMiddleware); // Middleware para verificar autenticación

// Operaciones CRUD básicas
router.get("/", checkPermission("loads", "read"), consecutiveController.getConsecutives);
router.get("/:id", checkPermission("loads", "read"), consecutiveController.getConsecutiveById);
router.post("/", checkPermission("loads", "create"), consecutiveController.createConsecutive);
router.put("/:id", checkPermission("loads", "update"), consecutiveController.updateConsecutive);
router.delete("/:id", checkPermission("loads", "delete"), consecutiveController.deleteConsecutive);

// Operaciones especiales
router.post("/:id/next", checkPermission("loads", "update"), consecutiveController.getNextConsecutiveValue);
router.get("/:id/reset", checkPermission("loads", "manage"), consecutiveController.resetConsecutive);
router.post("/:id/assign", checkPermission("loads", "manage"), consecutiveController.assignConsecutive);
router.get(
  "/entity/:entityType/:entityId",
  checkPermission("loads", "read"),
  consecutiveController.getConsecutivesByEntity
);
// Operaciones de reserva
router.post("/reserve-batch", checkPermission("loads", "create"), consecutiveController.reserveConsecutiveValues);
router.post("/commit-reservation", checkPermission("loads", "create"), consecutiveController.commitReservation);
router.post("/cancel-reservation", checkPermission("loads", "manage"), consecutiveController.cancelReservation);

// Endpoint para limpiar reservas expiradas manualmente
router.post(
  "/cleanup-expired-reservations",
  checkPermission("loads", "manage"),
  consecutiveController.cleanupExpiredReservations
);

// Métricas y dashboard
router.get(
  "/metrics/:consecutiveId",
  checkPermission("loads", "read"),
  consecutiveController.getConsecutiveMetrics
);
router.get("/dashboard", checkPermission("loads", "read"), consecutiveController.getDashboard);

module.exports = router;
