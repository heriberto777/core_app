const express = require("express");
const router = express.Router();
const ordersController = require("../controllers/ordersController");

// Ruta para obtener pedidos con filtros
router.get("/", ordersController.getOrders);

// Ruta para obtener detalles de un pedido específico
router.get("/:orderId", ordersController.getOrderDetails);

// Ruta para procesar pedidos
router.post("/process", ordersController.processOrders);

// Ruta para obtener bodegas
router.get("/warehouses", ordersController.getWarehouses);

// Ruta para exportar pedidos a Excel
router.post("/export", ordersController.exportOrders);

module.exports = router;
