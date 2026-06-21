const { body, param } = require("express-validator");

/**
 * Esquemas de validación para el controlador de Roles
 */
const createRoleSchema = [
    body("name")
        .trim()
        .notEmpty()
        .withMessage("El nombre interno del rol es obligatorio")
        .matches(/^[a-z0-9-_]+$/)
        .withMessage("El nombre solo puede contener letras minúsculas, números, guiones y guiones bajos"),
    body("displayName")
        .trim()
        .notEmpty()
        .withMessage("El nombre para mostrar es obligatorio"),
    body("description")
        .optional()
        .trim(),
    body("permissions")
        .isArray({ min: 1 })
        .withMessage("Debe asignar al menos un permiso"),
    body("permissions.*.resource")
        .notEmpty()
        .withMessage("Cada permiso debe tener un recurso"),
    body("permissions.*.actions")
        .isArray({ min: 1 })
        .withMessage("Cada recurso debe tener al menos una acción"),
];

const updateRoleSchema = [
    param("id")
        .isMongoId()
        .withMessage("ID de rol inválido"),
    body("name")
        .optional()
        .trim()
        .matches(/^[a-z0-9-_]+$/)
        .withMessage("El nombre solo puede contener letras minúsculas, números, guiones y guiones bajos"),
    body("displayName")
        .optional()
        .trim()
        .notEmpty()
        .withMessage("El nombre para mostrar no puede estar vacío"),
    body("permissions")
        .optional()
        .isArray({ min: 1 })
        .withMessage("Debe asignar al menos un permiso si se modifica este campo"),
];

const assignUsersSchema = [
    body("roleId")
        .isMongoId()
        .withMessage("ID de rol inválido"),
    body("userIds")
        .isArray({ min: 1 })
        .withMessage("Debe proporcionar una lista de IDs de usuario"),
    body("userIds.*")
        .isMongoId()
        .withMessage("Cada ID de usuario debe ser un MongoID válido"),
];

const toggleStatusSchema = [
    param("id")
        .isMongoId()
        .withMessage("ID de rol inválido"),
    body("isActive")
        .isBoolean()
        .withMessage("isActive debe ser un valor booleano"),
];

module.exports = {
    createRoleSchema,
    updateRoleSchema,
    assignUsersSchema,
    toggleStatusSchema,
};
