function formatDateToYYYYMMDD(dateStr) {
  if (typeof dateStr !== "string") return dateStr;

  // Si ya tiene 8 dígitos, asumimos que ya está formateada.
  if (/^\d{8}$/.test(dateStr)) {
    return dateStr;
  }

  // Para evitar problemas de zona horaria, vamos a separar los componentes
  // de la fecha y construir una nueva fecha usando la zona horaria local
  const parts = dateStr.split(/[-T]/);

  if (parts.length >= 3) {
    // Si tenemos al menos año, mes y día
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // JS usa 0-11 para meses
    const day = parseInt(parts[2], 10);

    // Construimos la fecha con la hora establecida en 12:00 para evitar cambios de día
    const dateObj = new Date(year, month, day, 12, 0, 0);

    if (isNaN(dateObj.getTime())) {
      throw new Error("Fecha inválida: " + dateStr);
    }

    const formattedYear = dateObj.getFullYear();
    const formattedMonth = ("0" + (dateObj.getMonth() + 1)).slice(-2);
    const formattedDay = ("0" + dateObj.getDate()).slice(-2);

    return `${formattedYear}${formattedMonth}${formattedDay}`;
  }

  // Si el formato no es el esperado, intentamos con el constructor de Date
  const dateObj = new Date(dateStr);
  if (isNaN(dateObj.getTime())) {
    throw new Error("Fecha inválida: " + dateStr);
  }

  const year = dateObj.getFullYear();
  const month = ("0" + (dateObj.getMonth() + 1)).slice(-2);
  const day = ("0" + dateObj.getDate()).slice(-2);

  return `${year}${month}${day}`;
}
