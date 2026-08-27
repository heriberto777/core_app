const express = require("express");
const router = express.Router();
const RoutesController = require("../controllers/routesController");
const { verifyToken, checkPermission } = require("../middlewares/authMiddleware");

router.use(verifyToken);

/**
 * @route GET /api/v1/routes
 */
router.get("/", checkPermission("routes", "read"), RoutesController.getRoutes);

/**
 * @route GET /api/v1/routes/:codeRoute
 */
router.get("/:codeRoute", checkPermission("routes", "read"), RoutesController.getRouteByCode);

/**
 * @route POST /api/v1/routes
 */
router.post("/", checkPermission("routes", "create"), RoutesController.createRoute);

/**
 * @route PUT /api/v1/routes/:codeRoute
 */
router.put("/:codeRoute", checkPermission("routes", "update"), RoutesController.updateRoute);

/**
 * @route PATCH /api/v1/routes/:codeRoute/active
 */
router.patch("/:codeRoute/active", checkPermission("routes", "update"), RoutesController.toggleRouteActive);

module.exports = router;
