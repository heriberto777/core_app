const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");
const bcrypt = require("bcrypt");
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
    roles: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Role",
        default: [],
      },
    ],

    permissions: [
      {
        resource: {
          type: String,
          required: true,
        },
        actions: [
          {
            type: String,
            enum: ["create", "read", "update", "delete", "manage"],
            required: true,
          },
        ],
      },
    ],

    isAdmin: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

UserSchema.plugin(mongoosePaginate);

// userController.changePassword la invoca para validar currentPassword antes
// de permitir el cambio — el método nunca existió, así que esa ruta siempre
// fallaba con 500 en cuanto se mandaba currentPassword.
UserSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("Usuario", UserSchema);
