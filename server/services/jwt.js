const jwt = require("jsonwebtoken");
const { JWT_SECRET_KEY } = require("../config");

function createAccessToken(user) {
  const expToken = new Date();
  expToken.setHours(expToken.getHours() + 365);

  const payload = {
    token_type: "access",
    user_id: user._id,
    iat: Date.now(),
    exp: expToken.getTime(),
  };

  return jwt.sign(payload, JWT_SECRET_KEY);
}

function createRefreshToken(user) {
  const expToken = new Date();
  expToken.setHours(expToken.getHours() + 365);

  const payload = {
    token_type: "refresh",
    user_id: user._id,
    iat: Date.now(),
    exp: expToken.getTime(),
  };

  return jwt.sign(payload, JWT_SECRET_KEY);
}

// ⭐ CAMBIAR jwt.decode por jwt.verify ⭐
function decoded(token) {
  try {
    // jwt.verify decodifica Y verifica la firma del token
    return jwt.verify(token, JWT_SECRET_KEY);
  } catch (error) {
    console.log("❌ Error verificando token:", error.message);
    throw error;
  }
}

module.exports = {
  createAccessToken,
  createRefreshToken,
  decoded,
};
