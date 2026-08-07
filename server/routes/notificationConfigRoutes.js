// routes/notificationConfigRoutes.js
const express = require("express");
const router = express.Router();
const { verifyToken, checkPermission } = require("../middlewares/authMiddleware");
const notificationConfigController = require("../controllers/notificationConfigController");

// Mismo recurso de permisos que el resto de Configuraciones (email, scheduler, etc.)
router.use(verifyToken);

router.get("/", checkPermission("settings", "read"), notificationConfigController.getConfig);
router.put("/", checkPermission("settings", "manage"), notificationConfigController.updateConfig);
router.post("/test", checkPermission("settings", "manage"), notificationConfigController.testWebhook);

module.exports = router;
