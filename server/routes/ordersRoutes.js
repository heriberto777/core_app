// routes/ordersRoutes.js
const express = require("express");
const ordersController = require("../controllers/ordersController");
const { validateJwt } = require("../middleware/validateJwt");

const api = express.Router();

// Todos los endpoints requieren autenticación JWT
api.use(validateJwt);

// Ruta para obtener pedidos con filtros
api.get("/", ordersController.getOrders);

// Ruta para obtener detalles de un pedido específico
api.get("/:orderId", ordersController.getOrderDetails);

// Ruta para procesar pedidos
api.post("/process", ordersController.processOrders);

// Ruta para obtener bodegas
api.get("/warehouses", ordersController.getWarehouses);

// Ruta para exportar pedidos a Excel
api.post("/export", ordersController.exportOrders);

module.exports = api;
