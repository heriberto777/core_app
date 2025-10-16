const mongoose = require("mongoose");

// Schema para tracking de cargas
const LoadTrackingSchema = new mongoose.Schema({
  loadId: {
    type: String,
    required: true,
    unique: true,
  },
  status: {
    type: String,
    enum: ["pending", "processing", "completed", "error", "cancelled"],
    default: "pending",
  },
  route: {
    type: String,
    required: true,
  },
  bodega: {
    type: String,
    required: true,
  },
  totalOrders: {
    type: Number,
    default: 0,
  },
  processedOrders: {
    type: Number,
    default: 0,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Schema para mapeo de repartidores y bodegas
const DeliveryPersonSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
  },
  name: {
    type: String,
    required: true,
  },
  assignedWarehouse: {
    type: String,
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = {
  LoadTracking: mongoose.model("LoadTracking", LoadTrackingSchema),
  DeliveryPerson: mongoose.model("DeliveryPerson", DeliveryPersonSchema),
};
