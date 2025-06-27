import { useContext } from "react";
import { AuthContext } from "../index";

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth debe ser usado dentro de AuthProvider");
  }

  // ⭐ AGREGAR LOG DE DEBUG ⭐
  // console.log("🔍 useAuth - Token disponible:", {
  //   hasToken: !!context.accessToken,
  //   tokenType: typeof context.accessToken,
  //   tokenLength: context.accessToken?.length,
  //   hasUser: !!context.user,
  //   userEmail: context.user?.email,
  // });

  return context;
};
