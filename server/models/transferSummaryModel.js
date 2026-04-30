// models/transferSummaryModel.js
const mongoose = require("mongoose");

const TransferSummarySchema = new mongoose.Schema(
  {
    taskName: {
      type: String,
    },
    loadId: {
      type: String,
      index: true,
    },
    route: {
      type: String,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["completed", "failed", "partial_return", "full_return", "running", "cancelled"],
      default: "completed",
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
    inserted: {
      type: Number,
      default: 0,
    },
    updated: {
      type: Number,
      default: 0,
    },
    duplicates: {
      type: Number,
      default: 0,
    },
    message: {
      type: String,
    },
    errorDetails: {
      type: String,
    },
    documentId: {
      type: String, // Reference to the traspaso document ID (documento_inv)
    },
    products: [
      {
        code: {
          type: String,
          required: true,
        },
        description: {
          type: String,
        },
        quantity: {
          type: Number,
          required: true,
        },
        returnedQuantity: {
          type: Number,
          default: 0,
        },
        unit: {
          type: String,
          default: "UND",
        },
      },
    ],
    totalProducts: {
      type: Number,
      default: 0,
    },
    totalQuantity: {
      type: Number,
      default: 0,
    },
    returnData: {
      documentId: String,
      date: Date,
      reason: String,
    },
    createdBy: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

const TransferSummary = mongoose.model(
  "TransferSummary",
  TransferSummarySchema
);

module.exports = TransferSummary;
