// models/taskExecutionModel.js
const mongoose = require("mongoose");

const TaskExecutionSchema = new mongoose.Schema(
  {
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TransferTask",
      required: true,
      index: true,
    },
    taskName: {
      type: String,
      required: true,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["running", "completed", "failed", "cancelled"],
      default: "running",
    },
    executionTime: {
      type: Number,
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
    errorMessage: {
      type: String,
    },
    details: {
      type: Object,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

const TaskExecution = mongoose.model("TaskExecution", TaskExecutionSchema);

module.exports = TaskExecution;
