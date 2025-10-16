// models/transferSummaryModel.js
const mongoose = require("mongoose");

const TransferSummarySchema = new mongoose.Schema(
  {
    loadId: {
      type: String,
      required: true,
      index: true,
    },
    route: {
      type: String,
      required: true,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["completed", "partial_return", "full_return"],
      default: "completed",
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
