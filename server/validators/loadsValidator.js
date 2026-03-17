const { body, param, query } = require("express-validator");

/**
 * Esquemas de validación para el controlador de Cargas (Loads)
 */
const processLoadSchema = [
    body("deliveryPersonCode")
        .trim()
        .notEmpty()
        .withMessage("El código del repartidor es obligatorio"),
    body("selectedPedidos")
        .isArray({ min: 1 })
        .withMessage("Debe proporcionar un array de pedidos no vacío"),
];

const cancelOrdersSchema = [
    body("selectedPedidos")
        .isArray({ min: 1 })
        .withMessage("Debe proporcionar un array de pedidos a cancelar"),
    body("reason")
        .optional()
        .trim()
];

const removeOrderLinesSchema = [
    param("pedidoId")
        .notEmpty()
        .withMessage("El ID del pedido es requerido en la URL"),
    body("lineasToRemove")
        .isArray({ min: 1 })
        .withMessage("Debe proporcionar un de líneas a eliminar"),
];

const deliveryPersonSchema = [
    body("code")
        .trim()
        .notEmpty()
        .withMessage("El código es obligatorio"),
    body("name")
        .trim()
        .notEmpty()
        .withMessage("El nombre es obligatorio"),
    body("assignedWarehouse")
        .trim()
        .notEmpty()
        .withMessage("La bodega asignada es obligatoria"),
];

const historySchema = [
    query("page")
        .optional()
        .isInt({ min: 1 })
        .toInt(),
    query("limit")
        .optional()
        .isInt({ min: 1, max: 100 })
        .toInt(),
    query("status")
        .optional()
        .isIn(["processing", "completed", "failed", "transferred", "error"]),
];

module.exports = {
    processLoadSchema,
    cancelOrdersSchema,
    removeOrderLinesSchema,
    deliveryPersonSchema,
    historySchema,
};
