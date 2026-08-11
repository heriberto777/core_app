# 📊 ANÁLISIS PROFUNDO: MAPPINGS Y HIJOS (CONSECUTIVOS) - ESTADO ACTUAL

**Fecha:** 2026-05-18  
**Estado:** REVISADO POST-CORRECCIONES  
**Objetivo:** Actualización del análisis exhaustivo de la arquitectura de Mappings y sus hijos (consecutivos, promociones)

---

## ✅ CORRECCIONES APLICADAS (ÚLTIMAS COMMITS)

### 1. Normalización de Campos ✅ SOLUCIONADO
**Archivo:** `useMappingEditor.jsx` (lineas 112-122)

**Estado:** CORREGIDO

```javascript
// Antes (PROBLEMA):
field.fieldType = field.fieldType || "text";
field.valueType = field.valueType || "text";
if (!field.isConsecutive || !field.consecutiveId) {
    field.consecutiveId = null;
    field.isConsecutive = false;
}

// Después (SOLUCIÓN):
field.fieldType = field.fieldType || "text";
field.valueType = field.valueType || "string";  // ✅ Default distinto
if (!field.isConsecutive || !field.consecutiveId) {
    field.consecutiveId = null;
    field.isConsecutive = false;  // ✅ Validación correcta
}
```

**Impacto:** Se evita inconsistencia entre `fieldType` y `valueType`, y se previene CastError en Mongoose.

---

### 2. Asignación Automática de Consecutivos ✅ MEJORADO
**Archivo:** `useMappingEditor.jsx` (lineas 135-153)

**Estado:** MEJORADO

```javascript
// Antes: Error bloqueante confuso
if (onSave) onSave(result);
return;  // ❌ Bloquea creación del mapping

// Después: Error no bloqueante con referencia clara
console.error("Error en vinculación automática:", assignError);
Swal.fire({
    icon: "warning",
    title: "Mapping Creado",
    text: "El mapeo se creó, pero hubo un problema vinculando el consecutivo. Por favor, verifique la pestaña de consecutivos.",
});
if (onSave) onSave(result);  // ✅ No bloquea
return;
```

**Impacto:** El mapping se crea exitosamente aunque haya problema con consecutivo.

---

### 3. Conditions y Actions con Valores por Defecto ✅ SOLUCIONADO
**Archivo:** `usePromotionConfig.js` (lineas 115-132)

**Estado:** CORREGIDO

```javascript
// Antes: Objeto vacío
conditions: {},
actions: {}
// ❌ Promociones inoperantes

// Después: Valores por defecto basados en detectFields/targetFields
conditions: {
    detectFields: {
        bonusField: promotionConfig.detectFields?.bonusField || "ART_BON",
        referenceField: promotionConfig.detectFields?.referenceField || "COD_ART_RFR",
        discountField: promotionConfig.detectFields?.discountField || "MON_DSC"
    },
    targetFields: {
        bonusLineRef: promotionConfig.targetFields?.bonusLineRef || "PEDIDO_LINEA_BONIF",
        orderedQuantity: promotionConfig.targetFields?.orderedQuantity || "CANTIDAD_PEDIDA",
        bonusQuantity: promotionConfig.targetFields?.bonusQuantity || "CANTIDAD_BONIF"
    }
},
actions: {
    bonusField: promotionConfig.detectFields?.bonusField || "ART_BON",
    bonusFieldValue: promotionConfig.detectFields?.discountField || "MON_DSC",
    targetField: promotionConfig.targetFields?.bonusLineRef || "PEDIDO_LINEA_BONIF",
    targetFieldValue: promotionConfig.targetFields?.orderedQuantity || "CANTIDAD_PEDIDA"
}
// ✅ Reglas aplicables inmediatamente
```

**Impacto:** Las reglas de promoción ya no se crean con objetos vacíos.

---

## 🔍 ANÁLISIS DETALLADO POR COMPONENTE (POST-CORRECCIÓN)

### 1. MappingsList.jsx
**Estado:** ✅ SOLIDO

- Diseño moderno con TailwindCSS
- Búsqueda por nombre/descripción
- Acciones CRUD completas
- Badge de estado visual
- ⚠️ TransferType muestra pero no se usa en lógica (info, no crítico)

---

### 2. MappingEditor.jsx
**Estado:** ⚠️ PUNTOS DE MEJORA

- Tablas organizadas por pestañas
- Expansión dinámica de tablas
- Integración con modales

**Puntos no resueltos:**
- PromotionConfigSection pasados como props pero no usados en lógica
- ConsecutiveConfigSection pasados pero la lógica está en el mismo archivo
- WorkflowConfigSection no se muestra en UI (pestaña workflow vacía)

---

### 3. useMappingEditor.jsx
**Estado:** ✅ PRINCIPAL CORREGIDO

- ✅ Normalización de campos (lineas 106-124) - **CORREGIDO**
- ✅ Asignación automática de consecutivos (lineas 132-152) - **MEJORADO**
- ✅ CRUD helpers para tablas, campos, reglas, dependencias
- ✅ Manejo de value mappings dentro de campos

**Puntos pendientes:**
- No se valida que el consecutivo existe antes de asignar (en ConsecutiveConfigSection.jsx)
- No se valida que el consecutivo esté activo
- No se valida que el mapping exista en lista de asignables

---

### 4. FieldMappingModal.jsx
**Estado:** ⚠️ PROBLEMA PENDING

**PROBLEMA: Transformación no se guarda (linea 157)**

