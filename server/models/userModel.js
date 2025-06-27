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

    // ⭐ MANTENER ROLES LEGACY PARA COMPATIBILIDAD ⭐
    role: [String], // Roles legacy como strings

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

    // ⭐ SISTEMA NUEVO DE ROLES (CORREGIDO) ⭐
    systemRoles: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Role", // ⭐ IMPORTANTE: Debe coincidir con el nombre del modelo
        default: [],
      },
    ],

    // ⭐ ALIAS PARA COMPATIBILIDAD ⭐
    // Este campo ya no se usará directamente, pero lo mantenemos por compatibilidad
    roles: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Role",
        default: [],
      },
    ],

    // ⭐ PERMISOS DIRECTOS ⭐
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

    isAdmin: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ⭐ ÍNDICES (NO DUPLICAR email porque unique: true ya lo crea) ⭐
UserSchema.index({ isAdmin: 1 });
UserSchema.index({ activo: 1 });
UserSchema.index({ isActive: 1 });
UserSchema.index({ role: 1 }); // Para búsquedas por rol legacy
UserSchema.index({ systemRoles: 1 }); // Para el nuevo sistema de roles

// ⭐ VIRTUAL PARA COMPATIBILIDAD ENTRE SISTEMAS ⭐
UserSchema.virtual("allRoles").get(function () {
  // Combinar roles legacy y nuevos roles del sistema
  const legacyRoles = this.role || [];
  const systemRoleIds = this.systemRoles || [];

  return {
    legacy: legacyRoles,
    system: systemRoleIds,
    combined: [...legacyRoles, ...systemRoleIds],
  };
});

// ⭐ MÉTODOS DE INSTANCIA MEJORADOS ⭐
UserSchema.methods.hasPermission = async function (resource, action) {
  // 1. Si es admin, tiene todos los permisos
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

  // 3. Verificar permisos a través de systemRoles
  if (this.systemRoles && this.systemRoles.length > 0) {
    await this.populate("systemRoles");
    for (const role of this.systemRoles) {
      if (
        role &&
        typeof role.hasPermission === "function" &&
        role.hasPermission(resource, action)
      ) {
        return true;
      }
    }
  }

  return false;
};

UserSchema.methods.getFullName = function () {
  return `${this.name || ""} ${this.lastname || ""}`.trim();
};

UserSchema.methods.isActiveUser = function () {
  return this.activo && this.isActive;
};

// ⭐ MÉTODO PARA MIGRAR ROLES LEGACY A SISTEMA NUEVO ⭐
UserSchema.methods.migrateToSystemRoles = async function () {
  if (!this.role || this.role.length === 0) return;

  const Role = require("./roleModel");

  // Buscar roles del sistema que coincidan con los roles legacy
  const matchingRoles = await Role.find({
    name: { $in: this.role },
    isActive: true,
  });

  // Agregar roles del sistema que no estén ya asignados
  for (const role of matchingRoles) {
    if (!this.systemRoles.includes(role._id)) {
      this.systemRoles.push(role._id);
    }
  }

  // También sincronizar el campo 'roles' por compatibilidad
  this.roles = [...this.systemRoles];

  return this.save();
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
    $or: [
      { role: roleName }, // Roles legacy
      { "systemRoles.name": roleName }, // Roles del sistema
    ],
    isActive: true,
  }).populate("systemRoles");
};

// ⭐ HOOKS PRE-SAVE ⭐
UserSchema.pre("save", function (next) {
  // Sincronizar campos activo/isActive
  if (this.isModified("activo")) {
    this.isActive = this.activo;
  }
  if (this.isModified("isActive")) {
    this.activo = this.isActive;
  }

  // Sincronizar systemRoles con roles para compatibilidad
  if (this.isModified("systemRoles")) {
    this.roles = [...this.systemRoles];
  }

  next();
});

// ⭐ MIDDLEWARE PARA POPULATE AUTOMÁTICO ⭐
UserSchema.pre(["find", "findOne", "findOneAndUpdate"], function () {
  // Auto-populate systemRoles cuando sea necesario
  if (this.getOptions().populateRoles !== false) {
    this.populate("systemRoles", "name displayName permissions isActive");
  }
});

UserSchema.plugin(mongoosePaginate);

module.exports = mongoose.model("Usuario", UserSchema);
