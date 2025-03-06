// models/transferTask.js
const mongoose = require("mongoose");

const transferTaskSchema = new mongoose.Schema({
  // Nombre único de la tarea
  name: { type: String, required: true, unique: true },

  // Tipo de tarea: manual, auto, both
  type: {
    type: String,
    enum: ["manual", "auto", "both"],
    default: "both",
  },

  // ¿Está activa la tarea?
  active: { type: Boolean, default: true },

  // Consulta SQL base (SELECT, MERGE, etc.)
  query: { type: String, required: true },

  // Parámetros para construir el WHERE (field, operator, value)
  parameters: [
    {
      field: { type: String, required: true },
      operator: { type: String, required: true },
      value: { type: mongoose.Schema.Types.Mixed, required: true },
    },
  ],

  // Reglas de validación (campos obligatorios, existenciaCheck)
  validationRules: {
    requiredFields: [String],
    existenceCheck: {
      table: String,
      key: String,
    },
  },

  // Estado actual de la tarea
  status: {
    type: String,
    enum: ["pending", "running", "completed", "error"],
    default: "pending",
  },

  // Porcentaje de progreso (0..100)
  progress: { type: Number, default: 0 },

  // NUEVO: transferType (indica dirección: up/down)
  transferType: {
    type: String,
    enum: ["up", "down", ""], // O usa "none" en lugar de ""
    default: "",
  },

  // NUEVO: executionMode (normal o batchesSSE)
  executionMode: {
    type: String,
    enum: ["normal", "batchesSSE"],
    default: "normal",
  },
  clearBeforeInsert: {
    type: Boolean,
    default: false,
    description:
      "Si se deben borrar registros de la tabla destino antes de insertar",
  },

  // Ejemplo de flag para ejecutar un procedimiento almacenado antes
  executeProcedureBefore: { type: Boolean, default: false },

  // Configuración del procedimiento almacenado (opcional)
  procedureConfig: {
    name: { type: String },
    parameters: [
      {
        field: { type: String, required: true },
        value: { type: mongoose.Schema.Types.Mixed, required: true },
      },
    ],
  },
  postUpdateQuery: { type: String, default: null },
  postUpdateMapping: {
    viewKey: { type: String, default: null }, // Clave en la vista
    tableKey: { type: String, default: null }, // Clave en la tabla real
  },
});

const TransferTask = mongoose.model("TransferTask", transferTaskSchema);
module.exports = TransferTask;
