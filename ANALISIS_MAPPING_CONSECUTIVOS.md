# 📊 ANÁLISIS PROFUNDO: MAPPINGS Y HIJOS (CONSECUTIVOS)

**Fecha:** 2026-05-18  
**Objetivo:** Análisis exhaustivo de la arquitectura de Mappings y sus hijos (consecutivos, promociones)

---

## 🏗️ ARQUITECTURA COMPLETA

### Diagrama de Flujo de Datos

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         NIVEL DE USUARIO (FRONTEND)                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  MappingsList.jsx (Lista)                                               │
│  ↓                                                                       │
│  MappingEditor.jsx (Editor) → useMappingEditor.jsx (Hook)              │
│         ↓                                                                 │
│  ┌──────────────────────────────────────────────────────────────┐      │
│  │                    COMPONENTES DE MODAL                       │      │
│  │  ├─ FieldMappingModal.jsx (Mapeo de campos)                  │      │
│  │  ├─ ValueMappingModal.jsx (Mapeo de valores)                 │      │
│  │  ├─ ConsecutiveAssignModal.jsx (Asignación de consecutivos)  │      │
│  │  ├─ ConsecutiveFormModal.jsx (Creación de consecutivos)      │      │
│  │  └─ DependencyModal.jsx (Dependencias FK)                    │      │
│  └──────────────────────────────────────────────────────────────┘      │
│         ↓                                                                 │
│  usePromotionConfig.js (Configuración de promociones)                  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                      NIVEL DE NEGOCIO (HOOKS)                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  useMappingEditor:                                                      │
│  ├─ Normalización de campos (lineas 106-124)                           │
│  ├─ Validaciones (nombre, tableConfigs)                                 │
│  ├─ Asignación automática de consecutivos (lineas 132-152)              │
│  ├─ CRUD operations (addTable, addFieldMapping, etc.)                   │
│  └─ Document type rules, foreign key dependencies, value mappings       │
│                                                                          │
│  usePromotionConfig:                                                    │
│  ├─ Gestión de reglas de promoción                                     │
│  ├─ handleDetectFieldChange / handleTargetFieldChange                   │
│  ├─ addRule / editRule / deleteRule                                     │
│  └─ conditions y actions con valores por defecto                       │
│                                                                          │
│  useConsecutiveManager:                                                 │
│  ├─ getConsecutives (listar consecutivos)                               │
│  ├─ createConsecutive (crear nuevo)                                     │
│  ├─ assignConsecutive (asignar a mapping)                                │
│  ├─ getNextConsecutiveValue (obtener siguiente valor)                   │
│  ├─ reserveConsecutiveValues (reservar valores)                         │
│  └─ commitConsecutiveReservation (confirmar reserva)                    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                      NIVEL DE API (NETWORK)                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  MappingApi:                                                            │
│  ├─ getMappings, getMappingById                                         │
│  ├─ createMapping, updateMapping, deleteMapping                         │
│  ├─ getDocumentsByMapping                                               │
│  ├─ getDocumentDetailsByMapping                                         │
│  ├─ validateBonificationConfig                                          │
│  ├─ processDocumentsByMapping                                           │
│  ├─ getSourceDataByMapping                                              │
│  ├─ updateConsecutiveConfig                                             │
│  └─ queryDynamicFieldValue                                              │
│                                                                          │
│  ConsecutiveApi:                                                        │
│  ├─ getConsecutives (listar)                                             │
│  ├─ getConsecutiveById (obtener por ID)                                 │
│  ├─ createConsecutive (crear)                                            │
│  ├─ updateConsecutive (actualizar)                                      │
│  ├─ deleteConsecutive (eliminar)                                        │
│  ├─ getNextConsecutiveValue (siguiente valor)                           │
│  ├─ resetConsecutive (reiniciar)                                        │
│  ├─ assignConsecutive (asignar)                                         │
│  ├─ getConsecutivesByEntity (por entidad)                               │
│  ├─ reserveConsecutiveValues (reservar)                                 │
│  ├─ commitConsecutiveReservation (confirmar)                            │
│  ├─ cancelConsecutiveReservation (cancelar)                             │
│  ├─ cleanupExpiredReservations (limpiar expiradas)                      │
│  ├─ getConsecutiveDashboard (dashboard)                                 │
│  └─ getConsecutiveMetrics (métricas)                                    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                      NIVEL DE BACKEND (SERVIDOR)                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Endpoints Backend:                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ /api/mappings/:id                                               │   │
│  │   - GET: Obtener mapeo                                          │   │
│  │   - PUT: Actualizar mapeo                                       │   │
│  │   - DELETE: Eliminar mapeo                                      │   │
│  │   - GET /documents: Documentos por mapeo                        │   │
│  │   - GET /documents/:id: Detalles de documento                   │   │
│  │   - POST /process: Procesar documentos                          │   │
│  │   - POST /query-dynamic-value: Consultar valor dinámico         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ /api/consecutives/:id                                            │   │
│  │   - GET: Obtener consecutivo                                    │   │
│  │   - PUT: Actualizar                                               │   │
│  │   - DELETE: Eliminar                                              │   │
│  │   - GET /next: Obtener siguiente valor                           │   │
│  │   - POST /assign: Asignar consecutivo                            │   │
│  │   - POST /reset: Reiniciar                                       │   │
│  │   - POST /reserve-batch: Reservar valores                        │   │
│  │   - POST /commit-reservation: Confirmar reserva                  │   │
│  │   - POST /cancel-reservation: Cancelar reserva                   │   │
│  │   - POST /cleanup-expired-reservations: Limpiar expiradas        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🔍 ANÁLISIS DETALLADO POR COMPONENTE

