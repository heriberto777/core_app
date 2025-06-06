const express = require("express");
const AuthController = require("../controllers/auth");
const md = require("../middlewares/authenticated");
const { upload } = require("../utils/images");

const api = express.Router();

// api.post("/refresh-access-token", AuthController.refreshAccessToken);
api.post("/register", upload.single("avatar"), AuthController.register);
api.post("/login", AuthController.login);
api.post("/refresh_access_token", AuthController.refreshAccessToken);

module.exports = api;
