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
router.put("/:mappingId", checkPermission("mappings", "update"), mappingController.updateMapping);
router.delete("/:mappingId", checkPermission("mappings", "delete"), mappingController.deleteMapping);

// Rutas para documentos
router.get("/:mappingId/documents", checkPermission("mappings", "read"), getDocumentsSchema, validate, mappingController.getDocumentsByMapping);
router.get("/:mappingId/documents/:documentId", checkPermission("mappings", "read"), mappingController.getDocumentDetailsByMapping);
router.post("/:mappingId/process", checkPermission("mappings", "execute"), mappingController.processDocumentsByMapping);

// Rutas para consecutivos
router.post("/:mappingId/consecutive", checkPermission("mappings", "update"), mappingController.updateConsecutiveConfig);
router.get("/:mappingId/reset-consecutive", checkPermission("mappings", "update"), mappingController.resetConsecutive);

// Rutas avanzadas y promociones
router.get("/:mappingId/document/:documentId/details-with-promotions", checkPermission("mappings", "read"), mappingController.getDocumentDetailsWithPromotions);
router.post("/:mappingId/process-with-promotions", checkPermission("mappings", "execute"), mappingController.processDocumentsWithPromotions);
router.post("/:mappingId/query-dynamic-value", checkPermission("mappings", "read"), mappingController.queryDynamicValue);
router.get("/:mappingId/validate-promotions", checkPermission("mappings", "read"), mappingController.validatePromotionConfig);

module.exports = router;
