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
    activo: Boolean,
  },
  { timestamps: {} }
);

UserSchema.plugin(mongoosePaginate);

module.exports = mongoose.model("Usuario", UserSchema);
