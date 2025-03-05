// routes/emailRecipientRoutes.js
const express = require("express");
const router = express.Router();
const emailRecipientController = require("../controllers/emailRecipientController");

// Rutas para destinatarios de correo electrónico
router.get("/", emailRecipientController.getAllRecipients);
router.get(
  "/initialize-defaults",
  emailRecipientController.initializeDefaultRecipients
);
router.get("/:id", emailRecipientController.getRecipientById);
router.post("/", emailRecipientController.createRecipient);
router.put("/:id", emailRecipientController.updateRecipient);
router.delete("/:id", emailRecipientController.deleteRecipient);
router.patch("/:id/toggle-send", emailRecipientController.toggleSendStatus);

module.exports = router;
