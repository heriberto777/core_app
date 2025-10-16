const DBConfig = require("../models/dbConfigModel");
// const {
//   loadConfig: loadConfigurations,
// } = require("../services/ConnectionManager");

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
 * 📌 Crear o actualizar una configuración de base de datos en MongoDB
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

    console.log("📝 Datos recibidos:", {
      serverName,
      type,
      host,
      port,
      database,
    });

    // Verificar si ya existe para decidir entre crear o actualizar
    const existingConfig = await DBConfig.findOne({ serverName });

    if (existingConfig) {
      // Actualizar configuración existente
      const updatedConfig = await DBConfig.findOneAndUpdate(
        { serverName },
        {
          type,
          user,
          password,
          host,
          port,
          database,
          instance,
          options,
        },
        { new: true }
      );

      console.log("✅ Configuración actualizada:", serverName);
      return res.status(200).json({
        message: "Configuración actualizada con éxito",
        data: updatedConfig,
      });
    } else {
      // Crear nueva configuración
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
      console.log("✅ Nueva configuración creada:", serverName);

      return res.status(201).json({
        message: "Configuración creada con éxito",
        data: newConfig,
      });
    }
  } catch (error) {
    console.error("❌ Error guardando configuración:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
      details: error.message,
    });
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
    // await loadConfigurations(); // 🔥 Recargar configuración en memoria

    res.json({ message: "Configuración eliminada con éxito" });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Error eliminando configuración de la base de datos" });
  }
};

/**
 * 📌 Probar conexión a base de datos
 */
const testDBConnection = async (req, res) => {
  try {
    const { type, host, port, user, password, database, instance, options } =
      req.body;

    // Aquí implementarías la lógica de prueba según el tipo de DB
    // Por ahora, simularemos una respuesta

    // Simular delay de conexión
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Simular éxito/fallo (puedes implementar lógica real aquí)
    const isSuccess = Math.random() > 0.3; // 70% de éxito

    if (isSuccess) {
      res.json({
        success: true,
        message: "Conexión establecida correctamente",
        connectionTime: "150ms",
      });
    } else {
      res.status(400).json({
        success: false,
        error:
          "No se pudo conectar a la base de datos. Verifique las credenciales y configuración.",
      });
    }
  } catch (error) {
    console.error("❌ Error probando conexión:", error);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor al probar la conexión",
    });
  }
};

module.exports = {
  getDBConfigs,
  upsertDBConfig,
  deleteDBConfig,
  testDBConnection,
};
