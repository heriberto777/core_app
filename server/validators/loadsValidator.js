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
        .trim()
        .notEmpty()
        .withMessage("El motivo de la anulación es obligatorio"),
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

const lineAdjustmentSchema = [
    param("loadId")
        .notEmpty()
        .withMessage("El loadId es requerido en la URL"),
    body("pedido")
        .notEmpty()
        .withMessage("El pedido es obligatorio"),
    body("pedidoLinea")
        .isInt({ min: 1 })
        .withMessage("pedidoLinea debe ser un entero positivo"),
    body("tipoLinea")
        .optional()
        .isIn(["P", "B"])
        .withMessage("tipoLinea debe ser 'P' (pagado) o 'B' (bonificado)"),
    body("codeProduct")
        .trim()
        .notEmpty()
        .withMessage("codeProduct es obligatorio"),
    body("cantidadOriginal")
        .isFloat({ min: 0 })
        .withMessage("cantidadOriginal debe ser un número mayor o igual a 0"),
    body("cantidadAjustada")
        .isFloat({ min: 0 })
        .withMessage("cantidadAjustada debe ser un número mayor o igual a 0"),
    body("motivo")
        .optional()
        .trim(),
];

const authorizeDispatchSchema = [
    param("loadId")
        .notEmpty()
        .withMessage("El loadId es requerido en la URL"),
    body("bodegaOrigen")
        .optional()
        .trim()
        .notEmpty()
        .withMessage("bodegaOrigen no puede ser una cadena vacía si se envía"),
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
    lineAdjustmentSchema,
    authorizeDispatchSchema,
};
