// routes/emailConfigRoutes.js
const express = require("express");
const router = express.Router();
const { validate } = require("../middlewares/validator");
const { createEmailConfigSchema, updateEmailConfigSchema, testEmailSchema } = require("../validators/configValidator");
const { verifyToken, checkPermission } = require("../middlewares/authMiddleware");
const emailConfigController = require("../controllers/emailConfigController");

// Todas las rutas requieren autenticación: gestionan credenciales SMTP
router.use(verifyToken);

// Rutas para configuraciones de email
router.get("/", checkPermission("settings", "read"), emailConfigController.getAllConfigs);
router.get("/:id", checkPermission("settings", "read"), emailConfigController.getConfigById);
router.post(
  "/",
  checkPermission("settings", "manage"),
  createEmailConfigSchema,
  validate,
  emailConfigController.createConfig
);
router.put(
  "/:id",
  checkPermission("settings", "manage"),
  updateEmailConfigSchema,
  validate,
  emailConfigController.updateConfig
);
router.delete("/:id", checkPermission("settings", "manage"), emailConfigController.deleteConfig);
router.patch("/:id/default", checkPermission("settings", "manage"), emailConfigController.setAsDefault);
router.post(
  "/:id/test",
  checkPermission("settings", "manage"),
  testEmailSchema,
  validate,
  emailConfigController.testConfig
);
router.patch("/:id/toggle", checkPermission("settings", "manage"), emailConfigController.toggleStatus);

module.exports = router;
