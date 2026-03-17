const { body, param } = require("express-validator");

/**
 * Esquemas de validación para Configuración del Sistema (Scheduler)
 */
const updateSchedulerSchema = [
    body("hour")
        .optional()
        .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
        .withMessage("Formato de hora inválido. Use formato HH:MM (24 horas)"),
    body("enabled")
        .optional()
        .isBoolean()
        .withMessage("enabled debe ser un valor booleano"),
];

/**
 * Esquemas de validación para Configuración de Email
 */
const createEmailConfigSchema = [
    body("name")
        .trim()
        .notEmpty()
        .withMessage("El nombre de la configuración es obligatorio"),
    body("host")
        .trim()
        .notEmpty()
        .withMessage("El host es obligatorio"),
    body("port")
        .optional()
        .isInt({ min: 1, max: 65535 })
        .withMessage("Puerto inválido"),
    body("secure")
        .optional()
        .isBoolean(),
    body("auth.user")
        .trim()
        .notEmpty()
        .withMessage("El usuario de autenticación es obligatorio"),
    body("auth.pass")
        .trim()
        .notEmpty()
        .withMessage("La contraseña de autenticación es obligatoria"),
    body("from")
        .trim()
        .notEmpty()
        .withMessage("El campo remitente (from) es obligatorio"),
];

const testEmailSchema = [
    body("testEmail")
        .isEmail()
        .withMessage("Debe proporcionar un email de prueba válido")
        .normalizeEmail(),
];

/**
 * Esquemas de validación para Configuración de DB
 */
const upsertDBConfigSchema = [
    body("serverName")
        .trim()
        .notEmpty()
        .withMessage("El nombre del servidor es obligatorio"),
    body("type")
        .custom((value) => {
            console.log("🔍 Validando TYPE:", value, typeof value);
            const allowed = ["mssql", "mongodb", "mysql", "postgres", "mariadb", "sqlserver"];
            if (!value) return false;
            const cleanValue = String(value).trim().toLowerCase();
            return allowed.includes(cleanValue);
        })
        .withMessage("Tipo de base de datos no soportado"),
    body("host")
        .trim()
        .notEmpty()
        .withMessage("El host es obligatorio"),
    body("user")
        .trim()
        .notEmpty()
        .withMessage("El usuario es obligatorio"),
    body("password")
        .trim()
        .notEmpty()
        .withMessage("La contraseña es obligatoria"),
    body("database")
        .trim()
        .notEmpty()
        .withMessage("El nombre de la base de datos es obligatorio"),
    body("port")
        .notEmpty()
        .withMessage("El puerto es obligatorio"),
];

module.exports = {
    updateSchedulerSchema,
    createEmailConfigSchema,
    testEmailSchema,
    upsertDBConfigSchema,
};
