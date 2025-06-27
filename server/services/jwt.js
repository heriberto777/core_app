const jwt = require("jsonwebtoken");
const { JWT_SECRET_KEY } = require("../config");

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

// ⭐ FUNCIÓN MEJORADA PARA VERIFICAR TOKEN ⭐
function decoded(token) {
  try {
    // Verificar que el token existe y tiene el formato correcto
    if (!token || typeof token !== "string") {
      throw new Error("Token no proporcionado o formato inválido");
    }

    // Verificar que el token tiene la estructura JWT básica (3 partes separadas por puntos)
    const tokenParts = token.split(".");
    if (tokenParts.length !== 3) {
      throw new Error("Formato de token JWT inválido");
    }

    // Verificar y decodificar el token
    const decodedToken = jwt.verify(token, JWT_SECRET_KEY);

    // Verificar que el token no ha expirado
    const currentTime = Math.floor(Date.now() / 1000);
    if (decodedToken.exp && decodedToken.exp < currentTime) {
      throw new Error("Token expirado");
    }

    console.log("✅ Token verificado exitosamente");
    return decodedToken;
  } catch (error) {
    console.log("❌ Error verificando token:", error.message);

    // Proporcionar mensajes de error más específicos
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

// ⭐ FUNCIÓN ADICIONAL PARA DECODIFICAR SIN VERIFICAR (SOLO PARA DEBUG) ⭐
function decodeWithoutVerification(token) {
  try {
    if (!token || typeof token !== "string") {
      return null;
    }

    const tokenParts = token.split(".");
    if (tokenParts.length !== 3) {
      return null;
    }

    // Decodificar sin verificar la firma (solo para debugging)
    const decoded = jwt.decode(token);
    return decoded;
  } catch (error) {
    console.log("❌ Error decodificando token:", error.message);
    return null;
  }
}

module.exports = {
  createAccessToken,
  createRefreshToken,
  decoded,
  decodeWithoutVerification, // Para debugging
};
