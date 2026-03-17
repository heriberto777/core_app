const { body } = require("express-validator");

/**
 * Esquemas de validación para el controlador de Autenticación
 */
const loginSchema = [
    body("email")
        .isEmail()
        .withMessage("Debe proporcionar un email válido")
        .normalizeEmail(),
    body("password")
        .notEmpty()
        .withMessage("La contraseña es obligatoria"),
];

const registerSchema = [
    body("name")
        .trim()
        .notEmpty()
        .withMessage("El nombre es obligatorio"),
    body("lastname")
        .trim()
        .notEmpty()
        .withMessage("El apellido es obligatorio"),
    body("email")
        .isEmail()
        .withMessage("Debe proporcionar un email válido")
        .normalizeEmail(),
    body("password")
        .isLength({ min: 6 })
        .withMessage("La contraseña debe tener al menos 6 caracteres"),
];

const refreshTokenSchema = [
    body("token")
        .notEmpty()
        .withMessage("El token de refresh es obligatorio"),
];

module.exports = {
    loginSchema,
    registerSchema,
    refreshTokenSchema,
};
