const jwt = require("../services/jwt");

function asureAuth(req, res, next) {
  console.log("🔐 Verificando autenticación...");

  if (!req.headers.authorization) {
    console.log("❌ No hay header de autorización");
    return res
      .status(403)
      .send({ msg: "La peticion no tiene la cabecera de autenticación" });
  }

  const token = req.headers.authorization.replace("Bearer ", "");
  console.log(
    "🎫 Token extraído:",
    token ? `${token.substring(0, 20)}...` : "Vacío"
  );

  try {
    const payload = jwt.decoded(token);
    console.log("✅ Payload decodificado:", {
      user_id: payload.user_id,
      token_type: payload.token_type,
      exp: payload.exp,
    });

    const { exp } = payload;
    const currentData = new Date().getTime();

    console.log("⏰ Verificación de expiración:", {
      tokenExp: exp,
      currentTime: currentData,
      isExpired: exp <= currentData,
      timeUntilExp: Math.round((exp - currentData) / 1000 / 60), // minutos
    });

    if (exp <= currentData) {
      console.log("❌ Token expirado");
      return res.status(400).send({ msg: "El token ha expirado" });
    }

    req.user = payload;
    console.log("✅ Autenticación exitosa para usuario:", payload.user_id);
    next();
  } catch (error) {
    console.log("❌ Error en autenticación:", error.message);

    // Mensajes de error más específicos
    if (error.name === "JsonWebTokenError") {
      return res.status(400).send({ msg: "Token invalido - Firma incorrecta" });
    } else if (error.name === "TokenExpiredError") {
      return res.status(400).send({ msg: "Token expirado" });
    } else if (error.name === "NotBeforeError") {
      return res.status(400).send({ msg: "Token no válido aún" });
    } else {
      return res.status(400).send({ msg: "Token invalido" });
    }
  }
}

module.exports = {
  asureAuth,
};
