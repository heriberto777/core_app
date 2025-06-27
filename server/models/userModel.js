const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");
const Schema = mongoose.Schema;

const UserSchema = Schema(
  {
    name: String,
    lastname: String,
    email: {
      type: String,
      unique: true,
    },
    password: String,
    // ⭐ ROLES LEGACY (MANTENER COMPATIBILIDAD) ⭐
    role: [String],
    telefono: String,
    avatar: String,
    theme: String,
    activo: {
      type: Boolean,
      default: true,
    },
    lastLogin: Date,
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "Usuario",
    },

    // ⭐ SISTEMA NUEVO DE ROLES ⭐
    systemRoles: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Role",
        default: [],
      },
    ],

    // ⭐ PERMISOS DIRECTOS (OVERRIDE) ⭐
    permissions: [
      {
        resource: {
          type: String,
          required: true,
        },
        actions: [
          {
            type: String,
            enum: [
              "create",
              "read",
              "update",
              "delete",
              "manage",
              "execute",
              "assign",
              "approve",
              "reject",
              "view",
              "export",
              "import",
            ],
            required: true,
          },
        ],
      },
    ],

    // ⭐ CAMPOS ADMINISTRATIVOS ⭐
    isAdmin: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },

    // ⭐ METADATOS ADICIONALES ⭐
    metadata: {
      department: String,
      position: String,
      employeeId: String,
      hireDate: Date,
      manager: {
        type: Schema.Types.ObjectId,
        ref: "Usuario",
      },
    },

    // ⭐ CONFIGURACIONES PERSONALES ⭐
    preferences: {
      language: { type: String, default: "es" },
      timezone: { type: String, default: "America/Santo_Domingo" },
      notifications: {
        email: { type: Boolean, default: true },
        push: { type: Boolean, default: true },
        sms: { type: Boolean, default: false },
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ⭐ ÍNDICES OPTIMIZADOS ⭐
// UserSchema.index({ email: 1 });
UserSchema.index({ isActive: 1, isAdmin: 1 });
UserSchema.index({ "metadata.department": 1 });

// ⭐ MÉTODOS DE INSTANCIA ⭐
UserSchema.methods.hasPermission = async function (resource, action) {
  // 1. Verificar si es admin (acceso total)
  if (this.isAdmin) return true;

  // 2. Verificar permisos directos
  const directPermission = this.permissions.find(
    (p) => p.resource === resource
  );
  if (
    directPermission &&
    (directPermission.actions.includes(action) ||
      directPermission.actions.includes("manage"))
  ) {
    return true;
  }

  // 3. Verificar permisos a través de roles
  if (this.systemRoles && this.systemRoles.length > 0) {
    await this.populate("systemRoles");
    for (const role of this.systemRoles) {
      if (role.hasPermission(resource, action)) {
        return true;
      }
    }
  }

  return false;
};

UserSchema.methods.getAllPermissions = async function () {
  const permissions = new Map();

  // Permisos directos
  this.permissions.forEach((perm) => {
    permissions.set(perm.resource, [
      ...(permissions.get(perm.resource) || []),
      ...perm.actions,
    ]);
  });

  // Permisos de roles
  if (this.systemRoles && this.systemRoles.length > 0) {
    await this.populate("systemRoles");
    this.systemRoles.forEach((role) => {
      role.permissions.forEach((perm) => {
        const existing = permissions.get(perm.resource) || [];
        permissions.set(perm.resource, [...existing, ...perm.actions]);
      });
    });
  }

  // Remover duplicados
  const result = {};
  permissions.forEach((actions, resource) => {
    result[resource] = [...new Set(actions)];
  });

  return result;
};

UserSchema.methods.getFullName = function () {
  return `${this.name || ""} ${this.lastname || ""}`.trim();
};

UserSchema.methods.isActiveUser = function () {
  return this.activo && this.isActive;
};

// ⭐ MÉTODOS ESTÁTICOS ⭐
UserSchema.statics.findActiveUsers = function () {
  return this.find({ isActive: true, activo: true });
};

UserSchema.statics.findAdmins = function () {
  return this.find({ isAdmin: true, isActive: true });
};

UserSchema.statics.findByRole = function (roleName) {
  return this.find({
    $or: [{ role: roleName }, { "systemRoles.name": roleName }],
    isActive: true,
  }).populate("systemRoles");
};

// ⭐ VIRTUAL PARA COMPATIBILIDAD ⭐
UserSchema.virtual("fullName").get(function () {
  return this.getFullName();
});

// ⭐ HOOKS PRE-SAVE ⭐
UserSchema.pre("save", function (next) {
  // Sincronizar campos activo/isActive
  if (this.isModified("activo")) {
    this.isActive = this.activo;
  }
  if (this.isModified("isActive")) {
    this.activo = this.isActive;
  }
  next();
});

UserSchema.plugin(mongoosePaginate);

module.exports = mongoose.model("Usuario", UserSchema);
