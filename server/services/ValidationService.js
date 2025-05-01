const logger = require("./logger");

/**
 * Error personalizado para validación
 */
class ValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ValidationError";
    this.details = details;
  }
}

/**
 * Servicio para validación robusta de datos
 */
class ValidationService {
  /**
   * Valida un registro completo según un schema
   * @param {Object} record - Registro a validar
   * @param {Object} schema - Schema de validación
   * @param {Object} config - Configuración de validación
   * @returns {Object} - Registro validado
   */
  validateRecord(record, schema = null, config = {}) {
    if (!record || typeof record !== "object") {
      throw new ValidationError("El registro debe ser un objeto válido");
    }

    // Si no hay schema, sanitizar todos los campos
    if (!schema) {
      return this.sanitizeRecord(record);
    }

    const validatedRecord = {};
    const errors = [];

    // Validar cada campo según el schema
    for (const [field, rules] of Object.entries(schema)) {
      try {
        const value = record[field];
        validatedRecord[field] = this.validateField(field, value, rules);
      } catch (error) {
        if (config.throwOnFirstError) {
          throw error;
        }
        errors.push(error);
      }
    }

    // Si estamos recolectando errores y hay alguno
    if (errors.length > 0 && !config.throwOnFirstError) {
      throw new ValidationError("Errores de validación múltiples", { errors });
    }

    // Si se permiten campos adicionales
    if (config.allowExtraFields !== false) {
      for (const [field, value] of Object.entries(record)) {
        if (!schema[field]) {
          validatedRecord[field] = this.sanitizeValue(value);
        }
      }
    }

    return validatedRecord;
  }

  /**
   * Sanitiza un registro sin validación de schema
   * @param {Object} record - Registro a sanitizar
   * @returns {Object} - Registro sanitizado
   */
  sanitizeRecord(record) {
    if (!record || typeof record !== "object") {
      throw new ValidationError("El registro debe ser un objeto válido");
    }

    const sanitized = {};

    for (const [key, value] of Object.entries(record)) {
      sanitized[key] = this.sanitizeValue(value);
    }

    return sanitized;
  }

  /**
   * Valida un campo individual
   * @param {string} field - Nombre del campo
   * @param {any} value - Valor a validar
   * @param {Object} rules - Reglas de validación
   * @returns {any} - Valor validado
   */
  validateField(field, value, rules) {
    // Manejar NULL/undefined
    if (value === undefined || value === null || value === "") {
      if (rules.required) {
        throw new ValidationError(`Campo requerido: ${field}`);
      }
      return null;
    }

    // Validar según tipo
    switch (rules.type) {
      case "string":
        return this.validateString(field, value, rules);
      case "number":
        return this.validateNumber(field, value, rules);
      case "date":
        return this.validateDate(field, value, rules);
      case "boolean":
        return this.validateBoolean(field, value, rules);
      default:
        return this.sanitizeValue(value);
    }
  }

  /**
   * Valida un valor de tipo string
   * @param {string} field - Nombre del campo
   * @param {any} value - Valor a validar
   * @param {Object} rules - Reglas de validación
   * @returns {string} - String validado
   */
  validateString(field, value, rules) {
    let strValue;

    // Convertir a string si es necesario
    if (typeof value !== "string") {
      if (rules.autoConvert) {
        strValue = String(value);
      } else {
        throw new ValidationError(`Campo ${field} debe ser string`);
      }
    } else {
      strValue = value;
    }

    // Validar longitud mínima
    if (rules.minLength && strValue.length < rules.minLength) {
      throw new ValidationError(
        `Campo ${field} debe tener al menos ${rules.minLength} caracteres`
      );
    }

    // Validar longitud máxima
    if (rules.maxLength && strValue.length > rules.maxLength) {
      if (rules.truncate) {
        strValue = strValue.substring(0, rules.maxLength);
      } else {
        throw new ValidationError(
          `Campo ${field} excede longitud máxima (${rules.maxLength})`
        );
      }
    }

    // Validar pattern si existe
    if (rules.pattern && !rules.pattern.test(strValue)) {
      throw new ValidationError(
        `Campo ${field} no cumple con el patrón requerido`
      );
    }

    // Aplicar transformaciones
    if (rules.trim !== false) {
      strValue = strValue.trim();
    }

    if (rules.uppercase) {
      strValue = strValue.toUpperCase();
    }

    if (rules.lowercase) {
      strValue = strValue.toLowerCase();
    }

    return strValue;
  }

