const express = require("express");
const router = express.Router();
const mappingController = require("../controllers/mappingController");
const logger = require("../services/logger");

/**
 * Middleware para manejo de errores específico para rutas de mapping
 */
const errorHandler = (controllerFn) => async (req, res, next) => {
  try {
    await controllerFn(req, res, next);
  } catch (error) {
    logger.error(
      `Error no controlado en ruta de mapping: ${error.message}`,
      error
    );

    // Asegurar que siempre envíe una respuesta JSON válida
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: error.message || "Error interno del servidor",
      });
    }
  }
};

/**
 * 📋 RUTAS BÁSICAS DE MAPPING
 */

// GET /api/v1/mappings - Obtener todas las configuraciones de mapeo
router.get("/", errorHandler(mappingController.getMappings));

// GET /api/v1/mappings/:mappingId - Obtener una configuración específica
router.get("/:mappingId", errorHandler(mappingController.getMappingById));

// POST /api/v1/mappings - Crear nueva configuración de mapeo
router.post("/", errorHandler(mappingController.createMapping));

// PUT /api/v1/mappings/:mappingId - Actualizar configuración existente
router.put("/:mappingId", errorHandler(mappingController.updateMapping));

// DELETE /api/v1/mappings/:mappingId - Eliminar configuración
router.delete("/:mappingId", errorHandler(mappingController.deleteMapping));

/**
 * 📊 RUTAS DE DOCUMENTOS
 */

// GET /api/v1/mappings/:mappingId/documents - Obtener documentos según filtros
router.get(
  "/:mappingId/documents",
  errorHandler(mappingController.getDocumentsByMapping)
);

// GET /api/v1/mappings/:mappingId/documents/:documentId - Obtener detalles de un documento
router.get(
  "/:mappingId/documents/:documentId",
  errorHandler(mappingController.getDocumentDetailsByMapping)
);

// POST /api/v1/mappings/:mappingId/process - Procesar documentos
router.post(
  "/:mappingId/process",
  errorHandler(mappingController.processDocumentsByMapping)
);

/**
 * 🔢 RUTAS DE CONSECUTIVOS
 */

// POST /api/v1/mappings/:mappingId/consecutive - Actualizar configuración de consecutivos
router.post(
  "/:mappingId/consecutive",
  errorHandler(mappingController.updateConsecutiveConfig)
);

// GET /api/v1/mappings/:mappingId/next-consecutive - Obtener siguiente consecutivo
router.get(
  "/:mappingId/next-consecutive",
  errorHandler(mappingController.getNextConsecutiveValue)
);

// POST /api/v1/mappings/:mappingId/reset-consecutive - Resetear consecutivo
router.post(
  "/:mappingId/reset-consecutive",
  errorHandler(mappingController.resetConsecutive)
);

/**
 * 🎁 RUTAS DE BONIFICACIONES
 */

// POST /api/v1/mappings/:mappingId/validate-bonifications - Validar configuración de bonificaciones
router.post(
  "/:mappingId/validate-bonifications",
  errorHandler(mappingController.validateBonifications)
);

// GET /api/v1/mappings/:mappingId/preview-bonifications/:documentId - Preview de bonificaciones
router.get(
  "/:mappingId/preview-bonifications/:documentId",
  errorHandler(mappingController.previewBonifications)
);

// GET /api/v1/mappings/:mappingId/bonification-stats - Estadísticas de bonificaciones
router.get(
  "/:mappingId/bonification-stats",
  errorHandler(mappingController.getBonificationStats)
);

/**
 * Middleware para rutas no encontradas específico de mappings
 */
router.use("*", (req, res) => {
  logger.warn(
    `Ruta de mapping no encontrada: ${req.method} ${req.originalUrl}`
  );
  res.status(404).json({
    success: false,
    message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
    availableRoutes: [
      "GET /mappings - Listar todos los mappings",
      "GET /mappings/:id - Obtener mapping específico",
      "POST /mappings - Crear nuevo mapping",
      "PUT /mappings/:id - Actualizar mapping",
      "DELETE /mappings/:id - Eliminar mapping",
      "GET /mappings/:id/documents - Obtener documentos",
      "GET /mappings/:id/documents/:docId - Obtener detalles de documento",
      "POST /mappings/:id/process - Procesar documentos",
      "POST /mappings/:id/validate-bonifications - Validar bonificaciones",
      "GET /mappings/:id/preview-bonifications/:docId - Preview bonificaciones",
      "GET /mappings/:id/bonification-stats - Estadísticas bonificaciones",
    ],
  });
});

module.exports = router;
