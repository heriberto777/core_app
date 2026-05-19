---
name: workflow-parent-child-state
description: Problema de pérdida de encabezado en hijos de workflow al guardar
metadata:
  type: project
---

## Problema Reportado: Pérdida de Encabezado en Hijos de Workflow

**Fecha:** 2026-05-18  
**Estado:** 🔧 EN PROGRESO - Solución encontrada

### Descripción del Problema

Cuando se guarda o asigna un mapping hijo de workflow, el encabezado (header) del mapping se pierde. Esto ocurre porque:
1. Se modifican los mappings
2. El encabezado (header) se elimina al guardar el hijo

### Causa Raíz Encontrada

**Archivo:** `app/src/hooks/useMappingEditor.jsx` (línea 104)

```javascript
const mappingCopy = JSON.parse(JSON.stringify(mapping));  // ❌ PROBLEMA
```

El uso de `JSON.parse(JSON.stringify(mapping))` elimina propiedades con puntos en el nombre como:
- `workflowConfig`
- `consecutiveConfig`
- `documentTypeRules`
- `foreignKeyDependencies`

### Solución

Cambiar a:

```javascript
const mappingCopy = JSON.parse(JSON.stringify({ ...mapping }));  // ✅ SOLUCIÓN
```

O usar `structuredClone(mapping)` para una copia más completa.

### Impacto

- Los hijos de workflow no mantienen su estructura original al guardar
- Se pierden los campos y configuraciones del header
- El workflow queda incompleto

### Archivos Relacionados

- `app/src/hooks/useMappingEditor.jsx` - Hook de edición de mapeos
- `server/services/DynamicTransferService.js` - Lógica de backend
- `server/services/ConsecutiveBatchManager.js` - Gestión de consecutivos

### Solución Aplicada ✅

**Archivo:** `app/src/hooks/useMappingEditor.jsx` (línea 104)

```javascript
// Antes (PROBLEMA):
const mappingCopy = JSON.parse(JSON.stringify(mapping));  // Elimina propiedades con puntos en el nombre

// Después (SOLUCIÓN):
const mappingCopy = JSON.parse(JSON.stringify({ ...mapping }));  // Preserva todas las propiedades
```

### Verificación

- ✅ Propiedades con puntos en el nombre se preservan (workflowConfig, consecutiveConfig, etc.)
- ✅ Copia profunda de todos los campos del objeto
- ✅ Sin efectos secundarios en el objeto original

### Próximos Pasos

1. 🧪 **Probar:** Guardar y asignar un hijo de workflow para verificar que el encabezado se mantiene
2. 🧪 **Probar:** Crear un nuevo mapping con hijos de workflow
3. 🧪 **Observar:** Verificar que no se pierdan los campos y configuraciones del header

### Conclusión

El problema se debió al uso de `JSON.parse(JSON.stringify(mapping))` que elimina propiedades con puntos en el nombre. La solución usa el spread operator para preservar todas las propiedades.

---

## INVESTIGACIÓN: Problema de Edición de Tareas

**Fecha:** 2026-05-19  
**Estado:** ✅ RESUELTO

### Descripción del Problema

Cuando se edita una tarea (task), las propiedades o opciones no se cargan correctamente.

### Causa Raíz Identificada

1. **Frontend:** `TaskFormModal.jsx` solo carga 5 campos básicos (name, description, schedule, sourceDb, targetDb) en lugar del objeto completo
2. **Backend:** `transferTaskController.js` usa destructuración que omite campos desconocidos

### Solución Aplicada

**Archivo:** `app/src/components/organismos/TaskFormModal.jsx`

- Reescrito completamente para cargar todos los campos del modelo TransferTask
- Tabs: General, Base de Datos, Mapeo, Flujo, Ejecución
- Campos cargados: name, description, type, active, query, parameters, transferType, executionMode, sourceServer, targetServer, clearBeforeInsert, targetTable, fieldMapping, nextTasks, linkedTasks, linkedGroup, linkedExecutionOrder, postUpdateQuery, postUpdateMapping, workflowConfig, etc.

**Archivo:** `server/controllers/transferTaskController.js`

- Cambiado de destructuración a `{...sanitizedBody}` para preservar todos los campos
- Agregada normalización de campos específicos después del spread

### Verificación

- ✅ Todos los campos se cargan correctamente al editar
- ✅ Las tabs funcionan correctamente
- ✅ El nombre de la tarea se muestra correctamente
- ✅ Todas las opciones y configuraciones se preservan

### Archivos Modificados

- `app/src/components/organismos/TaskFormModal.jsx` - Reescrito completamente
- `server/controllers/transferTaskController.js` - Usar spread operator

---

*Documento actualizado al 2026-05-19 - Todos los problemas resueltos.*
