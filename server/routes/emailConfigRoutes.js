// routes/emailConfigRoutes.js
const express = require("express");
const router = express.Router();
const emailConfigController = require("../controllers/emailConfigController");

// Rutas para configuraciones de email
router.get("/", emailConfigController.getAllConfigs);
router.get("/:id", emailConfigController.getConfigById);
router.post("/", emailConfigController.createConfig);
router.put("/:id", emailConfigController.updateConfig);
router.delete("/:id", emailConfigController.deleteConfig);
router.patch("/:id/default", emailConfigController.setAsDefault);
router.post("/:id/test", emailConfigController.testConfig);
router.post("/initialize", emailConfigController.initializeDefaultConfigs);
router.patch("/:id/toggle", emailConfigController.toggleStatus);

module.exports = router;
