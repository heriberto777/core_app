const express = require("express");
const router = express.Router();
const mappingController = require("../controllers/mappingController");
const { validate } = require("../middlewares/validator");
const { createMappingSchema, getDocumentsSchema } = require("../validators/operationalValidator");
const { verifyToken, checkPermission } = require("../middlewares/authMiddleware");

// Todas las rutas de mapping requieren autenticación
router.use(verifyToken);

// Rutas para configuraciones de mapeo
router.get("/", checkPermission("mappings", "read"), mappingController.getMappings);
router.get("/:mappingId", checkPermission("mappings", "read"), mappingController.getMappingById);
router.post("/", checkPermission("mappings", "create"), createMappingSchema, validate, mappingController.createMapping);
router.put("/:mappingId", checkPermission("mappings", "update"), createMappingSchema, validate, mappingController.updateMapping);
router.delete("/:mappingId", checkPermission("mappings", "delete"), mappingController.deleteMapping);

// Rutas para documentos
router.get("/:mappingId/documents", checkPermission("mappings", "read"), getDocumentsSchema, validate, mappingController.getDocumentsByMapping);
router.get("/:mappingId/documents/:documentId", checkPermission("mappings", "read"), mappingController.getDocumentDetailsByMapping);
router.post("/:mappingId/process", checkPermission("mappings", "execute"), mappingController.processDocumentsByMapping);

// Rutas para consecutivos
router.post("/:mappingId/consecutive", checkPermission("mappings", "update"), mappingController.updateConsecutiveConfig);
// Antes era GET — una mutación real (resetea consecutiveConfig.lastValue) no
// debería ser idempotente/cacheable ni dispararse por un prefetch del navegador.
router.post("/:mappingId/reset-consecutive", checkPermission("mappings", "update"), mappingController.resetConsecutive);

// Rutas avanzadas y promociones
router.get("/:mappingId/document/:documentId/details-with-promotions", checkPermission("mappings", "read"), mappingController.getDocumentDetailsWithPromotions);
router.post("/:mappingId/process-with-promotions", checkPermission("mappings", "execute"), mappingController.processDocumentsWithPromotions);
// "update" y no "read": la rama queryType==="sequence" incrementa/consume un
// consecutivo real (ConsecutiveService.getNextConsecutiveValue), no es de solo lectura.
router.post("/:mappingId/query-dynamic-value", checkPermission("mappings", "update"), mappingController.queryDynamicValue);
router.get("/:mappingId/validate-promotions", checkPermission("mappings", "read"), mappingController.validatePromotionConfig);

module.exports = router;
