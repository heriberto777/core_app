// utils/validateQuery.js

/**
 * Valida que la consulta sea SOLAMENTE SELECT.
 * - Rechaza DROP, DELETE, INSERT, UPDATE, MERGE, etc.
 * - Exige que inicie con SELECT.
 */
function validateSelectQueryOnly(query) {
  const forbiddenPatterns = [
    /\bDROP\b/i,
    /\bDELETE\b/i,
    /\bINSERT\b/i,
    /\bUPDATE\b/i,
    /\bMERGE\b/i,
    /\bALTER\b/i,
    /\bTRUNCATE\b/i,
    /\bEXEC\b/i,
    /;/g, // Evita sentencias múltiples
  ];

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(query)) {
      throw new Error(
        "Query no válido: contiene palabras reservadas prohibidas"
      );
    }
  }

  // Verificar que comience con SELECT
  if (!/^\s*SELECT\b/i.test(query)) {
    throw new Error("Solo se permiten consultas SELECT.");
  }
}

/**
 * Valida que la consulta NO contenga comandos destructivos
 * (DROP, TRUNCATE, ALTER, EXEC). PERO PERMITE MERGE, INSERT, UPDATE, etc.
 * - Ideal para tareas que necesitan MERGE o INSERT, pero no deben borrar tablas.
 */
function validateNonDestructiveQuery(query) {
  const forbiddenPatterns = [
    /\bDROP\b/i,
    /\bTRUNCATE\b/i,
    /\bALTER\b/i,
    /\bEXEC\b/i,
    // Aquí podrías agregar "DELETE" si quieres prohibir DELETE también,
    // o permitirlo, según tu caso.
  ];

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(query)) {
      throw new Error(
        "Query no válido: contiene palabras reservadas prohibidas"
      );
    }
  }
}

module.exports = {
  validateSelectQueryOnly,
  validateNonDestructiveQuery,
};
