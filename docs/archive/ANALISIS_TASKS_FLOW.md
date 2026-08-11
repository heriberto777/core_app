# 📊 ANÁLISIS COMPLETO: Flujo de Edición de Tareas

**Fecha:** 2026-05-19  
**Objetivo:** Analizar completamente el flujo frontend-backend para entender por qué las opciones no se cargan al editar tareas

---

## 🔄 FLUJO COMPLETO DE EDICIÓN DE TAREAS

### 1. FRONTEND - TaskFormModal.jsx

**Archivo:** `app/src/components/organismos/TaskFormModal.jsx`

**Estado actual (línea 19):**
```javascript
const [formData, setFormData] = useState({ ...task });
```

**✅ CORRECTO:** Ahora usa spread operator para cargar todo el objeto `task`.

**Campos cargados en el formulario:**
- name, description, type, active
- query, parameters, transferType, executionMode
- sourceServer, targetServer, clearBeforeInsert, targetTable
- fieldMapping, nextTasks, linkedTasks, linkedGroup
- linkedExecutionOrder, postUpdateQuery, postUpdateMapping
- workflowConfig, executionCount, progress
- markProcessedField, markProcessedValue, validationRules

**Problema encontrado:**
El formulario tiene **cambios incorrectos** en varios lugares:

#### PROBLEMA 1: Lineas 204-216 (Transferencia duplicada)
```javascript
<div className="flex flex-col gap-1.5">
    <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Transferencia</label>
    <Select
        value={formData.transferType || ""}
        onChange={e => handleChange("transferType", e.target.value)}
        className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800"
    >
        <option value="">-- Seleccionar --</option>
        <option value="up">↑ Up (Server2 → Server1)</option>
        <option value="down">↓ Down (Server1 → Server2)</option>
        <option value="internal">⇄ Internal</option>
    </Select>
</div>
```
**PROBLEMA:** Hay un campo `Transferencia` duplicado junto con `Transfer Type` (lineas 127-139). Esto causa confusión y el valor puede perderse.

#### PROBLEMA 2: Lineas 245-258 (Field Mapping)
```javascript
onChange={e => handleChange("fieldMapping", { ...formData.fieldMapping, sourceTable: e.target.value })}
```
**PROBLEMA:** El input solo actualiza `sourceTable`, no `targetTable` correctamente. El objeto `fieldMapping` es un objeto anidado y necesita manejar ambos campos.

#### PROBLEMA 3: Lineas 265-273 (Añadir Tarea Siguiente)
```javascript
onClick={() => {
    setFormData(prev => ({
        ...prev,
        nextTasks: [...(prev.nextTasks || []), allTasks.find(t => t._id === formData.nextTasks?.lastTaskId || allTasks[0]?._id)]
    }));
}}
```
**PROBLEMA:** Usa `formData.nextTasks?.lastTaskId` que NO EXISTE en el modelo. Debería ser `allTasks.find(t => t._id === ...)` directamente.

#### PROBLEMA 4: Lineas 459-468 (Añadir Siguiente Mapeo)
```javascript
onClick={() => {
    const nextMapping = allTasks.find(t => t._id !== task?._id);
    setFormData(prev => ({
        ...prev,
        workflowConfig: {
            ...formData.workflowConfig,
            nextMappings: [...(formData.workflowConfig?.nextMappings || []), nextMapping]
        }
    }));
}}
```
**PROBLEMA:** Usa `allTasks.find()` que no filtra correctamente. Debería filtrar tareas que no sean la actual.

---

### 2. BACKEND - transferTaskController.js

**Archivo:** `server/controllers/transferTaskController.js` (función `upsertTransferTaskController`)

**Estado actual (lineas 107-112):**
```javascript
const {
  name, type, active, query, parameters, transferType, validationRules, executionMode,
  postUpdateQuery, postUpdateMapping, clearBeforeInsert, fieldMapping, nextTasks,
  targetTable, linkedTasks = [], linkedGroup, executeLinkedTasks = false,
  linkedExecutionOrder = 0, coordinationConfig, linkingMetadata, _id,
} = sanitizedBody;
```

