const bcrypt = require("bcrypt");
const User = require("../models/userModel");
const nodemailer = require("nodemailer");
const image = require("../utils/images");
const userModel = require("../models/userModel");

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
    active: active,
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

async function createUser(req, res) {
  try {
    const { password } = req.body;

    // console.log(password);
    const user = new User({ ...req.body });
    const salt = bcrypt.genSaltSync(10);
    const hasPassword = bcrypt.hashSync(password, salt);
    user.password = hasPassword;
    if (req.files.avatar) {
      const imagePath = image.getFilePath(req.files.avatar);
      user.avatar = imagePath;
      console.log(imagePath);
    }

    const userStored = await user.save();

    res.status(201).send({ success: true, data: userStored });
  } catch (error) {
    console.error(error);
    res.status(400).send({ msg: "Error al crear el usuario" });
  }
}

async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const userData = req.body;

    // console.log(userData);

    // Asegúrate de que 'role' sea un array
    if (typeof userData.role === "string") {
      userData.role = userData.role.split(",");
    }

    if (userData.password) {
      const salt = bcrypt.genSaltSync(10);
      const hashPassword = bcrypt.hashSync(userData.password, salt);
      userData.password = hashPassword;
    } else {
      delete userData.password;
    }

    if (req.files && req.files.avatar) {
      const imagePath = image.getFilePath(req.files.avatar);
      userData.avatar = imagePath;
    }

    await User.findByIdAndUpdate(id, userData);

    // res.status(200).send({  });
    res.status(201).send({ success: true, msg: "Actualización correcta" });
  } catch (error) {
    res.status(400).send({ msg: "Error al actualizar el usuario", error });
  }
}

async function ActiveInactiveUser(req, res) {
  try {
    const { id } = req.params;
    const { userData } = req.body;

    // console.log(req.body);

    await User.findByIdAndUpdate(id, { active: userData });

    // res.status(200).send({  });
    res.status(201).send({ success: true, msg: "Actualización correcta" });
  } catch (error) {
    res.status(400).send({ msg: "Error al actualizar el usuario", error });
  }
}

async function deleteUser(req, res) {
  const { id } = req.params;

  User.findByIdAndDelete(id, (error) => {
    if (error) {
      res.status(400).send({ msg: "Error al eliminar el usuario" });
    } else {
      res.status(200).send({ msg: "Usuario eliminado" });
    }
  });
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
    console.log(`Usuario encontrado: active=${user[0].active}`);
    return user[0].active === true;
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
