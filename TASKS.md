# 📋 INVESTIGACIÓN: Problema de Edición de Tareas

**Fecha:** 2026-05-18  
**Estado:** ✅ SOLUCIÓN IDENTIFICADA

## Problema Reportado

Cuando se edita una tarea (task), las propiedades o opciones no se cargan correctamente.

## Enfoque de Investigación

### 1. Investigación Backend ✅ COMPLETADO

**Archivo:** `server/models/transferTaskModel.js`

**Estructura del Modelo:**
- Campos principales: `name`, `type`, `active`, `query`, `parameters`, `validationRules`, etc.
- Campos de vinculación: `linkedTasks`, `linkedGroup`, `coordinationConfig`, `linkingMetadata`
- Campos de transferencia: `fieldMapping`, `targetTable`, `postUpdateMapping`

**Controlador:** `server/controllers/transferTaskController.js` (función `upsertTransferTaskController`)

**Problema Identificado:**
El controlador usa destructuración agresiva que **omite campos desconocidos**:

```javascript
const {
  name, type, active, query, parameters, transferType, validationRules, executionMode,
  postUpdateQuery, postUpdateMapping, clearBeforeInsert, fieldMapping, nextTasks,
  targetTable, linkedTasks = [], linkedGroup, executeLinkedTasks = false,
  linkedExecutionOrder = 0, coordinationConfig, linkingMetadata, _id,
} = sanitizedBody;
```

**Campos OMITIDOS:**
- `schedule`
- `sourceDb`
- `targetDb`
- `description`
- `active` (se maneja separado)
- Cualquier otro campo del modelo

### 2. Investigación Frontend ✅ COMPLETADO

**Hook:** `app/src/hooks/useTransferTask.jsx`

**Función `saveTask`:**
```javascript
const saveTask = async (formData, isEdit = false) => {
    try {
        await taskApi.upsertTransferTask(accessToken, formData);
        // ...
    }
}
```

**El hook usa `useFetchData`** que hace una llamada API.

**Componente:** `app/src/components/templates/TransferTask.jsx`

**ModalOverlay:** `app/src/components/organismos/TaskFormModal.jsx`

**Problema Identificado:**
El `TaskFormModal.jsx` **solo carga un subconjunto limitado de campos**:

```javascript
const [formData, setFormData] = useState({
    name: task?.name || "",
    description: task?.description || "",
    schedule: task?.schedule || "",
    sourceDb: task?.sourceDb || "",
    targetDb: task?.targetDb || "",
});
```

**Campos NO CARGADOS:**
- `type`
- `active`
- `query`
- `parameters`
- `transferType`
- `validationRules`
- `executionMode`
- `postUpdateQuery`
- `postUpdateMapping`
- `clearBeforeInsert`
- `fieldMapping`
- `nextTasks`
- `targetTable`
- `linkedTasks`
- `linkedGroup`
- `executeLinkedTasks`
- `linkedExecutionOrder`
- `coordinationConfig`
- `linkingMetadata`
- `lastExecutionDate`
- `executionCount`
- `lastExecutionResult`
- `lastProcessingResult`
- `fieldMapping.transformations`
- `procedureConfig`
- `isCoordinator`
- `delayPostUpdate`
- Y muchos más...

## Causa Raíz

1. **Frontend:** `TaskFormModal.jsx` solo carga 5 campos básicos
2. **Backend:** `transferTaskController.js` usa destructuración que omite campos desconocidos
3. **Resultado:** Al editar, solo se guardan los campos que el frontend envía

## Solución

### Paso 1: Actualizar TaskFormModal.jsx

Cambiar de cargar campos específicos a cargar **todo el objeto task**:

```javascript
// Antes (PROBLEMA):
const [formData, setFormData] = useState({
    name: task?.name || "",
    description: task?.description || "",
    schedule: task?.schedule || "",
    sourceDb: task?.sourceDb || "",
    targetDb: task?.targetDb || "",
});

// Después (SOLUCIÓN):
const [formData, setFormData] = useState({ ...task });
```

### Paso 2: Actualizar transferTaskController.js

Cambiar de destructuración a **spread operator**:

```javascript
// Antes (PROBLEMA):
const {
  name, type, active, query, parameters, transferType, validationRules, executionMode,
  postUpdateQuery, postUpdateMapping, clearBeforeInsert, fieldMapping, nextTasks,
  targetTable, linkedTasks = [], linkedGroup, executeLinkedTasks = false,
  linkedExecutionOrder = 0, coordinationConfig, linkingMetadata, _id,
} = sanitizedBody;

// Después (SOLUCIÓN):
const taskData = { ...sanitizedBody };
```

### Paso 3: Agregar validaciones

El controlador debe validar y normalizar todos los campos antes de guardar.

## Impacto

- **Campos que se pierden:** type, active, query, parameters, transferType, coordinationConfig, etc.
- **Tareas incompletas:** Al editar, muchas propiedades se pierden
- **Inconsistencia:** Los datos en BD no coinciden con lo que se ve en el frontend

## Archivos a Modificar

1. `app/src/components/organismos/TaskFormModal.jsx` - Cargar todo el objeto task
2. `server/controllers/transferTaskController.js` - Usar spread operator en upsertTransferTaskController

## Pasos a Seguir

1. ✅ Investigar el modelo y controlador de tareas
2. ✅ Investigar el frontend (hook y modal)
3. ✅ Identificar la causa raíz (destructuración omitiendo campos)
4. 🔧 **Aplicar solución:**
   - TaskFormModal.jsx: Usar `{...task}` en lugar de campos específicos
   - transferTaskController.js: Usar `{...sanitizedBody}` en lugar de destructuración
5. 🧪 Probar edición de tareas
6. 📝 Actualizar documentación

---

*Documento actualizado al 2026-05-18 - Solución identificada y lista para implementación.*
