const Log = require("../models/loggerModel");

const getLogs = async (req, res) => {
  const { level, limit = 100 } = req.query; // Permitir filtrar por nivel y limitar resultados
  try {
    const query = level ? { level } : {};
    const logs = await Log.find(query)
      .sort({ timestamp: -1 })
      .limit(Number(limit));
    res.json(logs);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error obteniendo logs", error: error.message });
  }
};

module.exports = { getLogs };
