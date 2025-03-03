// utilities/stringUtils.js
/**
 * Normaliza cadenas con caracteres especiales escapados
 * Útil para contraseñas y cadenas de conexión
 * 
 * @param {string} str - Cadena a normalizar
 * @return {string} - Cadena normalizada
 */
function normalizeString(str) {
  if (!str) return str;
  
  // Reemplazar secuencias de escape comunes
  return str.replace(/\\([\\$\[\]%_])/g, '$1');
}

module.exports = {
  normalizeString
};