const express = require("express");
const router = express.Router();
const TrucksController = require("../controllers/trucksController");
const { verifyToken, checkPermission } = require("../middlewares/authMiddleware");

router.use(verifyToken);

/**
 * @route GET /api/v1/trucks
 */
router.get("/", checkPermission("trucks", "read"), TrucksController.getTrucks);

/**
 * @route GET /api/v1/trucks/repartidores
 */
router.get("/repartidores", checkPermission("trucks", "read"), TrucksController.getRepartidores);

/**
 * @route POST /api/v1/trucks
 */
router.post("/", checkPermission("trucks", "create"), TrucksController.createTruck);

/**
 * @route PUT /api/v1/trucks/:code
 */
router.put("/:code", checkPermission("trucks", "update"), TrucksController.updateTruck);

/**
 * @route PATCH /api/v1/trucks/:code/active
 */
router.patch("/:code/active", checkPermission("trucks", "update"), TrucksController.toggleTruckActive);

module.exports = router;
