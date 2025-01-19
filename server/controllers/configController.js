const Config = require("../models/configModel");
const { startCronJob } = require("../services/cronService");

const getConfig = async (req, res) => {
  try {
    const config = await Config.findOne();
    if (!config) {
      return res.json({ interval: 10 }); // Valor por defecto
    }
    res.json(config);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error al obtener la configuración", error });
  }
};

const updateConfig = async (req, res) => {
  const { interval } = req.body;

  try {
    const config = await Config.findOneAndUpdate(
      {},
      { interval },
      { upsert: true, new: true }
    );

    // Actualiza la tarea programada con el nuevo intervalo
    startCronJob(config.interval);

    res.json({ message: "Configuración actualizada", config });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error al actualizar la configuración", error });
  }
};

module.exports = { getConfig, updateConfig };