### 1. MappingsList.jsx

**Función:** Lista y gestiona mapeos de forma centralizada

**✅ MEJORES:**
- Diseño moderno con TailwindCSS
- Búsqueda por nombre/desccripción
- Acciones CRUD completas
- Badge de estado visual

**⚠️ PROBLEMAS:**
- `transferType` muestra en tabla pero no se usa en lógica
- No muestra número de campos mapeados
- No indica cuántos consecutivos asignados

---

### 2. MappingEditor.jsx

**Función:** Editor completo de mapeos con pestañas organizadas

**✅ MEJORES:**
- Tablas organizadas por pestañas (general, documentTypes, dependencies, tables, workflow)
- Expansión dinámica de tablas (mostrar/ocultar campos)
- Integración con modales para cada tipo de configuración

**⚠️ PROBLEMAS:**
- **PromotionConfigSection** pasados como props pero no se usan en lógica
- **ConsecutiveConfigSection** pasados pero la lógica está en el mismo archivo
- **WorkflowConfigSection** no se muestra en UI (pestaña workflow vacía)

---

### 3. useMappingEditor.jsx

**Función:** Hook principal para gestión de estado de mapeo

**✅ MEJORES:**
- Normalización de campos al guardar (lineas 106-124)
- Asignación automática de consecutivos post-creación (lineas 132-152)
- CRUD helpers para tablas, campos, reglas, dependencias
- Manejo de value mappings dentro de campos

**⚠️ PROBLEMAS:**

#### PROBLEMA 1: Normalización de campos (lineas 106-124)

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

**Problemas identificados:**
1. `fieldType` y `valueType` usan el mismo valor por defecto → inconsistencia
2. Lógica de `isConsecutive` no verifica si `consecutiveId` existe cuando es true
3. `isEditable` se fuerza a true si no es false
4. `showInList` se fuerza a false si no es true

#### PROBLEMA 2: Asignación automática de consecutivos (lineas 132-152)

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

**Problemas identificados:**
1. **No se valida que el consecutivo existe** antes de intentar asignar
2. **No se valida que el consecutivo esté activo**
3. **No se valida que el mapping exista** en la lista de asignables
4. Error no bloqueante pero confuso para el usuario

---

### 4. FieldMappingModal.jsx

**Función:** Modal para crear/editar mapeos de campos

**✅ MEJORES:**
- Transformación avanzada con configuración detallada
- Lookup SQL con parámetros
- Validación de existencia y fallo si no existe
- Consecutivos integrados

**⚠️ PROBLEMAS:**

#### PROBLEMA 1: Transformación no se guarda (linea 131)

```javascript
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

**Problema:** `formData.transform` se pierde al hacer `...formData`

#### PROBLEMA 2: Lookup SQL no validado (linea 255)

```javascript
<label className="text-[13px] font-semibold text-indigo-700 ml-1">Consulta SQL (use @parametro)</label>
<textarea 
    name="lookupQuery" 
    value={formData.lookupQuery} 
    onChange={handleChange} 
    placeholder="SELECT NOMBRE FROM CLIENTE WHERE ID = @codigo"
    className="w-full py-2.5 px-4 text-sm rounded-xl border border-indigo-200 bg-white focus:border-indigo-500 outline-none transition-all min-h-[100px]"
