// routes/transferSummaryRoutes.js
const express = require("express");
const router = express.Router();
const {
  createTransferSummary,
  getTransferSummaries,
  getTransferSummaryById,
  getTransferSummaryByLoadId,
  processTransferReturn,
  checkInventoryForReturns,
} = require("../controllers/transferSummaryController");

const { verifyToken, checkPermission } = require("../middlewares/authMiddleware");
const { validate } = require("../middlewares/validator");
const { createTransferSummarySchema, processReturnSchema } = require("../validators/transferValidator");

// ⭐ MIDDLEWARE GLOBAL ⭐
router.use(verifyToken);

// Routes
router.post("/create", checkPermission("loads", "create"), createTransferSummarySchema, validate, createTransferSummary);
router.get("/get", checkPermission("loads", "read"), getTransferSummaries);
router.get("/get/:id", checkPermission("loads", "read"), getTransferSummaryById);
router.get("/load/:loadId", checkPermission("loads", "read"), getTransferSummaryByLoadId);
router.post("/reverse/return", checkPermission("loads", "manage"), processReturnSchema, validate, processTransferReturn);
router.get("/inventory-check/:summaryId", checkPermission("loads", "read"), checkInventoryForReturns);

module.exports = router;
