const bcrypt = require("bcrypt");
const User = require("../models/userModel");
const Role = require("../models/roleModel");
const {
  createAccessToken,
  createRefreshToken,
  decoded,
} = require("../services/jwt");

// Función de login adaptada con roles
async function login(req, res) {
  try {
    const { email, password } = req.body;

    console.log("🔐 Intentando login para:", email);

    if (typeof email !== "string") {
      return res.status(400).send({
        state: false,
        msg: "El email debe ser una cadena de texto válida",
      });
    }

    // Validaciones básicas
    if (!email || !password) {
      return res.status(400).send({
        state: false,
        msg: "Email y contraseña son obligatorios",
      });
    }

    // Buscar usuario por email y poblar roles
    const emailCase = email.toLowerCase();
    const user = await User.findOne({ email: emailCase }).populate({
      path: "roles",
      match: { isActive: true }, // Solo roles activos
      select: "name displayName description permissions isActive isSystem",
    });

    console.log("❌ Usuario no encontrado:", email);

    if (!user) {
      console.log("❌ Usuario no encontrado:", email);
      return res.status(400).send({
        state: false,
        msg: "Email o contraseña incorrectos",
      });
    }

    // Verificar si el usuario está activo
    if (!user.activo) {
      console.log("❌ Usuario inactivo:", email);
      return res.status(400).send({
        state: false,
        msg: "Usuario desactivado. Contacte al administrador",
      });
    }

    // Verificar contraseña
    const passwordValid = bcrypt.compareSync(password, user.password);
    if (!passwordValid) {
      console.log("❌ Contraseña incorrecta para:", email);
      return res.status(400).send({
        state: false,
        msg: "Email o contraseña incorrectos",
      });
    }

    console.log("✅ Credenciales válidas para:", email);

    // ⭐ RECOPILAR PERMISOS DEL USUARIO ⭐
    let allPermissions = [];

    // 1. Agregar permisos específicos del usuario (si los tiene)
    if (user.permissions && user.permissions.length > 0) {
      console.log(
        "📋 Permisos específicos del usuario:",
        user.permissions.length
      );
      allPermissions = [...user.permissions];
    }

    // 2. Agregar permisos de roles
    if (user.roles && user.roles.length > 0) {
      console.log(
        "🎭 Roles del usuario:",
        user.roles.map((role) => role.displayName).join(", ")
      );

      user.roles.forEach((role) => {
        if (role.isActive && role.permissions) {
          role.permissions.forEach((permission) => {
            // Verificar si ya existe este recurso en los permisos
            const existingPermission = allPermissions.find(
              (p) => p.resource === permission.resource
            );

            if (existingPermission) {
              // Combinar acciones evitando duplicados
              const combinedActions = [
                ...new Set([
                  ...existingPermission.actions,
                  ...permission.actions,
                ]),
              ];
              existingPermission.actions = combinedActions;
            } else {
              // Agregar nueva permiso
              allPermissions.push({
                resource: permission.resource,
                actions: [...permission.actions],
              });
            }
          });
        }
      });
    }

    // 3. Si es admin, agregar permisos completos
    if (user.isAdmin) {
      console.log("👑 Usuario es administrador - agregando permisos completos");
      // Los admins tienen acceso a todo, pero mantenemos la lista específica para referencia
      const adminResources = [
        "users",
        "roles",
        "system",
        "settings",
        "tasks",
        "loads",
        "reports",
        "analytics",
        "logs",
        "documents",
        "history",
      ];
      adminResources.forEach((resource) => {
        const existingPermission = allPermissions.find(
          (p) => p.resource === resource
        );
        if (!existingPermission) {
          allPermissions.push({
            resource,
            actions: ["manage"],
          });
        } else if (!existingPermission.actions.includes("manage")) {
          existingPermission.actions.push("manage");
        }
      });
    }

    console.log("🔑 Total de permisos calculados:", allPermissions.length);

    // Generar tokens
    const accessToken = createAccessToken(user);
    const refreshToken = createRefreshToken(user);

    console.log("🎫 Tokens generados exitosamente");

    // ⭐ LOGS DETALLADOS PARA DEBUG ⭐
    console.log(
      "🔍 ACCESS TOKEN:",
      accessToken ? `${accessToken.substring(0, 50)}...` : "❌ VACÍO"
    );
    console.log(
      "🔍 REFRESH TOKEN:",
      refreshToken ? `${refreshToken.substring(0, 50)}...` : "❌ VACÍO"
    );

    // ⭐ RESPUESTA ADAPTADA CON ROLES Y PERMISOS ⭐
    const responseData = {
      state: true,
      msg: "Login exitoso",
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

        // ⭐ COMPATIBILIDAD CON SISTEMA ANTERIOR ⭐
        role: user.role || [], // Mantener roles legacy

        // ⭐ NUEVO SISTEMA DE ROLES ⭐
        roles: user.roles || [], // Roles poblados del nuevo sistema
        permissions: allPermissions, // Permisos calculados
        isAdmin: user.isAdmin || false,

        // Campos adicionales si existen
        theme: user.theme,
        isRuta: user.isRuta,
        vendedor: user.vendedor,
        retail: user.retail,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    };

    // ⭐ LOG DE LA RESPUESTA COMPLETA ⭐
    console.log("📤 RESPUESTA ENVIADA:");
    console.log("- state:", responseData.state);
    console.log("- accessToken presente:", !!responseData.accessToken);
    console.log("- refreshToken presente:", !!responseData.refreshToken);
    console.log("- user presente:", !!responseData.user);

    console.log(
      "✅ Login completado exitosamente para:",
      user.name,
      user.lastname
    );

    res.status(200).send(responseData);
  } catch (error) {
    console.error("❌ Error en login:", error);
    res.status(500).send({
      state: false,
      msg: "Error interno del servidor",
    });
  }
}

