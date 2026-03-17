const { body, param, query } = require("express-validator");

/**
 * Esquemas de validación para el controlador de Usuarios
 */
const createUserSchema = [
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
    body("roles")
        .optional()
        .isArray()
        .withMessage("Los roles deben ser un array de IDs"),
    body("isAdmin")
        .optional()
        .isBoolean()
        .withMessage("isAdmin debe ser un valor booleano"),
];

const updateUserSchema = [
    param("id")
        .isMongoId()
        .withMessage("ID de usuario inválido"),
    body("name")
        .optional()
        .trim()
        .notEmpty()
        .withMessage("El nombre no puede estar vacío"),
    body("lastname")
        .optional()
        .trim()
        .notEmpty()
        .withMessage("El apellido no puede estar vacío"),
    body("email")
        .optional()
        .isEmail()
        .withMessage("Debe proporcionar un email válido")
        .normalizeEmail(),
    body("roles")
        .optional()
        .isArray()
        .withMessage("Los roles deben ser un array de IDs"),
    body("activo")
        .optional()
        .isBoolean()
        .withMessage("activo debe ser un valor booleano"),
];

const getUsersSchema = [
    body("page")
        .optional()
        .isInt({ min: 1 })
        .toInt(),
    body("limit")
        .optional()
        .isInt({ min: 1, max: 100 })
        .toInt(),
    body("activo")
        .optional()
        .custom((value) => value === "true" || value === "false" || typeof value === "boolean")
        .withMessage("El campo activo debe ser booleano o string 'true'/'false'"),
];

const updateRolesSchema = [
    param("id")
        .isMongoId()
        .withMessage("ID de usuario inválido"),
    body("roles")
        .isArray({ min: 1 })
        .withMessage("Debe proporcionar al menos un rol"),
];

module.exports = {
    createUserSchema,
    updateUserSchema,
    getUsersSchema,
    updateRolesSchema,
};
