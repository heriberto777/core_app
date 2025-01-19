require("dotenv").config();
const express = require("express");
const app = express();
const errorHandler = require("./middlewares/errorHandler");
app.use(errorHandler);

const logRequests = require("./middlewares/loggerMiddleware");
app.use(logRequests);

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const API_VERSION = process.env.API_VERSION;

// Rutas
const apiRoutes = require("./routes/apiRoutes");
app.use(`/api/${API_VERSION}/`, apiRoutes);

module.exports = app;
