const express = require("express");
const router = express.Router();
const mappingController = require("../controllers/mappingController");
const logger = require("../services/logger"); // Asegúrate de importar el logger

// Middleware para manejo de errores específico para estas rutas
const errorHandler = (controllerFn) => async (req, res, next) => {
  try {
    await controllerFn(req, res, next);
  } catch (error) {
    logger.error(
      `Error no controlado en ruta de mapping: ${error.message}`,
      error
    );

    // Asegurarse de que siempre envíe una respuesta JSON
    res.status(500).json({
      success: false,
      message: error.message || "Error interno del servidor",
    });
  }
};

// Rutas para configuraciones de mapeo
router.get("/", errorHandler(mappingController.getMappings));
router.get("/:mappingId", errorHandler(mappingController.getMappingById));
router.post("/", errorHandler(mappingController.createMapping));
router.put("/:mappingId", errorHandler(mappingController.updateMapping));
router.delete("/:mappingId", errorHandler(mappingController.deleteMapping));

// Rutas para documentos
router.get(
  "/:mappingId/documents",
  errorHandler(mappingController.getDocumentsByMapping)
);
router.get(
  "/:mappingId/documents/:documentId",
  errorHandler(mappingController.getDocumentDetailsByMapping)
);
router.post(
  "/:mappingId/process",
  errorHandler(mappingController.processDocumentsByMapping)
);

module.exports = router;
