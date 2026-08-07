const Config = require("../models/configModel");
const cronService = require("../services/cronService");
const logger = require("../services/logger");

/**
 * Obtiene la configuración actual del planificador de tareas
 */
const getConfig = async (req, res) => {
  try {
    let configFromDB = await Config.findOne().lean();
    const schedulerStatus = cronService.getSchedulerStatus();

    if (!configFromDB) {
      const newConfig = new Config({
        hour: schedulerStatus.hour || "02:00",
        enabled: schedulerStatus.enabled,
        lastModified: new Date(),
      });

      await newConfig.save();
      configFromDB = newConfig.toObject();
      logger.info("Configuración por defecto creada para scheduler");
    }

    return res.status(200).json({
      success: true,
      data: {
        ...configFromDB,
        active: schedulerStatus.active,
        running: schedulerStatus.running,
        nextExecution: schedulerStatus.nextExecution,
      }
    });
  } catch (error) {
    logger.error("Error en getConfig:", error);
    return res.status(500).json({ success: false, message: "Error al obtener configuración", error: error.message });
  }
};

/**
 * Actualiza la configuración del planificador
 */
const updateConfig = async (req, res) => {
  try {
    const { hour, enabled } = req.body;

    // Forzar hour a "02:00" cuando no viene en el body (p.ej. un toggle que
    // solo manda {enabled}) reseteaba silenciosamente la hora ya guardada.
    // $setOnInsert solo aplica esos defaults si el documento no existía aún.
    const setFields = { lastModified: new Date() };
    const setOnInsertFields = {};
    if (hour !== undefined) setFields.hour = hour; else setOnInsertFields.hour = "02:00";
    if (enabled !== undefined) setFields.enabled = enabled; else setOnInsertFields.enabled = true;

    const updateDoc = { $set: setFields };
    if (Object.keys(setOnInsertFields).length > 0) updateDoc.$setOnInsert = setOnInsertFields;

    const config = await Config.findOneAndUpdate(
      {},
      updateDoc,
      { upsert: true, new: true, lean: true, runValidators: true }
    );

    cronService.setSchedulerEnabled(config.enabled, config.hour);
    const schedulerStatus = cronService.getSchedulerStatus();

    logger.info(`Configuración de scheduler actualizada por ${req.user?._id}`);

    return res.status(200).json({
      success: true,
      message: config.enabled
        ? `Planificador habilitado para ejecutar a las ${config.hour}`
        : "Planificador de tareas deshabilitado",
      data: {
        ...config,
        active: schedulerStatus.active,
        running: schedulerStatus.running,
        nextExecution: schedulerStatus.nextExecution,
      }
    });
  } catch (error) {
    logger.error("Error en updateConfig:", error);
    return res.status(500).json({ success: false, message: "Error al actualizar configuración", error: error.message });
  }
};

module.exports = { getConfig, updateConfig };
