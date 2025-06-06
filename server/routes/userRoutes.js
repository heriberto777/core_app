"use strict";

const express = require("express");
const UserController = require("../controllers/userController");
const { upload } = require("../utils/images");
// const multipart = require("connect-multiparty");

const md_auth = require("../middlewares/authenticated");
// const md_upload = multipart({ uploadDir: "./uploads/avatar" });

const api = express.Router();

api.get("/user/me", [md_auth.asureAuth], UserController.getMe);
api.post("/lists", [md_auth.asureAuth], UserController.getUsers);
api.get("/responsable", UserController.getUsers);
api.post("/user/create", [md_auth.asureAuth], UserController.createUser);

api.patch(
  "/user/update/:id",
  [md_auth.asureAuth],
  upload.single("avatar"),
  UserController.updateUser
);
api.patch(
  "/user/active/:id",
  [md_auth.asureAuth],
  UserController.ActiveInactiveUser
);
api.delete("/user/delete/:id", [md_auth.asureAuth], UserController.deleteUser);

module.exports = api;
