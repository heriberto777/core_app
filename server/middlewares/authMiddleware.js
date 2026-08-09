const User = require("../models/userModel");
const Role = require("../models/roleModel");
const { decoded, decodeWithoutVerification } = require("../services/jwt");
const logger = require("../services/logger");

// Verificar token JWT mejorado
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "No se proporcionó token de autorización",
      });
    }

    const tokenParts = authHeader.split(" ");
    if (tokenParts.length !== 2 || tokenParts[0] !== "Bearer") {
      return res.status(401).json({
        success: false,
        message: "Formato de autorización inválido. Use: Bearer <token>",
      });
    }

    const token = tokenParts[1];

    // Fix #5 — usar logger en lugar de console.log con datos sensibles
    logger.debug("Verificando token JWT...");

    const payload = decoded(token);

    if (payload.token_type !== "access") {
      return res.status(401).json({
        success: false,
        message: "Tipo de token inválido",
      });
    }

    if (!payload.user_id) {
      return res.status(401).json({
        success: false,
        message: "Token no contiene ID de usuario válido",
      });
    }

    // Fix #2 — poblar roles UNA sola vez en verifyToken para que todos los
    // middlewares downstream (checkPermissions, checkTransferPermission) reusen req.user
    const user = await User.findById(payload.user_id)
      .select("-password")
      .populate("roles");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Usuario no encontrado",
      });
    }

    if (!user.activo) {
      return res.status(401).json({
        success: false,
        message: "Usuario desactivado",
      });
    }

    req.user = user;
    // Fix #5 — no loguear email en producción; logger.debug filtra en producción
    logger.debug(`Token verificado para userId: ${payload.user_id}`);

    next();
  } catch (error) {
    logger.error("Error en verifyToken:", error.message);

    let message = "Token inválido";
    const statusCode = 401;

    if (error.message.includes("malformed") || error.message.includes("malformado")) {
      message = "Token malformado";
    } else if (error.message.includes("expired") || error.message.includes("expirado")) {
      message = "Token expirado";
    } else if (error.message.includes("invalid signature")) {
      message = "Firma de token inválida";
    }

    return res.status(statusCode).json({
      success: false,
      message,
      debug: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// EventSource del navegador no puede enviar headers personalizados, así que
// las rutas SSE (progressRoutes.js) reciben el token por query string en vez
// del header Authorization estándar.
const verifySseToken = async (req, res, next) => {
  try {
    const token = req.query.token;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No se proporcionó token de autorización",
      });
    }

    const payload = decoded(token);

    if (payload.token_type !== "access" || !payload.user_id) {
      return res.status(401).json({
        success: false,
        message: "Token inválido",
      });
    }

    const user = await User.findById(payload.user_id).select("-password");

    if (!user || !user.activo) {
      return res.status(401).json({
        success: false,
        message: "Usuario no encontrado o desactivado",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error("Error en verifySseToken:", error.message);
    return res.status(401).json({
      success: false,
      message: "Token inválido o expirado",
    });
  }
};

// Resto de funciones del middleware...
const checkPermission = (resource, action) => {
  return async (req, res, next) => {
    try {
      const user = req.user;

      // Admin siempre tiene acceso
      if (user.isAdmin) {
        return next();
      }

      // Obtener roles del usuario si no están cargados
      let userRoles = [];
      if (user.roles && user.roles.length > 0) {
        userRoles = await Role.find({
          _id: { $in: user.roles },
          isActive: true,
        });
      }

      // Verificar permisos específicos del usuario
      const userPermission = user.permissions?.find(
        (p) => p.resource === resource
      );
      if (
        userPermission &&
        (userPermission.actions.includes(action) ||
          userPermission.actions.includes("manage"))
      ) {
        return next();
      }

      // Verificar permisos de roles
      let hasPermission = false;
      for (const role of userRoles) {
        const rolePermission = role.permissions?.find(
          (p) => p.resource === resource
        );
        if (
          rolePermission &&
          (rolePermission.actions.includes(action) ||
            rolePermission.actions.includes("manage"))
        ) {
          hasPermission = true;
          break;
        }
      }

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          message: `No tienes permisos para ${action} en ${resource}`,
        });
      }

      next();
    } catch (error) {
      console.error("❌ Error verificando permisos:", error.message);
      return res.status(500).json({
        success: false,
        message: "Error verificando permisos",
      });
    }
  };
};

// Función helper para verificar permiso individual (agregar al inicio)
const checkUserPermission = (user, resource, action) => {
  // Verificar en roles del usuario
  if (user.roles && user.roles.length > 0) {
    for (const role of user.roles) {
      if (!role.isActive) continue;

      const permission = role.permissions.find((p) => p.resource === resource);
      if (
        permission &&
        (permission.actions.includes(action) ||
          permission.actions.includes("manage"))
      ) {
        return true;
      }
    }
  }

  // Verificar permisos específicos del usuario
  if (user.permissions && user.permissions.length > 0) {
    const userPermission = user.permissions.find(
      (p) => p.resource === resource
    );
    if (
      userPermission &&
      (userPermission.actions.includes(action) ||
        userPermission.actions.includes("manage"))
    ) {
      return true;
    }
  }

  return false;
};

const checkPermissions = (permissions, type = "AND") => {
  return async (req, res, next) => {
    try {
      // Fix #2 — req.user ya viene poblado con roles desde verifyToken
      const user = req.user;

      if (!user || !user.activo) {
        return res.status(403).json({
          success: false,
          message: "Usuario no autorizado o inactivo",
        });
      }

      if (user.isAdmin === true) {
        return next();
      }

      let hasRequiredPermissions = false;

      if (type === "AND") {
        hasRequiredPermissions = permissions.every(({ resource, action }) =>
          checkUserPermission(user, resource, action)
        );
      } else if (type === "OR") {
        hasRequiredPermissions = permissions.some(({ resource, action }) =>
          checkUserPermission(user, resource, action)
        );
      }

      if (!hasRequiredPermissions) {
        return res.status(403).json({
          success: false,
          message: "Acceso denegado. Permisos insuficientes.",
        });
      }

      next();
    } catch (error) {
      logger.error("Error verificando permisos:", error);
      res.status(500).json({
        success: false,
        message: "Error interno del servidor",
      });
    }
  };
};

module.exports = {
  verifyToken,
  verifySseToken,
  checkPermission,
  checkPermissions, // ⭐ NUEVA
  checkUserPermission, // ⭐ NUEVA (helper)
};
