const logger = require("./logger");

/**
 * Valida los datos según las reglas proporcionadas.
 * @param {Array} data - Datos a validar.
 * @param {Object} rules - Reglas de validación.
 * @param {Object} server2Pool - Conexión al servidor 2 para verificar existencia.
 * @returns {Object} - Resultado de la validación con registros válidos e inválidos.
 */
const validateData = async (data, rules, server2Pool) => {
  const validData = [];
  const invalidData = [];

  // Verificar existencia previa en el servidor 2
  let existingKeys = new Set();
  if (rules.existenceCheck) {
    const { table, key } = rules.existenceCheck;
    const result = await server2Pool
      .request()
      .query(`SELECT ${key} FROM ${table}`);
    existingKeys = new Set(result.recordset.map((row) => row[key]));
  }

  for (const record of data) {
    const errors = [];

    // Validar campos obligatorios
    if (rules.requiredFields) {
      for (const field of rules.requiredFields) {
        if (!record[field] || record[field].toString().trim() === "") {
          errors.push(`${field} es obligatorio`);
        }
      }
    }

    // Validar existencia
    if (
      rules.existenceCheck &&
      existingKeys.has(record[rules.existenceCheck.key])
    ) {
      errors.push(`${rules.existenceCheck.key} ya existe en la tabla destino`);
    }

    // Clasificar el registro
    if (errors.length > 0) {
      invalidData.push({ record, errors });
      logger.warn(
        `Registro inválido: ${JSON.stringify(record)}, Errores: ${errors.join(
          ", "
        )}`
      );
    } else {
      validData.push(record);
    }
  }

  return { validData, invalidData };
};

module.exports = { validateData };
