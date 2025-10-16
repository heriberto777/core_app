// models/emailConfigModel.js
const mongoose = require("mongoose");

/**
 * Esquema para configuración de correo electrónico
 * Permite gestionar múltiples configuraciones de SMTP
 */
const emailConfigSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      description: "Nombre identificativo de la configuración",
    },
    host: {
      type: String,
      required: true,
      trim: true,
      description: "Servidor SMTP (ej: smtp.gmail.com)",
    },
    port: {
      type: Number,
      required: true,
      default: 587,
      description: "Puerto SMTP (587 para TLS, 465 para SSL)",
    },
    secure: {
      type: Boolean,
      default: false,
      description: "true para 465, false para otros puertos",
    },
    auth: {
      user: {
        type: String,
        required: true,
        trim: true,
        description: "Usuario de correo",
      },
      pass: {
        type: String,
        required: true,
        description: "Contraseña o App Password",
      },
    },
    from: {
      type: String,
      required: true,
      trim: true,
      description: "Dirección de envío (ej: Sistema <noreply@example.com>)",
    },
    isActive: {
      type: Boolean,
      default: true,
      description: "Si esta configuración está activa",
    },
    isDefault: {
      type: Boolean,
      default: false,
      description: "Si es la configuración por defecto",
    },
    // Configuraciones adicionales opcionales
    options: {
      connectionTimeout: {
        type: Number,
        default: 60000,
        description: "Timeout de conexión en ms",
      },
      greetingTimeout: {
        type: Number,
        default: 30000,
        description: "Timeout de saludo en ms",
      },
      socketTimeout: {
        type: Number,
        default: 60000,
        description: "Timeout del socket en ms",
      },
      maxConnections: {
        type: Number,
        default: 5,
        description: "Máximo número de conexiones",
      },
      rateDelta: {
        type: Number,
        default: 1000,
        description: "Tiempo entre mensajes en ms",
      },
      rateLimit: {
        type: Number,
        default: 10,
        description: "Máximo de mensajes por rateDelta",
      },
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

// Índices para mejorar rendimiento
// emailConfigSchema.index({ name: 1 });
emailConfigSchema.index({ isActive: 1, isDefault: 1 });

// Middleware para asegurar que solo haya una configuración por defecto
emailConfigSchema.pre("save", async function (next) {
  if (this.isDefault) {
    // Si esta configuración se marca como default, desmarcar las otras
    await this.constructor.updateMany(
      { _id: { $ne: this._id }, isDefault: true },
      { $set: { isDefault: false, updatedAt: new Date() } }
    );
  }
  next();
});

const EmailConfig = mongoose.model("EmailConfig", emailConfigSchema);

module.exports = EmailConfig;
