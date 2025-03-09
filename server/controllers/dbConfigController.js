const DBConfig = require("../models/dbConfigModel");
const {
  loadConfig: loadConfigurations,
} = require("../services/ConnectionManager");

/**
 * 📌 Obtener todas las configuraciones de base de datos
 */
const getDBConfigs = async (req, res) => {
  try {
    const configs = await DBConfig.find();
    res.json(configs);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener configuraciones" });
  }
};

/**
 * 📌 Crear una configuración de base de datos en MongoDB
 */
const upsertDBConfig = async (req, res) => {
  try {
    const {
      serverName,
      type,
      user,
      password,
      host,
      port,
      database,
      instance,
      options,
    } = req.body;

    // Validar si ya existe
    const existingConfig = await DBConfig.findOne({ serverName });
    if (existingConfig) {
      return res.status(400).json({ error: "El servidor ya existe" });
    }

    // Crear la configuración en MongoDB
    const newConfig = new DBConfig({
      serverName,
      type,
      user,
      password,
      host,
      port,
      database,
      instance,
      options,
    });

    await newConfig.save();
    return res
      .status(201)
      .json({ message: "Configuración guardada con éxito", data: newConfig });
  } catch (error) {
    console.error("❌ Error guardando configuración:", error);
    return res
      .status(500)
      .json({ error: "Error interno del servidor", details: error.message });
  }
};

/**
 * 📌 Eliminar una configuración de base de datos
 */
const deleteDBConfig = async (req, res) => {
  try {
    const { serverName } = req.params;

    if (!serverName) {
      return res
        .status(400)
        .json({ error: "Debe proporcionar un nombre de servidor" });
    }

    await DBConfig.findOneAndDelete({ serverName });
    await loadConfigurations(); // 🔥 Recargar configuración en memoria

    res.json({ message: "Configuración eliminada con éxito" });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Error eliminando configuración de la base de datos" });
  }
};

module.exports = {
  getDBConfigs,
  upsertDBConfig,
  deleteDBConfig,
};
