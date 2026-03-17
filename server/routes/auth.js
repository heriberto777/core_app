const express = require("express");
const router = express.Router();
const { upload } = require("../utils/images");

const {
  login,
  refreshAccessToken,
  register,
  checkUserPermissions,
} = require("../controllers/auth");

const { verifyToken } = require("../middlewares/authMiddleware");
const { validate } = require("../middlewares/validator");
const { loginSchema, registerSchema, refreshTokenSchema } = require("../validators/authValidator");

// Rutas públicas
router.post("/login", loginSchema, validate, login);
router.post("/register", upload.single("avatar"), registerSchema, validate, register);
router.post("/refresh_access_token", refreshTokenSchema, validate, refreshAccessToken);

// Rutas protegidas
router.get("/me/permissions", verifyToken, checkUserPermissions);

module.exports = router;
