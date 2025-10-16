const express = require("express");
const router = express.Router();
const { progressSseHandler } = require("../services/progressSse");

// Ruta principal para monitoreo de progreso de tareas
router.get("/progress/:taskId", progressSseHandler);

module.exports = router;
