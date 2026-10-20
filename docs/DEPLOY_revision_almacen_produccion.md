# Despliegue a producción — Revisión de Almacén en Despacho de Cargas

Checklist de todo lo que hay que correr/verificar en producción para activar el
flujo nuevo (Almacén concilia cantidades antes de que se dispare el traspaso
real). El código ya está en el repo (backend: `loadsService.js`,
`LoadsSQLService.js`, `loadsController.js`, `loadsRoutes.js`,
`loadsValidator.js`, `models/loadsModel.js`; frontend: `WarehouseReview.jsx`,
`WarehouseReviewDetail.jsx`, `useWarehouseReview.jsx`, `LoadsApi.jsx`,
rutas en `AdminRouter.jsx`, link en `TopNav.jsx`). Lo que falta es aplicar
esquema + reconfigurar Mongo + desplegar, **en ese orden**.

## Hallazgos de la auditoría (2026-10-20)

Se investigó un número de 22 dígitos apareciendo en `Order_Num` río abajo
(Telynet/Preventa). Verificado con datos reales contra server1/server2 (que
resultaron ser la MISMA instancia física de SQL Server, bases `EXACTUS` y
`TELYNET`):
- `core_app.loads_orders_staging.order_num` y la query real de la tarea
  `IMPLT_Orders` están limpios — no hay ningún código en este repo generando
  ese número.
- Existe una vista vieja `dbo.[IMPLT_Orders]` en `EXACTUS` (pre-rediseño, la
  de `docs/vistas.txt`) que hardcodea `NULL AS Order_Num` — pero no la
  referencia ningún job, stored procedure ni linked server hoy. Está
  huérfana. **Pendiente, opcional**: hacer `DROP VIEW [dbo].[IMPLT_Orders]`
  en `EXACTUS` en algún mantenimiento, para que no quede como trampa a
  futuro (nadie la usa, pero alguien podría reactivarla por error).
- **Verificar manualmente** (no se pudo desde acá): si el campo `Order_Num`
  de la tarea `IMPLT_Orders` real tiene un "Consecutivo" asignado en la UI
  de Gestión de Tareas — eso generaría un valor nuevo por fuera de lo que
  mandamos en `order_num`, sin que el código de este repo tenga nada que ver.

## Por qué el orden importa

Hay dos riesgos reales de producción si esto se hace en el orden equivocado:

1. **Filas huérfanas**: `core_app.loads_orders_staging` / `loads_detail_staging`
   ya tienen filas hoy (cargas despachadas con el código viejo). Si se agrega
   la columna `review_status` con default `'pending'` y después se le pone el
   filtro a la tarea de push, esas filas viejas (y cualquier fila que inserte
   el backend viejo mientras dura el despliegue) quedan invisibles para
   siempre — nunca las marca nadie como `'approved'` porque nunca pasan por
   el flujo nuevo. Por eso el DDL en `docs/sql/loads_warehouse_review_schema.sql`
   usa default **`'approved'`**, no `'pending'` — el código nuevo siempre
   especifica el valor explícito en el INSERT, así que el default solo le
   pega a lo que ya existía o a lo que inserte el código viejo durante la
   ventana de despliegue.
2. **Despachos sin revisar subiendo a server2**: la tarea automática de push
   (cron diario + botón "Ejecutar" manual) puede correr en cualquier momento.
   Si el backend nuevo ya está desplegado (empieza a insertar
   `review_status='pending'` de verdad) pero el filtro todavía no está en la
   query de Mongo, esas cargas nuevas se van a subir a server2 sin que
   Almacén las haya revisado — exactamente lo que este feature busca evitar.

Por eso el filtro de Mongo (paso 2) va **antes** del despliegue del código
nuevo (paso 3), no después.

## Pasos

### 1. Aplicar el esquema SQL en server1 (producción)

Correr `docs/sql/loads_warehouse_review_schema.sql` contra la base de
producción. Es idempotente (todo con `IF NOT EXISTS`), se puede re-correr sin
problema, incluso si ya lo corriste antes con una versión anterior del
archivo (trae su propia migración para agregar `tipo_linea` si la tabla ya
existía sin esa columna). Agrega:
- Tabla `core_app.loads_orders_adjustments`, con `tipo_linea` ('P'/'B') en
  su clave única — necesaria para que Almacén pueda ajustar la cantidad
  pagada y la bonificada de una misma línea por separado (no sabemos la
  regla de promoción de Preventa para recalcular una a partir de la otra).
