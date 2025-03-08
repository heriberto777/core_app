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

// Authentication middleware (assuming you're using the same middleware as other routes)
const { asureAuth } = require("../middlewares/authenticated");

// Routes
router.post("/", asureAuth, createTransferSummary);
router.get("/", asureAuth, getTransferSummaries);
router.get("/:id", asureAuth, getTransferSummaryById);
router.get("/load/:loadId", asureAuth, getTransferSummaryByLoadId);
router.post("/return", asureAuth, processTransferReturn);
router.get("/inventory-check/:summaryId", asureAuth, checkInventoryForReturns);

module.exports = router;
