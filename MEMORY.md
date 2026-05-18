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

### Pasos a Seguir

1. ✅ Investigar la lógica de actualización de mappings en el backend
2. ✅ Verificar si hay un bug en la normalización de campos
3. ✅ Revisar el flujo de asignación de hijos en workflow
4. 🔧 **Aplicar solución: Cambiar `JSON.parse(JSON.stringify(mapping))` por `JSON.parse(JSON.stringify({ ...mapping }))`**
5. 🧪 Probar con hijos de workflow
6. 📝 Actualizar documentación

---

*Documento actualizado al 2026-05-18 - Solución encontrada y aplicación en proceso.*
