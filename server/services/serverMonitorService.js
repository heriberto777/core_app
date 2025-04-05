const ServerMetric = require("../models/serverMetricModel");
const ConnectionDiagnostic = require("./connectionDiagnostic");
const DBConfig = require("../models/dbConfigModel");
const mongoose = require("mongoose");
const logger = require("./logger");

class ServerMonitorService {
  constructor() {
    this.intervalId = null;
    this.interval = 5 * 60 * 1000; // 5 minutos
  }

  start() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    // Ejecutar inmediatamente una vez
    this.checkServers();

    // Programar ejecuciones periódicas
    this.intervalId = setInterval(() => this.checkServers(), this.interval);

    logger.info(
      `Servicio de monitoreo de servidores iniciado (intervalo: ${
        this.interval / 60000
      } minutos)`
    );
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async checkServers() {
    try {
      logger.debug("Ejecutando comprobación de servidores...");

      // 1. Verificar MongoDB
      const isMongoConnected = mongoose.connection.readyState === 1;
      await this.saveMetric("mongodb", isMongoConnected ? "online" : "offline");

      // 2. Verificar Server1
      try {
        const startTime = Date.now();
        const server1Config = await DBConfig.findOne({ serverName: "server1" });

        if (!server1Config) {
          throw new Error("No se encontró configuración para server1");
        }

        const server1Result = await ConnectionDiagnostic.testDirectConnection(
          server1Config
        );
        const endTime = Date.now();
        const responseTime = endTime - startTime;

        await this.saveMetric("server1", "online", responseTime, server1Result);
      } catch (error) {
        await this.saveMetric("server1", "offline", null, {
          error: error.message,
        });
      }

      // 3. Verificar Server2
      try {
        const startTime = Date.now();
        const server2Config = await DBConfig.findOne({ serverName: "server2" });

        if (!server2Config) {
          throw new Error("No se encontró configuración para server2");
        }

        const server2Result = await ConnectionDiagnostic.testDirectConnection(
          server2Config
        );
        const endTime = Date.now();
        const responseTime = endTime - startTime;

        await this.saveMetric("server2", "online", responseTime, server2Result);
      } catch (error) {
        await this.saveMetric("server2", "offline", null, {
          error: error.message,
        });
      }

      logger.debug("Comprobación de servidores completada");
    } catch (error) {
      logger.error("Error en la comprobación de servidores:", error);
    }
  }

  async saveMetric(server, status, responseTime = null, details = {}) {
    try {
      const metric = new ServerMetric({
        server,
        status,
        responseTime,
        details,
        timestamp: new Date(),
      });

      await metric.save();
    } catch (error) {
      logger.error(`Error al guardar métrica para ${server}:`, error);
    }
  }
}

// Exportar instancia singleton
module.exports = new ServerMonitorService();
