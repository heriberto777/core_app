const express = require("express");
const router = express.Router();
const customerController = require("../controllers/customerController");
const { verifyToken, checkPermission } = require("../middlewares/authMiddleware");

// Todas las rutas de clientes requieren autenticación
router.use(verifyToken);

// Ruta para obtener clientes con filtros
router.get("/", checkPermission("loads", "read"), customerController.getCustomers);

// Ruta para actualizar datos de un cliente
router.put("/update", checkPermission("loads", "update"), customerController.updateCustomer);

module.exports = router;
