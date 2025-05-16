const Config = require("../models/configModel");
const { startCronJob, stopCronJob } = require("../services/cronService");
const logger = require("../services/logger");

/**
 * Obtiene la configuración actual del planificador de tareas
 */
const getConfig = async (req, res) => {
  try {
    const config = await Config.findOne();
    if (!config) {
      return res.json({
        hour: "02:00",
        enabled: true,
        _id: null,
      }); // Valores predeterminados
    }
    logger.info(`Configuración obtenida: ${JSON.stringify(config)}`);
    res.json(config);
  } catch (error) {
    logger.error("Error al obtener la configuración:", error);
    res.status(500).json({
      message: "Error al obtener la configuración",
      error: error.message,
    });
  }
};

/**
 * Actualiza la configuración del planificador
 */
const updateConfig = async (req, res) => {
  const { hour, enabled } = req.body;

  try {
    // Validar formato de hora (HH:MM)
    if (hour && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(hour)) {
      return res.status(400).json({
        message: "Formato de hora inválido. Use formato HH:MM (24 horas)",
      });
    }

    // Buscar configuración existente o crear nueva
    const config = await Config.findOneAndUpdate(
      {},
      {
        hour,
        enabled: enabled !== undefined ? enabled : true,
        lastModified: new Date(),
      },
      { upsert: true, new: true }
    );

    logger.info(`Configuración actualizada: ${JSON.stringify(config)}`);

    // Si está habilitado, iniciar el trabajo cron con la nueva hora
    if (config.enabled) {
      startCronJob(config.hour);
      logger.info(`Planificador iniciado con hora: ${config.hour}`);
    } else {
      // Si está deshabilitado, detener el trabajo cron
      stopCronJob();
      logger.info("Planificador de tareas detenido");
    }

    res.json({
      message: "Configuración actualizada",
      config,
    });
  } catch (error) {
    logger.error("Error al actualizar la configuración:", error);
    res.status(500).json({
      message: "Error al actualizar la configuración",
      error: error.message,
    });
  }
};

module.exports = { getConfig, updateConfig };