/>
```

**Problema:** No hay validación de SQL ni de parámetros

---

### 5. ConsecutiveConfigSection.jsx

**Función:** Configuración de consecutivos para un mapping

**✅ MEJORES:**
- Sistema dual: Local vs Centralizado
- Asignación automática de consecutivos
- Campos específicos por tabla
- Visualización detallada de asignaciones

**⚠️ PROBLEMAS:**

#### PROBLEMA 1: Uso de inline styles en modales (lineas 71-80)

```javascript
Swal.fire({
    title: `Consecutivo: ${consec.name}`,
    html: `
      <div style="text-align: left; padding: 10px; font-family: 'Inter', sans-serif;">
        <p style="margin-bottom: 8px;"><strong>Descripción:</strong> ${consec.description || "N/A"}</p>
        <p style="margin-bottom: 8px;"><strong>Valor actual:</strong> <span style="background: #f1f5f9; padding: 2px 8px; border-radius: 4px; font-weight: 800;">${consec.currentValue}</span></p>
        ...
      </div>
    `,
    ...
});
```

**Problema:** Uso de inline styles en SweetAlert2 → no compatible con Tailwind

#### PROBLEMA 2: Asignación de consecutivos sin validación (lineas 140-170)

```javascript
if (isNewMapping) {
    handleChange({
        target: {
            name: "consecutiveConfig",
            type: "custom",
            value: { ...consecutiveConfig, pendingAssignmentId: selectedId, enabled: true }
        }
    });
    const selectedConsec = availableConsecutives.find(c => c._id === selectedId);
    setAssignedConsecutives([selectedConsec]);
    setSelectedCentralizedConsecutive(selectedId);
    setUseCentralizedSystem(true);
    return;
}

