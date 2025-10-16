export function hasExpiredToken(token) {
  try {
    if (!token || typeof token !== "string") {
      return true;
    }

    const parts = token.split(".");
    if (parts.length !== 3) {
      return true;
    }

    // Decodificar el payload (segunda parte)
    const payload = JSON.parse(atob(parts[1]));

    if (!payload.exp) {
      return false; // Si no tiene expiración, considerarlo válido
    }

    // Verificar si ha expirado (exp está en segundos)
    const currentTime = Math.floor(Date.now() / 1000);
    return payload.exp < currentTime;
  } catch (error) {
    console.error("Error verificando expiración:", error);
    return true; // Si hay error, considerar expirado
  }
}
