# LISTA DE COMPONENTES PENDIENTES DE MIGRACIÓN

## Componentes que usan styled-components (40 archivos)

### MODALES DE FORMULARIOS (12)
1. ModuleFormModal.jsx
2. ConsecutiveFormModal.jsx
3. RoleFormModal.jsx
4. RecipientFormModal.jsx (COMPLETADO)
5. EmailConfigFormModal.jsx (COMPLETADO)
6. LoadsProcessModal.jsx (COMPLETADO)
7. ConsecutiveDetailsModal.jsx (COMPLETADO)
8. ConsecutiveAssignModal.jsx (COMPLETADO)
9. ValueMappingModal.jsx (COMPLETADO)
10. DocumentRuleModal.jsx (COMPLETADO)
11. DependencyModal.jsx (COMPLETADO)
12. EmailTestModal.jsx (COMPLETADO)

### DASHBOARD (2)
13. IntelligenceGrids.jsx
14. ConsecutiveDashboardPanel.jsx

### TABLAS (3)
15. RecipientsTable.jsx (COMPLETADO)
16. TraspasoFiltersPanel.jsx (COMPLETADO)
17. SummaryDataTable.jsx (COMPLETADO)

### FILTROS (2)
18. OrdersFilterPanel.jsx (COMPLETADO)
19. SummaryFilterPanel.jsx (COMPLETADO)

### SECCIONES DE CONFIGURACIÓN (3)
20. WorkflowConfigSection.jsx (COMPLETADO)
21. ConsecutiveConfigSection.jsx (COMPLETADO)
22. ScheduleConfiguration.jsx (COMPLETADO)

### MODALES ESPECIALES (8)
23. OrderDetailsModal.jsx
24. ProcessingResultsModal.jsx
25. ProcessingStatusModal.jsx
26. ReturnProcessModal.jsx
27. ClearLogsModal.jsx
28. SourceDataViewerModal.jsx
29. DBConnectionModal.jsx
30. DocumentDetailsModal.jsx

### OTROS (10)
31. DynamicSidebar.jsx
32. LinkedGroupsManager.jsx
33. DeliveryPersonSelector.jsx
34. SchedulerPanel.jsx
35. ScheduleConfigManager.jsx
36. CustomerFormGroups.jsx
37. UserRoleManager.jsx
38. LogDetailModal.jsx
39. OrderDetailsModal.jsx (duplicado)
40. ClearLogsModal.jsx (duplicado)

## ESTRATEGIA DE MIGRACIÓN

### Prioridad Alta (Formularios complejos)
- ModuleFormModal, ConsecutiveFormModal, RoleFormModal
- EmailConfigFormModal, LoadsProcessModal
- DependencyModal, DocumentRuleModal

### Prioridad Media (Tablas y filtros)
- RecipientsTable, TraspasoFiltersPanel, SummaryDataTable
- OrdersFilterPanel, SummaryFilterPanel

### Prioridad Baja (Dashboards y utilidades)
- IntelligenceGrids, ConsecutiveDashboardPanel
- WorkflowConfigSection, ScheduleConfiguration
- DynamicSidebar, LinkedGroupsManager

## PATRÓN DE MIGRACIÓN

Para cada componente:
1. Identificar todos los `styled.div`, `styled.section`, `styled.table`, etc.
2. Reemplazar con clases Tailwind correspondientes
3. Migrar inline styles a Tailwind
4. Mapear colores CSS a Tailwind
5. Mapear animaciones a Tailwind/inline styles