**PROBLEMA:** La destructuración sigue omitiendo campos como:
- `schedule`
- `sourceDb`
- `targetDb`
- `description`
- `active` (se maneja separado)
- `workflowConfig` (se usa después pero debería estar aquí)

**Linea 170:**
```javascript
const taskData = { ...sanitizedBody };
```

**✅ CORRECTO:** Usa spread operator para preservar todos los campos.

**Lineas 173-187:** Normalización de campos específica.

---

### 3. API - TransferTaskApi.jsx

**Archivo:** `app/src/api/TransferTaskApi.jsx` (función `upsertTransferTask`)

**Estado actual (lineas 26-44):**
```javascript
async upsertTransferTask(accessToken, datos) {
    try {
        const url = `${this.baseApi}/${ENV.API_ROUTERS.TRANSFER}/accion/addEdit`;
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(datos),
        });
        // ...
    }
}
```

**✅ CORRECTO:** Envía correctamente los datos al backend.

---

## 🐛 CAUSAS RAÍZ DEL PROBLEMA

### Causa 1: Destructuración Agresiva en Controlador
El controlador usa destructuración que omite campos desconocidos como `schedule`, `sourceDb`, `targetDb`, `workflowConfig`, etc.

### Causa 2: Campos Duplicados en Formulario
El campo `Transferencia` duplicado junto con `Transfer Type` causa confusión.

### Causa 3: Manejo Incorrecto de Objetos Anidados
Los campos como `fieldMapping`, `workflowConfig`, `postUpdateMapping` necesitan manejar objetos anidados, pero el código actual tiene errores.

### Causa 4: Referencias Incorrectas
Las referencias como `formData.nextTasks?.lastTaskId` no existen en el modelo.

---

## 🔧 SOLUCIONES NECESARIAS

### Solución 1: Corregir el Formulario
1. Eliminar el campo `Transferencia` duplicado (lineas 204-216)
2. Corregir el manejo de `fieldMapping` para actualizar ambos campos
3. Corregir las referencias incorrectas en `nextTasks`
4. Filtrar correctamente las tareas en `allTasks.find()`

### Solución 2: Mejorar el Controlador
1. Agregar más campos a la destructuración: `schedule`, `sourceDb`, `targetDb`, `workflowConfig`
2. O mejor: Usar `const taskData = sanitizedBody` sin destructuración

### Solución 3: Validar Campos
1. Agregar validaciones para campos obligatorios
2. Validar tipos de datos (booleano, número, string)

---

## 📋 CAMPOS DEL MODELO TransferTask

Según `server/models/transferTaskModel.js`:

**Campos principales:**
- name, type, active, query, parameters
- validationRules, executionMode, status, progress
- transferType, clearBeforeInsert, targetTable
- fieldMapping, procedureConfig
- postUpdateQuery, postUpdateMapping

**Campos de vinculación:**
- linkedTasks, linkedGroup, executeLinkedTasks
- linkedExecutionOrder, coordinationConfig
- linkingMetadata (isCoordinator, lastGroupExecution, etc.)

**Campos de ejecución:**
- lastExecutionDate, executionCount, lastExecutionResult
- lastProcessingResult

**Campos de transformación:**
- fieldMapping.transformations
- sourceFields, targetFields, defaultValues

---

## 🎯 RECOMENDACIONES

1. **Frontend:**
   - Eliminar campos duplicados
   - Corregir manejo de objetos anidados
   - Filtrar correctamente las tareas

2. **Backend:**
   - Eliminar destructuración agresiva
   - Usar `const taskData = sanitizedBody` directamente
   - Agregar validaciones de tipos

3. **Validación:**
   - Validar campos obligatorios (name, query)
   - Validar tipos de datos
   - Validar referencias (linkedTasks, nextTasks)

---

*Documento generado al 2026-05-19 - Análisis completo del flujo frontend-backend.*
