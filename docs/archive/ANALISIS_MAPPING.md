# 📊 ANÁLISIS PROFUNDO: LÓGICA DE MAPPING

**Fecha:** 2026-05-18  
**Objetivo:** Análisis exhaustivo de la arquitectura de mapping del sistema

---

## 🏗️ ARQUITECTURA GENERAL

### Flujo de Datos en Mappings

```
┌─────────────────────────────────────────────────────────────────┐
│                    LAYER DE USUARIO (FRONTEND)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  MappingEditor.jsx → useMappingEditor.jsx                       │
│         ↓                                                        │
│  FieldMappingModal / ValueMappingModal                           │
│         ↓                                                        │
│  useMappingEditor hooks (handleChange, handleSave)               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                    LAYER DE NEGOCIO (HOOKS)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  useMappingEditor:                                              │
│  - Normalización de campos (lineas 106-122)                    │
│  - Validaciones (nombre, tableConfigs)                          │
│  - Asignación automática de consecutivos (lineas 132-152)       │
│  - CRUD operations                                              │
│                                                                  │
│  usePromotionConfig:                                            │
│  - Gestión de reglas de promoción                              │
│  - handleDetectFieldChange / handleTargetFieldChange            │
│  - addRule / editRule / deleteRule                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                    LAYER DE API (NETWORK)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  MappingApi:                                                    │
│  - getMappings, getMappingById                                  │
│  - createMapping, updateMapping, deleteMapping                  │
│  - getDocumentsByMapping                                        │
│  - validateBonificationConfig                                   │
│  - queryDynamicFieldValue                                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                    LAYER DE BACKEND (SERVIDOR)                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Backend Routes:                                                │
│  - /api/mappings/:id                                            │
│  - /api/mappings/:id/documents                                  │
│  - /api/mappings/:id/process                                    │
│  - /api/mappings/:id/query-dynamic-value                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔍 PUNTOS CRÍTICOS IDENTIFICADOS

### 1. NORMALIZACIÓN DE CAMPOS (useMappingEditor.jsx:106-122)

```javascript
mappingCopy.tableConfigs.forEach(table => {
    table.fieldMappings?.forEach(field => {
        field.isEditable = field.isEditable !== false;
        field.showInList = field.showInList === true;
        field.displayOrder = field.displayOrder || 0;
        field.fieldType = field.fieldType || field.valueType || "text";
        field.valueType = field.valueType || field.fieldType || "text";
        if (field.fieldType !== "select") field.options = null;
        
        // Evitar CastError en Mongoose
        if (!field.isConsecutive || !field.consecutiveId) {
            field.consecutiveId = null;
            field.isConsecutive = false;
        }
    });
});
```

**⚠️ PROBLEMAS IDENTIFICADOS:**

1. **Lógica de `isConsecutive` y `consecutiveId`**
   - La condición `!field.isConsecutive || !field.consecutiveId` puede causar problemas
   - Si `isConsecutive` es `false`, `consecutiveId` se fuerza a `null` ✅
   - Si `isConsecutive` es `true` pero `consecutiveId` está vacío, no se asigna ❌
   - **Recomendación:** Verificar que `consecutiveId` tenga valor si `isConsecutive === true`

2. **Normalización de `fieldType` y `valueType`**
   - `fieldType` y `valueType` usan el mismo valor por defecto (`"text"`)
   - Esto puede causar inconsistencias si el backend espera diferentes valores

3. **`isEditable` y `showInList`**
   - `isEditable` se fuerza a `true` si no es `false`
   - `showInList` se fuerza a `false` si no es `true`
   - Esto puede sobrescribir intencionalmente configuradas por el usuario

---

### 2. GESTIÓN DE CONSECUTIVOS (useMappingEditor.jsx:132-152)

```javascript
if (!isEditing && mapping.consecutiveConfig?.pendingAssignmentId && result.data?._id) {
    try {
        await consecutiveApi.assignConsecutive(accessToken, mapping.consecutiveConfig.pendingAssignmentId, {
            entityType: "mapping",
            entityId: result.data._id,
            allowedOperations: ["read", "increment"]
        });
        console.log("Consecutivo vinculado automáticamente tras creación");
    } catch (assignError) {
        console.error("Error en vinculación automática:", assignError);
        Swal.fire({
            icon: "warning",
            title: "Mapping Creado",
            text: "El mapeo se creó, pero hubo un problema vinculando el consecutivo.",
        });
        if (onSave) onSave(result);
        return;
    }
}
```

**✅ MEJORES:**
- Asignación automática al crear mapping
- Manejo de errores sin bloquear la creación
- Información clara al usuario

**⚠️ MEJORAS RECOMENDADAS:**
1. **Validación pre-creación:** Verificar que el consecutivo existe antes de intentar asignar
2. **Logging detallado:** Registrar en qué falló la asignación
3. **Retry logic:** Intentar asignar de nuevo si falló por timeout

---

### 3. REGLAS DE PROMOCIÓN (usePromotionConfig.js:50-117)

```javascript
const addRule = async () => {
    const { value: formValues } = await Swal.fire({
        // ... configuración del modal
        preConfirm: () => {
            const name = document.getElementById("ruleName").value;
            const type = document.getElementById("ruleType").value;
            // ...
            return { name, type, description, priority, enabled, isOneTime, conditions: {}, actions: {} };
        },
    });
    
    if (formValues) {
        const newRules = [...rules, formValues];
        setRules(newRules);
        updatePromotionConfig({ rules: newRules });
    }
};
```

**⚠️ PROBLEMAS CRÍTICOS:**

1. **`conditions` y `actions` vacíos**
   - Las reglas se crean con `conditions: {}` y `actions: {}` vacíos
   - Esto significa que **NADIE** puede aplicar la regla
   - **Impacto:** Promociones configuradas pero inoperantes

2. **Falta de validación de tipo**
   - No se valida que el tipo de promoción sea válido
   - El backend podría rechazar la regla con error genérico

3. **Edición no guarda cambios en `conditions`/`actions`**
   - `editRule` solo actualiza los campos básicos
   - Si se editan `conditions` o `actions`, se pierden

---

### 4. TRANSFORMACIÓN DE CAMPOS (FieldMappingModal.jsx)

```javascript
// En handleSubmit (linea 127-137)
const handleSubmit = async () => {
    if (!formData.targetField) return;
    setLoading(true);
    try {
        const dataToSave = { ...formData, fieldType: formData.valueType };
        await onSave(dataToSave);
        onClose();
    } finally {
        setLoading(false);
    }
};
```

**⚠️ PROBLEMAS:**

1. **Transformación no se guarda correctamente**
   - `formData.transform` se pierde al hacer `...formData`
   - Solo se guarda `fieldType` (linea 131)
   - **Resultado:** Transformaciones configuradas se pierden al guardar

2. **`defaultValue` duplicado**
   - `formData.defaultValue` (linea 224)
   - `formData.transform.defaultValue` (linea 380)
   - No está claro cuál prevalece

---

### 5. LOOKUP Y VALIDACIÓN

```javascript
// FieldMappingModal.jsx:245-289
if (!formData.lookupFromTarget) {
    // Transformación simple
} else {
    // Configuración de consulta (Lookup)
}
```

**⚠️ PROBLEMAS:**

1. **Lookup Query no se valida**
   - El usuario puede ingresar SQL inválido
   - No hay validación de sintaxis SQL
   - No hay validación de tablas/columnas existentes

2. **`validateExistence` y `failIfNotFound`**
   - Estas opciones se definen pero no se usan en el backend
   - No hay lógica para manejar casos donde el registro no existe

---

## 📋 RESUMEN DE PROBLEMAS CRÍTICOS

| # | Problema | Impacto | Sección |
|---|----------|---------|---------|
| 1 | `conditions` y `actions` vacíos en reglas de promoción | Promociones inoperantes | usePromotionConfig.js |
| 2 | `formData.transform` no se guarda en FieldMappingModal | Transformaciones perdidas | FieldMappingModal.jsx |
| 3 | `isConsecutive` sin `consecutiveId` válido | Consecutivos no se asignan | useMappingEditor.jsx |
| 4 | Lookup SQL no validado | Errores en backend | FieldMappingModal.jsx |
| 5 | `fieldType` y `valueType` con mismo default | Inconsistencias | useMappingEditor.jsx |

---

## ✅ RECOMENDACIONES DE MEJORA

### Prioridad ALTA

1. **Guardar `transform` en FieldMappingModal**
   ```javascript
   const dataToSave = { 
       ...formData, 
       fieldType: formData.valueType,
       transform: formData.transform || {}
   };
   ```

2. **Validar reglas de promoción antes de guardar**
   ```javascript
   if (!formValues.conditions || !formValues.actions) {
       Swal.fire("Error", "Las condiciones y acciones son requeridas");
       return;
   }
   ```

3. **Verificar consecutivo antes de asignar**
   ```javascript
   try {
       const consecutive = await consecutiveApi.getConsecutiveById(accessToken, pendingAssignmentId);
       if (!consecutive) {
           throw new Error("Consecutivo no encontrado");
       }
   } catch (error) {
       Swal.fire("Error", "Consecutivo inválido");
       return;
   }
   ```

### Prioridad MEDIA

4. **Validar SQL en Lookup**
   - Usar librería como `sql-validator`
   - Validar tablas y columnas existen

5. **Manejar `conditions` y `actions` en editRule**
   ```javascript
   return { 
       ...rule, 
       name, type, description, priority, enabled, isOneTime,
       conditions: formValues.conditions || {},
       actions: formValues.actions || {}
   };
   ```

6. **Logging detallado de errores de consecutivo**
   - Registrar en qué falló
   - Proporcionar ID del consecutivo para debugging

### Prioridad BAJA

7. **Normalización de `fieldType` y `valueType`**
   - Definir valores válidos explícitos
   - Documentar qué valor prevalece

8. **Validación de Lookup params**
   - Verificar que `sourceField` existe en la tabla origen
   - Validar formato de `@parametro`

---

## 🎯 CONCLUSIÓN

La lógica de mapping es **funcionalmente completa** pero tiene **brechas críticas** en:

1. **Persistencia de transformaciones** (FieldMappingModal)
2. **Validación de reglas de promoción** (usePromotionConfig)
3. **Manejo de consecutivos** (useMappingEditor)

Estos problemas podrían causar:
- ❌ Promociones que no se aplican
- ❌ Transformaciones perdidas en producción
- ❌ Consecutivos no asignados correctamente

**Recomendación:** Priorizar la corrección de los problemas de ALTA prioridad antes de considerar la migración completa.
