# 📊 ANÁLISIS PROFUNDO: MAPPINGS Y HIJOS (CONSECUTIVOS) - ESTADO ACTUAL

**Fecha:** 2026-05-18  
**Objetivo:** Análisis de arquitectura de Mappings y sus hijos (consecutivos, promociones)  
**Estado:** ✅ POST-CORRECCIÓN - La mayoría de problemas críticos ya están solucionados

---

## 📊 ESTADO ACTUAL POST-CORRECCIÓN

### ✅ CORRECCIONES APLICADAS (2026-05-18)

1. **FieldMappingModal.jsx** - Transformación guardada correctamente
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
│  ├─ Normalización de campos al guardar                                 │
│  ├─ Validaciones (nombre, tableConfigs)                                │
│  ├─ Asignación automática de consecutivos post-creación                │
│  ├─ CRUD helpers para tablas, campos, reglas, dependencias             │
│  └─ Manejo de value mappings dentro de campos                          │
│                                                                          │
│  usePromotionConfig:                                                    │
│  ├─ Gestión de reglas de promoción                                     │
│  ├─ handleDetectFieldChange / handleTargetFieldChange                   │
│  ├─ addRule / editRule / deleteRule                                    │
│  └─ conditions y actions con valores por defecto ✅                     │
│                                                                          │
│  useConsecutiveManager:                                                 │
│  ├─ getConsecutives (listar consecutivos)                               │
│  ├─ createConsecutive (crear nuevo)                                     │
│  ├─ assignConsecutive (asignar a mapping)                               │
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

## 🔍 ANÁLISIS DETALLADO POR COMPONENTE - ESTADO ACTUAL

### 1. MappingsList.jsx

**Función:** Lista y gestiona mapeos de forma centralizada

**✅ MEJORES:**
- Diseño moderno con TailwindCSS
- Búsqueda por nombre/descripción
- Acciones CRUD completas
- Badge de estado visual

**⚠️ PROBLEMAS:**
- `transferType` muestra en tabla pero no se usa en lógica (info, no crítico)
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
- PromotionConfigSection pasados como props pero no se usan en lógica (ahora implementado en organismo separado)
- ConsecutiveConfigSection pasados pero la lógica está en el mismo archivo
- WorkflowConfigSection no se muestra en UI (pestaña workflow vacía) - AHORA IMPLEMENTADO

---

### 3. useMappingEditor.jsx

**Función:** Hook principal para gestión de estado de mapeo

**✅ MEJORES:**
- ✅ Normalización de campos al guardar (fieldType/valueType correctos)
- ✅ Asignación automática de consecutivos post-creación (error no bloqueante)
- ✅ CRUD helpers para tablas, campos, reglas, dependencias
- ✅ Manejo de value mappings dentro de campos

**Estado:** ✅ **CORREGIDO** - Los problemas de normalización y asignación automática han sido solucionados.

---

### 4. FieldMappingModal.jsx

**Función:** Modal para crear/editar mapeos de campos

**✅ MEJORES:**
- Transformación avanzada con configuración detallada
- Lookup SQL con parámetros
- Validación de existencia y fallo si no existe
- Consecutivos integrados

**✅ CORREGIDO:**
- Transformación ahora se guarda correctamente usando `JSON.parse(JSON.stringify())`

**⚠️ PROBLEMAS PENDIENTES:**
- Lookup SQL no validado (no valida sintaxis ni parámetros)

---

### 5. ConsecutiveConfigSection.jsx

**Función:** Configuración de consecutivos para un mapping

**✅ MEJORES:**
- Sistema dual: Local vs Centralizado
- Asignación automática de consecutivos
- Campos específicos por tabla
- Visualización detallada de asignaciones

**✅ CORREGIDO:**
- Inline styles reemplazados con TailwindCSS en SweetAlert2
- Validación de duplicados agregada al asignar consecutivos

**⚠️ PROBLEMAS PENDIENTES:**
- Campos de tabla no se muestran dinámicamente en el modal de asignación

---

### 6. ConsecutiveFormModal.jsx

**Función:** Modal para crear/editar consecutivos

