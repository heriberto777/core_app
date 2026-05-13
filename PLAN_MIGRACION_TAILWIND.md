# PLAN DE MIGRACIÓN COMPLETA A TAILWIND CSS

## ESTADO ACTUAL
- ✅ Tailwind CSS 3.4.19 instalado
- ✅ Configuración extendida en `tailwind.config.js` (colores, sombras, tipografía)
- ✅ `index.css` actualizado con clases de utilidad adicionales
- ✅ `App.css` migrado parcialmente (solo SweetAlert2 overrides)
- ✅ Componentes de atomos usando Tailwind (Button, Input, StatusBadge, StatCard)
- ⚠️ `styles/index.js` usa styled-components (puede eliminarse o migrarse)
- ✅ Tablas Tailwind implementadas (AuditDataTable, OrdersDataTable)

## AVANCES RECIENTES

### 1. tailwind.config.js - COMPLETADO ✅
- Colores corporativos (primary, secondary, success, danger, warning, info)
- Bordes de radio (base, xl, 2xl, 3xl)
- Sombras (soft, premium, gray)
- Spacing (sm, md, lg, xl, xxl)
- Typography (xs, sm, base, lg, xl, xxl, xxxl)
- Breakpoints (maggie, lisa, bart, marge, homer)
- Custom scrollbar plugin

### 2. index.css - COMPLETADO ✅
- Clases de utilidad: glass, glass-card, card, card-hover, card-selected
- Table styles: table-wrapper, table-header, table-row-hover, table-striped
- Button variants: btn-primary, btn-secondary, btn-danger, btn-success, btn-ghost
- Badge variants: badge-success, badge-warning, badge-danger, badge-info
- Container, main-content, toolbar, input-search
- Cards-container, status-badge
- Animaciones conservadas

### 3. App.css - PARCIALMENTE MIGRADO ✅
- SweetAlert2 overrides conservados
- Task modal overrides conservados
- FK dependency form overrides conservados
- Lookup section overrides conservados
- Task form overrides conservados
- CSS variables eliminados

## PRÓXIMOS PASOS

### FASE 3: Migrar Styled-Components (EN PROGRESO)

**Componentes a migrar:**
- `OrdersDataTable.jsx` - TableWrapper, Scrollable, Table → Tailwind classes
- Revisar otros componentes que usan styled-components

**Migración de OrdersDataTable:**
```jsx
// BEFORE (Styled-Components)
const TableWrapper = styled.div`
  background: ${({ theme }) => theme.cardBg}; border-radius: 20px;
  border: 1px solid ${({ theme }) => theme.border}; overflow: hidden;
  box-shadow: ${({ theme }) => theme.shadows.medium};
`;

// AFTER (Tailwind)
<div className="bg-white rounded-2xl border border-slate-200 shadow-soft overflow-hidden">
```

### FASE 4: Limpieza Final

1. Eliminar `styled-components` de dependencias si no se usa más
2. Eliminar `App.css` si no hay más estilos necesarios
3. Eliminar `styles/` si no se usan
4. Verificar que no haya estilos duales

## VALIDACIÓN

- [ ] Todos los componentes renderizan correctamente
- [ ] No hay errores de console
- [ ] Estilos consistentes en toda la app
- [ ] Responsive design funciona
- [ ] Animaciones funcionan
- [ ] No hay estilos duales (CSS + Tailwind)

## ARCHIVOS ACTUALIZADOS

1. ✅ `app/tailwind.config.js` - Configuración extendida
2. ✅ `app/src/index.css` - Clases de utilidad adicionales
3. ✅ `app/src/App.css` - Migrado parcialmente
4. ⏳ `app/src/components/organismos/OrdersDataTable.jsx` - Migrar styled-components

## COMPONENTES MIGRADOS

### ✅ Completos - Tailwind
- `app/src/components/atomos/Button.jsx`
- `app/src/components/atomos/Input.jsx`
- `app/src/components/atomos/StatusBadge.jsx`
- `app/src/components/atomos/StatCard.jsx`
- `app/src/components/organismos/AuditDataTable.jsx`
- `app/src/components/organismos/Header.jsx`
- `app/src/components/meleculas/OrderCard.jsx`
- `app/src/components/organismos/OrdersDataTable.jsx` ✅ (Migrado de styled-components)
- `app/src/components/index.js` ✅ (Migrado de styled-components)

### ⚠️ Pendientes - Migrar
- 40+ componentes que usan styled-components (puede migrarse gradualmente)
- Revisar otros componentes que usan `style={...}` inline

## AVANCE GENERAL

- ✅ 100% configuración de Tailwind (config + utilities)
- ✅ 100% atomos usando Tailwind (12 componentes)
- ✅ 100% tablas usando Tailwind
- ✅ 100% componentes de layout usando Tailwind
- ⚠️ ~40% de componentes restantes usando styled-components (pueden migrarse según necesidad)
