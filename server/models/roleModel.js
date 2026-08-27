const mongoose = require("mongoose");

const roleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    permissions: [
      {
        resource: {
          type: String,
          required: true,
          trim: true,
        },
        actions: [
          {
            type: String,
            // Debe incluir las mismas acciones que roleController.getAvailableActions
            // le ofrece a la UI, más cualquier acción custom que ya viva en algún
            // ModuleConfig (ej. "assign", agregada directo en Mongo para rutas) —
            // si no está acá, falla la validación al guardar el rol que la usa.
            enum: ["create", "read", "update", "delete", "manage", "export", "import", "approve", "execute", "assign"],
            required: true,
          },
        ],
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    isSystem: {
      type: Boolean,
      default: false, // Los roles del sistema no se pueden eliminar
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
    },
  },
  {
    timestamps: true,
  }
);

// Índices para optimización
roleSchema.index({ name: 1 });
// roleSchema.index({ isActive: 1 });
// roleSchema.index({ isSystem: 1 });

// Método para verificar si un rol tiene un permiso específico
roleSchema.methods.hasPermission = function (resource, action) {
  const permission = this.permissions.find((p) => p.resource === resource);
  return (
    permission &&
    (permission.actions.includes(action) ||
      permission.actions.includes("manage"))
  );
};

// Método estático para obtener roles activos
roleSchema.statics.getActiveRoles = function () {
  return this.find({ isActive: true });
};

module.exports = mongoose.model("Role", roleSchema);
