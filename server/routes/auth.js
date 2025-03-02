const express = require("express");
const AuthController = require("../controllers/auth");
const md = require("../middlewares/authenticated");

const api = express.Router();

// api.post("/refresh-access-token", AuthController.refreshAccessToken);
api.post("/auth/register", AuthController.register);
api.post("/auth/login", AuthController.login);
api.post("/auth/refresh_access_token", AuthController.refreshAccessToken);

module.exports = api;
