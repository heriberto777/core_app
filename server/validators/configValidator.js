const { body, param } = require("express-validator");

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

// El formulario de edición omite auth.pass a propósito cuando el usuario no
// quiere cambiarla (para no sobrescribir la contraseña guardada con un valor
// vacío); createEmailConfigSchema exige auth.pass siempre, así que reusarlo en
// la ruta PUT hacía fallar toda edición que no reingresara la contraseña.
const updateEmailConfigSchema = [
    body("name")
        .optional()
        .trim()
        .notEmpty()
        .withMessage("El nombre de la configuración es obligatorio"),
    body("host")
        .optional()
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
        .optional()
        .trim()
        .notEmpty()
        .withMessage("El usuario de autenticación es obligatorio"),
    body("auth.pass")
        .optional()
        .trim()
        .notEmpty()
        .withMessage("La contraseña de autenticación no puede quedar vacía si se envía"),
    body("from")
        .optional()
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
            // Debe coincidir exactamente con el enum real de dbConfigModel.js;
            // "sqlserver" se aceptaba aquí pero el modelo lo rechazaba siempre.
            const allowed = ["mssql", "mongodb", "mysql", "postgres", "mariadb"];
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
    createEmailConfigSchema,
    updateEmailConfigSchema,
    testEmailSchema,
    upsertDBConfigSchema,
};
