// models/RouteConfig.js
const mongoose = require("mongoose");

const routeConfigSchema = new mongoose.Schema(
  {
    path: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
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
    resource: {
      type: String,
      required: true,
      trim: true,
    },
    requiredAction: {
      type: String,
      default: "read",
      enum: ["create", "read", "update", "delete", "manage", "execute"],
    },
    category: {
      type: String,
      required: true,
      enum: [
        "operational",
        "administrative",
        "analytical",
        "system",
        "profile",
      ],
      default: "operational",
    },
    isAlwaysAccessible: {
      type: Boolean,
      default: false,
    },
    requiresAdmin: {
      type: Boolean,
      default: false,
    },
    priority: {
      type: Number,
      default: 100,
      min: 1,
      max: 1000,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    icon: {
      type: String,
      trim: true,
    },
    color: {
      type: String,
      trim: true,
      default: "#3b82f6",
    },
    showInMenu: {
      type: Boolean,
      default: true,
    },
    showInDashboard: {
      type: Boolean,
      default: false,
    },
    parentRoute: {
      type: String,
      trim: true,
    },
    children: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "RouteConfig",
      },
    ],
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
    },
    restrictions: {
      timeRestrictions: {
        enabled: { type: Boolean, default: false },
        allowedHours: {
          start: { type: String },
          end: { type: String },
        },
        allowedDays: [{ type: Number, min: 0, max: 6 }],
      },
      ipRestrictions: {
        enabled: { type: Boolean, default: false },
        allowedIPs: [{ type: String }],
        blockedIPs: [{ type: String }],
      },
    },
    isSystem: {
      type: Boolean,
      default: false,
    },
    version: {
      type: String,
      default: "1.0.0",
    },
  },
  {
    timestamps: true,
    collection: "route_configs",
  }
);

// Índices
routeConfigSchema.index({ path: 1 });
routeConfigSchema.index({ resource: 1 });
routeConfigSchema.index({ category: 1, priority: 1 });
routeConfigSchema.index({ isActive: 1, showInMenu: 1 });

module.exports = mongoose.model("RouteConfig", routeConfigSchema);
