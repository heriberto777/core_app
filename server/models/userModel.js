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

module.exports = mongoose.model("Usuario", UserSchema);
