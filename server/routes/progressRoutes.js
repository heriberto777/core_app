const express = require("express");
const router = express.Router();
const { progressSseHandler } = require("../services/progressSse");
const { verifySseToken } = require("../middlewares/authMiddleware");

// Ruta principal para monitoreo de progreso de tareas
router.get("/progress/:taskId", verifySseToken, progressSseHandler);

module.exports = router;
