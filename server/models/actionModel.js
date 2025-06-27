const mongoose = require("mongoose");

const actionSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    icon: {
      type: String,
      default: "FaCog",
    },
    level: {
      type: String,
      enum: ["basic", "intermediate", "advanced", "admin"],
      default: "basic",
    },
    color: {
      type: String,
      default: "#6b7280",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isSystem: {
      type: Boolean,
      default: false, // Las acciones del sistema no se pueden eliminar
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Action", actionSchema);
