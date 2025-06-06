import { useState, useEffect, createContext } from "react";
import { User, AuthApi, hasExpiredToken } from "../index";

export const AuthContext = createContext();
const userController = new User();
const authController = new AuthApi();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const accessToken = authController.getAccessToken();
        const refreshToken = authController.getRefreshToken();

        console.log("🔄 Inicializando autenticación...");
        console.log("Access Token:", accessToken ? "Presente" : "Ausente");
        console.log("Refresh Token:", refreshToken ? "Presente" : "Ausente");

        if (!accessToken || !refreshToken) {
          console.log("❌ No hay tokens, haciendo logout");
          logout();
          setLoading(false);
          return;
        }

        console.log("🔍 Verificando expiración del access token...");
        if (hasExpiredToken(accessToken)) {
          console.log("⚠️ Access token expirado, intentando relogin...");
          await relogin(refreshToken);
        } else {
          console.log("✅ Access token válido, haciendo login...");
          await login(accessToken);
        }
      } catch (error) {
        console.error("❌ Error al inicializar autenticación:", error);
        logout();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const relogin = async (refreshToken) => {
    try {
      console.log("🔄 Intentando relogin con refresh token...");
      const { accessToken } = await authController.refreshAccessToken(
        refreshToken
      );
      console.log("✅ Nuevo access token obtenido");
      authController.setAccessToken(accessToken);
      await login(accessToken);
    } catch (error) {
      console.error("❌ Error en relogin:", error);
      logout();
    }
  };

  const login = async (accessToken) => {
    try {
      console.log("🔐 Obteniendo datos del usuario...");
      const response = await userController.getMe(accessToken);
      delete response.password;
      setUser(response);
      setToken(accessToken);
      console.log("✅ Usuario logueado:", response.name);
    } catch (error) {
      console.error("❌ Error en login:", error);
      logout();
    }
  };

  const logout = () => {
    console.log("🚪 Haciendo logout...");
    setUser(null);
    setToken(null);
    authController.removeToken();
  };

  // ⭐ FUNCIÓN PARA ACTUALIZAR USUARIO ⭐
  const updateUser = (newUserData) => {
    console.log("🔄 Actualizando datos del usuario:", newUserData?.name);
    setUser((prevUser) => ({
      ...prevUser,
      ...newUserData,
    }));
  };

  // ⭐ VERIFICAR QUE updateUser ESTÉ EN EL OBJETO DATA ⭐
  const data = {
    accessToken: token,
    user,
    login,
    logout,
    updateUser, // ⭐ DEBE ESTAR AQUÍ ⭐
  };

  if (loading) return <p>Cargando...</p>;
  return <AuthContext.Provider value={data}>{children}</AuthContext.Provider>;
}
