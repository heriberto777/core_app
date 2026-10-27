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
    // "pendingWarehouseReview": agregado para el flujo de Revisión de Almacén —
    // processOrderLoad para acá en vez de ejecutar el traspaso de una, queda
    // esperando a que Almacén ajuste y autorice (ver loadsController: authorize).
    // Nota: updateTrackingStatus no corre runValidators, así que el código ya
    // usaba otros valores fuera de este enum (completed_with_warnings, etc.)
    // sin que fallara — no se tocan acá, es deuda preexistente aparte.
    enum: ["pending", "processing", "pendingWarehouseReview", "completed", "error", "cancelled"],
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
  // Fecha de carga que el operador elige/confirma en Despacho (formato
  // YYYYMMDD, mismo que usa el resto del pipeline) -- se arrastra sin
  // cambios hasta Revisión de Almacén/autorizar (ver loadsService.
  // authorizeDispatch), para no perderla ni recalcularla con GETDATE().
  dateLoad: {
    type: String,
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
