const express = require("express");
const { getTransferStats } = require("../controllers/statsController");
const router = express.Router();
const { verifyToken, checkPermission } = require("../middlewares/authMiddleware");

router.use(verifyToken);

// Ruta para obtener estadísticas generales
router.get("/", checkPermission("analytics", "read"), getTransferStats);

module.exports = router;
