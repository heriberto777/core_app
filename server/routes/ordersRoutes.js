const express = require("express");
const router = express.Router();
const ordersController = require("../controllers/ordersController");
const { validate } = require("../middlewares/validator");
const { getOrdersSchema, processOrdersSchema } = require("../validators/operationalValidator");
const { verifyToken, checkPermission } = require("../middlewares/authMiddleware");

// Todas las rutas de pedidos requieren autenticación
router.use(verifyToken);

// Ruta para obtener pedidos con filtros
router.get("/", checkPermission("orders", "read"), getOrdersSchema, validate, ordersController.getOrders);

// Ruta para obtener detalles de un pedido específico
router.get("/:orderId", checkPermission("orders", "read"), ordersController.getOrderDetails);

// Ruta para procesar pedidos
router.post("/process", checkPermission("orders", "execute"), processOrdersSchema, validate, ordersController.processOrders);

// Ruta para obtener bodegas
router.get("/warehouses", checkPermission("orders", "read"), ordersController.getWarehouses);

module.exports = router;
