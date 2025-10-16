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

// Rutas públicas
router.post("/login", login);
router.post("/register", upload.single("avatar"), register);
router.post("/refresh_access_token", refreshAccessToken);

// Rutas protegidas
router.get("/me/permissions", verifyToken, checkUserPermissions);

module.exports = router;
