const express = require("express");
const router = express.Router();
const consecutiveController = require("../controllers/consecutiveController");

// Rutas públicas (si las necesitas)
router.get("/public/:id/next", consecutiveController.getNextConsecutiveValue);

// // Rutas protegidas
// router.use(authMiddleware); // Middleware para verificar autenticación

// Operaciones CRUD básicas
router.get("/", consecutiveController.getConsecutives);
router.get("/:id", consecutiveController.getConsecutiveById);
router.post("/", consecutiveController.createConsecutive);
router.put("/:id", consecutiveController.updateConsecutive);
router.delete("/:id", consecutiveController.deleteConsecutive);

// Operaciones especiales
router.post("/:id/next", consecutiveController.getNextConsecutiveValue);
router.get("/:id/reset", consecutiveController.resetConsecutive);
router.post("/:id/assign", consecutiveController.assignConsecutive);
router.get(
  "/entity/:entityType/:entityId",
  consecutiveController.getConsecutivesByEntity
);
// Operaciones de reserva
router.post("/reserve-batch", consecutiveController.reserveConsecutiveValues);
router.post("/commit-reservation", consecutiveController.commitReservation);
router.post("/cancel-reservation", consecutiveController.cancelReservation);

// Endpoint para limpiar reservas expiradas manualmente
router.post(
  "/cleanup-expired-reservations",
  consecutiveController.cleanupExpiredReservations
);

// Métricas y dashboard
router.get(
  "/metrics/:consecutiveId",
  consecutiveController.getConsecutiveMetrics
);
router.get("/dashboard", consecutiveController.getDashboard);

module.exports = router;
