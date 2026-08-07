// models/emailRecipientModel.js
const mongoose = require("mongoose");

/**
 * Esquema para los destinatarios de correos electrónicos
 * Permite gestionar quién recibe cada tipo de notificación
 */
const emailRecipientSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      // Alineado con la validación del frontend (RecipientFormModal.jsx): el
      // regex anterior (\w{2,3} en el TLD, sin "+") rechazaba direcciones
      // válidas como alias+tag@dominio.com o TLDs largos (.technology), que
      // sí pasaban la validación del formulario — el usuario recibía un 400
      // confuso después de que el formulario ya había aceptado el correo.
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        "Por favor ingrese un correo válido",
      ],
    },
    notificationTypes: {
      traspaso: {
        type: Boolean,
        default: false,
      },
      transferencias: {
        type: Boolean,
        default: false,
      },
      erroresCriticos: {
        type: Boolean,
        default: false,
      },
    },
    isSend: {
      type: Boolean,
      default: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Índices para mejorar la búsqueda
emailRecipientSchema.index({ email: 1 }, { unique: true });
emailRecipientSchema.index({ isSend: 1, isActive: 1 });
emailRecipientSchema.index({
  "notificationTypes.traspaso": 1,
  isSend: 1,
  isActive: 1,
});
emailRecipientSchema.index({
  "notificationTypes.transferencias": 1,
  isSend: 1,
  isActive: 1,
});
emailRecipientSchema.index({
  "notificationTypes.erroresCriticos": 1,
  isSend: 1,
  isActive: 1,
});

const EmailRecipient = mongoose.model("EmailRecipient", emailRecipientSchema);

module.exports = EmailRecipient;
