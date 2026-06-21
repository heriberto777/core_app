const express = require('express');
const router = express.Router();
const LoadsController = require('../controllers/loadsController');
const {
  verifyToken,
  checkPermission, checkPermissions
} = require("../middlewares/authMiddleware");
const { validate } = require("../middlewares/validator");
const {
  processLoadSchema,
  cancelOrdersSchema,
  removeOrderLinesSchema,
  deliveryPersonSchema,
  historySchema
} = require("../validators/loadsValidator");

// Middleware de autenticación para todas las rutas
router.use(verifyToken);

/**
 * @route GET /api/loads/pending-orders
 */
router.get('/pending-orders',
  checkPermission('loads', 'read'),
  LoadsController.getPendingOrders
);

/**
 * @route GET /api/loads/order-details/:pedidoId
 */
router.get('/order-details/:pedidoId',
  checkPermission('loads', 'read'),
  LoadsController.getOrderDetails
);

/**
 * @route GET /api/loads/sellers
 */
router.get('/sellers',
  checkPermission('loads', 'read'),
  LoadsController.getSellers
);

/**
 * @route GET /api/loads/delivery-persons
 */
router.get('/delivery-persons',
  checkPermission('loads', 'read'),
  LoadsController.getDeliveryPersons
);

/**
 * @route POST /api/loads/process-load
 */
router.post('/process-load',
  checkPermission('loads', 'create'),
  processLoadSchema,
  validate,
  LoadsController.processOrderLoad
);

/**
 * @route POST /api/loads/cancel-orders
 */
router.post('/cancel-orders',
  checkPermission('loads', 'update'),
  cancelOrdersSchema,
  validate,
  LoadsController.cancelOrders
);

/**
 * @route DELETE /api/loads/order-lines/:pedidoId
 */
router.delete('/order-lines/:pedidoId',
  checkPermission('loads', 'update'),
  removeOrderLinesSchema,
  validate,
  LoadsController.removeOrderLines
);

/**
 * @route POST /api/loads/delivery-persons
 */
router.post('/delivery-persons',
  checkPermission('loads', 'manage'),
  deliveryPersonSchema,
  validate,
  LoadsController.createDeliveryPerson
);

/**
 * @route PUT /api/loads/delivery-persons/:id
 */
router.put('/delivery-persons/:id',
  checkPermission('loads', 'manage'),
  deliveryPersonSchema,
  validate,
  LoadsController.updateDeliveryPerson
);

/**
 * @route GET /api/loads/history
 */
router.get('/history',
  checkPermission('loads', 'read'),
  historySchema,
  validate,
  LoadsController.getLoadHistory
);

/**
 * @route POST /api/loads/inventory-transfer
 */
router.post('/inventory-transfer',
  checkPermission('loads', 'create'),
  LoadsController.processInventoryTransfer
);

// ================================================
// RUTAS DE GESTIÓN DE TRASPASOS
// ================================================

router.get('/traspaso-history',
  checkPermission('loads', 'read'),
  LoadsController.getTraspasoHistory
);

router.get(
  "/traspasos",
  checkPermission("loads", "read"),
  LoadsController.getTraspasos
);

router.get(
  "/traspasos/delivery-persons",
  checkPermission("loads", "read"),
  LoadsController.getDeliveryPersonsFilter
);

router.get('/traspasos/stats',
  checkPermission('loads', 'read'),
  LoadsController.getTraspasoStats
);

router.get('/warehouses',
  checkPermission('loads', 'read'),
  LoadsController.getWarehouses
);

router.get('/traspasos/:traspasoId',
  checkPermission('loads', 'read'),
  LoadsController.getTraspasoDetails
);

router.post('/traspasos/execute/:loadId',
  checkPermission('loads', 'create'),
  LoadsController.executeTransfer
);

router.post('/traspasos/execute-bulk',
  checkPermission('loads', 'create'),
  LoadsController.executeBulkTransfers
);

router.put('/traspasos/:traspasoId/status',
  checkPermission('loads', 'update'),
  LoadsController.updateTraspasoStatus
);

router.post('/traspasos/:traspasoId/retry',
  checkPermission('loads', 'manage'),
  LoadsController.retryTraspaso
);

router.post('/traspasos/:traspasoId/returns',
  checkPermission('loads', 'manage'),
  LoadsController.processReturns
);

router.post('/traspasos/bulk-action',
  checkPermissions(
    [
      { resource: "loads", action: "manage" },
      { resource: "admin", action: "manage" },
    ],
    "OR"
  ),
  LoadsController.bulkAction
);

router.delete('/traspasos/:traspasoId',
  checkPermissions(
    [
      { resource: "loads", action: "manage" },
      { resource: "admin", action: "delete" },
    ],
    "AND"
  ),
  LoadsController.deleteTraspaso
);

module.exports = router;
