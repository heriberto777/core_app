const validateData = async (data, rules, server2Pool, tableName) => {
  const validData = [];
  const invalidData = [];

  for (const record of data) {
    const errors = {};

    for (const [field, validation] of Object.entries(rules)) {
      if (validation.required && !record[field]) {
        errors[field] = `⚠️ ${field} es obligatorio`;
      }
      if (
        validation.maxLength &&
        record[field] &&
        record[field].length > validation.maxLength
      ) {
        errors[
          field
        ] = `⚠️ ${field} excede el límite de ${validation.maxLength} caracteres`;
      }
      if (validation.numeric && isNaN(Number(record[field]))) {
        errors[field] = `⚠️ ${field} debe ser un valor numérico`;
      }
    }

    // 📌 Validar si el registro ya existe en la base de datos destino
    if (rules.checkExistence) {
      try {
        const existQuery = `SELECT COUNT(*) AS count FROM dbo.${tableName} WHERE ${rules.primaryKey} = @value`;
        const request = server2Pool.request();
        request.input("value", record[rules.primaryKey]);

        const result = await request.query(existQuery);
        if (result.recordset[0].count > 0) {
          errors[rules.primaryKey] = `⚠️ El registro con ${
            rules.primaryKey
          } = ${
            record[rules.primaryKey]
          } ya existe en la base de datos destino`;
        }
      } catch (err) {
        errors[
          "DB_CHECK"
        ] = `⚠️ Error al verificar existencia en la base de datos: ${err.message}`;
      }
    }

    if (Object.keys(errors).length === 0) {
      validData.push(record);
    } else {
      invalidData.push({ record, errors });
    }
  }

  return { validData, invalidData };
};

module.exports = { validateData };
