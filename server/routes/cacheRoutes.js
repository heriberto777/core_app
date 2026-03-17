const express = require("express");
const router = express.Router();
const cacheManagementController = require("../controllers/cacheManagementController");
const { verifyToken, checkPermission } = require("../middlewares/authMiddleware");

// Gestión de cache requiere altos privilegios
router.use(verifyToken);

router.get("/status", checkPermission("config", "manage"), cacheManagementController.getCacheStatus);
router.post("/invalidate", checkPermission("config", "manage"), cacheManagementController.invalidateCache);

module.exports = router;
