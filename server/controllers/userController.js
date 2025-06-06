const bcrypt = require("bcrypt");
const User = require("../models/userModel");
const nodemailer = require("nodemailer");
const image = require("../utils/images");
const userModel = require("../models/userModel");

const fs = require("fs");
const path = require("path");

async function getMe(req, res) {
  const { user_id } = req.user;

  const response = await User.findById(user_id);
  // console.log(response);

  if (!response) {
    res.status(400).send({ msg: "No se ha encontrado usuario" });
  } else {
    res.status(200).send(response);
    // console.log(response);
  }
}

async function getUsers(req, res) {
  const { query, page = 1, pageSize = 10, active, busqueda } = req.body;

  // console.log(active);

  let matchStage = {
    activo: active,
  };

  // Solo aplicar la búsqueda en el servidor si se proporciona
  if (busqueda) {
    matchStage.$or = [
      { name: { $regex: busqueda, $options: "i" } },
      { lastname: { $regex: busqueda, $options: "i" } },
      { email: { $regex: busqueda, $options: "i" } },
      { vendedor: { $regex: busqueda, $options: "i" } },
      { retail: { $regex: busqueda, $options: "i" } },
    ];
  }

  const usuarios = await userModel.aggregate([
    {
      $match: matchStage,
    },
    {
      $skip: (page - 1) * pageSize,
    },
    {
      $limit: pageSize,
    },
  ]);

  // console.log(usuarios);

  const totalUsuarios = await userModel.countDocuments(matchStage);
  res.status(200).send({ code: 200, datos: usuarios, totalUsuarios });
  try {
  } catch (error) {
    console.log(error);
  }
}

async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const userData = req.body;

    console.log("📝 Datos recibidos:", userData);
    console.log("📷 Archivos recibidos:", req.files || req.file ? "Sí" : "No");
    console.log("🔍 req.file:", req.file);
    console.log("🔍 req.files:", req.files);

    // Asegúrate de que 'role' sea un array
    if (typeof userData.role === "string") {
      userData.role = userData.role.split(",");
    }

    // Manejar contraseña
    if (userData.password) {
      const salt = bcrypt.genSaltSync(10);
      const hashPassword = bcrypt.hashSync(userData.password, salt);
      userData.password = hashPassword;
    } else {
      delete userData.password;
    }

    // ⭐ MANEJAR ARCHIVO - COMPATIBLE CON upload.any() y upload.single() ⭐
    let avatarFile = null;

    if (req.file) {
      // Si usaste upload.single('avatar')
      avatarFile = req.file;
    } else if (req.files && req.files.length > 0) {
      // Si usaste upload.any(), buscar el archivo de avatar
      avatarFile = req.files.find((file) => file.fieldname === "avatar");
    }

    if (avatarFile) {
      try {
        const imagePath = image.getFilePath(avatarFile);
        console.log("🖼️ Ruta de imagen generada:", imagePath);

        const fullPath = path.join(__dirname, "../", imagePath);
        if (fs.existsSync(fullPath)) {
          userData.avatar = imagePath;
          console.log("✅ Archivo verificado y ruta guardada:", imagePath);
        } else {
          console.error("❌ El archivo no existe en:", fullPath);
          throw new Error("Error al procesar la imagen");
        }
      } catch (imageError) {
        console.error("❌ Error procesando imagen:", imageError);
        return res.status(400).send({
          success: false,
          msg: "Error al procesar la imagen",
          error: imageError.message,
        });
      }
    } else {
      console.log("ℹ️ No se recibió archivo de avatar");
    }

    console.log("📦 Datos finales a actualizar:", {
      ...userData,
      password: userData.password ? "[HIDDEN]" : undefined,
      avatar: userData.avatar ? userData.avatar : "Sin cambio",
    });

    const updatedUser = await User.findByIdAndUpdate(id, userData, {
      new: true,
    });

    if (!updatedUser) {
      return res.status(404).send({
        success: false,
        msg: "Usuario no encontrado",
      });
    }

    res.status(200).send({
      success: true,
      msg: "Actualización correcta",
      data: updatedUser,
    });
  } catch (error) {
    console.error("❌ Error en updateUser:", error);
    res.status(400).send({
      success: false,
      msg: "Error al actualizar el usuario",
      error: error.message,
    });
  }
}

async function createUser(req, res) {
  try {
    const { password } = req.body;

    const user = new User({ ...req.body });
    const salt = bcrypt.genSaltSync(10);
    const hasPassword = bcrypt.hashSync(password, salt);
    user.password = hasPassword;

    // ⭐ USAR req.file EN LUGAR DE req.files.avatar ⭐
    if (req.file) {
      const imagePath = image.getFilePath(req.file);
      user.avatar = imagePath;
      console.log("🖼️ Avatar asignado:", imagePath);
    }

    const userStored = await user.save();
    res.status(201).send({ success: true, data: userStored });
  } catch (error) {
    console.error("❌ Error al crear usuario:", error);
    res.status(400).send({ msg: "Error al crear el usuario" });
  }
}

async function ActiveInactiveUser(req, res) {
  try {
    const { id } = req.params;
    const { userData } = req.body;

    console.log("Inactivando usuario", req.body);

    await User.findByIdAndUpdate(id, { activo: userData });

    // res.status(200).send({  });
    res.status(201).send({ success: true, msg: "Actualización correcta" });
  } catch (error) {
    res.status(400).send({ msg: "Error al actualizar el usuario", error });
  }
}

async function deleteUser(req, res) {
  try {
    const { id } = req.params;

    console.log("🗑️ Eliminando usuario con ID:", id);

    // Verificar que el usuario existe antes de eliminar
    const userExists = await User.findById(id);
    if (!userExists) {
      return res.status(404).send({
        success: false,
        msg: "Usuario no encontrado",
      });
    }

    // Eliminar el usuario
    await User.findByIdAndDelete(id);

    console.log("✅ Usuario eliminado correctamente");

    res.status(200).send({
      success: true,
      msg: "Usuario eliminado correctamente",
    });
  } catch (error) {
    console.error("❌ Error al eliminar usuario:", error);
    res.status(400).send({
      success: false,
      msg: "Error al eliminar el usuario",
      error: error.message,
    });
  }
}

async function validateisRuta(userId) {
  try {
    const user = await User.find({ _id: userId });
    // console.log(user);
    if (!user) {
      console.log("Usuario no encontrado.");
      return false;
    }
    console.log(`Usuario encontrado: active=${user[0].active}`);
    return user[0].isRuta === true;
  } catch (error) {
    console.error("Error al validar usuario :", error);
    throw error;
  }
}

async function validateuserActive(userId) {
  try {
    const user = await User.find({ _id: userId });
    // console.log(user);
    if (!user) {
      console.log("Usuario no encontrado.");
      return false;
    }
    console.log(`Usuario encontrado: active=${user[0].activo}`);
    return user[0].activo === true;
  } catch (error) {
    console.error("Error al validar usuario :", error);
    throw error;
  }
}

module.exports = {
  getMe,
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  validateisRuta,
  ActiveInactiveUser,
  validateuserActive,
};
