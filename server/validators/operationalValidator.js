const { body, param, query } = require("express-validator");

/**
 * Esquemas de validación para Módulos
 */
const createModuleSchema = [
    body("name").trim().notEmpty().withMessage("El nombre del módulo es obligatorio").toLowerCase(),
    body("displayName").trim().notEmpty().withMessage("El nombre a mostrar es obligatorio"),
    body("resource").trim().notEmpty().withMessage("El recurso es obligatorio"),
];

const updateModuleSchema = [
    param("id").isMongoId().withMessage("ID de módulo inválido"),
    body("displayName").optional().trim().notEmpty(),
    body("description").optional().trim(),
];

/**
 * Esquemas de validación para Mappings
 */
const createMappingSchema = [
    body("name").trim().notEmpty().withMessage("El nombre del mapeo es obligatorio"),
    body("sourceServer").trim().notEmpty().withMessage("El servidor origen es obligatorio"),
    body("targetServer").trim().notEmpty().withMessage("El servidor destino es obligatorio"),
    body("tableConfigs").isArray().withMessage("Las configuraciones de tabla deben ser un array"),
];

const getDocumentsSchema = [
    param("mappingId").notEmpty().withMessage("ID de mapeo obligatorio"),
    query("dateFrom").isISO8601().withMessage("Fecha de inicio inválida"),
    query("dateTo").isISO8601().withMessage("Fecha fin inválida"),
];

/**
 * Esquemas de validación para Órdenes/Pedidos
 */
const getOrdersSchema = [
    query("dateFrom").optional().isISO8601(),
    query("dateTo").optional().isISO8601(),
];

const processOrdersSchema = [
    body("orders").isArray({ min: 1 }).withMessage("Debe proporcionar al menos un ID de pedido"),
    body("taskName").notEmpty().withMessage("El nombre de la tarea es obligatorio"),
];

module.exports = {
    createModuleSchema,
    updateModuleSchema,
    createMappingSchema,
    getDocumentsSchema,
    getOrdersSchema,
    processOrdersSchema,
};
