"use strict";

const express = require("express");
const UserController = require("../controllers/userController");
const multipart = require("connect-multiparty");

const md_auth = require("../middlewares/authenticated");
const md_upload = multipart({ uploadDir: "./uploads/avatar" });

const api = express.Router();

api.get("/user/me", [md_auth.asureAuth], UserController.getMe);
api.post("/users", [md_auth.asureAuth], UserController.getUsers);
api.get("/responsable", UserController.getUsers);
api.post("/user", [md_auth.asureAuth, md_upload], UserController.createUser);

api.patch(
  "/user/:id",
  [md_auth.asureAuth, md_upload],
  UserController.updateUser
);
api.patch(
  "/user/active/:id",
  [md_auth.asureAuth],
  UserController.ActiveInactiveUser
);
api.delete("/user/:id", [md_auth.asureAuth], UserController.deleteUser);

module.exports = api;