  /**
   * Valida un valor de tipo número
   * @param {string} field - Nombre del campo
   * @param {any} value - Valor a validar
   * @param {Object} rules - Reglas de validación
   * @returns {number} - Número validado
   */
  validateNumber(field, value, rules) {
    let num;

    // Convertir a número si es necesario
    if (typeof value === "string") {
      num = Number(value.replace(/[^\d.-]/g, ""));
    } else if (typeof value === "number") {
      num = value;
    } else {
      throw new ValidationError(`Campo ${field} no puede convertirse a número`);
    }

    if (isNaN(num)) {
      throw new ValidationError(`Campo ${field} no es un número válido`);
    }

    // Validar rango
    if (rules.min !== undefined && num < rules.min) {
      if (rules.clamp) {
        num = rules.min;
      } else {
        throw new ValidationError(
          `Campo ${field} debe ser mayor o igual a ${rules.min}`
        );
      }
    }

    if (rules.max !== undefined && num > rules.max) {
      if (rules.clamp) {
        num = rules.max;
      } else {
        throw new ValidationError(
          `Campo ${field} debe ser menor o igual a ${rules.max}`
        );
      }
    }

    // Validar que sea entero si se requiere
    if (rules.integer && !Number.isInteger(num)) {
      if (rules.round) {
        num = Math.round(num);
      } else {
        throw new ValidationError(`Campo ${field} debe ser un número entero`);
      }
    }

    // Aplicar precisión si se especifica
    if (rules.precision !== undefined) {
      const factor = Math.pow(10, rules.precision);
      num = Math.round(num * factor) / factor;
    }

    return num;
  }

  /**
   * Valida un valor de tipo fecha
   * @param {string} field - Nombre del campo
   * @param {any} value - Valor a validar
   * @param {Object} rules - Reglas de validación
   * @returns {Date} - Fecha validada
   */
  validateDate(field, value, rules) {
    let date;

    // Convertir a Date si es necesario
    if (value instanceof Date) {
      date = value;
    } else if (typeof value === "string") {
      date = new Date(value);
    } else if (typeof value === "number") {
      date = new Date(value);
    } else {
      throw new ValidationError(`Campo ${field} no puede convertirse a fecha`);
    }

    if (isNaN(date.getTime())) {
      throw new ValidationError(`Campo ${field} no es una fecha válida`);
    }

    // Validar rango
    if (rules.min instanceof Date && date < rules.min) {
      throw new ValidationError(
        `Campo ${field} debe ser posterior a ${rules.min.toISOString()}`
      );
    }

    if (rules.max instanceof Date && date > rules.max) {
      throw new ValidationError(
        `Campo ${field} debe ser anterior a ${rules.max.toISOString()}`
      );
    }

    return date;
  }

  /**
   * Valida un valor de tipo booleano
   * @param {string} field - Nombre del campo
   * @param {any} value - Valor a validar
   * @returns {boolean} - Booleano validado
   */
  validateBoolean(field, value) {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "string") {
      const lowerValue = value.toLowerCase().trim();
      if (["true", "yes", "y", "1", "si"].includes(lowerValue)) {
        return true;
      }
      if (["false", "no", "n", "0"].includes(lowerValue)) {
        return false;
      }
    }

    if (typeof value === "number") {
      return value !== 0;
    }

    throw new ValidationError(`Campo ${field} no puede convertirse a booleano`);
  }

  /**
   * Sanitiza un valor de cualquier tipo
   * @param {any} value - Valor a sanitizar
   * @returns {any} - Valor sanitizado
   */
  sanitizeValue(value) {
    if (value === undefined) return null;
    if (value === null) return null;
    if (value === "") return null;

    // Por tipo
    if (typeof value === "string") {
      return value.trim() === "" ? null : value.trim();
    }

    if (typeof value === "number") {
      return isNaN(value) ? 0 : value;
    }

    if (value instanceof Date) {
      return isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === "boolean") {
      return value;
    }

    if (Array.isArray(value)) {
      return value.length === 0 ? null : JSON.stringify(value);
    }

    if (typeof value === "object") {
      return Object.keys(value).length === 0 ? null : JSON.stringify(value);
    }

    // Para cualquier otro tipo
    return String(value);
  }
}

// Exportar el servicio y el error personalizado
module.exports = new ValidationService();
module.exports.ValidationError = ValidationError;
