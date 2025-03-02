const Config = require("../models/configModel");
const { startCronJob } = require("../services/cronService");

const getConfig = async (req, res) => {
  try {
    const config = await Config.findOne();
    if (!config) {
      return res.json({ hour: "02:00" }); // Hora por defecto: 02:00 AM
    }
    res.json(config);
    console.log(config);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error al obtener la configuración", error });
  }
};

const updateConfig = async (req, res) => {
  const { hour } = req.body;

  try {
    const config = await Config.findOneAndUpdate(
      {},
      { hour },
      { upsert: true, new: true }
    );

    // Actualiza la tarea programada con la nueva hora
    startCronJob(config.hour);

    res.json({ message: "Configuración actualizada", config });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error al actualizar la configuración", error });
  }
};

module.exports = { getConfig, updateConfig };
