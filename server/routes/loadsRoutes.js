const express = require('express');
const router = express.Router();
const LoadsController = require('../controllers/loadsController');
const {
  verifyToken,
  checkPermission, checkPermissions
} = require("../middlewares/authMiddleware");

// Middleware de autenticación para todas las rutas
router.use(verifyToken);

/**
 * @route GET /api/loads/pending-orders
 * @desc Obtiene pedidos pendientes de cargar
 * @access Private (loads:read)
 */
router.get('/pending-orders',
  checkPermission('loads', 'read'),
  LoadsController.getPendingOrders
);

/**
 * @route GET /api/loads/order-details/:pedidoId
 * @desc Obtiene detalles de líneas de un pedido específico
 * @access Private (loads:read)
 */
router.get('/order-details/:pedidoId',
  checkPermission('loads', 'read'),
  LoadsController.getOrderDetails
);

/**
 * @route GET /api/loads/sellers
 * @desc Obtiene lista de vendedores activos
 * @access Private (loads:read)
 */
router.get('/sellers',
  checkPermission('loads', 'read'),
  LoadsController.getSellers
);

/**
 * @route GET /api/loads/delivery-persons
 * @desc Obtiene lista de repartidores con sus bodegas asignadas
 * @access Private (loads:read)
 */
router.get('/delivery-persons',
  checkPermission('loads', 'read'),
  LoadsController.getDeliveryPersons
);

/**
 * @route POST /api/loads/process-load
 * @desc Procesa la carga de pedidos seleccionados
 * @access Private (loads:create)
 */
router.post('/process-load',
  checkPermission('loads', 'create'),
  LoadsController.processOrderLoad
);

/**
 * @route POST /api/loads/cancel-orders
 * @desc Cancela pedidos seleccionados
 * @access Private (loads:update)
 */
router.post('/cancel-orders',
  checkPermission('loads', 'update'),
  LoadsController.cancelOrders
);

/**
 * @route DELETE /api/loads/order-lines/:pedidoId
 * @desc Elimina líneas específicas de un pedido
 * @access Private (loads:update)
 */
router.delete('/order-lines/:pedidoId',
  checkPermission('loads', 'update'),
  LoadsController.removeOrderLines
);

/**
 * @route POST /api/loads/delivery-persons
 * @desc Crea un nuevo repartidor
 * @access Private (loads:manage)
 */
router.post('/delivery-persons',
  checkPermission('loads', 'manage'),
  LoadsController.createDeliveryPerson
);

/**
 * @route PUT /api/loads/delivery-persons/:id
 * @desc Actualiza un repartidor existente
 * @access Private (loads:manage)
 */
router.put('/delivery-persons/:id',
  checkPermission('loads', 'manage'),
  LoadsController.updateDeliveryPerson
);

/**
 * @route GET /api/loads/history
 * @desc Obtiene el historial de cargas
 * @access Private (loads:read)
 */
router.get('/history',
  checkPermission('loads', 'read'),
  LoadsController.getLoadHistory
);

/**
 * @route POST /api/loads/inventory-transfer
 * @desc Procesa traspaso de inventario
 * @access Private (loads:create)
 */
router.post('/inventory-transfer',
  checkPermission('loads', 'create'),
  LoadsController.processInventoryTransfer
);

// ================================================
// RUTAS DE GESTIÓN DE TRASPASOS (NUEVAS)
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