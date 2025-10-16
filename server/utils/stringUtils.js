// utils/stringUtils.js
function normalizeString(str) {
  if (!str) return str;
  
  // Reemplazar secuencias de escape comunes en contraseñas SQL
  return str.replace(/\\([\\$\[\]%_])/g, '$1')
            .replace(/%5f/g, '_')    // Manejar URL encoding para '_'
            .replace(/%25/g, '%');   // Manejar URL encoding para '%'
}

module.exports = {
  normalizeString
};