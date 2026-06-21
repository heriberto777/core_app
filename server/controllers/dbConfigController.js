const DBConfig = require("../models/dbConfigModel");
const logger = require("../services/logger");

/**
 * Obtener todas las configuraciones de base de datos
 */
const getDBConfigs = async (req, res) => {
  try {
    const configs = await DBConfig.find().lean();
    return res.status(200).json({ success: true, data: configs });
  } catch (error) {
    logger.error("Error en getDBConfigs:", error);
    return res.status(500).json({ success: false, message: "Error al obtener configuraciones", error: error.message });
  }
};

/**
 * Crear o actualizar una configuración de base de datos
 */
const upsertDBConfig = async (req, res) => {
  try {
    const { serverName, type, user, password, host, port, database, instance, options } = req.body;
    const existingConfig = await DBConfig.findOne({ serverName });

    if (existingConfig) {
      const updatedConfig = await DBConfig.findOneAndUpdate(
        { serverName },
        { type, user, password, host, port, database, instance, options, updatedAt: new Date() },
        { new: true, lean: true }
      );

      logger.info(`Configuración de DB actualizada: ${serverName} por ${req.user?._id}`);
      return res.status(200).json({
        success: true,
        message: "Configuración actualizada con éxito",
        data: updatedConfig,
      });
    }

    const newConfig = new DBConfig({ serverName, type, user, password, host, port, database, instance, options });
    await newConfig.save();

    logger.info(`Nueva configuración de DB creada: ${serverName} por ${req.user?._id}`);
    return res.status(201).json({
      success: true,
      message: "Configuración creada con éxito",
      data: newConfig.toObject(),
    });
  } catch (error) {
    logger.error("Error en upsertDBConfig:", error);
    return res.status(500).json({ success: false, message: "Error al guardar configuración", error: error.message });
  }
};

/**
 * Eliminar una configuración de base de datos
 */
const deleteDBConfig = async (req, res) => {
  try {
    const { serverName } = req.params;
    const result = await DBConfig.findOneAndDelete({ serverName });

    if (!result) return res.status(404).json({ success: false, message: "Servidor no encontrado" });

    logger.warn(`Configuración de DB eliminada: ${serverName} por ${req.user?._id}`);
    return res.status(200).json({ success: true, message: "Configuración eliminada con éxito" });
  } catch (error) {
    logger.error(`Error en deleteDBConfig (${req.params.serverName}):`, error);
    return res.status(500).json({ success: false, message: "Error al eliminar configuración", error: error.message });
  }
};

const { Connection } = require("tedious");

/**
 * Probar conexión a base de datos (Real)
 */
const testDBConnection = async (req, res) => {
  const { host, user, password, database, port, options, type } = req.body;

  if (type && type.toLowerCase() !== "mssql") {
    return res.status(400).json({
      success: false,
      message: "Por el momento, solo se admite la prueba de conexión para SQL Server.",
    });
  }

  const isIpAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(host);

  const config = {
    server: host,
    authentication: {
      type: "default",
      options: {
        userName: user,
        password: password,
      },
    },
    options: {
      encrypt: isIpAddress ? false : options?.mssqlEncrypt || false,
      trustServerCertificate: true,
      database: database,
      connectTimeout: 10000, // 10 segundos para la prueba
    },
  };

  if (port) config.options.port = parseInt(port);

  let connection;
  try {
    return new Promise((resolve) => {
      connection = new Connection(config);

      const timeout = setTimeout(() => {
        if (connection) connection.close();
        resolve(
          res.status(400).json({
            success: false,
            message: "Tiempo de espera agotado al conectar con el servidor.",
          })
        );
      }, 12000);

      connection.connect((err) => {
        clearTimeout(timeout);
        if (err) {
          logger.error(`Fallo de prueba de conexión a ${host}:`, err);
          resolve(
            res.status(400).json({
              success: false,
              message: `Fallo de conexión: ${err.message}`,
            })
          );
        } else {
          connection.close();
          resolve(
            res.status(200).json({
              success: true,
              message: "Conexión establecida correctamente",
            })
          );
        }
      });
    });
  } catch (error) {
    if (connection) connection.close();
    logger.error("Error crítico en testDBConnection:", error);
    return res.status(500).json({
      success: false,
      message: "Error interno al probar la conexión",
      error: error.message,
    });
  }
};

module.exports = {
  getDBConfigs,
  upsertDBConfig,
  deleteDBConfig,
  testDBConnection,
};
