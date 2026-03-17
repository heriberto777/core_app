/**
 * SEGURIDAD: Todas las credenciales y secretos se leen del archivo .env
 * NUNCA deben estar hardcodeadas aquí.
 * Si falta una variable crítica en producción, el servidor se detiene al arrancar.
 */

const JWT_SECRET_KEY = process.env.JWT_SECRET;

if (!JWT_SECRET_KEY && process.env.NODE_ENV === "production") {
  throw new Error(
    "[CONFIG] JWT_SECRET no definida. Agréguela al archivo .env antes de iniciar en producción."
  );
}

const API_VERSION = process.env.API_VERSION || "v1";

module.exports = {
  API_VERSION,
  JWT_SECRET_KEY: JWT_SECRET_KEY || "dev-secret-change-in-production",
};

