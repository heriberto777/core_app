const express = require("express");
const router = express.Router();
const RouteAccountsController = require("../controllers/routeAccountsController");
const { verifyToken, checkPermission } = require("../middlewares/authMiddleware");

router.use(verifyToken);

/**
 * @route GET /api/v1/route-accounts/clients
 */
router.get("/clients", checkPermission("routes", "read"), RouteAccountsController.getClients);

/**
 * @route GET /api/v1/route-accounts/sellers
 */
router.get("/sellers", checkPermission("routes", "read"), RouteAccountsController.getSellersFilter);

/**
 * @route GET /api/v1/route-accounts/repartidores
 */
router.get("/repartidores", checkPermission("routes", "read"), RouteAccountsController.getRepartidoresFilter);

/**
 * @route GET /api/v1/route-accounts/erp-routes
 */
router.get("/erp-routes", checkPermission("routes", "read"), RouteAccountsController.getErpRoutesFilter);

/**
 * @route POST /api/v1/route-accounts/assign
 */
router.post("/assign", checkPermission("routes", "update"), RouteAccountsController.assignRoute);

/**
 * @route POST /api/v1/route-accounts/remove
 */
router.post("/remove", checkPermission("routes", "update"), RouteAccountsController.removeFromRoute);

/**
 * @route POST /api/v1/route-accounts/assign-seller
 */
router.post("/assign-seller", checkPermission("routes", "update"), RouteAccountsController.assignSellerRoute);

/**
 * @route POST /api/v1/route-accounts/remove-seller
 */
router.post("/remove-seller", checkPermission("routes", "update"), RouteAccountsController.removeFromSellerRoute);

module.exports = router;
