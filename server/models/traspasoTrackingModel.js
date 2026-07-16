const mongoose = require("mongoose");

/**
 * Trazabilidad real de traspasos de inventario (CATELLI.DOCUMENTO_INV).
 * Reemplaza a la tabla deprecada IMPLT_traspaso_tracking (SQL Server) como
 * fuente de datos para "Gestión de Traspasos". El vínculo con la Carga que
 * lo originó se conserva en `loadId`; el documento de inventario generado
 * (si el traspaso llegó a insertarse) se conserva en `documentoInv`.
 */
const TraspasoTrackingSchema = new mongoose.Schema(
  {
    loadId: {
      type: String,
      required: true,
      index: true,
    },
    documentoInv: {
      type: String,
      index: true,
      sparse: true, // nulo si el traspaso falló antes de generarse el consecutivo
    },
    route: {
      type: String,
      required: true,
      index: true, // código de repartidor/vendedor (ej. "R17")
    },
    deliveryPersonName: {
      type: String,
    },
    warehouseOrigin: {
      type: String,
    },
    warehouseDestination: {
      type: String,
    },
    status: {
      type: String,
      enum: ["completed", "failed"],
      required: true,
      index: true,
    },
    executionSource: {
      type: String,
      enum: ["automatic", "manual"],
      default: "automatic",
    },
    totalLines: {
      type: Number,
      default: 0,
    },
    successfulLines: {
      type: Number,
      default: 0,
    },
    failedLines: {
      type: Number,
      default: 0,
    },
    totalQuantity: {
      type: Number,
      default: 0,
    },
    errorMessage: {
      type: String,
    },
    createdBy: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

TraspasoTrackingSchema.index({ createdAt: -1 });

module.exports = mongoose.model("TraspasoTracking", TraspasoTrackingSchema);
