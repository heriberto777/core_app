const jwt = require("jsonwebtoken");
const { JWT_SECRET_KEY } = require("../config");
const logger = require("./logger");

function createAccessToken(user) {
  const expToken = new Date();
  expToken.setHours(expToken.getHours() + 24); // Cambiar a 24 horas en lugar de 365

  const payload = {
    token_type: "access",
    user_id: user._id,
    iat: Math.floor(Date.now() / 1000), // Usar segundos en lugar de milisegundos
    exp: Math.floor(expToken.getTime() / 1000), // Usar segundos
  };

  return jwt.sign(payload, JWT_SECRET_KEY);
}

function createRefreshToken(user) {
  const expToken = new Date();
  expToken.setDate(expToken.getDate() + 30); // 30 días para refresh token

  const payload = {
    token_type: "refresh",
    user_id: user._id,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(expToken.getTime() / 1000),
  };

  return jwt.sign(payload, JWT_SECRET_KEY);
}

function decoded(token) {
  try {
    if (!token || typeof token !== "string") {
      throw new Error("Token no proporcionado o formato inválido");
    }

    const tokenParts = token.split(".");
    if (tokenParts.length !== 3) {
      throw new Error("Formato de token JWT inválido");
    }

    // jwt.verify ya valida la firma Y la expiración internamente
    // No es necesario verificar exp manualmente
    const decodedToken = jwt.verify(token, JWT_SECRET_KEY);

    logger.debug("Token JWT verificado exitosamente");
    return decodedToken;
  } catch (error) {
    // Normalizar mensajes de error para el middleware
    if (error.name === "JsonWebTokenError") {
      throw new Error("Token JWT malformado o inválido");
    } else if (error.name === "TokenExpiredError") {
      throw new Error("Token expirado");
    } else if (error.name === "NotBeforeError") {
      throw new Error("Token aún no es válido");
    } else {
      throw error;
    }
  }
}

// Solo para uso en logging/diagnóstico — nunca usar para decisiones de seguridad
function decodeWithoutVerification(token) {
  try {
    if (!token || typeof token !== "string") return null;
    const tokenParts = token.split(".");
    if (tokenParts.length !== 3) return null;
    return jwt.decode(token);
  } catch {
    return null;
  }
}

module.exports = {
  createAccessToken,
  createRefreshToken,
  decoded,
  decodeWithoutVerification, // Para debugging
};
