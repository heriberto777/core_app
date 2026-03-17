const express = require("express");
const emailRecipientController = require("../controllers/emailRecipientController");
const { verifyToken, checkPermission } = require("../middlewares/authMiddleware");

const router = express.Router();

// ⭐ MIDDLEWARE GLOBAL ⭐
router.use(verifyToken);

// Rutas para destinatarios de correo electrónico
router.get("/", checkPermission("loads", "read"), emailRecipientController.getAllRecipients);
router.get(
  "/initialize-defaults",
  checkPermission("loads", "manage"),
  emailRecipientController.initializeDefaultRecipients
);
router.get("/:id", checkPermission("loads", "read"), emailRecipientController.getRecipientById);
router.post("/", checkPermission("loads", "create"), emailRecipientController.createRecipient);
router.put("/:id", checkPermission("loads", "update"), emailRecipientController.updateRecipient);
router.delete("/:id", checkPermission("loads", "delete"), emailRecipientController.deleteRecipient);
router.put("/toggle-send/:id", checkPermission("loads", "manage"), emailRecipientController.toggleSendStatus);

module.exports = router;
