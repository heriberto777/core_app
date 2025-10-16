// Controlador HTTP
const transferData = async (req, res) => {
  try {
    logger.info("Iniciando proceso de transferencia de datos");
    const result = await transferDataLogic();
    logger.info("Transferencia completada exitosamente", { result });
    res.status(200).json(result);
  } catch (error) {
    logger.error("Error durante la transferencia de datos", {
      message: error.message,
      stack: error.stack,
      endpoint: req.originalUrl,
      method: req.method,
    });
    res
      .status(500)
      .json({ message: "Error transfiriendo datos", error: error.message });
  }
};



module.exports = { transferData };
