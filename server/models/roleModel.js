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
            // ⭐ ENUM EXPANDIDO PARA INCLUIR TODAS LAS ACCIONES NECESARIAS ⭐
            enum: [
              "create",
              "read",
              "update",
              "delete",
              "manage",
              "execute", // ✅ Agregado
              "assign", // ✅ Agregado
              "approve", // ✅ Agregado
              "reject", // ✅ Agregado
              "view", // ✅ Agregado
              "export", // ✅ Agregado
              "import", // ✅ Agregado
            ],
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
      default: false,
    },
    // ⭐ CAMPOS ADICIONALES PARA MEJOR GESTIÓN ⭐
    priority: {
      type: Number,
      default: 0,
    },
    maxUsers: {
      type: Number,
      default: null,
    },
    restrictions: {
      requiresApproval: { type: Boolean, default: false },
      allowSelfAssign: { type: Boolean, default: false },
      requireAdmin: { type: Boolean, default: false },
      minimumRole: { type: String, default: null },
      contextRules: [String],
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

// ⭐ ÍNDICES OPTIMIZADOS (SOLO UNO POR CAMPO) ⭐
roleSchema.index({ name: 1 });
roleSchema.index({ isActive: 1, isSystem: 1 });
roleSchema.index({ priority: -1 });

// ⭐ MÉTODOS DE INSTANCIA MEJORADOS ⭐
roleSchema.methods.hasPermission = function (resource, action) {
  const permission = this.permissions.find((p) => p.resource === resource);
  if (!permission) return false;
  return (
    permission.actions.includes(action) || permission.actions.includes("manage")
  );
};

roleSchema.methods.getPermissionsForResource = function (resource) {
  const permission = this.permissions.find((p) => p.resource === resource);
  return permission ? permission.actions : [];
};

roleSchema.methods.canAssignTo = function (userId, context = {}) {
  if (!this.isActive) return false;
  if (this.restrictions.requireAdmin && !context.isAdmin) return false;
  if (this.maxUsers && this.userCount >= this.maxUsers) return false;
  return true;
};

// ⭐ MÉTODOS ESTÁTICOS MEJORADOS ⭐
roleSchema.statics.getActiveRoles = function () {
  return this.find({ isActive: true }).sort({ priority: -1 });
};

roleSchema.statics.getSystemRoles = function () {
  return this.find({ isSystem: true, isActive: true }).sort({ priority: -1 });
};

roleSchema.statics.findByPermission = function (resource, action) {
  return this.find({
    isActive: true,
    "permissions.resource": resource,
    "permissions.actions": { $in: [action, "manage"] },
  });
};

// ⭐ HOOKS PRE-SAVE PARA VALIDACIONES ⭐
roleSchema.pre("save", function (next) {
  // Validar que no haya permisos duplicados para el mismo recurso
  const resources = new Set();
  for (const permission of this.permissions) {
    if (resources.has(permission.resource)) {
      return next(
        new Error(`Permiso duplicado para el recurso: ${permission.resource}`)
      );
    }
    resources.add(permission.resource);
  }
  next();
});

// ⭐ VIRTUAL PARA CONTEO DE USUARIOS ⭐
roleSchema.virtual("userCount", {
  ref: "Usuario",
  localField: "_id",
  foreignField: "roles",
  count: true,
});

module.exports = mongoose.model("Role", roleSchema);
