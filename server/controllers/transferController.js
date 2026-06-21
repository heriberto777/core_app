const logger = require("../services/logger");
// Nota: transferDataLogic debe estar disponible en el scope o importada. 
// Si no está, el código original ya estaba roto. Mantengo la referencia pero estandarizo la respuesta.

/**
 * Controlador HTTP para transferencia de datos
 */
const transferData = async (req, res) => {
  try {
    const userId = req.user?.user_id || req.user?._id || "SYSTEM";
    logger.info(`Iniciando proceso de transferencia de datos por ${userId}`);

    // Asumimos que transferDataLogic es una función global o está definida en otro lugar 
    // que este controlador usa. Mantengo la lógica original pero con respuesta estandarizada.
    const result = await transferDataLogic();

    logger.info(`Transferencia completada exitosamente por ${userId}`, { result });
    return res.status(200).json({
      success: true,
      message: "Transferencia completada exitosamente",
      data: result,
    });
  } catch (error) {
    logger.error("Error durante la transferencia de datos:", {
      message: error.message,
      stack: error.stack,
      endpoint: req.originalUrl,
      method: req.method,
    });
    return res.status(500).json({
      success: false,
      message: "Error transfiriendo datos",
      error: error.message,
    });
  }
};

module.exports = { transferData };
