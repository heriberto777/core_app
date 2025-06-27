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

const {
  verifyToken,
  checkPermission,
} = require("../middlewares/authMiddleware");

// ⭐ MIDDLEWARE GLOBAL ⭐
router.use(verifyToken);

// Routes
router.post("/create", checkPermission("roles", "read"), createTransferSummary);
router.get("/get", checkPermission("roles", "read"), getTransferSummaries);
router.get(
  "/get/:id",
  checkPermission("roles", "read"),
  getTransferSummaryById
);
router.get(
  "/load/:loadId",
  checkPermission("roles", "read"),
  getTransferSummaryByLoadId
);
router.post(
  "/reverse/return",
  checkPermission("roles", "read"),
  processTransferReturn
);
router.get(
  "/inventory-check/:summaryId",
  checkPermission("roles", "read"),
  checkInventoryForReturns
);

module.exports = router;
