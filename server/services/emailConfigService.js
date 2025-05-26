// services/emailConfigService.js
const EmailConfig = require("../models/emailConfigModel");
const logger = require("./logger");

/**
 * Servicio para gestionar configuraciones de email
 */
class EmailConfigService {
  /**
   * Obtiene la configuración de email por defecto o activa
   * @returns {Promise<Object|null>} Configuración de email
   */
  static async getDefaultConfig() {
    try {
      // Primero buscar la configuración marcada como default
      let config = await EmailConfig.findOne({
        isDefault: true,
        isActive: true,
      });

      // Si no hay default, buscar la primera activa
      if (!config) {
        config = await EmailConfig.findOne({ isActive: true });
        logger.warn(
          "No hay configuración de email por defecto, usando la primera activa"
        );
      }

      if (!config) {
        logger.error("No hay configuraciones de email activas disponibles");
        return null;
      }

      return config;
    } catch (error) {
      logger.error(
        "Error al obtener configuración de email por defecto:",
        error
      );
      return null;
    }
  }

  /**
   * Obtiene una configuración específica por nombre
   * @param {string} name - Nombre de la configuración
   * @returns {Promise<Object|null>} Configuración de email
   */
  static async getConfigByName(name) {
    try {
      const config = await EmailConfig.findOne({
        name,
        isActive: true,
      });

      if (!config) {
        logger.warn(
          `No se encontró configuración de email activa con nombre: ${name}`
        );
      }

      return config;
    } catch (error) {
      logger.error(`Error al obtener configuración de email '${name}':`, error);
      return null;
    }
  }

  /**
   * Obtiene todas las configuraciones de email
   * @param {Object} filter - Filtros opcionales
   * @returns {Promise<Array>} Lista de configuraciones
   */
  static async getAllConfigs(filter = {}) {
    try {
      const configs = await EmailConfig.find(filter).sort({
        isDefault: -1,
        name: 1,
      });
      return configs;
    } catch (error) {
      logger.error("Error al obtener configuraciones de email:", error);
      return [];
    }
  }

  /**
   * Crea una nueva configuración de email
   * @param {Object} configData - Datos de la configuración
   * @returns {Promise<Object>} Configuración creada
   */
  static async createConfig(configData) {
    try {
      const newConfig = new EmailConfig(configData);
      await newConfig.save();

      logger.info(`Nueva configuración de email creada: ${newConfig.name}`);
      return newConfig;
    } catch (error) {
      logger.error("Error al crear configuración de email:", error);
      throw error;
    }
  }

