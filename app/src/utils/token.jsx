/**
 * Verifica si un token JWT ha expirado decodificando el payload cliente-side.
 * NOTA: Esta verificación es solo para UX (evitar requests innecesarios).
 * La verificación real de seguridad ocurre en el backend (authMiddleware.js).
 */
export function hasExpiredToken(token) {
  try {
    if (!token || typeof token !== "string") return true;

    const parts = token.split(".");
    if (parts.length !== 3) return true;

    // Decodificar el payload (segunda parte del JWT)
    const payload = JSON.parse(atob(parts[1]));

    if (!payload.exp) return false; // Sin campo exp → token permanente, considerarlo válido

    // exp está en segundos (estándar JWT RFC 7519)
    const currentTime = Math.floor(Date.now() / 1000);
    return payload.exp < currentTime;
  } catch {
    // Token malformado → tratar como expirado
    return true;
  }
}
