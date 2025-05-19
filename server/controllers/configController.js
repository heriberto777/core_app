const Config = require("../models/configModel");
const { startCronJob, stopCronJob } = require("../services/cronService");
const logger = require("../services/logger");

/**
 * Obtiene la configuración actual del planificador de tareas
 */
const getConfig = async (req, res) => {
  try {
    // Buscar configuración en la base de datos
    const configFromDB = await Config.findOne();

    // Obtener estado actual del planificador
    const schedulerStatus = cronService.getSchedulerStatus();

    // Si no hay configuración en la base de datos, crear una por defecto
    if (!configFromDB) {
      // Crear configuración con los valores actuales del planificador
      const newConfig = new Config({
        hour: schedulerStatus.hour || "02:00",
        enabled: schedulerStatus.enabled,
        lastModified: new Date(),
      });

      await newConfig.save();
      logger.info(
        `Configuración por defecto creada: ${JSON.stringify(newConfig)}`
      );

      return res.json({
        ...newConfig.toObject(),
        active: schedulerStatus.active,
        running: schedulerStatus.running,
        nextExecution: schedulerStatus.nextExecution,
      });
    }

    // Combinar datos de DB con estado actual del planificador
    const configResponse = {
      ...configFromDB.toObject(),
      active: schedulerStatus.active,
      running: schedulerStatus.running,
      nextExecution: schedulerStatus.nextExecution,
    };

    logger.info(`Configuración obtenida: ${JSON.stringify(configResponse)}`);
    res.json(configResponse);
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

    // Actualizar configuración en la base de datos
    const config = await Config.findOneAndUpdate(
      {},
      {
        hour: hour || "02:00",
        enabled: enabled !== undefined ? enabled : true,
        lastModified: new Date(),
      },
      { upsert: true, new: true }
    );

    logger.info(`Configuración en DB actualizada: ${JSON.stringify(config)}`);

    // Actualizar el estado del planificador
    const schedulerResult = cronService.setSchedulerEnabled(
      config.enabled,
      config.hour
    );

    // Obtener estado actualizado para la respuesta
    const schedulerStatus = cronService.getSchedulerStatus();

    // Combinar respuesta con estado actualizado del planificador
    const responseData = {
      message: config.enabled
        ? `Planificador habilitado para ejecutar a las ${config.hour}`
        : "Planificador de tareas deshabilitado",
      config: {
        ...config.toObject(),
        active: schedulerStatus.active,
        running: schedulerStatus.running,
        nextExecution: schedulerStatus.nextExecution,
      },
    };

    res.json(responseData);
  } catch (error) {
    logger.error("Error al actualizar la configuración:", error);
    res.status(500).json({
      message: "Error al actualizar la configuración",
      error: error.message,
    });
  }
};

module.exports = { getConfig, updateConfig };
