const express = require("express");
const router = express.Router();
const { validate } = require("../middlewares/validator");
const { updateSchedulerSchema } = require("../validators/configValidator");
const configController = require("../controllers/configController");
const { verifyToken, checkPermission } = require("../middlewares/authMiddleware");

// Todas las rutas de scheduler requieren permisos de administrador o gestión
router.use(verifyToken);

router.get("/", checkPermission("config", "read"), configController.getConfig);
router.patch("/", checkPermission("config", "update"), updateSchedulerSchema, validate, configController.updateConfig);

module.exports = router;
