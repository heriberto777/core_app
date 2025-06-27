// AuthContexts.jsx - Versión mejorada sin resets automáticos
import React, {
  useState,
  useEffect,
  createContext,
  useCallback,
  useRef,
} from "react";
import { User, AuthApi } from "../index";

export const AuthContext = createContext();
const userController = new User();
const authController = new AuthApi();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

        if (userResponse.data && userResponse.data._id) {
          delete userResponse.data.password;

          let userData = {
            ...userResponse.data,
            roles: [],
            permissions: [],
            consolidatedPermissions: [],
            isAdmin: userResponse.data.isAdmin || false,
          };

          // ⭐ CARGAR PERMISOS SIN FALLAR SI HAY ERROR ⭐
          try {
            const permissionsResponse = await userController.getUserPermissions(
              token
            );
            console.log("🔑 Permisos cargados:", permissionsResponse?.success);

            if (permissionsResponse?.success) {
              userData = {
                ...userData,
                roles: permissionsResponse.data.roles || [],
                permissions: permissionsResponse.data.permissions || [],
                consolidatedPermissions:
                  permissionsResponse.data.consolidatedPermissions || [],
                isAdmin: permissionsResponse.data.isAdmin || userData.isAdmin,
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

          return { success: true, user: userData };
        } else {
          throw new Error("Respuesta de usuario inválida");
        }
      } catch (error) {
        console.error("❌ Error en loginWithToken:", error);
        setError(error.message);

        // ⚠️ SOLO HACER LOGOUT SI ES UN LOGIN NUEVO, NO EN INICIALIZACIÓN
        if (isFromLogin) {
          logout();
        }

        return { success: false, error: error.message };
      } finally {
        setLoading(false);
      }
    },
    [isValidTokenFormat, logout]
  );

  // ⭐ FUNCIÓN DE LOGIN MEJORADA ⭐
  const login = useCallback(
    async (formData) => {
      try {
        setLoading(true);
        setError(null);

        const response = await authController.login(formData);

        if (response.state && response.accessToken) {
          if (response.refreshToken) {
            authController.setRefreshToken(response.refreshToken);
          }

          const result = await loginWithToken(response.accessToken, true);
          return result;
        } else {
          throw new Error(response.msg || "Credenciales inválidas");
        }
      } catch (error) {
        console.error("❌ Error en login:", error);
        setError(error.message);
        return { success: false, error: error.message };
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

      if (response.state && response.accessToken) {
        const result = await loginWithToken(response.accessToken, false);

        if (response.refreshToken) {
          authController.setRefreshToken(response.refreshToken);
        }

        return result.success;
      } else {
        console.warn(
          "⚠️ No se pudo renovar el token - no haciendo logout automático"
        );
        return false;
      }
    } catch (error) {
      console.error("❌ Error renovando token:", error);
      // ⚠️ NO LLAMAR LOGOUT AUTOMÁTICAMENTE - Dejar que el usuario decida
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

      if (permissionsResponse?.success) {
        setUser((prevUser) => ({
          ...prevUser,
          roles: permissionsResponse.data.roles || [],
          permissions: permissionsResponse.data.permissions || [],
          consolidatedPermissions:
            permissionsResponse.data.consolidatedPermissions || [],
          isAdmin:
            permissionsResponse.data.isAdmin || prevUser.isAdmin || false,
        }));

        console.log("🔄 Permisos recargados exitosamente");
        return true;
      }
      return false;
    } catch (error) {
      console.error("❌ Error recargando permisos:", error);
      // ⚠️ NO HACER LOGOUT por error de permisos
      return false;
    }
  }, [accessToken, user]);

  // ⭐ INICIALIZACIÓN MEJORADA (SOLO UNA VEZ) ⭐
  useEffect(() => {
    if (hasInitialized.current || isInitializing.current) {
      console.log("🔍 Inicialización ya ejecutada o en proceso, saltando...");
      return;
    }

    const initializeAuth = async () => {
      isInitializing.current = true;

      try {
        console.log("🚀 Inicializando autenticación...");

        const storedAccessToken = authController.getAccessToken();
        const storedRefreshToken = authController.getRefreshToken();

        if (storedAccessToken && isValidTokenFormat(storedAccessToken)) {
          console.log(
            "🔍 Token de acceso encontrado en localStorage, verificando..."
          );

          // ⚠️ NO usar await aquí para evitar bloqueos
          loginWithToken(storedAccessToken, false).then((result) => {
            if (!result.success) {
              console.log("🔄 Token de acceso inválido, intentando refresh...");
              if (
                storedRefreshToken &&
                isValidTokenFormat(storedRefreshToken)
              ) {
                refreshToken().then((refreshSuccess) => {
                  if (!refreshSuccess) {
                    console.log(
                      "❌ Refresh también falló - usuario debe hacer login manual"
                    );
                    setLoading(false);
                  }
                });
              } else {
                setLoading(false);
              }
            }
          });
        } else if (
          storedRefreshToken &&
          isValidTokenFormat(storedRefreshToken)
        ) {
          console.log(
            "🔄 Solo refresh token disponible, intentando renovar..."
          );

          refreshToken().then((success) => {
            if (!success) {
              console.log(
                "❌ No se pudo renovar - usuario debe hacer login manual"
              );
            }
            setLoading(false);
          });
        } else {
          console.log("❌ No hay tokens válidos disponibles");
          setLoading(false);
        }

        hasInitialized.current = true;
      } catch (error) {
        console.error("❌ Error inicializando autenticación:", error);
        setLoading(false);
      } finally {
        isInitializing.current = false;
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
