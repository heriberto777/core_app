const { validationResult } = require("express-validator");
const logger = require("../services/logger");

/**
 * Middleware genérico para capturar errores de express-validator.
 * Si hay errores, detiene la petición y responde con 400.
 */
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (errors.isEmpty()) {
        return next();
    }

    const extractedErrors = [];
    errors.array().map((err) => {
        extractedErrors.push({
            path: err.path || err.param,
            message: err.msg,
            value: err.value,
            location: err.location
        });
    });

    logger.warn(`⚠️ Error de validación en ${req.originalUrl}:`, {
        errorsCount: extractedErrors.length,
        errors: extractedErrors,
        body: req.body,
        method: req.method
    });

    return res.status(400).json({
        success: false,
        message: "Error de validación de datos",
        errors: extractedErrors,
    });
};

module.exports = {
    validate,
};
