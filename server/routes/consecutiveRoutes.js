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

module.exports = router;
