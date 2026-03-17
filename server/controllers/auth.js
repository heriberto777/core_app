const bcrypt = require("bcrypt");
const User = require("../models/userModel");
const Role = require("../models/roleModel");
const logger = require("../services/logger");
const { createAccessToken, createRefreshToken, decoded } = require("../services/jwt");

/**
 * Función de login adaptada con roles
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;
    const emailCase = email?.toLowerCase().trim();

    logger.info(`Intento de login para: ${emailCase}`);

    const user = await User.findOne({ email: emailCase }).populate({
      path: "roles",
      match: { isActive: true },
      select: "name displayName description permissions isActive isSystem",
    });

    if (!user) {
      logger.warn(`Usuario no encontrado: ${emailCase}`);
      return res.status(401).json({ success: false, message: "Email o contraseña incorrectos" });
    }

    if (!user.activo) {
      logger.warn(`Acceso denegado: Usuario inactivo (${emailCase})`);
      return res.status(403).json({ success: false, message: "Usuario desactivado. Contacte al administrador" });
    }

    if (!bcrypt.compareSync(password, user.password)) {
      logger.warn(`Contraseña incorrecta para: ${emailCase}`);
      return res.status(401).json({ success: false, message: "Email o contraseña incorrectos" });
    }

    // ⭐ RECOPILAR PERMISOS
    let allPermissions = [];
    if (user.permissions?.length > 0) {
      allPermissions = [...user.permissions];
    }

    if (user.roles?.length > 0) {
      user.roles.forEach((role) => {
        role.permissions?.forEach((permission) => {
          const existingPermission = allPermissions.find((p) => p.resource === permission.resource);
          if (existingPermission) {
            existingPermission.actions = [...new Set([...existingPermission.actions, ...permission.actions])];
          } else {
            allPermissions.push({ resource: permission.resource, actions: [...permission.actions] });
          }
        });
      });
    }

    if (user.isAdmin) {
      const adminResources = ["users", "roles", "system", "settings", "tasks", "loads", "reports", "analytics", "logs", "documents", "history"];
      adminResources.forEach((resource) => {
        const existingPermission = allPermissions.find((p) => p.resource === resource);
        if (!existingPermission) {
          allPermissions.push({ resource, actions: ["manage"] });
        } else if (!existingPermission.actions.includes("manage")) {
          existingPermission.actions.push("manage");
        }
      });
    }

    const accessToken = createAccessToken(user);
    const refreshToken = createRefreshToken(user);

    logger.info(`Login exitoso: ${user.email} por ${user._id}`);

    return res.status(200).json({
      success: true,
      message: "Login exitoso",
      data: {
        accessToken,
        refreshToken,
        user: {
          _id: user._id,
          name: user.name,
          lastname: user.lastname,
          email: user.email,
          telefono: user.telefono,
          avatar: user.avatar,
          activo: user.activo,
          roles: user.roles || [],
          permissions: allPermissions,
          isAdmin: user.isAdmin || false,
          theme: user.theme,
          isRuta: user.isRuta,
          vendedor: user.vendedor,
          retail: user.retail,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        }
      }
    });
  } catch (error) {
    logger.error("Error en login:", error);
    return res.status(500).json({ success: false, message: "Error interno del servidor", error: error.message });
  }
}

/**
 * Función para refrescar token de acceso
 */
async function refreshAccessToken(req, res) {
  try {
    const { token } = req.body;
    const payload = decoded(token);

    if (!payload || payload.token_type !== "refresh") {
      return res.status(401).json({ success: false, message: "Token de refresh inválido o expirado" });
    }

    const user = await User.findById(payload.user_id).populate({
      path: "roles",
      match: { isActive: true },
      select: "name displayName description permissions isActive isSystem",
    });

    if (!user || !user.activo) {
      logger.warn(`Refresh token fallido: Usuario no válido o inactivo (${payload.user_id})`);
      return res.status(401).json({ success: false, message: "Usuario no válido o inactivo" });
    }

    const accessToken = createAccessToken(user);
    logger.debug(`AccessToken renovado: ${user.email}`);

    return res.status(200).json({ success: true, data: { accessToken } });
  } catch (error) {
    logger.error("Error en refreshAccessToken:", error);
    return res.status(401).json({ success: false, message: "Error al refrescar token", error: error.message });
  }
}

/**
 * Función para registro
 */
async function register(req, res) {
  try {
    const { name, lastname, email, password, telefono } = req.body;
    const emailCase = email?.toLowerCase().trim();

    logger.info(`Intento de registro: ${emailCase}`);

    const existingUser = await User.findOne({ email: emailCase });
    if (existingUser) {
      return res.status(409).json({ success: false, message: "El email ya está registrado" });
    }

    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);
    const defaultRole = await Role.findOne({ name: "employee", isActive: true });

    const user = new User({
      name: name?.trim(),
      lastname: lastname?.trim(),
      email: emailCase,
      password: hashedPassword,
      telefono: telefono?.trim(),
      activo: true,
      roles: defaultRole ? [defaultRole._id] : [],
      isAdmin: false,
    });

    await user.save();
    logger.info(`Usuario registrado exitosamente: ${user.email}`);

    return res.status(201).json({
      success: true,
      message: "Usuario registrado exitosamente",
      data: {
        _id: user._id,
        name: user.name,
        lastname: user.lastname,
        email: user.email,
        telefono: user.telefono,
      },
    });
  } catch (error) {
    logger.error("Error en register:", error);
    return res.status(500).json({ success: false, message: "Error interno del servidor", error: error.message });
  }
}

/**
 * Verifica permisos del usuario actual
 */
async function checkUserPermissions(req, res) {
  try {
    const userId = req.user?.user_id || req.user?._id;

    const user = await User.findById(userId)
      .populate({
        path: "roles",
        match: { isActive: true },
        select: "name displayName permissions",
      })
      .select("-password")
      .lean();

    if (!user) return res.status(404).json({ success: false, message: "Usuario no encontrado" });

    let allPermissions = [];
    if (user.permissions) allPermissions = [...user.permissions];

    if (user.roles) {
      user.roles.forEach((role) => {
        role.permissions?.forEach((permission) => {
          const existingPermission = allPermissions.find((p) => p.resource === permission.resource);
          if (existingPermission) {
            existingPermission.actions = [...new Set([...existingPermission.actions, ...permission.actions])];
          } else {
            allPermissions.push(permission);
          }
        });
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        user: { _id: user._id, name: user.name, lastname: user.lastname, email: user.email, isAdmin: user.isAdmin },
        roles: user.roles,
        permissions: allPermissions,
      },
    });
  } catch (error) {
    logger.error("Error en checkUserPermissions:", error);
    return res.status(500).json({ success: false, message: "Error interno del servidor", error: error.message });
  }
}

module.exports = {
  login,
  refreshAccessToken,
  register,
  checkUserPermissions,
};
