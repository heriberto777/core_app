const bcrypt = require("bcrypt");
const User = require("../models/userModel");
const jwt = require("../services/jwt");

/**
 * 📌 Función para enviar respuestas estandarizadas
 */
const sendResponse = (res, status, msg, state, extraData = {}) => {
  return res.status(status).json({ msg, state, ...extraData });
};

async function register(req, res) {
  try {
    const { name, lastname, email, password, activo, role } = req.body;

    if (!email) return res.status(400).send({ msg: "El email es obligatorio" });
    if (!password)
      return res.status(400).send({ msg: "La contraseña es obligatoria" });

    const user = new User({
      name,
      lastname,
      email: email.toLowerCase(),
      role,
      activo,
      password: bcrypt.hashSync(password, bcrypt.genSaltSync(10)),
    });

    const userStorage = await user.save();
    res.status(200).send(userStorage);
  } catch (error) {
    res.status(400).send({ msg: "Error al crear el usuario", error });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;

    // 📌 Validaciones iniciales
    if (!email || !password) {
      return res.status(400).json({
        msg: !email
          ? "El email es obligatorio"
          : "La contraseña es obligatoria",
        state: false,
      });
    }

    const emailLowerCase = email.toLowerCase();

    // 📌 Buscar usuario en la base de datos
    const userStore = await User.findOne({ email: emailLowerCase }).exec();

    if (!userStore) {
      return res.status(401).json({
        msg: "El usuario no existe. Verifique el correo electrónico.",
        state: false,
      });
    }

    console.log(
      "Password",
      password,
      "pass usuarios Tabla",
      userStore.password
    );
    // 📌 Verificar la contraseña con `bcrypt.compare`
    const isPasswordValid = await bcrypt
      .compare(password, userStore.password)
      .catch((err) => {
        console.error("Error en bcrypt.compare:", err);
        return false;
      });

    console.log("¿Contraseña válida?", isPasswordValid);
    if (!isPasswordValid) {
      return res.status(401).json({
        msg: "Credenciales incorrectas. Intente nuevamente.",
        state: false,
      });
    }

    // 📌 Verificar si el usuario está activo
    if (!userStore.activo) {
      return res.status(403).json({
        msg: "Cuenta inactiva. Comuníquese con el departamento de TI.",
        state: false,
      });
    }

    // 📌 Generar tokens
    const accessToken = jwt.createAccessToken(userStore);
    const refreshToken = jwt.createRefreshToken(userStore);

    return res.status(200).json({
      msg: "Inicio de sesión exitoso",
      state: true,
      access: accessToken,
      refresh: refreshToken,
      user: {
        id: userStore._id,
        name: userStore.name,
        email: userStore.email,
        role: userStore.role,
      },
    });
  } catch (error) {
    console.error("Error en el login:", error);
    return res.status(500).json({
      msg: "Error interno del servidor",
      state: false,
      error: error.message,
    });
  }
}

function refreshAccessToken(req, res) {
  const { token } = req.body;

  if (!token) res.status(400).send({ msg: "Token requerido" });

  const { user_id } = jwt.decoded(token);

  User.findOne({ _id: user_id }, (error, userStorage) => {
    if (error) {
      res.status(500).send({ msg: "Error del servidor", accessToken: false });
    } else {
      res.status(200).send({
        accessToken: jwt.createAccessToken(userStorage),
      });
    }
  });
}

module.exports = {
  register,
  login,
  refreshAccessToken,
};
