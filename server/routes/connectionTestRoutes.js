// routes/connectionTestRoutes.js
const express = require("express");
const router = express.Router();
const ConnectionDiagnostic = require("../services/connectionDiagnostic");
const { robustConnect } = require("../services/transferService");
const logger = require("../services/logger");

/**
 * @route   GET /api/v1/connection/health
 * @desc    Verificación rápida del estado de todas las conexiones
 * @access  Private
 */
router.get("/health", async (req, res) => {
  try {
    const healthCheck = await ConnectionDiagnostic.checkConnectionHealth();
    res.json(healthCheck);
  } catch (error) {
    logger.error("Error en health check:", error);
    res.status(500).json({
      success: false,
      message: "Error al verificar estado de conexiones",
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/v1/connection/test/:server
 * @desc    Prueba completa de conexión para un servidor específico
 * @access  Private
 * @param   {string} server - "server1" o "server2"
 */
router.get("/test/:server", async (req, res) => {
  const { server } = req.params;

  if (server !== "server1" && server !== "server2") {
    return res.status(400).json({
      success: false,
      message: "Servidor inválido. Use 'server1' o 'server2'",
    });
  }

  try {
    logger.info(`Iniciando prueba de conexión para ${server}...`);
    const diagnosticResults =
      await ConnectionDiagnostic.diagnoseServerConnection(server);

    res.json(diagnosticResults);
  } catch (error) {
    logger.error(`Error en prueba de conexión para ${server}:`, error);
    res.status(500).json({
      success: false,
      message: `Error al probar conexión para ${server}`,
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/v1/connection/robust-connect/:server
 * @desc    Intenta establecer una conexión robusta con reintentos
 * @access  Private
 * @param   {string} server - "server1" o "server2"
 */
router.post("/robust-connect/:server", async (req, res) => {
  const { server } = req.params;

  if (server !== "server1" && server !== "server2") {
    return res.status(400).json({
      success: false,
      message: "Servidor inválido. Use 'server1' o 'server2'",
    });
  }

  try {
    logger.info(`Iniciando conexión robusta para ${server}...`);
    const connectionResult = await robustConnect(server);

    if (connectionResult.success) {
      // Cerrar la conexión ya que solo estamos probando
      if (connectionResult.connection) {
        try {
          const { closeConnection } = require("../services/dbService");
          await closeConnection(connectionResult.connection);
        } catch (closeError) {
          logger.warn(
            `Error al cerrar conexión de prueba: ${closeError.message}`
          );
        }
      }

      res.json({
        success: true,
        message: `Conexión robusta a ${server} establecida correctamente`,
        details: connectionResult.details || "No hay detalles adicionales",
      });
    } else {
      res.status(500).json({
        success: false,
        message: `No se pudo establecer conexión robusta a ${server}`,
        error: connectionResult.error?.message || "Error desconocido",
        details: connectionResult.details || {},
      });
    }
  } catch (error) {
    logger.error(`Error en conexión robusta para ${server}:`, error);
    res.status(500).json({
      success: false,
      message: `Error en conexión robusta para ${server}`,
      error: error.message,
    });
  }
});

module.exports = router;
