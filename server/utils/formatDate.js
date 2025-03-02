// utils/formatDate.js

/**
 * Convierte una fecha en formato "YYYY-MM-DD" a "YYYYMMDD".
 * Si la fecha ya está en formato "YYYYMMDD", la devuelve tal cual.
 *
 * @param {string} dateStr - La fecha en formato "YYYY-MM-DD" o "YYYYMMDD"
 * @returns {string} La fecha formateada en "YYYYMMDD"
 * @throws {Error} Si la fecha es inválida.
 */
function formatDateToYYYYMMDD(dateStr) {
  if (typeof dateStr !== "string") return dateStr; // Si no es string, lo devuelve sin modificar.

  // Si ya tiene 8 dígitos, asumimos que ya está formateada.
  if (/^\d{8}$/.test(dateStr)) {
    return dateStr;
  }

  // Intentamos convertir la cadena a un objeto Date.
  const dateObj = new Date(dateStr);
  if (isNaN(dateObj.getTime())) {
    throw new Error("Fecha inválida: " + dateStr);
  }
  const year = dateObj.getFullYear();
  const month = ("0" + (dateObj.getMonth() + 1)).slice(-2);
  const day = ("0" + dateObj.getDate()).slice(-2);
  return `${year}${month}${day}`;
}

module.exports = { formatDateToYYYYMMDD };
