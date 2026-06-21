/**
 * transformerService.js
 * Servicio de transformación de valores según configuración del mapping
 * 
 * Transforma valores según el tipo de dato y configuración especificada en el campo del mapping
 */

const logger = require("./logger");

/**
 * Detecta si un valor es una fecha de JavaScript (string ISO largo) y lo transforma
 * Esta función actúa como respaldo automático cuando no hay configuración de transformación
 * @param {*} value - Valor a verificar
 * @returns {*} Valor transformado o original
 */
function autoDetectAndTransformDate(value) {
  if (value === null || value === undefined) {
    return value;
  }

  const valueStr = String(value);
  
  // Detectar formato de fecha de JavaScript: "Mon Apr 06 2026 20:00:00 GMT-0400"
  const jsDatePattern = /^[A-Z][a-z]{2}\s[A-Z][a-z]{2}\s\d{1,2}\s\d{4}\s\d{2}:\d{2}:\d{2}\sGMT/;
  
  if (jsDatePattern.test(valueStr)) {
    try {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        // Convertir a formato SQL Server: YYYY-MM-DD
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      }
    } catch (e) {
      // Si falla, retornar valor original
    }
  }

  // También detectar timestamps Unix (número grande)
  if (typeof value === "number" && value > 1000000000000 && value < 10000000000000) {
    try {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      }
    } catch (e) {
      // Si falla, retornar valor original
    }
  }

  return value;
}

/**
 * Transforma un valor según la configuración de transformación
 * @param {*} value - Valor original
 * @param {Object} transformConfig - Configuración de transformación del campo
 * @returns {*} Valor transformado
 */
function transformValue(value, transformConfig) {
  // Si no hay configuración, intentar transformación automática de fechas
  if (!transformConfig || typeof transformConfig !== "object") {
    return autoDetectAndTransformDate(value);
  }

  // Si hay configuración pero no tiene transformType, también intentar auto-detectar
  if (!transformConfig.transformType) {
    return autoDetectAndTransformDate(value);
  }

  // Si el valor es null o undefined, aplicar defaultValue si existe
  if (value === null || value === undefined) {
    if (transformConfig.defaultValue !== undefined) {
      return transformConfig.defaultValue;
    }
    return value;
  }

  const { transformType } = transformConfig;

  try {
    switch (transformType) {
      case "string":
        return transformString(value, transformConfig);
      case "number":
        return transformNumber(value, transformConfig);
      case "date":
        return transformDate(value, transformConfig);
      case "datetime":
        return transformDatetime(value, transformConfig);
      case "boolean":
        return transformBoolean(value, transformConfig);
      default:
        return value;
    }
  } catch (error) {
    logger.debug(`Error transformando valor: ${error.message}`, {
      transformType,
      originalValue: String(value).substring(0, 100),
    });
    return value;
  }
}

/**
 * Transforma un valor string
 */
function transformString(value, config) {
  let result = String(value);

  if (config.toUpperCase) {
    result = result.toUpperCase();
  }

  if (config.toLowerCase) {
    result = result.toLowerCase();
  }

  if (config.trim) {
    result = result.trim();
  }

  if (config.maxLength && result.length > config.maxLength) {
    result = result.substring(0, config.maxLength);
  }

  return result;
}

/**
 * Transforma un valor numérico
 */
function transformNumber(value, config) {
  let num = parseFloat(value);

  if (isNaN(num)) {
    logger.debug(`Valor numérico inválido: ${value}`);
    return value;
  }

  const decimalPlaces = config.decimalPlaces ?? 2;

  // Redondear según decimales especificados
  num = Math.round(num * Math.pow(10, decimalPlaces)) / Math.pow(10, decimalPlaces);

  // Formatear con separador de miles si está habilitado
  if (config.thousandsSeparator) {
    return num.toLocaleString("en-US", {
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces,
    });
  }

  // Retornar como número o string según necesidad
  return decimalPlaces > 0 ? num.toFixed(decimalPlaces) : num.toString();
}

/**
 * Transforma una fecha (sin hora)
 */
function transformDate(value, config) {
  const dateFormat = config.dateFormat || "YYYY-MM-DD";
  return formatDate(value, dateFormat);
}

/**
 * Transforma una fecha con hora
 */
function transformDatetime(value, config) {
  const datetimeFormat = config.datetimeFormat || "YYYY-MM-DDTHH:MM:SS";
  return formatDate(value, datetimeFormat);
}

