// Utilidades para calcular "próxima ejecución" en una zona horaria de
// negocio específica (ej. "America/Santo_Domingo"), sin depender de una
// librería externa — Intl.DateTimeFormat ya trae la base de datos de zonas
// horarias en cualquier navegador moderno. Es el equivalente en frontend de
// server/utils/timezoneUtils.js (mismo algoritmo, mantenerlos en sync si se
// ajusta alguno).
//
// Antes, useDashboard.jsx/ScheduleConfiguration.jsx/ScheduleConfigManager.jsx
// calculaban la "próxima ejecución" con `new Date().setHours(...)`, que usa
// la zona horaria del navegador del usuario — no necesariamente la misma
// zona configurada para la Programación Automática.

/**
 * Convierte una fecha/hora "de pared" (year, month, day, hour, minute) en la
 * zona horaria indicada, al instante UTC real que representa.
 */
export function zonedTimeToUtc(year, month, day, hour, minute, timeZone) {
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
 * Próximo instante (Date) en el que son las `hour`:`minute` en la zona
 * horaria dada — hoy si todavía no pasó, o mañana si ya pasó. Asume que la
 * zona no tiene horario de verano (válido para las zonas que ofrece el
 * selector de Programación Automática).
 */
export function nextOccurrenceInZone(hour, minute, timeZone, now = new Date()) {
  const { year, month, day } = getZonedYMD(now, timeZone);
  let candidate = zonedTimeToUtc(year, month, day, hour, minute, timeZone);

  if (candidate <= now) {
    candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
  }

  return candidate;
}

/** Zonas horarias que puede elegir el usuario para la Programación Automática. */
export const SCHEDULE_TIMEZONE_OPTIONS = [
  { value: "America/Santo_Domingo", label: "Santo Domingo (UTC-4)" },
  { value: "America/Bogota", label: "Bogotá (UTC-5)" },
  { value: "America/Mexico_City", label: "Ciudad de México (UTC-6)" },
  { value: "America/New_York", label: "Nueva York (UTC-5/-4)" },
];
