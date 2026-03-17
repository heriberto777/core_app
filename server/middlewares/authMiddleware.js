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
      if (userPermission && userPermission.actions.includes(action)) {
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

// Fix #4 — early return guard: verifica que req.user exista antes de acceder a sus propiedades
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "No autenticado",
    });
  }
  if (!req.user.isAdmin) {
    return res.status(403).json({
      success: false,
      message: "Se requieren permisos de administrador",
    });
  }
  next();
};

// Verificar rol específico
const requireRole = (roleName) => {
  return async (req, res, next) => {
    try {
      const user = req.user;

      if (user.isAdmin) {
        return next();
      }

      // Verificar roles legacy
      if (user.role && user.role.includes(roleName)) {
        return next();
      }

      // Verificar roles nuevos
      if (user.roles && user.roles.length > 0) {
        const userRoles = await Role.find({
          _id: { $in: user.roles },
          name: roleName,
          isActive: true,
        });

        if (userRoles.length > 0) {
          return next();
        }
      }

      return res.status(403).json({
        success: false,
        message: `Se requiere el rol: ${roleName}`,
      });
    } catch (error) {
      console.error("❌ Error verificando rol:", error.message);
      return res.status(500).json({
        success: false,
        message: "Error verificando rol",
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

// Middleware específico para transferencias
const checkTransferPermission = async (req, res, next) => {
  try {
    // Fix #2 — reusar req.user poblado desde verifyToken (no hacer nueva query)
    const user = req.user;
    const { fromUserId, toUserId } = req.body;

    if (user.isAdmin === true) {
      return next();
    }

    if (!checkUserPermission(user, "tasks", "update")) {
      return res.status(403).json({
        success: false,
        message: "No tienes permisos para transferir tareas",
      });
    }

    if (checkUserPermission(user, "tasks", "manage")) {
      return next();
    }

    if (fromUserId && fromUserId !== String(user._id)) {
      return res.status(403).json({
        success: false,
        message: "Solo puedes transferir tus propias tareas",
      });
    }

    next();
  } catch (error) {
    logger.error("Error verificando permisos de transferencia:", error);
    res.status(500).json({
      success: false,
      message: "Error verificando permisos",
    });
  }
};

// Middleware para carga de documentos
const checkDocumentUpload = (documentType = "general") => {
  return async (req, res, next) => {
    try {
      const { user_id } = req.user;
      const user = await User.findById(user_id).populate("roles");

      if (!user || !user.activo) {
        return res.status(403).json({
          success: false,
          message: "Usuario no autorizado",
        });
      }

      if (user.isAdmin === true) {
        return next();
      }

      // Verificar permiso básico de documentos
      if (!checkUserPermission(user, "documents", "create")) {
        return res.status(403).json({
          success: false,
          message: "No tienes permisos para cargar documentos",
        });
      }

      // Verificaciones adicionales según tipo de documento
      switch (documentType) {
        case "sensitive":
          if (!checkUserPermission(user, "documents", "manage")) {
            return res.status(403).json({
              success: false,
              message: "No tienes permisos para cargar documentos sensibles",
            });
          }
          break;
        case "bulk":
          if (!checkUserPermission(user, "loads", "create")) {
            return res.status(403).json({
              success: false,
              message: "No tienes permisos para cargas masivas",
            });
          }
          break;
      }

      next();
    } catch (error) {
      console.error("Error verificando permisos de carga:", error);
      res.status(500).json({
        success: false,
        message: "Error verificando permisos",
      });
    }
  };
};

module.exports = {
  verifyToken,
  checkPermission,
  requireAdmin,
  requireRole,
  checkPermissions, // ⭐ NUEVA
  checkTransferPermission, // ⭐ NUEVA
  checkDocumentUpload, // ⭐ NUEVA
  checkUserPermission, // ⭐ NUEVA (helper)
};
