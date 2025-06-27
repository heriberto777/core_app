const User = require("../models/userModel");
const Role = require("../models/roleModel");
const { decoded, decodeWithoutVerification } = require("../services/jwt");

// Verificar token JWT mejorado
const verifyToken = async (req, res, next) => {
  try {
    // Obtener token del header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "No se proporcionó token de autorización",
      });
    }

    // Verificar formato del header (debe ser "Bearer TOKEN")
    const tokenParts = authHeader.split(" ");
    if (tokenParts.length !== 2 || tokenParts[0] !== "Bearer") {
      return res.status(401).json({
        success: false,
        message: "Formato de autorización inválido. Use: Bearer <token>",
      });
    }

    const token = tokenParts[1];

    // Log para debugging (puedes quitar esto en producción)
    console.log("🔍 Verificando token...");
    console.log(
      "Token recibido:",
      token ? `${token.substring(0, 20)}...` : "vacío"
    );

    // Intentar decodificar sin verificar primero (para debugging)
    const decodedInfo = decodeWithoutVerification(token);
    if (decodedInfo) {
      console.log("📋 Info del token:", {
        user_id: decodedInfo.user_id,
        token_type: decodedInfo.token_type,
        exp: decodedInfo.exp
          ? new Date(decodedInfo.exp * 1000)
          : "sin expiración",
        iat: decodedInfo.iat ? new Date(decodedInfo.iat * 1000) : "sin fecha",
      });
    }

    // Verificar y decodificar el token
    const payload = decoded(token);

    // Verificar que sea un token de acceso
    if (payload.token_type !== "access") {
      return res.status(401).json({
        success: false,
        message: "Tipo de token inválido",
      });
    }

    // Verificar que el user_id existe en el payload
    if (!payload.user_id) {
      return res.status(401).json({
        success: false,
        message: "Token no contiene ID de usuario válido",
      });
    }

    // Buscar usuario
    const user = await User.findById(payload.user_id).select("-password");

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

    // Agregar usuario al request
    req.user = user;
    console.log("✅ Token verificado para usuario:", user.email);

    next();
  } catch (error) {
    console.error("❌ Error en verifyToken:", error.message);

    // Respuestas específicas según el tipo de error
    let message = "Token inválido";
    let statusCode = 401;

    if (
      error.message.includes("malformed") ||
      error.message.includes("malformado")
    ) {
      message = "Token malformado";
    } else if (
      error.message.includes("expired") ||
      error.message.includes("expirado")
    ) {
      message = "Token expirado";
    } else if (error.message.includes("invalid signature")) {
      message = "Firma de token inválida";
    }

    return res.status(statusCode).json({
      success: false,
      message: message,
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

// Verificar si es admin
const requireAdmin = (req, res, next) => {
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
      const { user_id } = req.user;

      // Obtener usuario con roles poblados
      const user = await User.findById(user_id).populate("roles");
      if (!user || !user.activo) {
        return res.status(403).json({
          success: false,
          message: "Usuario no autorizado o inactivo",
        });
      }

      // Si es admin, permitir todo
      if (user.isAdmin === true) {
        return next();
      }

      let hasRequiredPermissions = false;

      if (type === "AND") {
        // Verificar que tenga TODOS los permisos
        hasRequiredPermissions = permissions.every(({ resource, action }) => {
          return checkUserPermission(user, resource, action);
        });
      } else if (type === "OR") {
        // Verificar que tenga AL MENOS UNO de los permisos
        hasRequiredPermissions = permissions.some(({ resource, action }) => {
          return checkUserPermission(user, resource, action);
        });
      }

      if (!hasRequiredPermissions) {
        return res.status(403).json({
          success: false,
          message: `Acceso denegado. Permisos insuficientes.`,
        });
      }

      next();
    } catch (error) {
      console.error("Error verificando permisos:", error);
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
    const { user_id } = req.user;
    const { fromUserId, toUserId } = req.body;

    const user = await User.findById(user_id).populate("roles");

    // Si es admin, puede transferir cualquier tarea
    if (user.isAdmin === true) {
      return next();
    }

    // Verificar permiso básico de transferencia
    if (!checkUserPermission(user, "tasks", "update")) {
      return res.status(403).json({
        success: false,
        message: "No tienes permisos para transferir tareas",
      });
    }

    // Si puede manejar tareas, puede transferir cualquiera
    if (checkUserPermission(user, "tasks", "manage")) {
      return next();
    }

    // Solo puede transferir sus propias tareas
    if (fromUserId && fromUserId !== user_id) {
      return res.status(403).json({
        success: false,
        message: "Solo puedes transferir tus propias tareas",
      });
    }

    next();
  } catch (error) {
    console.error("Error verificando permisos de transferencia:", error);
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