// Luego...
const assignResult = await api.assignConsecutive(accessToken, selectedId, {
    entityType: "mapping",
    entityId: mapping._id,
    allowedOperations: ["read", "increment"],
});
```

**Problemas identificados:**
1. **No se valida que el consecutivo existe** antes de asignar
2. **No se valida que el consecutivo esté activo**
3. **No se valida que el mapping exista** en la lista de asignables
4. **No se valida que no haya asignaciones duplicadas**

#### PROBLEMA 3: Campos de tabla no se muestran dinámicamente (lineas 52-59)

```javascript
const availableTables = React.useMemo(() => {
    if (!mapping.tableConfigs) return [];
    return mapping.tableConfigs.map((config) => ({
        name: config.name,
        isDetail: config.isDetailTable || false,
        fields: (config.fieldMappings || []).map((field) => field.targetField),
    }));
}, [mapping.tableConfigs]);
```

**Problema:** `fields` muestra todos los campos, pero en el modal se deshabilita el select de campos

---

### 6. ConsecutiveFormModal.jsx

**Función:** Modal para crear/editar consecutivos

**✅ MEJORES:**
- Segmentación operativa (año, mes, compañía, usuario, custom)
- Sincronización ERP con SQL Server
- Patrón de formato dinámico

**⚠️ PROBLEMAS:**

#### PROBLEMA 1: No hay validación de campos obligatorios (linea 62)

```javascript
const handleSubmit = () => {
    if (!formData.name) return alert("El nombre es obligatorio");
    onSave(formData);
};
```

**Problemas identificados:**
1. Solo valida nombre, no otros campos obligatorios
2. **No se valida `pattern`** (patrón de formato)
3. **No se valida `sqlSync`** si está habilitado
4. **No se valida `segments`** si está habilitado

#### PROBLEMA 2: No hay validación de SQL Sync (lineas 246-293)

```javascript
{formData.sqlSync.enabled && (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-top-4 duration-300">
        <Select
            label="SERVIDOR ERP"
            name="sqlSync.serverKey"
            value={formData.sqlSync.serverKey}
            onChange={handleChange}
            className="font-bold border-blue-100 rounded-2xl px-5 py-4 appearance-none bg-white"
        >
            <option value="server1">🖥️ Server 1 (Producción)</option>
            <option value="server2">🖥️ Server 2 (Backup/Testing)</option>
        </Select>
        <Input
            label="NOMBRE DE TABLA"
            name="sqlSync.tableName"
            value={formData.sqlSync.tableName}
            onChange={handleChange}
            placeholder="Ej: catelli.CONSECUTIVO"
            className="font-bold border-blue-100 rounded-2xl px-5 py-4 bg-white"
        />
        ...
    </div>
)}
```

**Problemas identificados:**
1. **No se valida que la tabla existe** en el servidor
2. **No se valida que los campos existen** en la tabla
3. **No se valida el formato** del nombre de tabla
4. **No se valida la conexión** al servidor

---

### 7. usePromotionConfig.js

**Función:** Gestión de configuración de promociones

**✅ MEJORES:**
- Gestión de reglas de promoción
- Condiciones y acciones con valores por defecto (corregido)
- Edición y eliminación de reglas

**⚠️ PROBLEMAS:**

#### PROBLEMA 1: `conditions` y `actions` vacíos (linea 108)

```javascript
return { name, type, description, priority, enabled, isOneTime, conditions: {}, actions: {} };
```

**Problema:** Las reglas se crean con `conditions: {}` y `actions: {}` vacíos → **NADIE puede aplicar la regla**

**Solución aplicable:** Se agregó valores por defecto basados en `promotionConfig.detectFields` y `promotionConfig.targetFields`

---

## 📋 RESUMEN DE PROBLEMAS CRÍTICOS

| # | Problema | Archivo | Impacto | Prioridad |
|---|----------|---------|---------|-----------|
| 1 | `conditions` y `actions` vacíos | `usePromotionConfig.js` | Promociones inoperantes | **ALTA** |
| 2 | `formData.transform` no se guarda | `FieldMappingModal.jsx` | Transformaciones perdidas | **ALTA** |
| 3 | Asignación de consecutivos sin validación | `ConsecutiveConfigSection.jsx` | Consecutivos inválidos | **ALTA** |
| 4 | Campos de tabla no se muestran dinámicamente | `ConsecutiveConfigSection.jsx` | UI inconsistente | MEDIA |
| 5 | Uso de inline styles en modales | `ConsecutiveConfigSection.jsx` | No compatible con Tailwind | MEDIA |
| 6 | `isConsecutive` sin `consecutiveId` válido | `useMappingEditor.jsx` | Consecutivos no asignados | **ALTA** |
| 7 | Lookup SQL no validado | `FieldMappingModal.jsx` | Errores en backend | MEDIA |
| 8 | Campos de tabla deshabilitados | `ConsecutiveConfigSection.jsx` | UX pobre | MEDIA |
| 9 | No hay validación de SQL Sync | `ConsecutiveFormModal.jsx` | Errores en backend | **ALTA** |
| 10 | `fieldType` y `valueType` con mismo default | `useMappingEditor.jsx` | Inconsistencias | MEDIA |

---

## 🎯 CONCLUSIÓN

### Arquitectura General: ✅ SOLIDA

- **Modularidad:** Separación clara entre frontend, hooks, API y backend
- **Escalabilidad:** Arquitectura de microservicios preparada
- **UX:** Diseño moderno y consistente con TailwindCSS

### Problemas Principales: ⚠️

1. **Validaciones insuficientes** - Los consecutivos se asignan sin validar existencia, estado activo, etc.
2. **Persistencia de datos** - Transformaciones, conditions, actions se pierden
3. **Inconsistencias de datos** - Tipos de datos no normalizados
4. **Inline styles** - Uso de estilos inline en modales no compatible con Tailwind

### Recomendaciones:

1. **Prioridad ALTA:**
   - Validar consecutivos antes de asignar (existencia, estado activo, en lista de asignables)
   - Validar SQL en Lookup y SQL Sync
   - Validar campos obligatorios en ConsecutiveFormModal
   - Corregir persistencia de `transform`, `conditions`, `actions`

2. **Prioridad MEDIA:**
   - Corregir normalización de `fieldType` y `valueType`
   - Corregir campos de tabla dinámicos en ConsecutiveConfigSection
   - Reemplazar inline styles con TailwindCSS

3. **Prioridad BAJA:**
   - Mejorar UX en modales (mensajes de error más claros)
   - Agregar logging detallado de errores

---

---

## 📊 ESTADO ACTUAL POST-CORRECCIÓN

**Fecha de actualización:** 2026-05-18  
**Comits recientes:** Migración a TailwindCSS v2

### ✅ CORRECCIONES APLICADAS EN ESTA SESIÓN

1. **FieldMappingModal.jsx** - Transformación ahora se guarda correctamente
   - Se usa `JSON.parse(JSON.stringify(formData.transform))` para preservar el objeto completo

2. **ConsecutiveConfigSection.jsx** - Inline styles reemplazados con Tailwind
   - Todos los `style="..."` en SweetAlert2 cambiados a `className="..."`

3. **ConsecutiveConfigSection.jsx** - Validación de duplicados agregada
   - Se verifica que el consecutivo no ya esté asignado antes de la asignación

4. **ConsecutiveFormModal.jsx** - Validación SQL Sync completa
   - Validación de campos obligatorios
   - Validación de formato de nombre de tabla (schema.tabla)
   - Validación de patrón de formato

---

*Documento actualizado al 2026-05-18 con correcciones aplicadas.*