/**
 * Formatea una fecha según el formato especificado
 */
function formatDate(value, format) {
  let date;

  // Convertir a objeto Date
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === "string") {
    // Intentar parsear el string de fecha
    date = new Date(value);
    if (isNaN(date.getTime())) {
      // Si falla, intentar otros formatos comunes
      const match = value.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        date = new Date(match[1], match[2] - 1, match[3]);
      } else {
        logger.debug(`No se pudo parsear la fecha: ${value}`);
        return value;
      }
    }
  } else {
    return value;
  }

  if (isNaN(date.getTime())) {
    return value;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  switch (format) {
    case "YYYY-MM-DD":
      return `${year}-${month}-${day}`;
    case "DD/MM/YYYY":
      return `${day}/${month}/${year}`;
    case "MM/DD/YYYY":
      return `${month}/${day}/${year}`;
    case "DD-MM-YYYY":
      return `${day}-${month}-${year}`;
    case "YYYY-MM-DDTHH:MM:SS":
      return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
    case "YYYY-MM-DD HH:MM:SS":
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    case "YYYY-MM-DD 00:00:00.000":
      return `${year}-${month}-${day} 00:00:00.000`;
    case "DD/MM/YYYY HH:MM":
      return `${day}/${month}/${year} ${hours}:${minutes}`;
    default:
      return `${year}-${month}-${day}`;
  }
}

/**
 * Transforma un valor booleano
 */
function transformBoolean(value, config) {
  const trueValues = config.trueValues || ["S", "Y", "1", "true"];
  const falseValues = config.falseValues || ["N", "0", "false"];
  const trueOutput = config.trueOutput || "S";
  const falseOutput = config.falseOutput || "N";

  // Convertir valor a string para comparar
  const strValue = String(value).trim();

  if (trueValues.includes(strValue)) {
    return trueOutput;
  }

  if (falseValues.includes(strValue)) {
    return falseOutput;
  }

  // Si no coincide con ningún valor, retornar el valor original o el falseOutput
  return falseOutput;
}

/**
 * Transforma un objeto completo según su configuración de campos
 * @param {Object} data - Objeto con los datos a transformar
 * @param {Array} fieldMappings - Arreglo de configuraciones de campo del mapping
 * @returns {Object} Objeto transformado
 */
function transformDataObject(data, fieldMappings) {
  if (!data || typeof data !== "object") {
    return data;
  }

  if (!Array.isArray(fieldMappings) || fieldMappings.length === 0) {
    return data;
  }

  const result = {};

  for (const fieldMapping of fieldMappings) {
    const { sourceField, targetField, transform: transformConfig } = fieldMapping;

    if (!targetField) continue;

    // Obtener el valor del campo origen
    const value = sourceField ? data[sourceField] : data[targetField];

    // Aplicar transformación si existe configuración
    if (transformConfig && transformConfig.transformType) {
      result[targetField] = transformValue(value, transformConfig);
    } else {
      // Si no hay transformación, usar el valor original
      result[targetField] = value;
    }
  }

  return result;
}

/**
 * Valida que un valor cumpla con las restricciones del campo
 * @param {*} value - Valor a validar
 * @param {Object} config - Configuración del campo
 * @returns {Object} { valid: boolean, error?: string }
 */
function validateField(value, config) {
  if (!config) {
    return { valid: true };
  }

  // Validar requerido
  if (config.isRequired && (value === null || value === undefined || value === "")) {
    return { valid: false, error: "Campo requerido" };
  }

  // Validar longitud máxima para strings
  if (config.transform?.maxLength && typeof value === "string") {
    if (value.length > config.transform.maxLength) {
      return {
        valid: false,
        error: `Longitud máxima excedida: ${value.length} > ${config.transform.maxLength}`,
      };
    }
  }

  // Validar número
  if (config.transform?.transformType === "number" && value !== null && value !== undefined) {
    const num = parseFloat(value);
    if (isNaN(num)) {
      return { valid: false, error: "Valor numérico inválido" };
    }
  }

  return { valid: true };
}

module.exports = {
  transformValue,
  transformDataObject,
  validateField,
  // Exportar funciones utilitarias para testing
  transformString,
  transformNumber,
  transformDate,
  transformDatetime,
  transformBoolean,
  formatDate,
};