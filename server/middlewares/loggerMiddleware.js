const logger = require("../services/logger");

const logRequests = (req, res, next) => {
  logger.http(`${req.method} ${req.originalUrl}`);
  next();
};

module.exports = logRequests;
