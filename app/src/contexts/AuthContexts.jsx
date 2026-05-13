// AuthContexts.jsx - Versión mejorada sin resets automáticos
import React, {
  useState,
  useEffect,
  createContext,
  useCallback,
  useRef,
} from "react";
import { User, AuthApi } from "../api/index";

export const AuthContext = createContext();

// Fix #11 — Las instancias se crean dentro del componente con useRef
// para respetar el lifecycle de React y evitar singletons a nivel de módulo.

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fix #11 — instancias dentro del componente usando useRef para evitar recreaciones en cada render
  const authController = useRef(new AuthApi()).current;
  const userController = useRef(new User()).current;

  // Refs para evitar llamadas múltiples
  const isInitializing = useRef(false);
  const hasInitialized = useRef(false);

  // ⭐ VALIDACIÓN DE FORMATO DE TOKEN ⭐
  const isValidTokenFormat = useCallback((token) => {
    if (!token || typeof token !== "string") return false;
    const parts = token.split(".");
    return parts.length === 3 && parts.every((part) => part && part.length > 0);
  }, []);

  // ⭐ FUNCIÓN DE LOGOUT MEJORADA ⭐
  const logout = useCallback(() => {
    console.log("🚪 Cerrando sesión...");
    setUser(null);
    setAccessToken(null);
    setError(null);
    setLoading(false);
    authController.removeToken();
    hasInitialized.current = false;
  }, []);

  // ⭐ FUNCIÓN MEJORADA PARA CARGAR USUARIO CON PERMISOS (SIN AUTO-LOGOUT) ⭐
  const loginWithToken = useCallback(
    async (token, isFromLogin = false) => {
      try {
        console.log("🔐 AuthContext.loginWithToken iniciado", { isFromLogin });

        if (!isFromLogin) {
          setLoading(true);
        }
        setError(null);

        // Validar formato del token
        if (!isValidTokenFormat(token)) {
          throw new Error("Formato de token inválido");
        }

        // Obtener datos básicos del usuario
        const userResponse = await userController.getMe(token);
        console.log("📥 Respuesta de getMe recibida:", !!userResponse);

        if (userResponse && (userResponse._id || userResponse.id)) {
          const userDataRaw = userResponse.data || userResponse;
          delete userDataRaw.password;

          let userData = {
            ...userDataRaw,
            roles: [],
            permissions: [],
            consolidatedPermissions: [],
            isAdmin: userDataRaw.isAdmin || false,
          };

          // ⭐ CARGAR PERMISOS SIN FALLAR SI HAY ERROR ⭐
          try {
            const permissionsResponse = await userController.getUserPermissions(
              token
            );
            console.log("🔑 Permisos cargados:", !!permissionsResponse);

            if (permissionsResponse) {
              const permsData = permissionsResponse.data || permissionsResponse;
              userData = {
                ...userData,
                roles: permsData.roles || [],
                permissions: permsData.permissions || [],
                consolidatedPermissions:
                  permsData.consolidatedPermissions || [],
                isAdmin: permsData.isAdmin || userData.isAdmin,
              };
            }
          } catch (permError) {
            console.warn(
              "⚠️ Error cargando permisos (continuando sin permisos):",
              permError.message
            );
            // ⚠️ NO LLAMAR LOGOUT - Solo log del error
          }

          // Establecer estado
          setUser(userData);
          setAccessToken(token);
          authController.setAccessToken(token);

          console.log("✅ Usuario establecido:", {
            name: userData.name,
            email: userData.email,
            roles: userData.roles?.length || 0,
            isAdmin: userData.isAdmin,
          });

          return { ok: true, user: userData };
        } else {
          throw new Error("Respuesta de usuario inválida");
        }
      } catch (error) {
        console.error("❌ Error en loginWithToken:", error);
        setError(error.message);

        // ⭐ SILENT LOGOUT ⭐
        // Si hay un error al validar el token (ej: 401, 500, o token expirado)
        // y NO es un intento de login nuevo (es decir, viene de la persistencia de sesión)
        // entonces limpiamos los tokens para evitar bucles de error.
        if (!isFromLogin) {
          console.warn("🧹 Limpiando sesión debido a error de validación persistente...");
          logout();
        } else {
          logout();
        }

        return { ok: false, error: error.message };
      } finally {
        setLoading(false);
      }
    },
    [isValidTokenFormat, logout]
  );

  const login = useCallback(
    async (formData) => {
      try {
        setLoading(true);
        setError(null);

        console.log("🎯 Iniciando login desde contexto...");

        const response = await authController.login(formData);
        console.log("📥 Respuesta de authController.login:", response);

        if (response && (response.accessToken || response.data?.accessToken)) {
          console.log("✅ Credenciales válidas, procesando tokens...");
          const resData = response.data || response;

          if (resData.refreshToken) {
            authController.setRefreshToken(resData.refreshToken);
          }

          const result = await loginWithToken(resData.accessToken, true);

          if (result && result.ok) {
            console.log("✅ Login completado exitosamente");
            return { ok: true, user: result.user };
          } else {
            console.error("❌ Error en loginWithToken:", result.error);
            throw new Error(
              result.error || "Error al procesar la autenticación"
            );
          }
        } else {
          // ⭐ MANEJO CORRECTO DE CREDENCIALES INVÁLIDAS ⭐
          console.log("❌ Credenciales inválidas:", response.msg);
          const errorMessage = response.msg || "Email o contraseña incorrectos";
          setError(errorMessage);
          throw new Error(errorMessage);
        }
      } catch (error) {
        console.error("❌ Error en login:", error);
        setError(error.message);
        // ⭐ IMPORTANTE: SIEMPRE ARROJA LA EXCEPCIÓN PARA QUE LoginForm LA MANEJE ⭐
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [loginWithToken]
  );

  // ⭐ FUNCIÓN DE REFRESH TOKEN MEJORADA ⭐
  const refreshToken = useCallback(async () => {
    try {
      const refreshTokenValue = authController.getRefreshToken();

      if (!refreshTokenValue || !isValidTokenFormat(refreshTokenValue)) {
        console.warn(
          "⚠️ Refresh token no válido - no haciendo logout automático"
        );
        return false;
      }

      console.log("🔄 Renovando token de acceso...");
      const response = await authController.refreshAccessToken(
        refreshTokenValue
      );

      if (response && (response.accessToken || response.data?.accessToken)) {
        const resData = response.data || response;
        const result = await loginWithToken(resData.accessToken, false);

        if (resData.refreshToken) {
          authController.setRefreshToken(resData.refreshToken);
        }

        return !!result;
      } else {
        console.warn(
          "⚠️ No se pudo renovar el token - no haciendo logout automático"
        );
        return false;
      }
    } catch (error) {
      console.error("❌ Error renovando token:", error);
      // ⭐ SILENT LOGOUT ⭐
      // Si la renovación falla (ej: refresh token expirado), limpiamos la sesión
      console.warn("🧹 Limpiando sesión debido a fallo en renovación de token...");
      logout();
      return false;
    }
  }, [isValidTokenFormat, loginWithToken]);

  // ⭐ FUNCIÓN PARA RECARGAR PERMISOS ⭐
  const reloadUserPermissions = useCallback(async () => {
    if (!accessToken || !user) {
      console.warn("⚠️ No hay usuario o token para recargar permisos");
      return;
    }

    try {
      const permissionsResponse = await userController.getUserPermissions(
        accessToken
      );

      if (permissionsResponse) {
        const permsData = permissionsResponse.data || permissionsResponse;
        setUser((prevUser) => ({
          ...prevUser,
          roles: permsData.roles || [],
          permissions: permsData.permissions || [],
          consolidatedPermissions:
            permsData.consolidatedPermissions || [],
          isAdmin:
            permsData.isAdmin || prevUser.isAdmin || false,
        }));

        return true;
      }
      return false;
    } catch (error) {
      console.error("❌ Error recargando permisos:", error);
      // ⚠️ NO HACER LOGOUT por error de permisos
      return false;
    }
  }, [accessToken, user]);

  // Fix #3 — initializeAuth usa await consistente para eliminar la race condition
  // donde hasInitialized.current se marcaba true antes de que loginWithToken terminara.
  useEffect(() => {
    if (hasInitialized.current || isInitializing.current) {
      return;
    }

    const initializeAuth = async () => {
      isInitializing.current = true;

      try {
        const storedAccessToken = authController.getAccessToken();
        const storedRefreshToken = authController.getRefreshToken();

        if (storedAccessToken && isValidTokenFormat(storedAccessToken)) {
          const result = await loginWithToken(storedAccessToken, false);

          if ((!result || !result.ok) && storedRefreshToken && isValidTokenFormat(storedRefreshToken)) {
            await refreshToken();
          }
        } else if (storedRefreshToken && isValidTokenFormat(storedRefreshToken)) {
          await refreshToken();
        }
      } catch (error) {
        console.error("❌ Error inicializando autenticación:", error);
      } finally {
        // Fix #3 — hasInitialized se marca DESPUÉS de que todo el proceso async termina
        hasInitialized.current = true;
        isInitializing.current = false;
        setLoading(false);
      }
    };

    initializeAuth();
  }, []); // Solo se ejecuta UNA vez

  // ⭐ VALORES DEL CONTEXTO ⭐
  const contextValue = {
    // Estados
    user,
    accessToken,
    loading,
    error,
    isAuthenticated: !!user && !!accessToken,

    // Funciones
    login,
    logout,
    loginWithToken,
    reloadUserPermissions,
    refreshToken,

    // Utilidades
    isValidTokenFormat,
  };

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
}