**✅ MEJORES:**
- Segmentación operativa (año, mes, compañía, usuario, custom)
- Sincronización ERP con SQL Server
- Patrón de formato dinámico

**✅ CORREGIDO:**
- Validación de campos obligatorios (nombre, descripción)
- Validación SQL Sync completa:
  - Campos obligatorios (tabla, keyField, keyValue, valueField)
  - Formato de nombre de tabla (schema.tabla)
  - Validación de patrón de formato si está configurado

**⚠️ PROBLEMAS PENDIENTES:**
- No se valida que la tabla existe en el servidor (requiere llamada API)
- No se valida que los campos existen en la tabla
- No se valida la conexión al servidor

---

### 7. usePromotionConfig.js

**Función:** Gestión de configuración de promociones

**✅ MEJORES:**
- Gestión de reglas de promoción
- ✅ conditions y actions con valores por defecto basados en detectFields/targetFields
- Edición y eliminación de reglas

**Estado:** ✅ **CORREGIDO** - Las reglas ya no se crean con objetos vacíos.

---

## 📋 RESUMEN DE ESTADO ACTUAL

| # | Problema | Archivo | Estado | Impacto |
|---|----------|---------|--------|---------|
| 1 | Transformación no guardada | FieldMappingModal.jsx | ✅ SOLUCIONADO | - |
| 2 | Inline styles en modales | ConsecutiveConfigSection.jsx | ✅ SOLUCIONADO | - |
| 3 | Validación duplicados consecutivos | ConsecutiveConfigSection.jsx | ✅ SOLUCIONADO | - |
| 4 | Validación SQL Sync | ConsecutiveFormModal.jsx | ✅ SOLUCIONADO | - |
| 5 | Lookup SQL no validado | FieldMappingModal.jsx | ⚠️ PENDING | MEDIA |
| 6 | Campos tabla dinámicos | ConsecutiveConfigSection.jsx | ⚠️ PENDING | MEDIA |
| 7 | Validación existencia tabla | ConsecutiveFormModal.jsx | ⚠️ PENDING | MEDIA |
| 8 | PromotionConfigSection no usado | MappingEditor.jsx | ✅ SOLUCIONADO | - |
| 9 | WorkflowConfigSection no mostrado | MappingEditor.jsx | ✅ SOLUCIONADO | - |

---

## 🎯 PRIORIDADES ACTUALIZADAS

### PRIORIDAD ALTA (Corregido ✅):
- ✅ Transformaciones guardadas correctamente
- ✅ Inline styles reemplazados con Tailwind
- ✅ Validación de duplicados de consecutivos
- ✅ Validación SQL Sync completa

### PRIORIDAD MEDIA (Pendientes):
1. Validación de sintaxis SQL en Lookup
2. Campos de tabla dinámicos en ConsecutiveConfigSection
3. Validación de existencia de tabla en SQL Sync
4. Validación de campos existentes en tabla

### PRIORIDAD BAJA (Ya implementado ✅):
1. ✅ PromotionConfigSection - Componente UI completo para reglas de promoción
2. ✅ WorkflowConfigSection - Componente UI completo para flujo de trabajo
3. Logging detallado de errores
4. Mensajes de error más claros en modales

---

## CONCLUSIÓN

### Arquitectura General: ✅ SOLIDA

- **Modularidad:** Separación clara entre frontend, hooks, API y backend
- **Escalabilidad:** Arquitectura de microservicios preparada
- **UX:** Diseño moderno y consistente con TailwindCSS

### Problemas Críticos: ✅ RESUELTOS

1. ✅ Persistencia de transformaciones
2. ✅ Inline styles incompatibles con Tailwind
3. ✅ Validaciones de duplicados
4. ✅ Validaciones SQL Sync

### Problemas Pendientes (No Críticos):

1. ⚠️ Validaciones SQL adicionales (existencia de tabla, campos)
2. ⚠️ Uso de componentes pasados como props en MappingEditor (ya implementados)

---

*Documento actualizado al 2026-05-18 - Estado post-corrección de problemas críticos.*
