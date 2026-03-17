const { body, param, query } = require("express-validator");

/**
 * Esquemas de validación para el core de Transferencias
 */

// Esquema para crear o actualizar una tarea de transferencia
const upsertTransferTaskSchema = [
    body("name").notEmpty().withMessage("El nombre es requerido").trim(),
    body("type").optional().isIn(["manual", "auto", "both"]).withMessage("Tipo inválido"),
    body("active").optional().isBoolean().withMessage("Debe ser booleano"),
    body("query").notEmpty().withMessage("La consulta SQL es requerida"),
    body("transferType").optional().isIn(["up", "down", "internal", ""]).withMessage("transferType inválido"),
    body("executionMode").optional().isIn(["normal", "batchesSSE"]).withMessage("executionMode inválido"),
    body("parameters").optional().isArray().withMessage("Parámetros debe ser un array"),
    body("linkedGroup").optional().trim(),
    body("linkedExecutionOrder").optional().isInt({ min: 0 }).toInt(),
    body("postUpdateQuery").optional().trim(),
];

// Esquema para ejecutar una tarea
const executeTransferTaskSchema = [
    param("taskId").isMongoId().withMessage("ID de tarea inválido"),
    body("overrides").optional().isObject().withMessage("Overrides debe ser un objeto"),
];

// Esquema para runTask (/run-loads/:taskName)
const runTaskSchema = [
    param("taskName").notEmpty().withMessage("Nombre de tarea requerido").trim(),
    body("parametros").optional().isObject().withMessage("Parámetros debe ser un objeto"),
];

// Esquema para insertar pedidos (insertOrders)
const insertOrdersSchema = [
    body("salesData").isArray({ min: 1 }).withMessage("salesData debe ser un array no vacío"),
    body("salesData.*.Code_Product").notEmpty().withMessage("Código de producto requerido"),
    body("salesData.*.Quantity").isNumeric().withMessage("Cantidad debe ser numérica"),
];

// Esquema para insertar cargas (insertLoadsDetail)
const insertLoadsSchema = [
    body("route").notEmpty().withMessage("Ruta requerida"),
    body("loadId").notEmpty().withMessage("loadId requerido"),
    body("bodega").optional().trim(),
    body("salesData").isArray({ min: 1 }).withMessage("salesData debe ser un array no vacío"),
];

// Esquema para insertar traspasos (insertLoadsTrapaso)
const insertTrapasoSchema = [
    body("route").notEmpty().withMessage("Ruta requerida"),
    body("bodega_destino").notEmpty().withMessage("Bodega destino requerida"),
    body("salesData").isArray({ min: 1 }).withMessage("salesData debe ser un array no vacío"),
];

// Esquema para actualización de configuración
const updateConfigSchema = [
    body("config").isObject().withMessage("Configuración debe ser un objeto"),
];

// Esquema para obtener historial
const getTransferHistorySchema = [
    query("page").optional().isInt({ min: 1 }).toInt(),
    query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
    query("dateFrom").optional().isISO8601().toDate(),
    query("dateTo").optional().isISO8601().toDate(),
    query("status").optional().isIn(["completed", "error", "running", "cancelled"]),
    query("taskName").optional().trim(),
];

// Esquema para resúmenes (createTransferSummary)
const createTransferSummarySchema = [
    body("loadId").notEmpty().withMessage("loadId es requerido"),
    body("route").notEmpty().withMessage("Ruta es requerida"),
    body("products").isArray({ min: 1 }).withMessage("Debe incluir productos"),
];

// Esquema para devoluciones (processTransferReturn)
const processReturnSchema = [
    body("summaryId").isMongoId().withMessage("ID de resumen inválido"),
    body("productsToReturn").isArray({ min: 1 }).withMessage("Debe incluir productos a devolver"),
    body("productsToReturn.*.code").notEmpty().withMessage("Código de producto requerido"),
    body("productsToReturn.*.quantity").isFloat({ min: 0.01 }).withMessage("Cantidad inválida"),
];

// Esquema para actualización de datos de entidad
const updateEntityDataSchema = [
    body("mappingId").notEmpty().withMessage("ID de mapeo requerido"),
    body("documentId").notEmpty().withMessage("ID de documento requerido"),
    body("updates").isObject().withMessage("Updates debe ser un objeto"),
];

// Esquema para cancelación
const cancelTaskSchema = [
    param("taskId").isMongoId().withMessage("ID de tarea inválido"),
    body("force").optional().isBoolean().withMessage("force debe ser booleano"),
    body("reason").optional().trim(),
];

module.exports = {
    upsertTransferTaskSchema,
    executeTransferTaskSchema,
    runTaskSchema,
    insertOrdersSchema,
    insertLoadsSchema,
    insertTrapasoSchema,
    updateConfigSchema,
    getTransferHistorySchema,
    createTransferSummarySchema,
    processReturnSchema,
    updateEntityDataSchema,
    cancelTaskSchema,
};
