// server/utils/timezoneUtils.js
// Utilidades para trabajar con horarios de negocio en una zona horaria IANA
// específica (ej. "America/Santo_Domingo"), sin depender de una librería
// externa (moment-timezone, date-fns-tz, etc.) — Intl.DateTimeFormat ya trae
// la base de datos de zonas horarias en Node 18+ y en cualquier navegador
// moderno.

/**
 * Convierte una fecha/hora "de pared" (year, month, day, hour, minute) en la
 * zona horaria indicada, al instante UTC real que representa.
 */
function zonedTimeToUtc(year, month, day, hour, minute, timeZone) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));

  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = {};
  for (const part of dtf.formatToParts(guess)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }

  // Qué hora "leería" alguien en esa zona si `guess` fuera realmente ese
  // instante — la diferencia contra `guess` es el offset UTC de la zona.
  const guessReadInZone = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  const offsetMs = guess.getTime() - guessReadInZone;
  return new Date(guess.getTime() + offsetMs);
}

/**
 * Año/mes/día "de pared" que corresponden a una fecha en una zona horaria.
 */
function getZonedYMD(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

/**
 * Próximo instante (Date, UTC real) en el que son las `hour`:`minute` en la
 * zona horaria dada — hoy si todavía no pasó, o mañana si ya pasó.
 * Asume que la zona no tiene horario de verano (válido para las zonas de
 * Latinoamérica/Caribe que ofrece el selector de Programación Automática);
 * con una zona que sí observe DST el resultado puede desviarse ±1h en los
 * días de cambio de horario.
 */
function nextOccurrenceInZone(hour, minute, timeZone, now = new Date()) {
  const { year, month, day } = getZonedYMD(now, timeZone);
  let candidate = zonedTimeToUtc(year, month, day, hour, minute, timeZone);

  if (candidate <= now) {
    candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
  }

  return candidate;
}

/**
 * Valida que `timeZone` sea un nombre de zona IANA reconocido por el motor
 * de JS actual — lanza si no lo es.
 */
function assertValidTimeZone(timeZone) {
  new Intl.DateTimeFormat(undefined, { timeZone });
}

module.exports = {
  zonedTimeToUtc,
  nextOccurrenceInZone,
  assertValidTimeZone,
};