  /**
   * Actualiza una configuración de email
   * @param {string} id - ID de la configuración
   * @param {Object} updateData - Datos a actualizar
   * @returns {Promise<Object>} Configuración actualizada
   */
  static async updateConfig(id, updateData) {
    try {
      // Asegurar que no se puede modificar el nombre a uno existente
      if (updateData.name) {
        const existingConfig = await EmailConfig.findOne({
          name: updateData.name,
          _id: { $ne: id },
        });

        if (existingConfig) {
          throw new Error(
            `Ya existe una configuración con el nombre: ${updateData.name}`
          );
        }
      }

      updateData.updatedAt = new Date();

      const updatedConfig = await EmailConfig.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      );

      if (!updatedConfig) {
        throw new Error(`No se encontró configuración con ID: ${id}`);
      }

      logger.info(`Configuración de email actualizada: ${updatedConfig.name}`);
      return updatedConfig;
    } catch (error) {
      logger.error("Error al actualizar configuración de email:", error);
      throw error;
    }
  }

  /**
   * Elimina una configuración de email
   * @param {string} id - ID de la configuración
   * @returns {Promise<boolean>} true si se eliminó correctamente
   */
  static async deleteConfig(id) {
    try {
      const config = await EmailConfig.findById(id);

      if (!config) {
        throw new Error(`No se encontró configuración con ID: ${id}`);
      }

      // No permitir eliminar la configuración por defecto si es la única
      if (config.isDefault) {
        const totalConfigs = await EmailConfig.countDocuments({
          isActive: true,
        });
        if (totalConfigs <= 1) {
          throw new Error(
            "No se puede eliminar la única configuración de email activa"
          );
        }
      }

      await EmailConfig.findByIdAndDelete(id);
      logger.info(`Configuración de email eliminada: ${config.name}`);
      return true;
    } catch (error) {
      logger.error("Error al eliminar configuración de email:", error);
      throw error;
    }
  }

  /**
   * Establece una configuración como predeterminada
   * @param {string} id - ID de la configuración
   * @returns {Promise<Object>} Configuración actualizada
   */
  static async setAsDefault(id) {
    try {
      const config = await EmailConfig.findById(id);

      if (!config) {
        throw new Error(`No se encontró configuración con ID: ${id}`);
      }

      if (!config.isActive) {
        throw new Error(
          "No se puede establecer como predeterminada una configuración inactiva"
        );
      }

      config.isDefault = true;
      await config.save(); // El middleware pre-save se encargará de desmarcar las otras

      logger.info(
        `Configuración establecida como predeterminada: ${config.name}`
      );
      return config;
    } catch (error) {
      logger.error(
        "Error al establecer configuración como predeterminada:",
        error
      );
      throw error;
    }
  }

  /**
   * Inicializa configuraciones por defecto si no existen
   */
  static async initializeDefaultConfigs() {
    try {
      const count = await EmailConfig.countDocuments();

      if (count === 0) {
        logger.info("Inicializando configuraciones de email por defecto...");

        // Crear configuración desde variables de entorno si existen
        if (
          process.env.EMAIL_HOST &&
          process.env.EMAIL_USER &&
          process.env.EMAIL_PASS
        ) {
          await this.createConfig({
            name: "Configuración Por Defecto",
            host: process.env.EMAIL_HOST,
            port: parseInt(process.env.EMAIL_PORT) || 587,
            secure: process.env.EMAIL_SECURE === "true",
            auth: {
              user: process.env.EMAIL_USER,
              pass: process.env.EMAIL_PASS,
            },
            from:
              process.env.EMAIL_FROM ||
              `"Sistema de Transferencia" <${process.env.EMAIL_USER}>`,
            isDefault: true,
            isActive: true,
          });

          logger.info(
            "Configuración de email por defecto inicializada desde variables de entorno"
          );
        } else {
          logger.warn(
            "No hay variables de entorno de email configuradas para inicializar"
          );
        }
      }
    } catch (error) {
      logger.error(
        "Error al inicializar configuraciones de email por defecto:",
        error
      );
    }
  }

  /**
   * Prueba una configuración de email enviando un correo de prueba
   * @param {string} configId - ID de la configuración
   * @param {string} testEmail - Email donde enviar la prueba
   * @returns {Promise<boolean>} true si la prueba fue exitosa
   */
  static async testConfig(configId, testEmail) {
    try {
      logger.info(`Iniciando prueba de configuración ID: ${configId}`);

      const config = await EmailConfig.findById(configId);

      if (!config) {
        logger.error(`No se encontró configuración con ID: ${configId}`);
        throw new Error(`No se encontró configuración con ID: ${configId}`);
      }

      logger.info(`Configuración encontrada: ${config.name}`);
      logger.debug(
        `Detalles de configuración: host=${config.host}, port=${config.port}, secure=${config.secure}`
      );

      // Importar EmailService aquí para evitar dependencias circulares
      const EmailService = require("./emailService");

      const result = await EmailService.testEmailConfig(config, testEmail);

      if (result) {
        logger.info(`Prueba de configuración exitosa: ${config.name}`);
      } else {
        logger.warn(`Prueba de configuración fallida: ${config.name}`);
      }

      return result;
    } catch (error) {
      logger.error("Error al probar configuración de email:", error);
      return false;
    }
  }
}

module.exports = EmailConfigService;
