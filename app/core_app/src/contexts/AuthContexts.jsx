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

        if (!accessToken || !refreshToken) {
          logout();
          setLoading(false);
          return;
        }

        if (hasExpiredToken(accessToken)) {
          await relogin(refreshToken);
        } else {
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
      const { accessToken } = await authController.refreshAccessToken(
        refreshToken
      );
      authController.setAccessToken(accessToken);
      await login(accessToken);
    } catch (error) {
      console.error("❌ Error en relogin:", error);
      logout();
    }
  };

  const login = async (accessToken) => {
    try {
      const response = await userController.getMe(accessToken);
      delete response.password;
      setUser(response);
      setToken(accessToken);
    } catch (error) {
      console.error("❌ Error en login:", error);
      logout();
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    authController.removeToken();
  };

  useEffect(() => {
    if (!user && token) {
      login(token);
    }
  }, [token]);

  const data = {
    accessToken: token,
    user,
    login,
    logout,
  };

  if (loading) return <p>Cargando...</p>;
  return <AuthContext.Provider value={data}>{children}</AuthContext.Provider>;
}
