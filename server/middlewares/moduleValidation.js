const { body, param, query } = require("express-validator");

const moduleValidation = {
  // ⭐ VALIDACIÓN PARA CREAR MÓDULO ⭐
  createModule: [
    body("name")
      .isLength({ min: 2, max: 50 })
      .withMessage("El nombre debe tener entre 2 y 50 caracteres")
      .matches(/^[a-z0-9_-]+$/)
      .withMessage(
        "El nombre solo puede contener letras minúsculas, números, guiones y guiones bajos"
      )
      .custom(async (value) => {
        const ModuleConfig = require("../models/moduleConfigModel");
        const existingModule = await ModuleConfig.findOne({
          name: value.toLowerCase(),
        });
        if (existingModule) {
          throw new Error("Ya existe un módulo con ese nombre");
        }
        return true;
      }),

    body("displayName")
      .isLength({ min: 2, max: 100 })
      .withMessage("El nombre para mostrar debe tener entre 2 y 100 caracteres")
      .trim(),

    body("description")
      .optional()
      .isLength({ max: 500 })
      .withMessage("La descripción no puede exceder 500 caracteres")
      .trim(),

    body("resource")
      .isLength({ min: 2, max: 50 })
      .withMessage("El recurso debe tener entre 2 y 50 caracteres")
      .matches(/^[a-z0-9_]+$/)
      .withMessage(
        "El recurso solo puede contener letras minúsculas, números y guiones bajos"
      ),

    body("actions")
      .isArray({ min: 1 })
      .withMessage("Debe especificar al menos una acción"),

    body("actions.*.name")
      .isIn([
        "create",
        "read",
        "update",
        "delete",
        "execute",
        "manage",
        "export",
        "import",
        "approve",
      ])
      .withMessage("Acción no válida"),

    body("actions.*.displayName")
      .isLength({ min: 1, max: 50 })
      .withMessage("El nombre de la acción debe tener entre 1 y 50 caracteres"),

    body("actions.*.isDefault")
      .optional()
      .isBoolean()
      .withMessage("isDefault debe ser un valor booleano"),

    body("routes")
      .optional()
      .isArray()
      .withMessage("Las rutas deben ser un array"),

    body("routes.*.path")
      .matches(/^\/[a-z0-9\/-]*$/)
      .withMessage(
        "La ruta debe comenzar con / y contener solo caracteres válidos"
      ),

    body("routes.*.method")
      .optional()
      .isIn(["GET", "POST", "PUT", "DELETE"])
      .withMessage("Método HTTP no válido"),

    body("uiConfig.icon")
      .optional()
      .isLength({ max: 50 })
      .withMessage("El icono no puede exceder 50 caracteres"),

    body("uiConfig.color")
      .optional()
      .matches(/^#[0-9A-F]{6}$/i)
      .withMessage("El color debe ser un código hexadecimal válido"),

    body("uiConfig.category")
      .optional()
      .isIn(["operational", "administrative", "analytical", "configuration"])
      .withMessage("Categoría no válida"),

    body("uiConfig.order")
      .optional()
      .isInt({ min: 0, max: 1000 })
      .withMessage("El orden debe ser un número entre 0 y 1000"),

    body("restrictions.requireAdmin")
      .optional()
      .isBoolean()
      .withMessage("requireAdmin debe ser un valor booleano"),

    body("restrictions.minimumRole")
      .optional()
      .isIn(["guest", "user", "editor", "manager", "admin"])
      .withMessage("Rol mínimo no válido"),
  ],

  // ⭐ VALIDACIÓN PARA ACTUALIZAR MÓDULO ⭐
  updateModule: [
    param("id").isMongoId().withMessage("ID de módulo no válido"),

    body("name")
      .optional()
      .isLength({ min: 2, max: 50 })
      .withMessage("El nombre debe tener entre 2 y 50 caracteres")
      .matches(/^[a-z0-9_-]+$/)
      .withMessage(
        "El nombre solo puede contener letras minúsculas, números, guiones y guiones bajos"
      ),

    body("displayName")
      .optional()
      .isLength({ min: 2, max: 100 })
      .withMessage("El nombre para mostrar debe tener entre 2 y 100 caracteres")
      .trim(),

    body("description")
      .optional()
      .isLength({ max: 500 })
      .withMessage("La descripción no puede exceder 500 caracteres")
      .trim(),

    body("resource")
      .optional()
      .isLength({ min: 2, max: 50 })
      .withMessage("El recurso debe tener entre 2 y 50 caracteres")
      .matches(/^[a-z0-9_]+$/)
      .withMessage(
        "El recurso solo puede contener letras minúsculas, números y guiones bajos"
      ),

    // Validaciones similares a createModule para campos opcionales...
  ],

  // ⭐ VALIDACIÓN PARA PARÁMETROS ID ⭐
  validateId: [param("id").isMongoId().withMessage("ID no válido")],

  // ⭐ VALIDACIÓN PARA BÚSQUEDA ⭐
  searchValidation: [
    param("term")
      .isLength({ min: 1, max: 100 })
      .withMessage("El término de búsqueda debe tener entre 1 y 100 caracteres")
      .trim(),

    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("El límite debe estar entre 1 y 100"),
  ],

  // ⭐ VALIDACIÓN PARA DUPLICAR MÓDULO ⭐
  duplicateModule: [
    param("id").isMongoId().withMessage("ID de módulo no válido"),

    body("newName")
      .isLength({ min: 2, max: 50 })
      .withMessage("El nuevo nombre debe tener entre 2 y 50 caracteres")
      .matches(/^[a-z0-9_-]+$/)
      .withMessage(
        "El nombre solo puede contener letras minúsculas, números, guiones y guiones bajos"
      ),

    body("newDisplayName")
      .isLength({ min: 2, max: 100 })
      .withMessage(
        "El nuevo nombre para mostrar debe tener entre 2 y 100 caracteres"
      )
      .trim(),
  ],

  // ⭐ VALIDACIÓN PARA QUERY PARAMETERS ⭐
  queryValidation: [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("La página debe ser un número mayor a 0"),

    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("El límite debe estar entre 1 y 100"),

    query("category")
      .optional()
      .isIn([
        "operational",
        "administrative",
        "analytical",
        "configuration",
        "all",
      ])
      .withMessage("Categoría no válida"),

    query("active")
      .optional()
      .isIn(["true", "false", "all"])
      .withMessage("El parámetro active debe ser true, false o all"),

    query("sortBy")
      .optional()
      .isIn([
        "name",
        "displayName",
        "createdAt",
        "updatedAt",
        "uiConfig.order",
        "uiConfig.category",
      ])
      .withMessage("Campo de ordenamiento no válido"),

    query("sortOrder")
      .optional()
      .isIn(["asc", "desc"])
      .withMessage("Orden debe ser asc o desc"),
  ],
};

module.exports = moduleValidation;