// Función para refrescar token de acceso
async function refreshAccessToken(req, res) {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).send({
        state: false,
        msg: "Token de refresh requerido",
      });
    }

    // Verificar y decodificar el refresh token
    const payload = decoded(token);

    if (payload.token_type !== "refresh") {
      return res.status(400).send({
        state: false,
        msg: "Tipo de token inválido",
      });
    }

    // Buscar usuario y poblar roles
    const user = await User.findById(payload.user_id).populate({
      path: "roles",
      match: { isActive: true },
      select: "name displayName description permissions isActive isSystem",
    });

    if (!user || !user.activo) {
      return res.status(400).send({
        state: false,
        msg: "Usuario no válido o inactivo",
      });
    }

    // Generar nuevo access token
    const accessToken = createAccessToken(user);

    console.log("✅ Access token renovado para:", user.email);

    res.status(200).send({
      state: true,
      accessToken,
    });
  } catch (error) {
    console.error("❌ Error en refresh token:", error);
    res.status(400).send({
      state: false,
      msg: "Token de refresh inválido o expirado",
    });
  }
}

// Función para registro (opcional - si no la tienes)
async function register(req, res) {
  try {
    const { name, lastname, email, password, telefono } = req.body;

    console.log("📝 Intentando registrar usuario:", email);

    // Validaciones básicas
    if (!name || !lastname || !email || !password) {
      return res.status(400).send({
        state: false,
        msg: "Todos los campos son obligatorios",
      });
    }

    // Verificar si el email ya existe
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).send({
        state: false,
        msg: "El email ya está registrado",
      });
    }

    // Crear usuario
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);

    // Obtener rol por defecto (employee)
    const defaultRole = await Role.findOne({
      name: "employee",
      isActive: true,
    });

    const userData = {
      name: name.trim(),
      lastname: lastname.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      telefono: telefono?.trim(),
      activo: true,
      roles: defaultRole ? [defaultRole._id] : [],
      isAdmin: false,
    };

    const user = new User(userData);
    const savedUser = await user.save();

    console.log("✅ Usuario registrado exitosamente:", savedUser.email);

    res.status(201).send({
      state: true,
      msg: "Usuario registrado exitosamente",
      user: {
        _id: savedUser._id,
        name: savedUser.name,
        lastname: savedUser.lastname,
        email: savedUser.email,
        telefono: savedUser.telefono,
      },
    });
  } catch (error) {
    console.error("❌ Error en registro:", error);
    res.status(500).send({
      state: false,
      msg: "Error interno del servidor",
    });
  }
}

// Función para verificar si el usuario actual tiene permisos (útil para endpoints)
async function checkUserPermissions(req, res) {
  try {
    const { user_id } = req.user; // Viene del middleware de autenticación

    const user = await User.findById(user_id)
      .populate({
        path: "roles",
        match: { isActive: true },
        select: "name displayName permissions",
      })
      .select("-password");

    if (!user) {
      return res.status(404).send({
        state: false,
        msg: "Usuario no encontrado",
      });
    }

    // Calcular permisos (misma lógica que en login)
    let allPermissions = [];

    if (user.permissions) {
      allPermissions = [...user.permissions];
    }

    if (user.roles) {
      user.roles.forEach((role) => {
        if (role.permissions) {
          role.permissions.forEach((permission) => {
            const existingPermission = allPermissions.find(
              (p) => p.resource === permission.resource
            );
            if (existingPermission) {
              existingPermission.actions = [
                ...new Set([
                  ...existingPermission.actions,
                  ...permission.actions,
                ]),
              ];
            } else {
              allPermissions.push(permission);
            }
          });
        }
      });
    }

    res.status(200).send({
      state: true,
      data: {
        user: {
          _id: user._id,
          name: user.name,
          lastname: user.lastname,
          email: user.email,
          isAdmin: user.isAdmin,
        },
        roles: user.roles,
        permissions: allPermissions,
      },
    });
  } catch (error) {
    console.error("❌ Error verificando permisos:", error);
    res.status(500).send({
      state: false,
      msg: "Error interno del servidor",
    });
  }
}

module.exports = {
  login,
  refreshAccessToken,
  register,
  checkUserPermissions,
};
