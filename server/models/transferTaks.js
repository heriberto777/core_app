// models/transferTask.js
const mongoose = require("mongoose");

const transferTaskSchema = new mongoose.Schema(
  {
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

    // Nuevos campos para el seguimiento de ejecuciones
    lastExecutionDate: {
      type: Date,
      default: null,
    },
    executionCount: {
      type: Number,
      default: 0,
    },
    lastExecutionResult: {
      success: Boolean,
      message: String,
      affectedRecords: Number,
      errorDetails: String,
    },
    // NUEVO CAMPO: Mapeo de campos para transferencias "down"
    fieldMapping: {
      sourceTable: { type: String }, // Tabla origen en server2
      targetTable: { type: String }, // Tabla destino en server1
      sourceFields: [String], // Campos en la tabla origen (server2)
      targetFields: [String], // Campos correspondientes en la tabla destino (server1)
      defaultValues: [
        {
          // Valores por defecto para campos
          field: String,
          value: mongoose.Schema.Types.Mixed,
        },
      ],
      // Mantén las transformaciones existentes
      transformations: [
        {
          sourceField: String,
          targetField: String,
          transformationType: {
            type: String,
            enum: ["split", "join", "default", "custom"],
            default: "custom",
          },
          transformationParams: mongoose.Schema.Types.Mixed,
        },
      ],
    },
    nextTasks: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "TransferTask",
      },
    ],
  },
  {
    timestamps: true,
  }
);

const TransferTask = mongoose.model("TransferTask", transferTaskSchema);
module.exports = TransferTask;
