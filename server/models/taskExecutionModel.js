// models/taskExecutionModel.js
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const TaskExecutionSchema = new Schema(
  {
    taskId: {
      type: Schema.Types.ObjectId,
      ref: "TransferTask",
      required: false, // 🔧 CORREGIDO: No siempre requerido
      default: null,
    },
    taskName: {
      type: String,
      required: true, // 🔧 CORREGIDO: Siempre requerido
      trim: true,
    },
    mappingId: {
      type: Schema.Types.ObjectId,
      ref: "TransferMapping",
      required: true,
    },
    executionType: {
      type: String,
      enum: ["manual", "auto", "dynamic_processing", "scheduled"],
      default: "manual",
    },
    status: {
      type: String,
      enum: ["running", "completed", "failed", "partial", "cancelled"],
      default: "running",
    },
    startTime: {
      type: Date,
      default: Date.now,
    },
    endTime: {
      type: Date,
      default: null,
    },
    executionTime: {
      type: Number, // en milisegundos
      default: 0,
    },
    totalRecords: {
      type: Number,
      default: 0,
    },
    successfulRecords: {
      type: Number,
      default: 0,
    },
    failedRecords: {
      type: Number,
      default: 0,
    },
    skippedRecords: {
      type: Number,
      default: 0,
    },
    // 🎁 NUEVO: Estadísticas de bonificaciones
    bonificationStats: {
      totalBonifications: { type: Number, default: 0 },
      totalPromotions: { type: Number, default: 0 },
      processedDetails: { type: Number, default: 0 },
      bonificationTypes: { type: Schema.Types.Mixed, default: {} },
    },
    details: {
      type: Schema.Types.Mixed,
      default: {},
    },
    errorDetails: {
      type: String, // 🔧 CORREGIDO: Cambiar de Mixed a String
      default: null,
    },
    metadata: {
      serverInfo: { type: String },
      userAgent: { type: String },
      ipAddress: { type: String },
      sessionId: { type: String },
    },
  },
  {
    timestamps: true,
    collection: "task_executions",
  }
);

// Índices
TaskExecutionSchema.index({ taskId: 1, startTime: -1 });
TaskExecutionSchema.index({ mappingId: 1, startTime: -1 });
TaskExecutionSchema.index({ status: 1, startTime: -1 });
TaskExecutionSchema.index({ executionType: 1, startTime: -1 });

module.exports = mongoose.model("TaskExecution", TaskExecutionSchema);
