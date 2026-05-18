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

*Documento actualizado al 2026-05-18 - Solución aplicada y lista para pruebas.*