```javascript
const handleSubmit = async () => {
    if (!formData.targetField) return;
    setLoading(true);
    try {
        const dataToSave = {
            ...formData,
            fieldType: formData.valueType,
            transform: formData.transform || {}  // ❌ formData.transform se pierde
        };
        await onSave(dataToSave);
        onClose();
    } finally {
        setLoading(false);
    }
};
```

**Impacto:** Transformaciones definidas en el modal se pierden al guardar.

**Solución requerida:**
```javascript
const dataToSave = {
    ...formData,
    fieldType: formData.valueType,
    transform: JSON.parse(JSON.stringify(formData.transform)) || {}
};
```

---

### 5. ConsecutiveConfigSection.jsx
**Estado:** ⚠️ MODERADO

**PROBLEMAS IDENTIFICADOS:**

1. **Inline styles en SweetAlert2** (lineas 72-79):
   ```javascript
   html: `
     <div class="text-left py-4 font-sans">
       <p style="mb-2;"><strong>Descripción:</strong>...</p>
   ```
   - ❌ Uso de `style="mb-2"` en lugar de Tailwind classes
   - Solución: Reemplazar con clases Tailwind (`<p className="mb-2">`)

2. **Asignación sin validación completa** (lineas 166-179):
   - ✅ Se valida que el mapping exista
   - ✅ Se valida que al menos uno esté activo
   - ❌ No se valida que el consecutivo seleccionado esté en lista de asignados

3. **Campos de tabla no dinámicos**:
   - `fields` muestra todos los campos, pero en el modal se deshabilita el select de campos
   - Esto causa confusión UX

**Código problemático (lineas 158-164):**
```javascript
// Validar que el consecutivo seleccionado esté activo
const selectedConsecutive = availableConsecutives.find(c => c._id === selectedId);
if (!selectedConsecutive || !selectedConsecutive.active) {
    Swal.fire({ icon: "warning", title: "Consecutivo Inactivo", text: "No puede asignar un consecutivo inactivo." });
    setLoading(false);
    return;
}
```
✅ Esta validación existe pero no se valida si el consecutivo ya está asignado.

---

### 6. ConsecutiveFormModal.jsx
**Estado:** ⚠️ MODERADO

**PROBLEMAS:**

1. **Validación incompleta** (linea 238-246):
   - ✅ Valida nombre
   - ❌ No valida `pattern` (patrón de formato)
   - ❌ No valida `sqlSync` si está habilitado
   - ❌ No valida `segments` si está habilitado

2. **No hay validación de SQL Sync** (lineas 246-293):
   - ❌ No se valida que la tabla existe en el servidor
   - ❌ No se valida que los campos existen en la tabla
   - ❌ No se valida el formato del nombre de tabla
   - ❌ No se valida la conexión al servidor

---

## 📋 RESUMEN DE ESTADO ACTUAL

| # | Problema | Archivo | Estado | Impacto |
|---|----------|---------|--------|---------|
| 1 | Normalización de campos | useMappingEditor.jsx | ✅ SOLUCIONADO | - |
| 2 | Asignación automática consecutivos | useMappingEditor.jsx | ✅ MEJORADO | - |
| 3 | Conditions/actions vacíos | usePromotionConfig.js | ✅ SOLUCIONADO | - |
| 4 | Transformación no guardada | FieldMappingModal.jsx | ⚠️ PENDING | **ALTA** |
| 5 | Inline styles en modales | ConsecutiveConfigSection.jsx | ⚠️ PENDING | MEDIA |
| 6 | Campos tabla dinámicos | ConsecutiveConfigSection.jsx | ⚠️ PENDING | MEDIA |
| 7 | Validación SQL Sync | ConsecutiveFormModal.jsx | ⚠️ PENDING | MEDIA |
| 8 | Validación duplicados consecutivos | ConsecutiveConfigSection.jsx | ⚠️ PENDING | MEDIA |
| 9 | field/valueType defaults | useMappingEditor.jsx | ✅ SOLUCIONADO | - |

---

## 🎯 PRIORIDADES ACTUALIZADAS

### PRIORIDAD ALTA (Corregir Inmediatamente):
1. **FieldMappingModal.jsx** - Transformación no se guarda al guardar el mapeo
   - Impacto: Configuraciones de transformación se pierden

### PRIORIDAD MEDIA (Corregir en Próximo Sprint):
1. **ConsecutiveConfigSection.jsx** - Inline styles en SweetAlert2
2. **ConsecutiveConfigSection.jsx** - Validación de duplicados al asignar
3. **ConsecutiveFormModal.jsx** - Validación SQL Sync y campos obligatorios
4. **ConsecutiveConfigSection.jsx** - Campos de tabla no dinámicos

### PRIORIDAD BAJA (Mejoras Futuras):
1. Logging detallado de errores
2. Mensajes de error más claros en modales
3. UX en modales de asignación

---

## CONCLUSIÓN

### Arquitectura General: ✅ SOLIDA

- **Modularidad:** Separación clara entre frontend, hooks, API y backend
- **Escalabilidad:** Arquitectura de microservicios preparada
- **UX:** Diseño moderno y consistente con TailwindCSS

### Problemas Principales Resueltos: ✅
1. ✅ Normalización de campos (fieldType/valueType)
2. ✅ Condiciones y acciones con valores por defecto
3. ✅ Asignación automática mejorada (no bloqueante)

### Problemas Pendientes (3 críticos de alto impacto):
1. **FieldMappingModal.jsx** - Transformaciones se pierden
2. **ConsecutiveConfigSection.jsx** - Validaciones incompletas
3. **ConsecutiveFormModal.jsx** - Validación SQL incompleta

---

*Documento actualizado para reflejar estado post-corrección de las últimas commits.*