- Columna `review_status` en ambas tablas de staging, default `'approved'`.

No requiere downtime ni afecta el flujo actual — las tareas de push siguen
funcionando exactamente igual que hoy hasta el paso 2. El resto de los fixes
de esta sesión (RUBRO2/RUBRO4 → Order_Num, bodega destino real en
`authorizeDispatch`, fecha en la lista de Revisión) son solo código — no
necesitan ningún paso extra en producción más allá de desplegar la imagen
nueva (paso 3).

### 2. Agregar el gate a las tareas de push (Mongo, manual)

Buscar las tareas `IMPLT_Orders` e `IMPLT_loads_detail` (colección
`TransferTask`, o vía la UI de Gestión de Tareas) y agregarle
`AND review_status = 'approved'` al `WHERE` existente (el que ya filtra por
`transfer_status = 1`).

**Actualización**: `IMPLT_Orders` ya tiene este filtro aplicado (confirmado
2026-10-20, `WHERE transfer_status = 1 AND review_status = 'approved'`).
Falta confirmar `IMPLT_loads_detail` de la misma forma — abrirla en
"Gestión de Tareas" y chequear que su `WHERE` también tenga
`AND review_status = 'approved'`; si no lo tiene, agregarlo igual que en
`IMPLT_Orders`.

Como todas las filas existentes y las que inserte el backend viejo quedan en
`review_status='approved'` por el default del paso 1, este cambio no frena
nada que esté en curso — solo empieza a importar en cuanto el backend nuevo
(paso 3) inserte `'pending'` explícito.

### 3. Desplegar el backend y frontend nuevos

Camino normal del repo (`docker-compose.prod.yml`, imágenes
`ghcr.io/heriberto777/core_app-{backend,frontend}`):
1. Mergear/pushear esta rama a `main` (si no está ya).
2. Build + push de ambas imágenes Docker (backend y frontend).
3. Pull + up de `docker-compose.prod.yml` en el servidor de producción.

Desde este momento, un despacho nuevo en "Gestión de Cargas" ya NO ejecuta
el traspaso de inmediato — queda en `pendingWarehouseReview` y aparece en
"Revisión de Almacén" (nuevo link en el menú, mismo recurso `loads`).

### 4. Verificar permisos de rol — paso que fácil se pasa por alto

El endpoint `POST /loads/review/:loadId/authorize` ("Autorizar despacho")
está protegido con `checkPermission('loads', 'manage')`. Según
`server/scripts/initRoles.js`, hoy **solo el rol admin tiene `loads:manage`**
— los demás roles con acceso a Cargas tienen como mucho
`["create","read","update","delete"]`, sin `manage`.

Antes de que Almacén pueda usar la pantalla nueva, confirmar en
"Gestión de Roles" (UI) qué rol usa el personal de Almacén y agregarle la
acción `manage` sobre el recurso `loads` si no la tiene — si no, van a ver
el botón "Autorizar despacho" pero les va a fallar con 403.

### 5. Pruebas en producción (Fase 6 del plan — las corrés vos)

Con datos reales, en este orden:
1. Despachar una carga real desde "Gestión de Cargas" → confirmar que queda
   en "Revisión de Almacén" (estado `pendingWarehouseReview`) y que **no**
   aparece ninguna fila nueva con `review_status='approved'` en el staging
   para esa carga.
2. Entrar al detalle, confirmar que la conversión Cajas/Unidades contra el
   `peso_bruto` real del producto da el empaque correcto.
3. Ajustar una línea por faltante, confirmar que
   `CATELLI.PEDIDO_LINEA.CANTIDAD_PEDIDA` del pedido afectado **no cambió**
   (el ajuste vive solo en `core_app.loads_orders_adjustments`).
4. Autorizar → confirmar que se generó un solo `TRA######` (sin duplicar) y
   que el staging de esa carga quedó en `review_status='approved'` con las
   cantidades ya corregidas.
5. Confirmar que la tarea automática de push no toma nada de esta carga
   hasta el paso 4, y que sí la toma después (puede ser con "Ejecutar"
   manual para no esperar al cron diario).
6. Reintentar autorizar la misma carga ya autorizada → debe rechazar
   (guarda de idempotencia en `loadsService.authorizeDispatch`), sin generar
   un segundo traspaso.
