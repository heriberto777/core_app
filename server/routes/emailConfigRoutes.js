// routes/emailConfigRoutes.js
const express = require("express");
const router = express.Router();
const { validate } = require("../middlewares/validator");
const { createEmailConfigSchema, testEmailSchema } = require("../validators/configValidator");
const emailConfigController = require("../controllers/emailConfigController");

// Rutas para configuraciones de email
router.get("/", emailConfigController.getAllConfigs);
router.get("/:id", emailConfigController.getConfigById);
router.post("/", createEmailConfigSchema, validate, emailConfigController.createConfig);
router.put("/:id", createEmailConfigSchema, validate, emailConfigController.updateConfig);
router.delete("/:id", emailConfigController.deleteConfig);
router.patch("/:id/default", emailConfigController.setAsDefault);
router.post("/:id/test", testEmailSchema, validate, emailConfigController.testConfig);
router.patch("/:id/toggle", emailConfigController.toggleStatus);

module.exports = router;
