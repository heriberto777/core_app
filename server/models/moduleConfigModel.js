const mongoose = require("mongoose");

const ModuleConfigSchema = new mongoose.Schema(
  {
    // ⭐ IDENTIFICACIÓN DEL MÓDULO ⭐
    name: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },

    // ⭐ CONFIGURACIÓN DE PERMISOS ⭐
    resource: {
      type: String,
      required: true,
      trim: true,
    },
    actions: [
      {
        name: {
          type: String,
          required: true,
          enum: [
            "create",
            "read",
            "update",
            "delete",
            "execute",
            "manage",
            "export",
            "import",
            "approve",
          ],
        },
        displayName: {
          type: String,
          required: true,
        },
        description: String,
        isDefault: {
          type: Boolean,
          default: false,
        },
      },
    ],

    // ⭐ CONFIGURACIÓN DE RUTAS ⭐
    routes: [
      {
        path: {
          type: String,
          required: true,
        },
        method: {
          type: String,
          enum: ["GET", "POST", "PUT", "DELETE"],
          default: "GET",
        },
        requiredAction: String,
        isMain: {
          type: Boolean,
          default: false,
        },
      },
    ],

    // ⭐ CONFIGURACIÓN DE UI ⭐
    uiConfig: {
      icon: {
        type: String,
        default: "FaCog",
      },
      color: {
        type: String,
        default: "#007bff",
      },
      category: {
        type: String,
        enum: ["operational", "administrative", "analytical", "configuration"],
        default: "operational",
      },
      order: {
        type: Number,
        default: 0,
      },
      showInMenu: {
        type: Boolean,
        default: true,
      },
      showInDashboard: {
        type: Boolean,
        default: true,
      },
    },

    // ⭐ RESTRICCIONES Y REGLAS ⭐
    restrictions: {
      requireAdmin: {
        type: Boolean,
        default: false,
      },
      minimumRole: {
        type: String,
        enum: ["guest", "user", "editor", "manager", "admin"],
        default: "user",
      },
      contextRules: [
        {
          type: {
            type: String,
            enum: [
              "own_content",
              "active_content",
              "not_running",
              "team_content",
              "department_content",
            ],
          },
          actions: [String],
          condition: String,
        },
      ],
    },

    // ⭐ METADATOS ⭐
    isSystem: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    version: {
      type: String,
      default: "1.0.0",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
    },
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
    },
  },
  {
    timestamps: true,
  }
);

// ⭐ ÍNDICES PARA RENDIMIENTO ⭐
ModuleConfigSchema.index({ name: 1, isActive: 1 });
ModuleConfigSchema.index({ "uiConfig.category": 1, "uiConfig.order": 1 });

module.exports = mongoose.model("ModuleConfig", ModuleConfigSchema);
