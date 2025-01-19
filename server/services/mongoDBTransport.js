const Transport = require("winston-transport");
const Log = require("../models/loggerModel"); // Modelo de MongoDB para logs

class MongoDBTransport extends Transport {
  constructor(opts) {
    super(opts);
  }

  async log(info, callback) {
    setImmediate(() => this.emit("logged", info));

    const log = new Log({
      level: info.level,
      message: info.message,
      metadata: info.metadata || null,
      timestamp: new Date(info.timestamp || Date.now()),
    });

    try {
      await log.save();
    } catch (err) {
      console.error("Error guardando log en MongoDB:", err);
    }

    callback();
  }
}

module.exports = MongoDBTransport;
