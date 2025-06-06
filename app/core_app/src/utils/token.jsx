import { jwtDecode } from "jwt-decode";

export const hasExpiredToken = (token) => {
  try {
    const { exp } = jwtDecode(token);
    const currentDate = new Date().getTime();

    // ⭐ CONVERTIR exp a milisegundos (viene en segundos) ⭐
    const expInMs = exp * 1000;

    console.log("🕒 Verificación de expiración:", {
      exp: exp,
      expInMs: expInMs,
      currentDate: currentDate,
      isExpired: expInMs <= currentDate,
      timeUntilExp: Math.round((expInMs - currentDate) / 1000 / 60), // minutos
    });

    if (expInMs <= currentDate) {
      console.log("❌ Token expirado");
      return true;
    }

    console.log("✅ Token válido");
    return false;
  } catch (error) {
    console.error("❌ Error decodificando token:", error);
    return true; // Si hay error, considerar como expirado
  }
};
