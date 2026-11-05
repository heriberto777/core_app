# Análisis: Gestor Universal — Mapping de Cliente y Factura (server2 → CATELLI)

**Fecha:** 2026-10-27, retomado y en curso desde 2026-10-29.
**Estado:** EN CURSO — retomado el 2026-10-29, respondiendo las preguntas abiertas una por una
con datos reales que trae el usuario.
**Objetivo original:** diseñar el mapping (vía el motor genérico `TransferMapping` +
`DynamicTransferService.js`, el "Gestor Universal" ya existente) para crear, en CATELLI
(server1), clientes y facturas nuevos que hoy se originan en server2.

**CAMBIO DE ALCANCE (2026-10-29):** la creación de **Cliente nuevo** queda **fuera de
alcance por ahora** — el usuario la va a trabajar más a fondo como una sección aparte más
adelante. Toda la sección 1 (Cliente) de abajo queda como investigación histórica de
referencia, sin seguir avanzando en ella por el momento. El trabajo activo de acá en más es
**solo el mapping de Factura**, asumiendo que el cliente dueño del pedido **ya existe** en
`CATELLI.CLIENTE` (confirmado con los 3 ejemplos reales de la pregunta 2: `CN17137`,
`CN17160`, `CN17376` ya existían con `NOMBRE`/`NIVEL_PRECIO` poblados). Si en el futuro
aparece un pedido de un cliente que realmente no existe todavía, eso se resuelve en la
sección de Cliente cuando se retome.

No se tocó código en ninguna parte de este análisis — es 100% investigación de estructura
real de tablas, con datos de ejemplo reales traídos por el usuario (no inventados).

---

## 1. Cliente — mapping server2 → CLIENTE / DETALLE_DIRECCION / DIRECC_EMBARQUE / CLIENTE_VENDEDOR

> **FUERA DE ALCANCE por ahora (2026-10-29).** Esta sección completa queda como
> investigación histórica de referencia — el usuario decidió trabajarla a fondo como una
> sección aparte más adelante. El trabajo activo es solo el mapping de Factura (sección 2),
> asumiendo cliente ya existente en CATELLI.

### Hallazgo central: `DETALLE_DIRECCION`

`CLIENTE.DETALLE_DIRECCION` es un entero que en realidad es **FK hacia una tabla aparte**
llamada literalmente `DETALLE_DIRECCION` (no una columna calculada ni un patrón de
numeración parametrizado). Confirmado con datos reales (4 clientes de ejemplo:
18493/O0002103/O0002104/O0002105 → DETALLE_DIRECCION 22336/22337/22338/22339,
consecutivos en orden cronológico de alta).

**Se confirmó explícitamente que esa columna NO es `IDENTITY`** (`sys.columns.is_identity = 0`,
`Allow Nulls = No`, sin default, verificado tanto por `sys.identity_columns` como por el
diseñador de tabla en SSMS). Es decir: nada a nivel de base de datos genera ese número —
alguna lógica de aplicación (Exactus) lo calcula y lo pasa explícitamente en cada INSERT,
probablemente con un patrón `MAX(DETALLE_DIRECCION)+1`, pero no tenemos certeza del mecanismo
exacto.

**Decisión tomada:** no reinventar ese "próximo número" nosotros. Se confirmó con el
diccionario de columnas requeridas de `CLIENTE` que **`DETALLE_DIRECCION` NO es obligatorio**
para insertar un cliente nuevo — así que para la primera versión del mapping se deja
`CLIENTE.DETALLE_DIRECCION = NULL` y no se toca esa tabla. Revisar más adelante si hace
falta estructurar direcciones ahí.

### `DIRECC_EMBARQUE`

Estructura real: `CLIENTE`, `DIRECCION` (código corto, ej. `'ND'` = dirección por defecto),
`DETALLE_DIRECCION` (viene `NULL` en todos los ejemplos — no hace falta poblarlo para el
caso por defecto), `DESCRIPCION`, `CONTACTO`, `CARGO`, teléfonos, `u_code_account` (campo
custom, `NULL` en todos los ejemplos — **descartado como puente con
`route_accounts_syncs.code_account`**, ver pregunta 6 resuelta: el usuario aclaró que lo creó
para otro propósito no relacionado con este mapping, no hace falta poblarlo).
El usuario indicó que para el caso mínimo alcanza con pocos campos (`CLIENTE`, `DIRECCION='ND'`),
aunque sería ideal pasar la info completa cuando esté disponible.

### `CLIENTE_VENDEDOR`

Tabla puente simple: `CLIENTE` + `VENDEDOR` (código de `CATELLI.VENDEDOR`) + auditoría
estándar + `u_code_account` (mismo patrón custom que en `DIRECC_EMBARQUE`, también `NULL`
en los ejemplos — mismo descarte, no se usa como puente).

### `CLIENTE` — columnas requeridas

De ~190 columnas totales, 49 son requeridas (`ColumnaRequeridaReal`, ver conversación para
la lista completa). La mayoría son defaulteables sin pensar (`SALDO*=0`, `ACTIVO='S'`, etc.),
pero este grupo necesita valor de negocio real, no default genérico, y queda pendiente
resolver de dónde sale cada uno:

- `NOMBRE`, `CONTRIBUYENTE` (RNC/cédula), `FECHA_INGRESO`
- `MONEDA`, `CONDICION_PAGO`, `NIVEL_PRECIO`
- `PAIS`, `ZONA`, `RUTA`, `COBRADOR`
- `CATEGORIA_CLIENTE`, `CLASE_DOCUMENTO`
- `DIAS_ABASTECIMIEN`, `DIAS_PROMED_ATRASO`

Varios de estos (`RUTA`, `COBRADOR`, `ZONA`) son FK hacia catálogos del ERP — pendiente
decidir si server2 ya los trae resueltos o si hace falta un valor institucional por defecto
("ruta genérica de clientes nuevos", etc.) o un lookup.

### Pendiente para retomar (Cliente)

- ~~Confirmar si `u_code_account` debe poblarse con `route_accounts_syncs.code_account`~~ —
  RESUELTO, descartado (ver pregunta 6 en sección 4).
- Resolver de dónde sale cada uno de los 14 campos "requeridos con valor de negocio real"
  listados arriba — ¿vienen de server2, o hay que resolverlos contra catálogos de CATELLI?

---

## 2. Factura — cadena completa de tablas en CATELLI (confirmada con datos reales)

Factura de ejemplo usada para todo el análisis: **`FV1509778`** (`TIPO_DOCUMENTO='F'`).

```
FACTURA (TIPO_DOCUMENTO='F', FACTURA='FV1509778')
 │  ASIENTO_DOCUMENTO=2020165   AUDIT_TRANS_INV=5541120   PEDIDO=PRIP-...
 │
 ├─ FACTURA_LINEA (×4) — PK (TIPO_DOCUMENTO, FACTURA, LINEA)
 │    Mismo patrón de partición regular/oferta por BODEGA que ya existe en Cargas
 │    (PEDIDO_LINEA): mismo ARTICULO en BODEGA 01 (cantidad regular) y BODEGA 02
 │    (cantidad bonificada), cada línea con su propia CUENTA_CONTABLE.
 │
 ├─ DOCUMENTOS_CC (DOCUMENTO='FV1509778', TIPO='FAC', ASIENTO=2020165)
 │    Vínculo a FACTURA es por VALOR literal (DOCUMENTO = FACTURA.FACTURA), NO por RowPointer.
 │    RowPointer propio = 1731A581-...
 │    └─ NCF_DOCUMENTO (DOC_ROWPOINTER=1731A581-..., TABLA='DOCUMENTOS_CC')
 │         Referencia POLIMÓRFICA: la columna TABLA dice a qué tabla pertenece DOC_ROWPOINTER.
 │         NCF = B0292477146 (módulo 'CC', tipo documento 'FCF')
 │         └─ AUXILIAR_CC — SÍ es parte de "crear factura" (confirmado, ver más abajo):
 │              el cargo/CxC inicial por el monto total, autorreferenciado al documento
 │
 ├─ AUDIT_TRANS_INV (AUDIT_TRANS_INV=5541120, ASIENTO=2020165, APLICACION='FAC#FV1509778')
 │    Header del lote de inventario. REFERENCIA trae texto descriptivo ("Cliente: O0000041"),
 │    el vínculo real con la factura está en APLICACION ('FAC#FV1509778', prefijo+número).
 │    └─ TRANSACCION_INV (×4) — reconcilian EXACTO con FACTURA_LINEA (mismo artículo,
 │         bodega y costo en cada línea).
 │
 └─ ASIENTO_DE_DIARIO (ASIENTO=2020165, TOTAL_DEBITO=TOTAL_CREDITO=1010.25 — balanceado)
      └─ DIARIO (×17 líneas, REFERENCIA='FAC#FV1509778') — partida doble
```

**Conclusión clave:** crear una factura nueva implica reservar/sincronizar al menos 3
secuencias independientes (`FACTURA` propio, `ASIENTO`, `AUDIT_TRANS_INV`) de forma atómica
entre 8-9 tablas (ver corrección de alcance debajo — se agrega `AUXILIAR_CC`). No existe un
SP del ERP para esto (confirmado explícitamente por el usuario) — hay que armarlo a mano.

**AUXILIAR_CC — CONFIRMADO (responde pregunta 4): SÍ es parte de la creación de la factura.**
El usuario confirmó que, al venir el documento en `ALCXC_MOV_DIR` autorreferenciado a sí
mismo (`NUM_DOC_AF` = la propia factura), eso indica que el documento queda asociado como
cargo/CxC desde su creación — no es un flujo separado de cobros posterior como se asumió al
principio. **Corrige el alcance de "crear factura":** además de `FACTURA` + `FACTURA_LINEA`
+ `DOCUMENTOS_CC` + `NCF_DOCUMENTO` + `AUDIT_TRANS_INV` + `TRANSACCION_INV` +
`ASIENTO_DE_DIARIO` + `DIARIO`, el mapping también tiene que insertar en `AUXILIAR_CC` el
cargo inicial (monto total, pendiente de cobro). Pendiente para cuando se diseñe el mapping
concreto: relevar la estructura completa de columnas de `AUXILIAR_CC` (todavía no se hizo,
solo se identificó su rol).

---

## 3. Fuente en server2 (stdb_gnd) — ya identificada

Tablas reales en server2 (`172.18.7.17`, DB `stdb_gnd`):

- **`FAC_ENC_PED`** (encabezado, filtrar `TIP_DOC='F'`) — contiene las facturas a llevar al
  ERP. Trae: `NUM_PED`, `COD_CLT`, `FEC_PED`, `FEC_DES`, `COD_CND` (condición de pago),
  `COD_BOD`, `NIVEL_PRECIO`, `RUTA`, `VENDEDOR`, `NOMBRE_CLIENTE`, coordenadas GPS
  (`COD_GEO1`/`COD_GEO2`), **`NCF_PREFIJO`/`NCF`**, `ESTADO`.
- **`FAC_DET_PED`** (detalle, por `NUM_PED` + `NUM_LN`) — `COD_ART`, `ART_BON`,
  `CANTIDAD_BONIFICADA`, `MON_PRC_MN` (precio unitario), `CNT_MAX` (cantidad),
  `PORC_IMPUESTO1`, `Unit_Measure`, `Factor_Conversion`, `Code_Promotion`. **No tiene
  columna BODEGA** (a diferencia de `FACTURA_LINEA` en CATELLI).
- **`ALCXC_MOV_DIR`** — tabla de movimientos de cuentas por cobrar (`NUM_DOC_AF` = documento
  afectado, `COD_CLT`, `MON_MOV_LOCAL`). **Revisión importante respecto a lo asumido antes**
  (ver pregunta 4 actualizada abajo): con datos reales de las 3 facturas de este lote,
  `ALCXC_MOV_DIR` trae una fila por factura con `NUM_DOC_AF = NUM_PED` (la propia factura,
  **autorreferencia**, no un recibo aplicado a otro documento), `COD_TIP_DC='01'`,
  `MON_MOV_LOCAL` = monto total de la factura (126.45, igual a `FAC_ENC_PED.MON_CIV`),
  `IND_ANL='P'` (pendiente — no cobrado todavía), `FEC_DOC` = fecha de **despacho**
  (`FEC_DES`), no la de pedido. Esto parece ser el "cargo"/CxC que nace CON la factura (el
  saldo por cobrar inicial), no una aplicación de cobro posterior — contradice la conclusión
  anterior de que esta tabla era 100% post-creación. Falta confirmar con el usuario si crear
  la factura en CATELLI implica también crear la fila correspondiente en `AUXILIAR_CC`.

### Hallazgo grande: el NCF YA viene resuelto desde server2

`FAC_ENC_PED.NCF` ya trae el NCF real asignado (ejemplos reales: `'00116649609'` y
`'B0190007371'`) — **no hace falta construir lógica de secuencia fiscal nosotros**, se toma
tal cual y se usa al crear `DOCUMENTOS_CC`/`NCF_DOCUMENTO`. Esto resuelve el riesgo más
grande que se había identificado (compliance fiscal de NCF).

### DECISIÓN: bodega fija 01 para todo por ahora (reemplaza la legend NIVEL_PRECIO→bodega)

En la factura real `FV1509778` (sección 2) el patrón observado fue BODEGA 01 = regular /
BODEGA 02 = bonificada — la misma partición que ya existe en `PEDIDO_LINEA` de Cargas. En
teoría la bodega real de la porción bonificada depende del `NIVEL_PRECIO` del cliente, pero
el usuario decidió **no construir esa legend todavía**: para esta primera versión del
mapping, tanto la línea regular como la bonificada van a **BODEGA = '01'** fijo.

Esto es posible postergarlo porque ya está resuelta la detección de qué línea es bono
(`CANTIDAD_BONIFICADA > 0` + precio/impuesto en 0, confirmado arriba) — cuando se arme la
legend real por `NIVEL_PRECIO`, solo hay que cambiar el valor de bodega que se asigna a esa
línea, no la lógica de detección. Queda pendiente a futuro (fuera del alcance de esta primera
versión) construir la legend `NIVEL_PRECIO → bodega` real.

### CONFIRMADO con datos reales: la bonificación viene en una LÍNEA SEPARADA (responde pregunta 3)

Ejemplo real (`NUM_PED='9R01260000028'`, 2 líneas, mismo `COD_ART='176'`):

| NUM_LN | COD_ART | ART_BON | MON_PRC_MN | CNT_MAX | MON_TOT | PORC_IMPUESTO1 | CANTIDAD_BONIFICADA |
|---|---|---|---|---|---|---|---|
| 1 | 176 | 0 | 26.79 | 4.00 | 126.45 | 18.00 | .000 |
| 2 | 176 | 0 | **.00** | 1.00 | **.00** | **NULL** | **1.000** |

Mismo patrón que `PEDIDO_LINEA` en Cargas (línea regular + línea bonificada del mismo
artículo), confirmado en los 3 pedidos de ejemplo (`...028`, `...029`, `...030`) de forma
idéntica. **Corrección respecto a lo asumido antes:** la señal de "esta línea es bono" NO es
`ART_BON` (vino `0` en ambas líneas de los 3 ejemplos) — la señal real es
`CANTIDAD_BONIFICADA > 0` combinado con `MON_PRC_MN = 0`/`MON_TOT = 0` en esa línea. Falta
ver un ejemplo con `ART_BON=1` para entender qué significa ese flag si no es "línea de bono".

Como `FAC_DET_PED` no tiene columna BODEGA (ya señalado arriba), la línea 2 de este ejemplo
es exactamente el caso que necesita la legend `NIVEL_PRECIO → bodega` para saber en qué
bodega de CATELLI insertarla en `FACTURA_LINEA`/`TRANSACCION_INV`.

---

## 4. Preguntas abiertas, pendientes de responder con datos reales antes de diseñar el mapping

1. ~~Legend NIVEL_PRECIO → bodega de bonificación~~ — **RESUELTO por decisión**: se deja
   BODEGA='01' fija para ambas líneas (regular y bonificada) en esta primera versión del
   mapping. La legend real por `NIVEL_PRECIO` queda pendiente para una iteración futura, fuera
   de alcance por ahora (ver sección 3, "DECISIÓN: bodega fija 01 para todo por ahora").
2. ~~En los pedidos de ejemplo revisados, `FAC_ENC_PED.NIVEL_PRECIO` vino siempre `NULL`~~ —
   **RESUELTO**: se resuelve contra `CATELLI.CLIENTE.NIVEL_PRECIO`, confirmado con datos
   reales (`CLIENTE 17137→Silver`, `17160→Gold`, `17376→Gold`, todos poblados). **Hallazgo
   adicional importante para el join:** `FAC_ENC_PED.COD_CLT` trae el código con prefijo
   `'CN'` (ej. `'CN17137'`), pero `CATELLI.CLIENTE.CLIENTE` NO tiene ese prefijo (`'17137'`)
   — el mapping tiene que quitar el prefijo `CN` antes de unir contra `CLIENTE` (el motor del
   Gestor Universal ya soporta esta transformación como opción de configuración, sin código
   nuevo). Esta misma regla de prefijo aplica potencialmente a **cualquier** columna que
   referencie `COD_CLT` en el mapping (Cliente dueño de la Factura, lookups contra `CLIENTE`
   para resolver otros campos), no solo a `NIVEL_PRECIO` — tenerlo presente al diseñar el
   mapping completo.
3. ~~Todavía no se vio ninguna fila real de `FAC_DET_PED` con `ART_BON=1` o
   `CANTIDAD_BONIFICADA > 0`~~ — **RESUELTO**, ver sección 3: la bonificación viene en una
   línea separada (mismo artículo, `CANTIDAD_BONIFICADA>0` + precio/impuesto en 0), NO en
   `ART_BON` (que vino `0` en ambas líneas). Pendiente nuevo: entender para qué sirve
   entonces `ART_BON` si no marca la línea de bono.
4. ~~`ALCXC_MOV_DIR`: ¿crear la factura implica insertar en `AUXILIAR_CC`?~~ — **RESUELTO,
   CONFIRMADO**: sí, hay que insertarlo. El usuario confirmó que la autorreferencia en
   `ALCXC_MOV_DIR` (`NUM_DOC_AF` = la propia factura) indica justamente que el documento
   queda asociado/cargado desde su creación — no es un flujo de cobros separado. Ver la
   corrección de alcance en la sección 2. Sigue sin explicarse el caso viejo de 2 filas
   idénticas para el mismo `NUM_DOC_AF` (posible duplicado real o dato atípico) — no bloquea
   el diseño, queda como nota para cuando se releve la estructura completa de `AUXILIAR_CC`.
5. ~~`NCF`/`NCF_PREFIJO` inconsistentes entre ejemplos~~ — **RESUELTO, DECISIÓN DEL USUARIO**:
   se toma siempre `FAC_ENC_PED.NCF` completo (el campo `NCF_PREFIJO` de server2 NO se usa,
   es inconsistente). El prefijo que haga falta en el lado CATELLI se **deriva** tomando los
   3 primeros caracteres de `NCF` (ej. `NCF='B0190007374'` → prefijo derivado `'B01'`), no se
   toma del campo `NCF_PREFIJO` de server2.
6. ~~Confirmar si `u_code_account` (Cliente) debe poblarse con `route_accounts_syncs.code_account`~~
   — **RESUELTO**: el usuario aclaró que `u_code_account` (en `DIRECC_EMBARQUE` y
   `CLIENTE_VENDEDOR`) no es un campo requerido para este mapping — se creó para otro
   propósito no relacionado. Se descarta como candidato de puente con `route_accounts_syncs`;
   no hace falta poblarlo.
7. **FUERA DE ALCANCE por ahora (2026-10-29)** — resolver el origen de los 14 campos
   "requeridos con valor de negocio real" de `CLIENTE` (ver sección 1). Pertenece a la
   creación de Cliente nuevo, que el usuario decidió trabajar como sección aparte más
   adelante.
8. **PARCIALMENTE RESUELTO (2026-10-29)** — mecanismo por campo para las FK a catálogos de
   `FACTURA`, decidido por el usuario:
   - **`RUTA`**: NO se toma de `FAC_ENC_PED.RUTA` pese a venir poblado — se resuelve por
     lookup contra `CATELLI.CLIENTE.RUTA` (mismo mecanismo que `NIVEL_PRECIO`, pregunta 2).
   - **`ZONA`**: mismo criterio, lookup contra `CATELLI.CLIENTE.ZONA`, no se usa
     `FAC_ENC_PED.COD_ZON` directo.
   - **`COBRADOR`**: por ahora se toma de `CATELLI.CLIENTE.COBRADOR` (mismo mecanismo de
     lookup). **Decisión marcada como parametrizable, no definitiva** — el usuario aclaró que
     a futuro podría cambiarse para usar el mismo valor que `VENDEDOR`, u otro criterio, o
     incluso quitarse del mapping — hay que dejarlo configurable en el Gestor Universal, no
     hardcodeado como regla fija.
   - **`CONDICION_PAGO`**: sin cambios respecto al borrador — se toma directo de
     `FAC_ENC_PED.COD_CND` (server2 confiable para este campo, no necesita lookup).
   - **Regla general confirmada**: si server2 trae el campo poblado de forma confiable para
     ESE campo puntual, se usa tal cual; si no, o si el usuario decide que `CLIENTE` en
     CATELLI es la fuente de verdad aunque server2 también lo traiga, se resuelve por lookup
     contra `CATELLI.CLIENTE` — el mismo mecanismo ya usado para `NIVEL_PRECIO`.
   - **Pendiente todavía**: la lista completa y cerrada de columnas requeridas de `FACTURA`
     nunca se trajo (a diferencia de `CLIENTE`, donde sí se tiene el diccionario completo de
     49/14 columnas) — lo de arriba cubre los campos conocidos hasta ahora
     (`RUTA`/`ZONA`/`COBRADOR`/`CONDICION_PAGO`/`NIVEL_PRECIO`), pero puede haber más FKs sin
     identificar todavía en `FACTURA`.

## 5. HALLAZGO MAYOR (2026-10-29): ya existe un `TransferMapping` real y activo — `CargarFacturas`

El usuario trajo el documento completo de Mongo (`transfermappings`, `_id: 69b8bb4d9bc73d3e6e311a36`,
`name: 'CargarFacturas'`, **`active: true`**). Esto no es un mapping en diseño — ya está
construido, con dos tablas (`FAC_ENC_PED→CATELLI.FACTURA`, `FAC_DET_PED→CATELLI.FACTURA_LINEA`)
y, más importante, un **`workflowConfig` con 3 mappings encadenados** que se ejecutan
automáticamente después (`autoExecute: true`, en este orden):

0. `CargarFacturas` (este mapping: `FACTURA` + `FACTURA_LINEA`)
1. **"Cargar las facturas a CC"** (`linkField: 'NUM_PED'`) — probablemente `DOCUMENTOS_CC`
2. **"Cargar Recibo a FAC"** (`linkField: 'NUM_DOC_AF'`) — el nombre y el campo de enlace
   (`NUM_DOC_AF`, la misma columna de `ALCXC_MOV_DIR` de la pregunta 4) sugieren fuertemente
   que **esto es la carga a `AUXILIAR_CC`** que confirmamos como necesaria — ya existiría.
3. **"Carga NCF a NCF_D"** (`linkField/parentLinkField: 'NCF'`) — carga a `NCF_DOCUMENTO`.

No se abrió el contenido de los mappings 1/2/3 todavía (solo se ve su `mappingId`,
`linkField` y descripción en `CargarFacturas.workflowConfig`) — falta traerlos para
confirmar qué tabla destino tiene cada uno realmente.

### Validación cruzada: lo que YA coincide con lo que decidimos en esta sesión

| Campo `FACTURA` | Mecanismo real en el mapping | Coincide con pregunta 8 |
|---|---|---|
| `NIVEL_PRECIO`, `COBRADOR`, `RUTA`, `ZONA`, `VENDEDOR`, `PAIS`, `CONDICION_PAGO` | `lookupFromTarget` contra `CATELLI.CLIENTE WHERE CLIENTE=@COD_CLT`, con `removePrefix:'CN'` en el parámetro | Sí, exacto — confirma la regla general acordada |
| `CLIENTE`, `CLIENTE_DIRECCION`, `CLIENTE_CORPORAC`, `CLIENTE_ORIGEN` | los 4 toman `COD_CLT` con `removePrefix:'CN'` — **son el mismo valor repetido 4 veces**, no 4 conceptos distintos | Responde Grupo E #5 |
| `TOTAL_FACTURA` | `MON_CIV` directo | Coincide con Grupo C |
| `TOTAL_IMPUESTO1` | `MON_IMP_VT` directo | Coincide con Grupo C |
| `MONEDA` | `MONEDA` directo | Coincide con Grupo B |
| `BODEGA` (en `FACTURA_LINEA`) | hardcodeado `'01'` para todas las líneas | **Coincide con la decisión de dejar todo en bodega 01** |

### Respuestas al Grupo E (ya resueltas por el mapping real, no hace falta preguntar más)

- `MONEDA_FACTURA` → hardcodeado `'L'` (no es un duplicado derivado de `MONEDA`, es un valor
  fijo separado).
- `CLASE_DOCUMENTO` → hardcodeado `'N'`.
- `MODULO` → hardcodeado `'FA'`.
- `USUARIO` → hardcodeado `'FAC1'` (usuario de integración fijo).
- Fechas: `FECHA`/`FECHA_PEDIDO` ← `FEC_PED` (server2); **todas las demás**
  (`FECHA_DESPACHO`, `FECHA_RECIBIDO`, `FECHA_ENTREGA`, `FECHA_RIGE`, `FECHA_ORDEN`,
  `FECHA_HORA`) ← `GETDATE()` (momento de la carga, no vienen de server2).
- `VERSION_NP` (no estaba identificado antes) → lookup compuesto:
  `CATELLI.CLIENTE` + `CATELLI.VERSION_NIVEL` por `NIVEL_PRECIO`, filtrado `ESTADO='A'`.

### Hallazgos para CONFIRMAR con el usuario — posibles problemas reales en el mapping existente

1. ~~`TIPO_CAMBIO` hardcodeado en `36.7`~~ — **RESUELTO**, ver hallazgo 10 de la sección 6.4:
   intencional por ahora, resolver tasa dinámica contra el ERP queda como mejora futura.
2. ~~`TOTAL_MERCADERIA` y `TOTAL_IMPUESTO2` hardcodeados en `0`~~ — **RESUELTO**, ver hallazgo
   8 de la sección 6.4: es el mismo error que `DOCUMENTOS_CC.SUBTOTAL` — debe tomar el monto
   SIN impuesto (`MON_SIV`), no `0` ni el monto con impuesto. Pendiente confirmar el campo
   exacto de `FACTURA` equivalente a `BASE_IMPUESTO1` y si aplica la misma fórmula
   (`SUBTOTAL - DESCUENTO`).
3. **`DESCUENTO_VOLUMEN`** tiene `sourceField: 'DESCUENTO_VOLUMEN'` — pero esa columna **no
   existe** en `FAC_ENC_PED` (confirmado contra el resultado real de `FAC_ENC_PED` de la
   pregunta anterior). Esto probablemente resuelve siempre a vacío/null en ejecución —
   parece un mapeo residual (quizás copiado de otro mapping de Pedidos) sin efecto real.
4. **`PRECIO_UNITARIO` (en `FACTURA_LINEA`) ← `MON_PRC_MX`**, no `MON_PRC_MN`. En los
   ejemplos de `FAC_DET_PED` ambos vinieron iguales (`26.79`), así que no se pudo distinguir
   si esto es intencional o un error de columna. ¿`MON_PRC_MX` es el precio real a facturar,
   o debería ser `MON_PRC_MN`?
5. ~~`CUENTA_CONTABLE` (en `FACTURA_LINEA`) hardcodeada a un único valor fijo~~ —
   **RESUELTO (2026-10-30), ver sección 9**: no es un valor fijo institucional, se resuelve por
   artículo vía `CATELLI.ARTICULO_CUENTA.CTA_VENTAS_LOC` (lookup encadenado
   `ARTICULO → ARTICULO_CUENTA`). El hardcode actual de `CargarFacturas` es un bug real que
   funciona solo cuando todos los artículos del pedido comparten el mismo grupo contable.
6. **`promotionConfig.enabled: false`** — la detección de línea de bono (que coincide
   exactamente con lo que reconciliamos en la sección 3: `ART_BON`, `CNT_MAX`, etc. ya están
   precargados como configuración, pero apagados) no está activa. Como de todas formas
   decidimos bodega `'01'` fija para ambas líneas, esto puede no ser bloqueante — pero
   confirmar que no hace falta ningún tratamiento especial de la línea de bono más allá de
   insertarla tal cual (con precio/impuesto en 0, que sí vienen bien del dato real).
7. ~~GAP: no aparece ningún mapping hacia `AUDIT_TRANS_INV`/`TRANSACCION_INV` ni
   `ASIENTO_DE_DIARIO`/`DIARIO`~~ — **CONFIRMADO con el listado completo de TODOS los mappings
   del sistema (sección 6)**: es un hueco real, no hay ningún mapping para esas 4 tablas en
   ningún lado del sistema, encadenado o no. Ver sección 6 para el detalle completo.

## 6. Análisis a fondo COMPLETO de los 3 mappings encadenados + auditoría de las 7 tablas (2026-10-30)

El usuario trajo el contenido completo de los 3 mappings encadenados por `CargarFacturas`
(`Carga_Fac_To_CC`, `CargasRecibos`, `CargaNCF_Fac`), el diccionario de columnas requeridas
de las 7 tablas del diagrama original (`DOCUMENTOS_CC`, `NCF_DOCUMENTO`, `AUXILIAR_CC`,
`AUDIT_TRANS_INV`, `TRANSACCION_INV`, `ASIENTO_DE_DIARIO`, `DIARIO`), y el listado resumido
de **todos** los `TransferMapping` que existen en el sistema (6 en total).

### 6.1 Mapa completo de los 6 mappings existentes en el sistema

| Mapping | Tabla(s) destino | entityType |
|---|---|---|
| `CargaPedidosPendientes` | `PEDIDO`, `PEDIDO_LINEA` | orders |
| `CargaDeClientes` | `CLIENTE`, `CLIENTE_VENDEDOR` | customers |
| `CargarFacturas` | `FACTURA`, `FACTURA_LINEA` | invoices |
| `Carga_Fac_To_CC` | `DOCUMENTOS_CC` (desde `FAC_ENC_PED`, tipo `'FAC'`) | invoices |
| `CargasRecibos` | `DOCUMENTOS_CC` (desde `ALCXC_MOV_DIR`, tipo `'REC'`) + `AUXILIAR_CC` | orders *(nota: entityType mal etiquetado, debería ser invoices)* |
| `CargaNCF_Fac` | `NCF_DOCUMENTO` | invoices |

**CONFIRMADO DEFINITIVAMENTE: no existe, en ningún lado del sistema, ningún mapping hacia
`AUDIT_TRANS_INV`, `TRANSACCION_INV`, `ASIENTO_DE_DIARIO` ni `DIARIO`.** Esto es un hueco
real, no una omisión de la cadena de `CargarFacturas` nada más — **ninguna de las 7-8 tablas
del diagrama de la sección 2 relacionadas a inventario y asiento contable tiene cobertura**.
Toda factura cargada por esta cadena de 4 mappings queda, hoy:
- Con `FACTURA.AUDIT_TRANS_INV = 'NULL'` explícito (nunca se linkea a un lote de inventario).
- Con `FACTURA.ASIENTO_DOCUMENTO` sin mapear (queda `NULL`, nunca se linkea a un asiento).
- **Sin ningún descuento de inventario real** (`TRANSACCION_INV` nunca se inserta).
- **Sin ningún asiento contable balanceado** (`ASIENTO_DE_DIARIO`/`DIARIO` nunca se insertan).

**RESUELTO (2026-10-30): es un hueco real de este pipeline — SÍ hay que diseñarlo y
construirlo acá, no es responsabilidad de otro proceso del ERP.** El usuario confirmó
explícitamente que tanto el descuento de inventario (`AUDIT_TRANS_INV`/`TRANSACCION_INV`) como
el asiento contable (`ASIENTO_DE_DIARIO`/`DIARIO`) deben resolverse dentro de este mismo
mapping de Factura. Pasa a ser trabajo pendiente de diseño, no una pregunta abierta de alcance.
Ver sección 7 para el primer hallazgo concreto sobre cómo se genera el consecutivo de
`ASIENTO_DE_DIARIO` (tabla `CATELLI.PAQUETE`).

### 6.2 Patrón de "doble documento" en Cuentas por Cobrar — descubierto y parece coherente, a confirmar

`Carga_Fac_To_CC` y `CargasRecibos` NO son redundantes entre sí — insertan dos filas
DISTINTAS en `DOCUMENTOS_CC`:
- `Carga_Fac_To_CC`: `DOCUMENTO = NUM_PED` (el número de la factura), `TIPO = 'FAC'` — el
  documento de cargo (la factura misma).
- `CargasRecibos` (tabla `CXC_`): `DOCUMENTO` = un **consecutivo nuevo** (vía
  `consecutiveConfig`, no viene de server2), `TIPO = 'REC'`, `SALDO = 0` (hardcodeado, sin
  saldo pendiente), `APROBADO = 'S'` — el documento de "recibo"/cobro.
- `CargasRecibos` (tabla `APLICAR_AUXILIAR`, detalle de la anterior): inserta en
  `AUXILIAR_CC` con `DEBITO = NUM_DOC_AF` (la factura) y `CREDITO` = el consecutivo del
  recibo recién creado — la aplicación que cierra el saldo de la factura contra el recibo.

Esto arma un patrón de doble entrada coherente con un modelo de **venta de ruta con cobro
contra-entrega**: la factura se carga YA COBRADA (saldo cero) porque en `ALCXC_MOV_DIR`
(server2) cada factura trae su propio "recibo" implícito (`NUM_DOC_AF` = la propia factura,
con `IND_ANL='P'` que marcamos como "pendiente" en la sesión anterior, pero que acá se trata
como ya cobrado). **Esto coincide con `FACTURA.CARGADO_CXC='S'`** que ya habíamos visto en
`CargarFacturas`.

**RESUELTO (2026-10-30):** el usuario confirmó que **sí existen facturas que deben quedar con
saldo pendiente real**, dos casos concretos:
- **Ventas a crédito**: la factura nace con saldo pendiente real (no contra-entrega), y el
  cobro llega después como un documento separado.
- **Recibos que saldan una factura de otra fecha**: a veces `ALCXC_MOV_DIR` no trae el cargo
  de la propia factura recién creada, sino el cobro de **una factura previa** que no se
  procesó/cobró en su momento — en ese caso `NUM_DOC_AF` referencia el documento viejo, y el
  propósito de esa fila es justamente traer el recibo para saldar ese documento `X` existente,
  no crear un cargo nuevo autorreferenciado.

**Implicación para el diseño:** el patrón de "doble documento" (`Carga_Fac_To_CC` tipo `'FAC'`
+ `CargasRecibos` tipo `'REC'` + `AUXILIAR_CC` cerrando `SALDO=0`) **no puede asumirse siempre
autorreferenciado** — hay que distinguir, por fila de `ALCXC_MOV_DIR`, si `NUM_DOC_AF` apunta a
la factura que se está creando en este mismo lote (caso contra-entrega, cierra en `0`) o a un
documento `DOCUMENTOS_CC` ya existente de una factura anterior (caso "recibo que salda saldo
viejo", donde el `DEBITO` de `AUXILIAR_CC` debe apuntar a ese documento viejo, no al nuevo). El
mapping real actual (`CargasRecibos`) no distingue este caso — queda como hallazgo nuevo a
tratar en el diseño (ver punto 11 en la sección 6.4).

### 6.3 Auditoría de columnas requeridas — resultado: DOCUMENTOS_CC / AUXILIAR_CC / NCF_DOCUMENTO están completas

Se cruzaron las 3 listas de columnas requeridas contra los `fieldMappings` reales:

- **`DOCUMENTOS_CC`** (41 columnas requeridas) — **cubiertas todas**, combinando
  `Carga_Fac_To_CC` (inserción tipo `'FAC'`) y `CargasRecibos`/`CXC_` (inserción tipo `'REC'`).
- **`AUXILIAR_CC`** (17 columnas requeridas) — **cubiertas todas** por
  `CargasRecibos`/`APLICAR_AUXILIAR`.
- **`NCF_DOCUMENTO`** (solo 5 columnas requeridas: `NCF`, `DOC_ROWPOINTER`, `MODULO`,
  `TIPO_DOCUMENTO`, `TABLA`) — **cubiertas todas** por `CargaNCF_Fac`, incluyendo el lookup
  correcto de `DOC_ROWPOINTER` contra `CATELLI.FACTURA.RowPointer WHERE FACTURA=@NUM_PED`.

No hay huecos de columnas requeridas en estas 3 tablas — el problema no es "falta un campo",
es "faltan 4 tablas enteras" (ver 6.1).

### 6.4 Hallazgos nuevos para confirmar (adicionales a los 7 de la sección 5)

8. ~~Mismo patrón de "total con impuesto en vez de subtotal": `Carga_Fac_To_CC` mapea
   `DOCUMENTOS_CC.SUBTOTAL ← FAC_ENC_PED.MON_CIV` (CON impuesto), no `MON_SIV` (sin impuesto)~~
   — **RESUELTO (2026-10-30):** el usuario confirmó que es un error real, **`SUBTOTAL` tiene
   que ser el monto SIN ITBIS** → debe mapear a `MON_SIV`, no a `MON_CIV`. Además, agregó una
   regla nueva no identificada antes: **`BASE_IMPUESTO1 = SUBTOTAL - DESCUENTO`** (no es un
   campo que venga directo de `FAC_ENC_PED`, se calcula). Esto mismo aplica, por el mismo
   razonamiento, al hallazgo 2 de la sección 5 (`FACTURA.TOTAL_MERCADERIA` hardcodeado en `0`
   en vez de `MON_SIV`) — ambos casos son la misma clase de error (usar el monto con impuesto,
   o cero, en vez del subtotal real sin impuesto). Pendiente: confirmar si `FACTURA` tiene un
   campo equivalente a `BASE_IMPUESTO1` que necesite la misma fórmula.
9. ~~Inconsistencia del flag `DOC_PRO` entre los 3 mappings que leen `FAC_ENC_PED`~~ —
   **RESUELTO (2026-10-30):** el usuario confirmó que hay que unificar al mismo patrón que ya
   usa `CargaPedidosPendientes`: **`DOC_PRO IS NULL` = no procesado, `DOC_PRO = 'S'` = ya
   procesado a CATELLI**. Hay que corregir `Carga_Fac_To_CC` (que hoy filtra `LIKE '1'` y marca
   `1` numérico) y `CargaNCF_Fac` (que hoy no filtra por `DOC_PRO` en absoluto y marca `1`) para
   que ambos filtren `DOC_PRO IS NULL` y marquen `DOC_PRO = 'S'`, igual que `CargarFacturas`.
   Esto también resuelve de raíz el riesgo operativo de ejecución manual/independiente
   (hallazgo original): con el mismo criterio en los 3, ejecutar cualquiera de forma suelta ya
   no reprocesa de más ni deja de encontrar filas.
10. ~~Tasa de cambio hardcodeada (`36.7`/`36.70`)~~ — **RESUELTO (2026-10-30):** confirmado
    como intencional **por ahora**: se deja fija. El usuario aclaró que a futuro hay que
    resolver cómo obtener la tasa de cambio vigente desde el propio ERP (mecanismo todavía sin
    definir) — queda anotado como mejora futura, no bloqueante para esta primera versión.
11. ~~`ALCXC_MOV_DIR`/`CargasRecibos` no distingue "cargo autorreferenciado de la factura
    nueva" vs. "recibo que salda el saldo de una factura previa"~~ — **RESUELTO POR DISEÑO
    (2026-10-30), decisión del usuario: dividir en 2 mappings independientes.**

    Investigando por qué el mapping real de hoy (`CargasRecibos`) nunca podría manejar el
    caso de documento viejo, se encontró la causa raíz: `CargasRecibos` se dispara encadenado
    desde `Carga_Fac_To_CC` vía `workflowConfig` con `linkField: 'NUM_DOC_AF'` — el motor
    (`findChildDocumentIds`, ver sección 11 más abajo) solo busca filas de `ALCXC_MOV_DIR`
    **cuyo `NUM_DOC_AF` esté entre las facturas recién creadas en ese mismo lote**. No es que
    el mapping tenga mal los campos — **estructuralmente nunca llega a mirar** una fila que
    salda un documento viejo (de días atrás, o generado directo por el ERP fuera de este
    pipeline), porque el encadenamiento mismo filtra de antemano solo lo del lote actual.

    El usuario confirmó el caso de negocio real: un documento de CxC puede haberse generado
    directo por el ERP (no por server2), quedar pendiente de cobro, y después llegar un recibo
    de pago por `ALCXC_MOV_DIR` que lo salda — hace falta un proceso para cargar y **aplicar**
    ese recibo contra ese documento, sin importar quién ni cuándo lo creó.

    **Decisión de diseño (confirmada por el usuario): separar en 2 `TransferMapping`
    independientes** en vez de 1 solo encadenado:
    - **`CargarFacturaCompleta`**: la cadena de creación de factura (`FACTURA`→`FACTURA_LINEA`→
      inventario→asiento→`DOCUMENTOS_CC` tipo `'FAC'`→`NCF_DOCUMENTO`), disparada por `NUM_PED`
      nuevo de `FAC_ENC_PED`. El caso de cobro inmediato autorreferenciado (contra-entrega,
      mismo lote) se mantiene **atómico junto con la factura**, igual que hoy.
    - **`AplicarRecibosCxC`** (nuevo, independiente): `ALCXC_MOV_DIR` como su **propia** tabla
      origen (no encadenado desde Factura), con su propio flag de "procesado" en
      `ALCXC_MOV_DIR` (**pendiente confirmar si existe una columna análoga a `DOC_PRO` ahí**,
      no se ha relevado todavía). Para cada fila pendiente: resuelve el `DOCUMENTOS_CC`
      existente por `NUM_DOC_AF` vía `lookupQuery` (funciona igual sea la factura de hoy, una
      vieja de este mismo pipeline, o una cargada directo por el ERP — no hace falta
      distinguir el caso, el lookup simplemente encuentra lo que exista), crea el `'REC'` +
      `AUXILIAR_CC`, y **actualiza el `SALDO` del documento encontrado**
      (`UPDATE DOCUMENTOS_CC SET SALDO = SALDO - @monto OUTPUT INSERTED.SALDO WHERE
      DOCUMENTO=@NUM_DOC_AF` — mismo patrón de `UPDATE...OUTPUT` atómico que ya se diseñó para
      `CATELLI.PAQUETE`, sección 7.1).

    Esto resuelve el problema de raíz, no solo el síntoma: al tener `ALCXC_MOV_DIR` como tabla
    origen propia (no filtrada por el lote de una factura padre), el mismo mecanismo cubre
    tanto la autorreferencia (si corre el mismo día) como el documento viejo, sin necesidad de
    lógica condicional para distinguir los 2 casos.

    **RESUELTO (2026-10-30): `ALCXC_MOV_DIR` usa el mismo campo `DOC_PRO`** que
    `FAC_ENC_PED`, con el mismo criterio ya confirmado para toda la cadena (hallazgo 9, sección
    6.4): `DOC_PRO IS NULL` = pendiente de aplicar, `DOC_PRO = 'S'` = ya aplicado. No hace
    falta ninguna columna nueva ni criterio distinto — `AplicarRecibosCxC` filtra
    `WHERE DOC_PRO IS NULL` y marca `DOC_PRO = 'S'` al terminar, igual que los demás pasos de
    la cadena. **Con esto, el análisis de campos queda cerrado al 100%** — no quedan preguntas
    abiertas de diseño, solo la construcción de los 2 `TransferMapping` (ver plan de
    implementación).

## 7. Asiento contable — consecutivo vía `CATELLI.PAQUETE` (hallazgo nuevo, 2026-10-30)

El usuario confirmó que **inventario y asiento contable sí se construyen en este pipeline**
(ver resolución en 6.1) y trajo el primer dato concreto para avanzar: el consecutivo de
`ASIENTO_DE_DIARIO.ASIENTO` se genera a partir de la tabla real **`CATELLI.PAQUETE`**, que
funciona como un catálogo de "paquetes contables" (uno por módulo del ERP), cada uno con su
propio último consecutivo:

| PAQUETE | DESCRIPCION | ULTIMO_ASIENTO |
|---|---|---|
| CG | Contabilidad General | CG00000002 |
| CB | Control Bancario | CB00114112 |
| **CC** | **Cuentas por Cobrar** | **CC04439391** |
| CP | Cuentas por Pagar | CP00041754 |
| AF | Activo Fijo | AF00000250 |
| CI | Control de Inventario | CI00008097 |
| **FA** | **Facturación** | **2197815** |
| AP | Administración de Productos | AP00000000 |
| CA | Cierre Anual | CAF0000007 |
| CN | Control de Nómina | CN00000268 |
| RH | Recursos Humanos | RH00000000 |
| CO | Compras | CO00011029 |
| SI | Saldos Iniciales | SI0000001 |
| CH | Caja Chica | CH00015537 |

El `ULTIMO_ASIENTO` de cada fila trae el último consecutivo usado para ese paquete — algunos
con prefijo alfabético + ceros a la izquierda (`CC04439391`, `CI00008097`), otros puramente
numéricos (`FA`: `2197815`, sin prefijo). **Para el flujo de Factura, el paquete a usar es
`PAQUETE='FA'` (Facturación)** — coincide con `FACTURA.MODULO='FA'` ya hardcodeado en
`CargarFacturas` (ver Grupo E, sección 5).

**Columnas requeridas de `PAQUETE`** (`ColumnaRequeridaReal`): `PAQUETE`, `DESCRIPCION`,
`USUARIO_CREADOR`, `ULTIMO_USUARIO`, `FECHA_ULT_ACCESO`, `ULTIMO_ASIENTO`, `DOBLE_ASIENTO`,
`MARCADO` — pero como ya existen las filas (es un catálogo fijo de paquetes, no algo que este
mapping cree), lo relevante acá no es insertar en `PAQUETE` sino **leer y actualizar
`ULTIMO_ASIENTO` de la fila `PAQUETE='FA'`** para obtener el próximo consecutivo de forma
atómica (patrón similar al de `CATELLI.CONSECUTIVO_CI` que ya usa `traspasoService.js` para
`TRA######` en el flujo de Traspasos — mismo tipo de problema de concurrencia: dos facturas
cargándose al mismo tiempo no pueden leer y usar el mismo `ULTIMO_ASIENTO`).

**Pendiente para profundizar** (marcado explícitamente por el usuario como "hay que investigar
más a fondo este punto"):
- Confirmar si el próximo asiento es literalmente `ULTIMO_ASIENTO + 1` interpretado como
  numérico (`'FA'` es puramente numérico, fácil) o si hay un patrón de formato distinto por
  paquete (otros paquetes mezclan letras+números, ej. `CC04439391`, `CI00008097` — para `FA`
  no aplicaría por ahora, pero conviene entender la regla general del ERP antes de asumir que
  siempre es numérico puro).
- Confirmar si hace falta un `UPDATE` atómico (ej. `UPDATE PAQUETE SET ULTIMO_ASIENTO =
  ULTIMO_ASIENTO + 1 OUTPUT ...`) para evitar colisiones bajo carga concurrente, igual que se
  resolvió para `CONSECUTIVO_CI` en Traspasos.
- Confirmar si `ASIENTO_DE_DIARIO.ASIENTO` es el mismo valor que después queda referenciado en
  `FACTURA.ASIENTO_DOCUMENTO` y en `AUDIT_TRANS_INV.ASIENTO` (según el diagrama de la sección 2,
  los 3 comparten el mismo número `2020165` en el ejemplo real `FV1509778`) — si es así, un
  solo consecutivo de `PAQUETE='FA'` sirve para enlazar las 3 tablas a la vez.
- Falta relevar la estructura completa de columnas requeridas de `ASIENTO_DE_DIARIO`, `DIARIO`,
  `AUDIT_TRANS_INV` y `TRANSACCION_INV` con datos reales (ya se tienen los diccionarios de
  columnas de estas 4 tablas de la sección 6, pero todavía no se diseñó el `fieldMappings`
  campo por campo como sí se hizo para `DOCUMENTOS_CC`/`AUXILIAR_CC`/`NCF_DOCUMENTO`).

### 7.1 Mecanismo atómico — investigación en el código real (2026-10-30)

Se revisó cómo el Gestor Universal maneja consecutivos hoy, y se encontró que **ninguno de
los 2 mecanismos genéricos existentes es seguro para `CATELLI.PAQUETE`**:

1. **`consecutiveConfig` "local"** (`DynamicTransferService.generateLocalConsecutive`,
   `server/services/DynamicTransferService.js:2675-2716`, el mismo que usa `CargasRecibos`
   para el número de "recibo"): el contador vive **en Mongo** (`$inc` atómico sobre
   `TransferMapping.consecutiveConfig.lastValue`), totalmente desconectado de cualquier tabla
   de SQL Server. Sirve para numerar algo que este pipeline posee en exclusiva (como el
   "recibo" sintético que inventa `CargasRecibos`), pero **`PAQUETE` no es nuestro** — es la
   tabla de consecutivos nativa del ERP, y si cualquier otro proceso de Catelli (el propio
   Exactus, un usuario cargando un asiento manual, otro módulo) también incrementa
   `PAQUETE.ULTIMO_ASIENTO` para `'FA'`, el contador de Mongo queda desincronizado de la
   realidad y el pipeline empezaría a generar **números de asiento duplicados**.
2. **Sistema "centralizado" (`ConsecutiveService`/modelo `Consecutive`,
   `server/services/ConsecutiveService.js`)**: tiene un `sqlSync` opcional
   (`serverKey`/`tableName`/`keyField`/`keyValue`/`valueField`) que **escribe** el valor final
   hacia una tabla del ERP después de cada reserva (`syncToSql`, línea 142) — pero es
   **solo de escritura, sin lectura previa**: nunca lee `PAQUETE.ULTIMO_ASIENTO` antes de
   reservar, Mongo sigue siendo la única fuente de verdad del contador, y si falla el `UPDATE`
   hacia el ERP el error se traga (`// No lanzamos el error para no romper el flujo
   principal`). Mismo riesgo de fondo que el punto anterior: no hay forma de que Mongo "se
   entere" si el ERP avanzó el número por su cuenta.

**El único precedente seguro en todo el repo es el manual: `CONSECUTIVO_CI` en
`traspasoService.js:416-452`** (usado para el `TRA######` de Traspasos) — trata a SQL Server
como única fuente de verdad: `SELECT ... WITH (UPDLOCK, ROWLOCK)` para leer el valor actual
bajo lock, calcula el siguiente en memoria, y hace `UPDATE ... WHERE SIGUIENTE_CONSEC =
@actual` (compara-y-reemplaza) verificando `rowsAffected`. Nota al margen: ese código no tiene
loop de reintento si el `UPDATE` afecta `0` filas (choque de concurrencia) — simplemente lanza
error. No es parte del alcance de Factura arreglarlo, pero es un antecedente a tener presente.

**Hallazgo clave que destraba el diseño sin tocar código del motor:** se confirmó leyendo
`DynamicTransferService.js:2908-2921` que un `lookupQuery` (el mecanismo de `lookupFromTarget`
que ya usamos para `NIVEL_PRECIO`, `RUTA`, etc.) **se ejecuta tal cual contra el servidor
destino y el motor simplemente toma la primera columna de la primera fila del `recordset`
devuelto** — no exige que sea un `SELECT`. Eso significa que un `lookupQuery` puede ser
directamente un `UPDATE ... OUTPUT`, que en SQL Server es una sola sentencia atómica (toma
lock de fila como parte del propio `UPDATE`, sin el problema de "leer-y-comparar" en dos pasos
que sí tiene `CONSECUTIVO_CI`):

```sql
UPDATE CATELLI.PAQUETE
SET ULTIMO_ASIENTO = CONVERT(VARCHAR(20), CONVERT(INT, ULTIMO_ASIENTO) + 1)
OUTPUT INSERTED.ULTIMO_ASIENTO
WHERE PAQUETE = 'FA'
```

Configurado como `lookupQuery` del campo `FACTURA.ASIENTO_DOCUMENTO` (sin `lookupParams`, ya
que no depende de ningún dato de la fila origen), el Gestor Universal resolvería ese campo
reservando atómicamente el próximo número de asiento **sin ningún cambio de código**, usando
el mismo mecanismo ya probado que resuelve `NIVEL_PRECIO`/`RUTA`/`ZONA`/`COBRADOR`. (Pendiente
de verificar con el usuario: si `PAQUETE` tiene triggers `AFTER UPDATE`, un `OUTPUT` sin
`INTO` puede fallar en SQL Server — no se puede confirmar esto sin acceso a la base real.)

**El problema real a resolver — no ejecutar este `UPDATE` tres veces por factura:**
`ASIENTO` tiene que quedar igual en `FACTURA.ASIENTO_DOCUMENTO`, `AUDIT_TRANS_INV.ASIENTO` y
`ASIENTO_DE_DIARIO.ASIENTO` (mismo número `2020165` en el ejemplo real). Si las 3 tablas
usaran cada una su propio `lookupQuery` de incremento contra `PAQUETE`, se consumirían 3
números de asiento distintos por factura en vez de 1 — un bug grave y silencioso.
**Solución propuesta, reutilizando un patrón que el mapping real YA usa hoy:**
`CargaNCF_Fac.DOC_ROWPOINTER` resuelve su valor con un `lookupQuery` tipo `SELECT
RowPointer FROM CATELLI.FACTURA WHERE FACTURA=@NUM_PED` — es decir, **lee de vuelta una fila
que un mapping anterior de la misma cadena ya insertó**, en vez de recalcular nada. Aplicando
la misma idea acá:
- Solo el **primer** tableConfig que necesite `ASIENTO` en todo el flujo (lo más natural:
  `FACTURA.ASIENTO_DOCUMENTO`, ya que `CargarFacturas` es el primer mapping de la cadena) usa
  el `UPDATE ... OUTPUT` de arriba — consume el consecutivo UNA sola vez por factura.
- Todas las demás tablas que necesiten el mismo número (`AUDIT_TRANS_INV.ASIENTO`,
  `ASIENTO_DE_DIARIO.ASIENTO`) usan un `lookupQuery` de **solo lectura**: `SELECT
  ASIENTO_DOCUMENTO FROM CATELLI.FACTURA WHERE FACTURA=@NUM_PED` — exactamente el mismo
  mecanismo que ya usa `CargaNCF_Fac` para `DOC_ROWPOINTER`, sin inventar nada nuevo.

Esto resuelve el mecanismo atómico sin necesidad de tocar `DynamicTransferService.js`: todo se
configura con los campos que el `FieldMappingSchema` ya soporta hoy.

## 8. Alcance final confirmado (2026-10-30): el "armado" es la distribución completa del proceso contable

El usuario confirmó explícitamente el objetivo final de todo este análisis: **cargar
`FAC_ENC_PED`, `FAC_DET_PED` y `ALCXC_MOV_DIR` desde server2 y distribuirlos al ERP cubriendo
todo el proceso que un ERP contable real exige** — no solo crear el documento `FACTURA`, sino
las 4 piezas completas que ya identificamos: Cuentas por Cobrar (`DOCUMENTOS_CC`/
`NCF_DOCUMENTO`/`AUXILIAR_CC`, ya resuelto por los mappings existentes), Inventario
(`AUDIT_TRANS_INV`/`TRANSACCION_INV`, hueco real, sección 6.1) y Asiento Contable
(`ASIENTO_DE_DIARIO`/`DIARIO`, hueco real, en diseño ahora mismo en la sección 7).

**Por qué `FAC_DET_PED` (el detalle) importa tanto como `FAC_ENC_PED` (el encabezado) para
este alcance completo:** no alimenta solo `FACTURA_LINEA` — por cada línea de detalle hay que
generar, como mínimo, 3 inserciones reflejo en 3 tablas distintas:
- `FACTURA_LINEA` (ya resuelto por `CargarFacturas`).
- `TRANSACCION_INV` (una fila por línea, mismo artículo/bodega/costo — confirmado en el
  diagrama real de `FV1509778`, sección 2 — todavía sin mapping, hueco de la sección 6.1).
- `DIARIO` (el detalle de asiento tiene partida doble por línea/cuenta contable — en el
  ejemplo real `FV1509778` son 17 líneas de `DIARIO` para solo 4 líneas de `FACTURA_LINEA`,
  así que la relación no es 1 a 1 simple; falta diseñar la regla real de cuántas líneas de
  `DIARIO` genera cada línea de factura y con qué cuentas contables, dato pendiente del
  hallazgo 5 de la sección 5 sobre `CUENTA_CONTABLE`).

Es decir: el "armado para descargar todo" que el usuario menciona **es exactamente lo que
venimos construyendo** — no es un trabajo nuevo aparte, es la continuación natural de cerrar
los huecos de Inventario y Asiento Contable ya identificados. No hace falta abrir una
investigación distinta; sí hace falta, antes de diseñar el `fieldMappings` completo,
relevar con datos reales la estructura de `DIARIO`/`ASIENTO_DE_DIARIO` línea por línea (cómo
se reparten las 17 líneas de `DIARIO` contra las 4 de `FACTURA_LINEA` + la de `AUXILIAR_CC`),
igual que se hizo para `DOCUMENTOS_CC`/`AUXILIAR_CC`/`NCF_DOCUMENTO` en la sección 6.3.

## 9. DIARIO — regla de generación reconstruida con datos reales completos (factura `3883332`, 2026-10-30)

El usuario trajo `FACTURA_LINEA` (8 líneas), `ASIENTO_DE_DIARIO` (1 fila, `ASIENTO=2193517`)
y `DIARIO` (19 líneas) completos de una factura real nueva (`FACTURA=3883332`, distinta de
`FV1509778`). Se reconciliaron los 19 renglones de `DIARIO` contra las 8 líneas de
`FACTURA_LINEA` cruzando montos exactos (no hay ninguna columna de `DIARIO` que apunte
directo a `FACTURA_LINEA.LINEA`, el cruce se hizo por valor) — **la regla de partida doble
quedó completamente reconstruida y balancea exacto** (`TOTAL_DEBITO_LOC = TOTAL_CREDITO_LOC =
4969.59`, confirmado sumando a mano los 19 renglones).

### Regla por línea de `FACTURA_LINEA`

**Línea regular (BODEGA='01'):**
- 1 renglón en `DIARIO`: **CRÉDITO** a `FACTURA_LINEA.CUENTA_CONTABLE` (la misma cuenta que ya
  trae la línea, `400-01-01-01-01` en los 8 casos de este ejemplo) por `PRECIO_TOTAL` (el
  monto sin impuesto, confirmado: línea artículo `3913` regular, `PRECIO_TOTAL=610.74` →
  `DIARIO` línea 3, `CREDITO_LOCAL=610.74`, misma cuenta).

**Línea bonificada (BODEGA='02', la misma detectada en la sección 3 por
`CANTIDAD_BONIFICADA>0`/precio-impuesto en 0 — acá se ve además con `DESC_TOT_LINEA =
PRECIO_TOTAL`, descuento igual al 100% del monto):**
- 2 renglones en `DIARIO`, que se **cancelan entre sí** (impacto neto cero en ingresos, que es
  exactamente lo esperado de una bonificación):
  - **CRÉDITO** a `FACTURA_LINEA.CUENTA_CONTABLE` (la misma cuenta de ventas) por
    `PRECIO_TOTAL`.
  - **DÉBITO** a una cuenta de **descuento en ventas** (`400-01-05-02-01` en este ejemplo, no
    viene de ninguna columna de `FACTURA_LINEA` — ver "pendiente" abajo) por el mismo
    `PRECIO_TOTAL`.
  - Confirmado 3 veces en el mismo ejemplo (artículos `3913`, `3912`, `3914`, cada bono de
    `140.94` → pares `DIARIO` 1-2, 4-5, 7-8) y una 4ta vez (artículo `225`, bono `170.98` →
    par `DIARIO` 11-12).

**Costo de venta — SOLO si la línea trae `COSTO_TOTAL > 0`** (en este ejemplo, únicamente las
2 líneas del artículo `225` tienen costo cargado — `859.92` regular, `143.32` bono — las 6
líneas de `3913`/`3912`/`3914` vinieron con `COSTO_TOTAL=0` y **no generaron ningún renglón de
costo**, confirmando que es condicional, no automático por cada línea):
- **CRÉDITO** a una cuenta de **inventario** (`100-01-05-01-01` en este ejemplo) por
  `COSTO_TOTAL` (`DIARIO` líneas 10 y 14).
- **DÉBITO** a una cuenta de **costo de venta** (`500-01-01-01-00` en este ejemplo) por el
  mismo `COSTO_TOTAL` (`DIARIO` líneas 13 y 16).

### Regla a nivel de encabezado de factura (2 renglones agregados, no por línea)

- **DÉBITO** a la cuenta de **Cuentas por Cobrar** (`100-01-04-01-00` en este ejemplo) por el
  **total de la factura con impuesto incluido** — confirmado exacto:
  `SUMA(PRECIO_TOTAL de líneas regulares) + SUMA(TOTAL_IMPUESTO1 de todas las líneas)` =
  `2858.10 + 514.45 = 3372.55` = `DIARIO` línea 17. (Las líneas bonificadas no suman acá
  porque ya quedaron neutralizadas por su propio par crédito/débito.)
- **CRÉDITO** a la cuenta de **ITBIS por pagar** (`200-01-02-06-01` en este ejemplo) por la
  **suma de `TOTAL_IMPUESTO1` de todas las líneas** = `184.66 + 109.93×3 = 514.45` = `DIARIO`
  línea 18.
- Una 19ª línea minúscula (`CREDITO_DOLAR=0.01`, cuenta `400-01-04-02-06`,
  `REFERENCIA='Diferencia de cambio'`) ajusta un redondeo de un centavo en dólares — parece
  generada automáticamente por el proceso contable del ERP al convertir a USD con la tasa del
  día, no una regla de negocio que haya que replicar explícitamente; lo dejamos anotado como
  posible ajuste de precisión a resolver si el asiento no balancea exacto en dólares.

### Columnas de armado directo en `DIARIO`

- `ASIENTO` = el mismo consecutivo de `ASIENTO_DE_DIARIO` (sección 7).
- `CONSECUTIVO` = número de línea dentro del asiento, secuencial 1..N en el orden de
  inserción (no es `FACTURA_LINEA.LINEA`, es un correlativo propio del asiento completo).
- `REFERENCIA` y `FUENTE` = `'FAC#' + FACTURA` (idéntico al patrón ya visto en
  `AUDIT_TRANS_INV.APLICACION` de la sección 2).
- `CENTRO_COSTO` = `'00-00-00'` fijo (coincide con `FACTURA_LINEA.CENTRO_COSTO`, también fijo).
- `NIT` = `'ND'` fijo (mismo patrón de placeholder genérico que `DIRECC_EMBARQUE.DIRECCION='ND'`).

### CONFIRMA el hallazgo 5 de la sección 5 con evidencia nueva (no lo contradice)

En este ejemplo (`3883332`), **las 8 líneas de `FACTURA_LINEA` comparten la misma
`CUENTA_CONTABLE='400-01-01-01-01'`** — a diferencia de lo que se había visto en `FV1509778`
(cuentas distintas por línea). Esto no resuelve la contradicción todavía (puede depender del
artículo, de la categoría, o de alguna configuración por cliente/bodega que no se ve en estos
2 ejemplos), pero sí confirma algo importante y accionable: **cuando `FACTURA_LINEA` SÍ trae
la cuenta contable, `DIARIO` la reutiliza tal cual para los renglones de venta/bono** — no hay
que resolverla de nuevo. El riesgo pendiente es solo de dónde sale el valor de
`FACTURA_LINEA.CUENTA_CONTABLE` en sí (hardcode vs. catálogo de artículo), no cómo se
propaga de ahí a `DIARIO`.

### RESUELTO (2026-10-30): 4 de las 5 cuentas vienen de `CATELLI.ARTICULO_CUENTA`, no son hardcode

El usuario trajo `CATELLI.ARTICULO_CUENTA` — el catálogo real que resuelve estas cuentas por
**grupo contable de artículo** (filas de ejemplo: `'ND'`=no definida, `'EXEN'`=artículos
exentos de ITBIS, `'ITBI'`=artículos con ITBIS). Cruzando sus columnas contra las 4 cuentas
que habíamos aislado del asiento real (`3883332`), coinciden **exactas**, tanto en la fila
`EXEN` como en la fila `ITBI` (ambas traen los mismos valores para estas 4 columnas en este
tenant — ver nota de alcance abajo):

| Cuenta que vimos en `DIARIO` | Columna real en `ARTICULO_CUENTA` | Valor (`EXEN`/`ITBI`) |
|---|---|---|
| Ventas (crédito, líneas regulares y bono) | `CTA_VENTAS_LOC` | `400-01-01-01-01` |
| Descuento en venta (débito, líneas bono) | `CTA_DESC_VENTA_LOC` (o la más específica `CTA_DESC_BONIF_LOC`, mismo valor en este ejemplo) | `400-01-05-02-01` |
| Inventario (crédito, costo de venta) | `CTA_INVENTARIO` | `100-01-05-01-01` |
| Costo de venta (débito, costo de venta) | `CTA_COST_VENTA_LOC` | `500-01-01-01-00` |

**Esto resuelve, de forma mucho más satisfactoria, el hallazgo 5 de la sección 5**: la razón
por la que `FV1509778` traía una `CUENTA_CONTABLE` distinta por línea y `3883332` trae la
misma en las 8 no es que una de las dos facturas esté "mal" — es que **`CUENTA_CONTABLE` se
resuelve por artículo vía su grupo de `ARTICULO_CUENTA`**, y en `3883332` los 4 artículos
(`225`, `3913`, `3912`, `3914`) simplemente comparten el mismo grupo contable, mientras que en
`FV1509778` no. **El hardcode actual de `CargarFacturas` (`CUENTA_CONTABLE='400-01-01-01-01`
fijo para todas las líneas) está mal en el caso general** — funciona por coincidencia cuando
todos los artículos del pedido comparten grupo, pero fallaría (cuenta incorrecta) en cualquier
factura con artículos de grupos contables distintos. La corrección real: resolver
`FACTURA_LINEA.CUENTA_CONTABLE` (y, para las líneas de bono, la cuenta de descuento) por
**lookup encadenado `FAC_DET_PED.COD_ART → CATELLI.ARTICULO.<columna FK a ARTICULO_CUENTA> →
CATELLI.ARTICULO_CUENTA.CTA_VENTAS_LOC`** (mismo patrón de `lookupFromTarget` ya usado para
`NIVEL_PRECIO`, con 2 saltos en vez de 1).

**RESUELTO (2026-10-30): la FK se confirmó con datos reales.** El usuario trajo
`CATELLI.ARTICULO` (diccionario completo + contenido de los 6 artículos de la factura
`3883332`, más `1060`/`3231` de yapa). **La columna es literalmente `ARTICULO.ARTICULO_CUENTA`
(mismo nombre que la tabla destino)** — los 6 artículos de la factura (`225`, `3913`, `3912`,
`3914`, y también `1060`/`3231` que no están en esta factura) traen **todos
`ARTICULO_CUENTA='ITBI'`**, consistente con que la factura completa resolvió las 4 cuentas de
la fila `'ITBI'` de `ARTICULO_CUENTA` para las 8 líneas. El lookup encadenado completo queda
cerrado: `FAC_DET_PED.COD_ART → CATELLI.ARTICULO.ARTICULO (PK) → ARTICULO.ARTICULO_CUENTA (FK) →
CATELLI.ARTICULO_CUENTA.ARTICULO_CUENTA (PK) → CTA_VENTAS_LOC / CTA_DESC_VENTA_LOC /
CTA_INVENTARIO / CTA_COST_VENTA_LOC`.

**Hallazgo adicional que confirma la regla de costo condicional de la sección 9:** los 3
artículos sin costo en la factura (`3913`, `3912`, `3914`) tienen `CLASIFICACION_6='OC'`
(probablemente "Obsequio/Cortesía") y **sus 3 columnas de costo
(`COSTO_PROM_LOC`/`COSTO_STD_LOC`/`COSTO_ULT_LOC`) vienen en `0.00000000`** — mientras que
`225` y `1060` (`CLASIFICACION_6='REG'`, regular) sí traen costo real cargado. Esto confirma
por qué esas 3 líneas no generaron renglón de costo de venta en `DIARIO`: no es una condición
de la línea de factura en sí, es que el **artículo mismo no tiene costo cargado en el ERP**
(consistente con ser un artículo promocional/muestra sin valor de inventario).

**RESUELTO (2026-10-30): ITBIS por pagar también sale de un lookup, confirmado exacto.** El
usuario trajo `CATELLI.IMPUESTO` — la fila `IMPUESTO='IT01'` ("ITBIS 18%") trae
`CTA_IMP1_GEN='200-01-02-06-01'` (columna `CTR_IMP1_GEN='00-00-00'` para centro de costo) —
**coincide exacto** con la cuenta de ITBIS por pagar que habíamos aislado del asiento real. La
columna específica de "ventas" (`CTA_IMP1_GEN_VTS`) viene `NULL` para `IT01`, así que es
`CTA_IMP1_GEN` (la general) la que efectivamente se usa. Lookup encadenado completo:
`FAC_DET_PED.COD_ART → ARTICULO.ARTICULO → ARTICULO.IMPUESTO ('IT01') →
CATELLI.IMPUESTO.IMPUESTO (PK) → CTA_IMP1_GEN`. Como esto se resuelve **por artículo** (igual
que las 4 cuentas de `ARTICULO_CUENTA`), confirma la hipótesis: si una factura tuviera
artículos con tasas de impuesto distintas (ej. `IT01` 18% + `EX01` exento), generaría **más de
1 línea de ITBIS por pagar en `DIARIO`**, una por tasa — no se puede confirmar sin un ejemplo
real con 2 tasas mezcladas, pero el mecanismo de resolución ya queda claro y es el mismo patrón
de lookup por artículo que ya usamos para las otras 4 cuentas.

**Descartado: `CATELLI.CONDICION_PAGO` NO es la fuente de la cuenta de Cuentas por Cobrar.**
El usuario trajo el diccionario completo de `CONDICION_PAGO` (20 columnas) y **no tiene
ninguna columna de cuenta contable** (`DIAS_NETO`, `PAGOS_PARCIALES`, `DESCUENTO_CONTADO`,
`TIPO_CONDPAGO`, campos `U_METODO_PAGO`/`U_FORMA_PAGO`/`U_PLAZO_PAGO`, nada de `CTA_*`) —
queda descartada como hipótesis.

**Descartado también: `CATELLI.CLIENTE` (listado COMPLETO, 161 columnas) tampoco tiene ninguna
cuenta contable.** El usuario trajo el diccionario completo (no solo las 49 "requeridas" de la
sección 1) más el registro real del cliente de la factura `3883332` (`O3695`, "COLMADO SOTO").
Revisando las 161 columnas una por una, ninguna es de tipo cuenta contable — los únicos campos
relacionados a plata/crédito son `SALDO*`, `LIMITE_CREDITO`, `TASA_INTERES*`,
`SALDO_TRANS*`, nada con prefijo `CTA_`/`CTR_`. Confirma que **el cliente no determina la
cuenta de CxC**, a diferencia de lo que sí hace con `NIVEL_PRECIO`/`RUTA`/`ZONA`/`COBRADOR`.

**RESUELTO (2026-10-30), por eliminación: Cuentas por Cobrar es una constante fija.** El
usuario trajo el registro real completo de `DOCUMENTOS_CC` (182 columnas) para la factura
`3883332` — **no existe ninguna columna `CUENTA_CONTABLE`** en toda la tabla, solo `ASIENTO`
(`2193517`, el mismo de siempre) y `PAQUETE`(`'FA'`). Tiene sentido: `DOCUMENTOS_CC` no
necesita su propia cuenta porque ya queda ligado, vía `ASIENTO`, al mismo `DIARIO` que trae el
débito de CxC. Con `ARTICULO_CUENTA` (es por artículo), `CONDICION_PAGO`, `CLIENTE` (listado
completo) y ahora `DOCUMENTOS_CC` descartados como fuente dinámica, queda confirmado:
**`100-01-04-01-00` es una constante institucional fija del módulo `FA`** — se hardcodea
igual que `CENTRO_COSTO`/`MODULO`/`USUARIO`/`MONEDA_FACTURA`. Pregunta cerrada, no queda
ninguna cuenta contable pendiente.

## 10. HALLAZGO MAYOR (2026-10-30): `AUDIT_TRANS_INV`/`TRANSACCION_INV` SÍ se están creando para facturas reales — pero ningún mapping lo hace

El usuario corrió la query real contra `FACTURA=3883332` (la misma factura de las secciones 7 y
9) y **sí existe** un `AUDIT_TRANS_INV` (header) + 8 `TRANSACCION_INV` (una por línea,
reconciliando exacto con las 8 líneas de `FACTURA_LINEA`). Esto contradice, en apariencia, la
conclusión de la sección 6.1 ("no existe ningún mapping hacia estas tablas, es un hueco real")
— pero la resolución no es que la sección 6.1 esté mal: **sigue siendo cierto que ningún
`TransferMapping` escribe ahí.** Lo que esto revela es que **otro mecanismo, fuera del Gestor
Universal, está generando este inventario automáticamente** apenas se inserta la factura.

### Evidencia de que no es un proceso separado/posterior, sino algo disparado por el mismo INSERT

- `AUDIT_TRANS_INV.USUARIO='FAC1'` y `CreatedBy='FA/FAC1'` — el mismo usuario de integración
  que `CargarFacturas` usa para crear `FACTURA`/`FACTURA_LINEA` (hardcoded en el mapping real,
  ver sección 5).
- `AUDIT_TRANS_INV.FECHA_HORA = 2026-10-28 22:17:59.310` — apenas **2 segundos** después de la
  hora de inserción de las líneas de factura (`FACTURA_LINEA.CreateDate` fue
  `22:18:01.760`-`22:18:01.993` en la sección 9; acá es incluso un poco antes, en la misma
  ventana de un par de segundos).
- `AUDIT_TRANS_INV.ASIENTO = 2193517` — **el mismo número de asiento** que ya vimos en
  `ASIENTO_DE_DIARIO` (sección 9). Confirma lo que habíamos anticipado en la sección 7: un solo
  consecutivo de `PAQUETE='FA'` enlaza `FACTURA.ASIENTO_DOCUMENTO` + `AUDIT_TRANS_INV.ASIENTO`
  + `ASIENTO_DE_DIARIO.ASIENTO`.
- `TRANSACCION_INV.FECHA = 2026-10-28 22:17:57.000` — **idéntico** a `FACTURA_LINEA.FECHA_FACTURA`
  de las 8 líneas correspondientes.

**Conclusión más probable**: existe un **trigger o stored procedure nativo de Catelli** sobre
`FACTURA`/`FACTURA_LINEA` (o algo equivalente, invocado por la capa de negocio del ERP) que
genera automáticamente el lote de inventario (`AUDIT_TRANS_INV`/`TRANSACCION_INV`) y
probablemente también el asiento contable (`ASIENTO_DE_DIARIO`/`DIARIO`, mismo número de
asiento) apenas se inserta la factura — **no es algo que el Gestor Universal necesite construir
desde cero**, es responsabilidad del propio ERP y ya está ocurriendo. Esto **reduce
significativamente el alcance pendiente**: si se confirma, el mapping de Factura no necesita
insertar en estas 4 tablas en absoluto, solo necesita crear `FACTURA`/`FACTURA_LINEA`
correctamente y dejar que el trigger/SP nativo haga el resto.

**DESCARTADO (2026-10-30): los 3 triggers NO generan inventario ni asiento contable.** El
usuario trajo las 3 definiciones completas:
- `EXFACTURAIup` / `EXFACTURA_LINEAIup`: son el trigger **genérico estándar de Exactus**
  que pone `CreatedBy`/`CreateDate`/`UpdatedBy`/`RecordDate` en cada INSERT/UPDATE — el mismo
  patrón boilerplate de auditoría que se repite en prácticamente todas las tablas del ERP
  (`ARTICULO`, `CLIENTE`, `IMPUESTO`, `PAQUETE`...). No tienen ninguna lógica de negocio.
- `TID_FACTURA`: solo rellena `NOMBRE_CLIENTE` si viene `NULL`, con un lookup simple contra
  `CLIENTE.NOMBRE`. Tampoco toca inventario ni contabilidad.

**La hipótesis de la sección anterior queda retractada — no hay trigger haciendo esto.** La
pregunta de quién genera `AUDIT_TRANS_INV`/`TRANSACCION_INV`/`ASIENTO_DE_DIARIO`/`DIARIO` para
`FACTURA=3883332` sigue abierta. Dos hipótesis nuevas a investigar:

1. **La factura `3883332` fue ingresada manualmente por un humano a través de la aplicación
   nativa de Catelli** (no por nuestro pipeline `CargarFacturas`), y es la **capa de negocio de
   la aplicación** (no la base de datos) la que hace las 4 inserciones como parte de una sola
   transacción al guardar la factura desde la UI. Si es así, esta factura es un buen ejemplo de
   referencia para diseñar el mapping, pero **no hay ningún mecanismo automático que vayamos a
   heredar** — haría falta replicar esa lógica nosotros mismos en el `TransferMapping`, tal como
   se asumía originalmente en la sección 6.1.
2. Existe algún **SQL Server Agent Job** (un job programado a nivel de SQL Server, fuera de
   Mongo/`cronService.js`) que procesa facturas nuevas en lote y genera inventario/asiento
   después. Query no destructiva para revisar:
   ```sql
   SELECT name, enabled, description
   FROM msdb.dbo.sysjobs
   WHERE name LIKE '%FACTURA%' OR name LIKE '%INVENTARIO%' OR name LIKE '%ASIENTO%' OR name LIKE '%CONTAB%';
   ```

**CONFIRMADO DEFINITIVAMENTE (2026-10-30): no existe ningún mecanismo automático a nivel de base
de datos.** Se agotaron las 3 hipótesis posibles:
- Triggers sobre `FACTURA`/`FACTURA_LINEA`: descartados (son boilerplate genérico de Exactus).
- SQL Server Agent Jobs con nombres relacionados a Factura: existen 2
  (`CargaFacturaDirectaDespacho`, `cargaFacturasDespacho`, ambos `enabled=0`), pero son de
  **otra aplicación completamente distinta** (registro/impresión de despacho — copian datos de
  una factura que **ya existe** hacia una tabla de staging `cdr_tbFacturas`, no tocan
  `AUDIT_TRANS_INV`/`TRANSACCION_INV`/`ASIENTO_DE_DIARIO`/`DIARIO` en absoluto).
- Stored procedures con nombres que combinen `FACTURA` + `INVENTARIO`/`ASIENTO`/`DIARIO`/
  `CONTAB`: **ningún resultado**.

**Conclusión final**: la sección 6.1 queda confirmada sin modificar — es un hueco real del
pipeline. La factura `3883332` (y cualquier otra con inventario/asiento completo hoy) se
generó muy probablemente por la lógica propia de la **aplicación de escritorio de Catelli**
(capa de negocio compilada, no un objeto de SQL Server descubrible) cuando un humano la
ingresó manualmente — no hay nada que el Gestor Universal pueda invocar o heredar. Hay que
construir el insert de las 4 tablas nosotros mismos, tal como ya prevé la Fase 1 del plan de
implementación. El punto 1 de la Fase 0 del plan queda cerrado.

### Reconciliación de campos (vale la pena documentar, se use o no directamente)

**`AUDIT_TRANS_INV`** (solo 5 columnas requeridas: `USUARIO`, `FECHA_HORA`, `MODULO_ORIGEN`,
`APLICACION`, `REFERENCIA` — `ASIENTO` y `PAQUETE_INVENTARIO` son NULLABLE, pese a venir
poblado `ASIENTO` en el ejemplo real):
- `USUARIO` ← `'FAC1'` (mismo patrón hardcoded que `FACTURA.USUARIO`).
- `FECHA_HORA` ← momento de creación (`GETDATE()`).
- `MODULO_ORIGEN` ← `'FA'` (mismo patrón que `FACTURA.MODULO`).
- `APLICACION` ← `'FAC#' + FACTURA` (idéntico patrón a `DIARIO.REFERENCIA`/`FUENTE`).
- `REFERENCIA` ← `'Cliente: ' + CLIENTE` (texto descriptivo, usa el código crudo del cliente
  sin prefijo `CN`, ej. `'Cliente: O3695'`).
- `ASIENTO` ← el mismo consecutivo de `PAQUETE='FA'` usado en `FACTURA.ASIENTO_DOCUMENTO`
  (sección 7) — reutilizado, no un segundo consecutivo nuevo.
- `AUDIT_TRANS_INV` (PK) es **`IDENTITY`** — a diferencia de `ASIENTO`, esta sí la genera SQL
  Server solo, no hace falta ningún mecanismo de consecutivo manual para esta tabla.

**`TRANSACCION_INV`** (una fila por cada línea de `FACTURA_LINEA`, mismo orden y cantidad —
confirmado 8/8 en este ejemplo):
- `ARTICULO`, `BODEGA`, `CANTIDAD` ← idénticos a la línea correspondiente de `FACTURA_LINEA`.
- `COSTO_TOT_FISC_LOC`/`COSTO_TOT_COMP_LOC` ← `FACTURA_LINEA.COSTO_TOTAL` (mismo valor
  repetido en ambas columnas en el ejemplo real).
- `COSTO_TOT_FISC_DOL`/`COSTO_TOT_COMP_DOL` ← `FACTURA_LINEA.COSTO_TOTAL_DOLAR`.
- `PRECIO_TOTAL_LOCAL` ← `FACTURA_LINEA.PRECIO_TOTAL`.
- `FECHA` ← `FACTURA_LINEA.FECHA_FACTURA` (idéntico, no `GETDATE()`).
- `NIT` ← `CATELLI.CLIENTE.CONTRIBUYENTE` del cliente dueño de la factura (lookup, confirmado
  exacto contra el cliente real `O3695`/`01300224522`).
- `AJUSTE_CONFIG` ← `'~VV~'` (constante, distinta del `'~TT~'` que usa Traspasos para
  `DOCUMENTO_INV` — cada flujo de inventario tiene su propio código de ajuste).
- `TIPO`/`SUBTIPO`/`SUBSUBTIPO`/`NATURALEZA` ← `'V'`/`'D'`/`'L'`/`'S'` constantes (Venta/
  Detalle/Local/Salida — misma idea que `getTraspasoConfig()` en `traspasoService.js`, pero
  constantes propias de Venta, no de Traspaso).
- `CONTABILIZADA` ← `'S'` (ya contabilizada).
- `CENTRO_COSTO`, `CUENTA_CONTABLE`, `UNIDAD_DISTRIBUCIO`, `ASIENTO_CARDEX`, `DOC_FISCAL`,
  `TIPO_OPERACION`, `TIPO_PAGO` ← todos vinieron `NULL` en el ejemplo real pese a existir la
  columna — no son obligatorios para esta línea de negocio (venta normal), quedan como
  candidatos a ignorar en el mapping salvo que aparezca un caso real donde sí vengan poblados.

## 12. HALLAZGO NUEVO (2026-10-30, encontrado al armar el script de migración): `COSTO_TOTAL` hardcodeado en `0`

Revisando con cuidado antes de escribir el script de consolidación, se encontró un **séptimo
bug** en `CargarFacturas` no identificado en los hallazgos anteriores: el campo
`FACTURA_LINEA.COSTO_TOTAL` está **hardcodeado en `'0'`** (`defaultValue: '0'`, sin
`sourceField`). Esto contradice el dato real de la factura `3883332` usada en las secciones 9-10
(`COSTO_TOTAL=859.92` para el artículo `225`), confirmando otra vez que esa factura no fue
generada por este pipeline tal como está configurado hoy.

**RESUELTO (2026-10-30), confirmado por el usuario**: cruzando `859.92 = CATELLI.ARTICULO.
COSTO_ULT_LOC (71.66... de otro ejemplo, ver nota) × CANTIDAD`, se confirmó la fórmula real:
- `FACTURA_LINEA.COSTO_TOTAL = CATELLI.ARTICULO.COSTO_ULT_LOC × CANTIDAD` (lookup por
  `COD_ART`, NO `COSTO_PROM_LOC` ni `COSTO_STD_LOC`).
- `FACTURA_LINEA.COSTO_TOTAL_DOLAR = CATELLI.ARTICULO.COSTO_ULT_DOL × CANTIDAD` (mismo
  mecanismo, columna dólar).

Esto se resuelve con un único `lookupQuery` que hace el cálculo en la misma consulta (patrón ya
usado para `BASE_IMPUESTO1`/`PAQUETE`):
```sql
SELECT (CAST(COSTO_ULT_LOC AS DECIMAL(18,4)) * @CANTIDAD)
FROM CATELLI.ARTICULO WHERE ARTICULO = @COD_ART
```
con `lookupParams: [COD_ART, CANTIDAD(←CNT_MAX)]`. Mismo patrón para `COSTO_TOTAL_DOLAR` con
`COSTO_ULT_DOL`. Esto corrige de raíz también `TRANSACCION_INV.COSTO_TOT_FISC_LOC/DOL` y los
renglones de costo de venta en `DIARIO` (sección 9), que dependían de este mismo valor.

## 11. Contexto de negocio completo y requisito de transacción atómica (2026-10-30)

El usuario explicó el ciclo de vida completo del que el proceso de Factura es solo una parte,
conectándolo con el flujo de Cargas/Traspasos que **ya existe en el repo**
(`loadsService.js`/`traspasoService.js`, ver `CLAUDE.md` y memoria del proyecto):

1. **Preventa** genera pedidos → se envían a `loads_orders_staging`/`loads_detail_staging`
   ("Loads_detail y orders").
2. **Despacho de Carga**: hoy esto dispara `realizarTraspaso` — un traspaso de bodega que
   **aparta/reserva** la existencia completa del pedido (bodega origen → bodega del repartidor/
   ruta) para que el repartidor la lleve físicamente.
3. **Reparto**: el repartidor entrega los pedidos. Lo que efectivamente se entrega se convierte
   en **Factura** — este es exactamente el proceso que venimos analizando en todo este
   documento (`FAC_ENC_PED`/`FAC_DET_PED`/`ALCXC_MOV_DIR` → `CATELLI`).
4. **Reverso pendiente**: no todos los pedidos que salieron en la Carga terminan facturados —
   algunos no se entregan. Para esos, hay que generar un **traspaso inverso** (bodega del
   repartidor → bodega origen) que devuelva la existencia no vendida a su bodega real.

**Requisito explícito del usuario**: todo este ciclo debe vivir en el mismo pipeline del Gestor
Universal, de forma automática. Y, específicamente para el proceso de Factura que estamos
diseñando: **tiene que ejecutarse como UNA sola transacción atómica**, insertando paso a paso
en el orden correspondiente (si cualquier paso falla, nada debe quedar a medias).

### CORREGIDO (2026-10-30): el motor SÍ tiene manejo de transacciones reales — solo que fragmentado entre mappings

La primera revisión fue incompleta (solo se buscó `BEGIN TRAN`/`Transaction` como texto literal
y no se encontró nada en `DynamicTransferService.js`) — una segunda pasada más a fondo encontró
el mecanismo real, que vive un nivel más abajo:

- `DatabaseServiceAdapter.withConnections` (`DatabaseServiceAdapter.js:52-70`) envuelve tanto la
  conexión origen como la destino en `DatabaseService.withTransaction()`
  (`DatabaseService.js:667-712`, usa `beginTransaction`/`commitTransaction`/`rollbackTransaction`
  nativos de `tedious`) — **toda la ejecución de UN mapping (todos sus documentos, todas sus
  tableConfigs) ya corre dentro de una transacción SQL real**, en origen y destino.
- Dentro de esa transacción, cada documento del lote tiene su propio **SAVEPOINT**
  (`DynamicTransferService.js:242,251-252`, `DatabaseService.js:789-824`): si un documento falla
  a mitad de camino, se revierte solo lo que ese documento escribió (`rollbackToSavepoint`), sin
  afectar a los documentos ya procesados en el mismo lote, que quedan pendientes de confirmar
  junto con el resto al final del batch.
- `processSingleDocumentSimple` (la función que inserta, en orden, cada `tableConfig` de un
  mapping para un documento) usa esa misma conexión transaccional para todas sus tablas.

**El problema real no es "falta soporte de transacciones"** — es que la cadena actual de
Factura está fragmentada en **4 mappings separados** (`CargarFacturas`→`Carga_Fac_To_CC`→
`CargasRecibos`→`CargaNCF_Fac`, encadenados vía `workflowConfig`), y cada uno dispara su
**propia** llamada a `processDocuments`/`withConnections`
(`DynamicTransferService.js:7408`, `this.processDocuments(childDocumentIds, nextMappingId, ...)`)
— es decir, **su propia transacción separada**, sin relación con la del mapping padre. Si las 9
tablas de Factura (las 8 actuales + las 2 nuevas de inventario/asiento) vivieran en **un solo
`TransferMapping`** en vez de 6 separados, el motor **ya da atomicidad real por factura sin
tocar una sola línea de `DynamicTransferService.js`** — consolidar mappings es la solución, no
construir motor nuevo. Ver el plan de implementación (`zazzy-spinning-cook.md` en el momento de
escribir esto, puede cambiar de nombre) para el detalle completo.

**Riesgo conocido a verificar antes de confiar en esto en producción**: SQL Server puede dejar
una transacción en estado "doomed" (`XACT_STATE()=-1`) después de ciertos errores severos, donde
un rollback parcial a savepoint no alcanza y hace falta abortar toda la transacción. El código
actual de `rollbackToSavepoint` traga el error de rollback (solo loguea warning y resuelve
igual) — hay que probar este escenario a propósito antes de confiar en el mecanismo para
Factura.

### Orden propuesto de los pasos dentro de la transacción (a validar)

Combinando lo ya confirmado (cadena real de mappings, sección 5-6) con las 2 piezas nuevas
(inventario y asiento, secciones 7-10):

1. `FACTURA` (header)
2. `FACTURA_LINEA` (detalle)
3. `AUDIT_TRANS_INV` (header de inventario) — nuevo, sección 10
4. `TRANSACCION_INV` (detalle de inventario, ×línea) — nuevo, sección 10
5. `ASIENTO_DE_DIARIO` (header contable) — nuevo, sección 7/9
6. `DIARIO` (detalle contable, partida doble) — nuevo, sección 9
7. `DOCUMENTOS_CC` tipo `'FAC'` (cargo) — ya existe en `Carga_Fac_To_CC`
8. `NCF_DOCUMENTO` — ya existe en `CargaNCF_Fac`
9. `DOCUMENTOS_CC` tipo `'REC'` + `AUXILIAR_CC` (aplicación del recibo) — ya existe en
   `CargasRecibos`, con el ajuste pendiente de la sección 6.2 (distinguir factura nueva vs.
   saldar documento viejo)

Este orden es una propuesta razonada (header antes que detalle, inventario y contabilidad antes
que CxC), **no confirmada todavía por el usuario** — falta validarla.

### El "reverso" (traspaso de devolución) queda fuera del diseño de ESTE mapping

El traspaso inverso para pedidos no entregados es una operación a **nivel de ruta/lote
completo** (comparar lo que salió en la Carga contra lo que efectivamente se facturó, y generar
UN traspaso correctivo por la diferencia) — no es parte del insert de una factura individual.
Conceptualmente es un primo cercano del plan ya en curso "Revisión de Almacén en Despacho de
Cargas" (ajuste de faltantes ANTES del despacho, por picking físico), pero resuelve un
problema distinto: ajuste DESPUÉS de la entrega, por pedidos no entregados. **Pendiente de
decidir con el usuario**: ¿se diseña como parte de esta misma investigación de Factura, o como
una fase aparte una vez cerrado el mapping de creación de Factura? Dado que toca el dominio de
Traspasos/Cargas (que ya tiene su propio plan de rediseño en curso, ver plan file
`zazzy-spinning-cook.md`), probablemente conviene tratarlo como una fase subsiguiente, no
mezclarla con el diseño actual — pero queda como pregunta abierta, no decisión tomada.

## 13. Decisión arquitectónica final para `DIARIO` (2026-10-30): 8 tableConfigs de detalle, sin tocar el motor

Al armar el script de migración (`server/scripts/buildCargarFacturaCompleta.js`) surgió la duda
de si el abanico variable de renglones de `DIARIO` por línea de `FAC_DET_PED` (0, 1 o 2 filas
según el caso, más 2 filas de encabezado que no corresponden a ninguna línea) podía modelarse
con el mecanismo de "tabla de detalle" existente (1 fila origen → 1 fila destino) o si hacía
falta ampliar `DynamicTransferService.js`.

**Se investigó el código real antes de decidir** (`processSingleDocumentSimple` y
`processDetailTables`, `DynamicTransferService.js:467-633,1034-1086`): el motor procesa cada
tabla de detalle de forma **totalmente secuencial** (`for` con `await`, nunca en paralelo),
ordenadas por su propio `executionOrder` entre sí. Esto significa que **no hace falta ampliar
el motor**: alcanza con modelar cada "tipo" de renglón contable como su propia tableConfig
estándar, filtrando el subconjunto de líneas que le corresponde. El campo que distingue línea
de bonificación de línea regular en `FAC_DET_PED` es `CANTIDAD_BONIFICADA` (`>0` = bonificación,
confirmado por el usuario — más confiable que inferir por `MON_PRC_MN`/`MON_PRC_MX`/`MON_TOT`
en cero, que es consecuencia, no la causa). También se confirmó que `filterCondition` se pega
literalmente al `WHERE` de la query de origen (`processFilterCondition`,
`DynamicTransferService.js:4410-4478`) y admite cualquier condición plana sobre columnas de la
propia tabla origen, pero no subqueries contra el otro servidor — por eso el costo de venta
(que depende de `CATELLI.ARTICULO`, server1) no se filtra por "costo>0": simplemente se genera
siempre el par crédito/débito, y si da `0` el renglón es inofensivo (no rompe el balance).

**Diseño final, 8 tableConfigs de detalle** (`parentTableRef:'FAC_ENC'`, todas con
`targetTable:CATELLI.DIARIO` salvo `ASIENTO_DE_DIARIO`):
- `ASIENTO_DE_DIARIO` (`FAC_ENC_PED`, 1 fila por factura — encabezado del asiento).
- `DIARIO_VENTA` (`FAC_DET_PED`, `filterCondition: CANTIDAD_BONIFICADA = 0`): crédito por línea.
- `DIARIO_BONO_CREDITO` / `DIARIO_BONO_DEBITO` (`filterCondition: CANTIDAD_BONIFICADA > 0`):
  crédito+débito que se cancelan.
- `DIARIO_COSTO_CREDITO` / `DIARIO_COSTO_DEBITO` (sin filtro, todas las líneas): crédito+débito
  de costo, en `0` si el artículo no tiene costo cargado.
- `DIARIO_AR` / `DIARIO_ITBIS` (`FAC_ENC_PED`, 1 fila por factura cada una, `executionOrder`
  más alto que las anteriores): débito a Cuentas por Cobrar / crédito a ITBIS por pagar.

`CONSECUTIVO` de cada renglón se resuelve vía `lookupQuery: SELECT ISNULL(MAX(CONSECUTIVO),0)+1
FROM CATELLI.DIARIO WHERE ASIENTO=@ASIENTO` — seguro porque el procesamiento es estrictamente
secuencial dentro de la misma transacción (no es una suposición, está confirmado en el código).

**Bloqueante de datos, resuelto (2026-10-30):** el usuario pasó el diccionario completo de
`ASIENTO_DE_DIARIO`/`DIARIO` (`INFORMATION_SCHEMA.COLUMNS`) y el registro real completo de
ambas tablas para la factura `3883332`.

`ASIENTO_DE_DIARIO`: `ASIENTO`, `PAQUETE`, `TIPO_ASIENTO`, `FECHA`, `CONTABILIDAD`, `ORIGEN`,
`CLASE_ASIENTO`, `TOTAL_DEBITO_LOC/DOL`, `TOTAL_CREDITO_LOC/DOL`, `ULTIMO_USUARIO`,
`FECHA_ULT_MODIF`, `MARCADO`, `NOTAS`, `TOTAL_CONTROL_LOC/DOL`, `USUARIO_CREACION`,
`FECHA_CREACION` (+ boilerplate `NoteExistsFlag`/`RowPointer`/`CreatedBy`/`UpdatedBy`/
`CreateDate`/`DEPENDENCIA`/`DOCUMENTO_GLOBAL`, nullables o con default de BD, sin mapear).
Valores reales confirmados (factura `3883332`, `ASIENTO=2193517`): `PAQUETE='FA'`,
`TIPO_ASIENTO='FA'`, `CONTABILIDAD='A'`, `ORIGEN='FA'`, `CLASE_ASIENTO='N'`, `MARCADO='N'`,
`TOTAL_DEBITO_LOC=TOTAL_CREDITO_LOC=TOTAL_CONTROL_LOC=4969.59`,
`TOTAL_DEBITO_DOL=TOTAL_CREDITO_DOL=TOTAL_CONTROL_DOL=135.38` (los 3 pares iguales entre sí,
confirma que `TOTAL_CONTROL_*` replica `TOTAL_DEBITO_*`, aunque nunca se preguntó su propósito
exacto). `DIARIO`: `ASIENTO`, `CONSECUTIVO`, `NIT`, `CENTRO_COSTO`, `CUENTA_CONTABLE`, `FUENTE`,
`REFERENCIA`, `DEBITO_LOCAL/DOLAR`, `CREDITO_LOCAL/DOLAR`, `DEBITO_UNIDADES`/`CREDITO_UNIDADES`
(sin usar), `TIPO_CAMBIO`/`BASE_LOCAL`/`BASE_DOLAR` (sin usar), más boilerplate y `PROYECTO`/
`FASE`/`DOCUMENTO_GLOBAL` (nullables, sin mapear — son dimensiones de contabilidad de proyectos
reales, no se deben reutilizar como marcador interno).

**Hallazgo durante la escritura del script — corrige la sección 3/9 sobre `BODEGA`:** al revisar
el registro real de `FACTURA_LINEA` de `3883332` junto con el diccionario nuevo, se vio que la
línea `BODEGA='02'` tiene el MISMO precio unitario que su hermana `BODEGA='01'` del mismo
artículo (85.49 en ambas, cantidades 2 y 12). Esto **no es un indicador de bonificación** —
contradice la lectura que se había hecho de la sección 9 — es un split real de picking entre dos
bodegas físicas, propio de una factura cargada manualmente (no por este pipeline, consistente
con lo ya establecido en la sección 10). La "DECISIÓN: bodega fija 01 para todo" (sección 3)
sigue siendo correcta tal cual: en este pipeline, tanto la línea regular como la de bono quedan
con `BODEGA='01'`. El único criterio confiable de bonificación sigue siendo
`CANTIDAD_BONIFICADA` en el origen (`FAC_DET_PED`), nunca `BODEGA` en el destino. Esto obligó a
corregir el lookup `SIBLING_REGULAR_PRICE` del script (ya no filtra por `BODEGA='01'`, que no
sirve para distinguir nada si ambas líneas comparten bodega — filtra por `PRECIO_UNITARIO > 0`,
que en el momento de procesar la línea de bono solo matchea su hermana regular ya insertada), y
a calcular los totales de `ASIENTO_DE_DIARIO`/`DIARIO_AR` sumando TODAS las líneas de
`FACTURA_LINEA` (o usando `FACTURA.TOTAL_MERCADERIA`, que ya viene neto de bonificaciones desde
`MON_SIV` del origen) en vez de intentar separar línea regular de bono en el destino.

## Caso feliz validado end-to-end en desarrollo (2026-10-31)

Se montó un ambiente de desarrollo en Docker (Mongo `dev-mongo` + backend/frontend `core_app`
en contenedores propios, red `core_app_default` + `dev-infra_default`; server1 (`10.0.11.49`)
alcanzable directo desde el contenedor, server2 (`172.18.7.15\calidadstdb`) solo vía un
portproxy de Windows + `host.docker.internal`, ya que esa red no es alcanzable desde Docker) y
se corrió `CargarFacturaCompleta` contra la factura real `9R01260000010`.

**Resultado: las 14 tablas se insertaron correctamente y el asiento contable balanceó exacto**
(`SUM(DEBITO)=SUM(CREDITO)=32821.856` local / `893.874` dólar, verificado línea por línea contra
`CATELLI.DIARIO`), `DOC_PRO` en server2 marcado solo al final. Esto confirma que las fórmulas de
`ASIENTO_DE_DIARIO`/`DIARIO_AR` derivadas en la sección 13 (sumando todas las líneas sin
discriminar bono/regular) son correctas con datos reales.

En el camino se encontraron y corrigieron **3 bugs reales y preexistentes en
`DynamicTransferService.js`/`DatabaseService.js`**, compartidos por todos los mappings
existentes (no solo este):

1. **Crítico — ningún rollback a savepoint se ejecutaba nunca.**
   `processSingleDocumentSimple` atrapaba sus propios errores y devolvía `{success:false}` en
   vez de relanzar la excepción, así que el `catch` de `processDocuments` (el que llama
   `rollbackToSavepoint`) jamás se disparaba — cualquier documento que fallara a mitad de
   camino quedaba con sus tablas parciales confirmadas igual al hacer `COMMIT` del batch
   completo. Confirmado con una fila huérfana real en `CATELLI.FACTURA` antes del fix. Fix:
   relanzar la excepción después de loguear (`processSingleDocumentSimple`, catch final).
   Verificado después del fix: `rollbackToSavepoint` sí se ejecuta y revierte todo lo escrito
   por el documento fallido, incluyendo el `UPDATE CATELLI.PAQUETE` que consume el consecutivo
   de `ASIENTO` (confirmado: reintentos sucesivos del mismo documento fallido reutilizan el
   mismo número de `ASIENTO`, señal de que también ese `UPDATE` se revierte).
2. Un lookup `lookupFromTarget` nunca se ejecutaba en tablas de detalle (`isDetailTable:true`)
   — la condición `!isDetailTable` lo saltaba bajo el supuesto de que el valor "ya venía
   resuelto en los datos", lo cual nunca es cierto para un campo que no existe en la tabla
   origen (ej. `FACTURA_LINEA.CUENTA_CONTABLE`, que no existe en `FAC_DET_PED`). Fix: ejecutar
   el lookup siempre que la tabla tenga campos `lookupFromTarget`, sin importar si es detalle.
3. El `catch` interno de `executeLookupInTarget` referenciaba una variable `mapping` inexistente
   en ese scope (`ReferenceError: mapping is not defined`), enmascarando cualquier error SQL
   real de un lookup fallido detrás de ese mensaje genérico. Fix: quitar la referencia rota.

**Importante para producción:** el fix #1 cambia el comportamiento observable de TODOS los
mappings existentes — antes nunca revertían nada ante un fallo parcial, ahora sí. Es el
comportamiento correcto, pero conviene tenerlo presente al desplegar.

Además, 2 `UPDATE ... OUTPUT` sin `INTO` (`CATELLI.PAQUETE` para el consecutivo de `ASIENTO`, y
`CATELLI.DOCUMENTOS_CC` para `SALDO` en `AplicarRecibosCxC`) fallaban con "cannot have any
enabled triggers if the statement contains an OUTPUT clause without INTO clause" — ambas tablas
tienen triggers reales habilitados. Se corrigieron capturando el `OUTPUT` en una tabla variable
(`DECLARE @t TABLE (...) ... OUTPUT INSERTED.col INTO @t ...; SELECT col FROM @t`).

Se completaron 3 campos `NOT NULL` que nunca se habían mapeado (confirmados uno por uno contra
el error real de SQL Server al insertar `9R01260000010`):
- `FAC_ENC.PEDIDO` (`sourceField: OBS_PED`) — venía `isRequired:true` heredado de
  `CargarFacturas`, pero `OBS_PED` puede ser `NULL` legítimamente (confirmado contra
  `9R01260000010`). Se relajó a opcional.
- `TRANSACCION_INV.CONSECUTIVO` — nunca se mapeó. Se agregó con el mismo patrón `MAX+1` que
  `DIARIO_CONSECUTIVO`, resolviendo el `AUDIT_TRANS_INV` real vía subquery (no se puede leer del
  `lookupResult` de otro campo de la misma pasada — `executeLookupInTarget` no comparte
  resultados entre `fieldMappings`).
- `TRANSACCION_INV.PRECIO_TOTAL_DOLAR` — nunca se mapeó. No existe un precio en dólares nativo
  en `FAC_DET_PED`; se calculó igual que `PRECIO_TOTAL_LOCAL` convertido con `EXCHANGE_RATE`.

Y un hallazgo de diseño propio (no un bug del motor): un `lookupParams` no puede referenciar un
campo que solo existe en la tabla del encabezado (`FAC_ENC_PED`) desde una tabla cuya
`sourceTable` es la de detalle (`FAC_DET_PED`) — el motor arma el `SELECT` de la tabla de
detalle incluyendo cualquier `sourceField` usado en `lookupParams`, así que un campo del header
rompe esa query con "Invalid column name". Pasó con `TRANSACCION_INV.NIT` (usaba `COD_CLT`, del
header) — se resolvió igual que `ASIENTO_LOOKUP`: vía `JOIN` contra la `FACTURA` ya insertada en
destino, usando `NUM_PED` (que sí existe en `FAC_DET_PED`) en vez de `COD_CLT`.

**Queda pendiente, no bloqueante** (campo de trazabilidad secundario): `FACTURA.AUDIT_TRANS_INV`
queda `NULL` porque se procesa en el paso 1, antes de que exista el registro real de
`AUDIT_TRANS_INV` (varios pasos después) — completarlo bien requeriría un `UPDATE` posterior a
`FACTURA` ya insertada, que el motor no soporta hoy como parte de un `tableConfig` simple.

**Queda por confirmar antes de activar en producción** (no bloquea seguir la Fase 3 en
desarrollo — esta factura de prueba no tenía líneas bonificadas, así que esto sigue sin probar):
- Nombre real de la cuenta de descuento por bonificación en `ARTICULO_CUENTA` — se usó
  `CTA_DESC_BONIF_LOC` (no `CTA_DESC_VENTA_LOC`) para `DIARIO_BONO_DEBITO`, sin confirmar.
- `DIARIO_ITBIS` genera 1 sola fila por factura (solo se vio 1 tasa de ITBIS en los ejemplos
  reales) — no soporta todavía una factura con más de una tasa de ITBIS distinta.

## Segunda factura de prueba (9R01260000019) — 2 bugs reales más, rollback reconfirmado

Se probó `CargarFacturaCompleta` contra una segunda factura real (`9R01260000019`, 4 líneas,
ninguna bonificada). Encontró y confirmó 2 cosas más:

**Rollback reconfirmado en un escenario mucho más complejo**: el primer intento falló en
`DIARIO_ITBIS` (ver abajo) después de haber insertado ya las 14 tablas hasta ese punto (4 líneas
de detalle, 13 renglones de `DIARIO`). Tras el fallo, `SELECT * FROM CATELLI.FACTURA_LINEA WHERE
FACTURA='9R01260000019'` vino **vacío** — confirma que el rollback a savepoint (fix de la sesión
anterior) revierte todo correctamente incluso en un documento con muchas más tablas/líneas
involucradas, no solo en el caso simple de la primera prueba.

**Bug de diseño 1 — `DIARIO_ITBIS` fallaba cuando la factura no tenía ITBIS.** El diseño
original (1 fila fija por factura, buscando "la primera línea con impuesto>0") asumía que
siempre habría al menos una línea con impuesto — pero esta factura tenía las 4 líneas con
`PORC_IMPUESTO1 IS NULL` en el origen (factura real sin ITBIS aplicado, confirmado contra
`FAC_DET_PED`). El `lookupQuery` de `CUENTA_CONTABLE` con `failIfNotFound:true` no encontraba
resultado y abortaba el documento entero por algo que no es un error real. Se rediseñó: en vez
de 1 fila agregada por factura vía `FAC_ENC_PED`, ahora es 1 fila **por línea con impuesto** vía
`FAC_DET_PED` con `filterCondition: "PORC_IMPUESTO1 IS NOT NULL"` — 0 líneas con impuesto = 0
filas generadas (mismo patrón ya usado por `DIARIO_BONO_CREDITO`/`DEBITO`), sin fallar. Esto
también resuelve de paso la limitación de "no soporta multi-tasa" que quedaba pendiente: cada
línea con impuesto ahora resuelve su propia cuenta contable independientemente.

**Bug de diseño 2 — `DIARIO_AR` podía desbalancear el asiento.** Tras corregir el bug anterior,
la factura procesó completo pero con un desbalance real de $2.88 entre `SUM(DEBITO)` y
`SUM(CREDITO)` en `CATELLI.DIARIO` (confirmado con SQL: `165401.28` vs `165398.40`). Causa:
`DIARIO_AR.DEBITO_LOCAL` usaba `FACTURA.TOTAL_MERCADERIA` (`=MON_SIV` del origen, `115274.88`),
mientras que `TOTAL_DEBITO_LOC`/`TOTAL_CREDITO_LOC` (el total que el resto del asiento declara)
se calcula con `SUM(FACTURA_LINEA.PRECIO_TOTAL)` (`115272.00`) — `MON_SIV` no coincidía exacto
con la suma de líneas por un redondeo propio del origen. Se corrigió `DIARIO_AR` para usar
`SUM(FACTURA_LINEA.PRECIO_TOTAL) + SUM(TOTAL_IMPUESTO1)` — la misma fuente que ya usa el resto
del asiento — garantizando balance exacto siempre, sin depender de que el origen cuadre con la
suma de líneas. Reprocesada la misma factura después del fix: `SUM(DEBITO)=SUM(CREDITO)=
165398.40` exacto.

**El modal de progreso del frontend ya funciona.** `ProcessingStatusModal.jsx` solo arranca su
polling si `mapping.taskId` existe; como el script creaba el `TransferMapping` directo vía
`TransferMapping.create()`, nunca quedaba vinculado a un `TransferTask` y el modal se quedaba
pegado en 0% para siempre (aunque el backend ya hubiera terminado). Se cambió el script para usar
`DynamicTransferService.createMapping()` (el mismo método que usa la UI) en vez de
`TransferMapping.create()` directo — ese método ya crea/vincula el `TransferTask`
automáticamente. Pendiente, no bloqueante: el progreso hoy es *por documento del batch*, no *por
tabla dentro de un documento* — para un batch de 1 factura salta de 0% a 100% de golpe al
terminar, sin pasos intermedios; mostrar "insertando FACTURA_LINEA" en vivo requeriría
instrumentar `processSingleDocumentSimple`/`processTable` para actualizar el `TransferTask` en
cada paso.

**Siguiente paso real**: seguir la Fase 3 del plan — batch mixto (varias facturas en un mismo
run, una forzada a fallar) y después probar `AplicarRecibosCxC` completo. El caso de falla
forzada / rollback ya quedó cubierto por los 2 fallos reales encontrados en el camino (no hace
falta repetirlo artificialmente).

## Batch mixto y `AplicarRecibosCxC` validados end-to-end (2026-11-01)

**Batch mixto (Fase 3, punto 3):** se procesaron 4 facturas reales pendientes
(`9R01260000011`, `9R01260000012`, `9R01260000017`, `9R01260000018`) en una sola corrida de
`CargarFacturaCompleta`. `9R01260000011` falló con una violación real de `PRIMARY KEY
DOCUMENTOS_CCPK` (ya tenía un `DOCUMENTOS_CC` cargado por la cadena legacy) y se revirtió
limpio (`FACTURA` vacía después); las otras 3 se procesaron y confirmaron con balance exacto.
Confirma que los savepoints aíslan documentos fallidos del resto del batch, como se esperaba.

**`AplicarRecibosCxC` — caso autorreferencia validado, con 3 bugs reales de diseño encontrados
y corregidos en el camino:**

1. **La tableConfig "ACTUALIZAR_SALDO_CC" generaba un INSERT corrupto.** Se había diseñado como
   una tableConfig aparte, con su propio `targetTable:CATELLI.DOCUMENTOS_CC`, pensada solo para
   disparar el `UPDATE...OUTPUT` de `SALDO` como efecto lateral vía `lookupFromTarget`. El motor
   no tiene ningún modo "solo UPDATE, sin INSERT" para una tableConfig: además de ejecutar el
   lookup, igual generaba su propio INSERT real con los `fieldMappings` de esa tableConfig
   (`DOCUMENTO`, `SALDO`), insertando una fila corrupta de 2 columnas en `DOCUMENTOS_CC` y
   violando el `NOT NULL` de `TIPO` (confirmado con el documento real `9R01260000012`: "Cannot
   insert the value NULL into column 'TIPO'", `INSERT INTO CATELLI.DOCUMENTOS_CC (DOCUMENTO,
   SALDO)...`). Fix: el `UPDATE` de `SALDO` se movió como un campo más (`_UPDATE_SALDO_FAC`,
   prefijo `_`) dentro de la tableConfig `APLICAR_AUXILIAR` ya existente, que sí genera un INSERT
   real y válido.
2. **Esto exigió generalizar el filtro de "campos auxiliares" en `DynamicTransferService.js`**
   (función `processTable`): antes era una lista hardcodeada de nombres específicos de
   promociones (`_IS_BONUS_LINE`, etc.); ahora cualquier `targetField` que empiece con `_` se
   excluye automáticamente del INSERT real. Esto también resolvió, de paso, un bug de UX ya
   reportado por el usuario: la columna "RECIBO" en la lista de documentos pendientes de la UI
   mostraba siempre "—", porque el único campo con `showInList:true` en `CXC_` (`DOCUMENTO`) no
   tiene `sourceField` (se genera por consecutivo, no existe en las filas de *origen* que lista
   esa UI). Se agregó un campo de solo-visualización `_DISPLAY_NUM_REC` (`sourceField: NUM_REC`)
   para mostrar el número real del recibo origen.
3. **El consecutivo de `DOCUMENTO` (número del recibo) tenía riesgo real de colisión.** El
   consecutivo de mapping heredado de `CargasRecibos` (`prefix:''`, `startValue:1`) nunca se
   había usado en producción (su `lastValue` seguía en `0`) y generaba `DOCUMENTO='1'`,`'2'`...
   con riesgo de chocar contra la numeración real de caja (`CATELLI.CONSECUTIVO CONSECUTIVO='20'
   "RECIBOS_CAJAS"`, formato real confirmado `SF######`, último valor real visto `SF476511`). Se
   descubrió que el ERP ya tiene un consecutivo propio y separado para esta integración:
   `CONSECUTIVO='37' "RECIBO_TELYNET"` (prefix `'RC-'`), ya reflejado en Mongo como el
   `Consecutive` centralizado **"RECIBO_FAC"** (`_id 69b8cab9e8d79850941accaf`). Se migró a
   usarlo vía `mapping.consecutiveConfig.useCentralizedSystem` +
   `selectedCentralizedConsecutive` — **no** vía el mecanismo "Multi-Consecutivo" por campo
   (`isConsecutive`+`consecutiveId` en el `fieldMapping`), que se probó primero y resultó
   incorrecto: ese mecanismo reserva un valor independiente por campo, rompiendo la réplica
   automática del mismo valor hacia `AUXILIAR_CC.CREDITO` (que depende de
   `consecutiveConfig.fieldName`/`detailFieldName`, resuelto una sola vez por documento) y
   causando una violación real del FK `AUXCCCRD` (`AUXILIAR_CC.CREDITO+TIPO_CREDITO` debe existir
   en `DOCUMENTOS_CC.DOCUMENTO+TIPO`).
   - Al resincronizar se encontró que `CATELLI.CONSECUTIVO.ULTIMO_VALOR` para `CONSECUTIVO='37'`
     estaba desincronizado respecto al `MAX(DOCUMENTO)` real ya usado en `DOCUMENTOS_CC` (había
     documentos reales `RC-00000002` hasta `RC-00000014`, cargados por esta misma cadena en mayo
     de 2026, cuyo `ULTIMO_VALOR` nunca se actualizó correctamente en esa corrida). Se
     resincronizaron manualmente tanto el `currentValue` en Mongo como `ULTIMO_VALOR` en CATELLI
     al valor máximo real antes de continuar, para evitar una colisión futura.
   - Los `Consecutive` centralizados en Mongo tienen control de permisos por mapping
     (`assignedTo`, `entityType:"mapping"`) — cada vez que se recrea el mapping
     `AplicarRecibosCxC` (cambia su `_id`), hay que volver a autorizarlo en el `Consecutive`
     "RECIBO_FAC", si no falla con "El usuario no tiene permiso para incrementar este
     consecutivo".

**Hallazgo nuevo, fuera del diseño original de la Fase 1 — el recibo SÍ genera su propio asiento
contable real.** Se confirmó con 6 asientos reales en CATELLI (paquete `'CC'` de
`ASIENTO_DE_DIARIO`) que aplicar un recibo genera un asiento de 2 líneas: débito a Caja/Efectivo
(cuenta fija `100-01-01-01-01`) y crédito a
Cuentas por Cobrar (cuenta fija `100-01-04-01-00`, la misma cuenta fija que ya usa `DIARIO_AR`
de la factura), por el monto exacto del recibo en ambos lados, con `FUENTE = 'REC' + DOCUMENTO`
y `REFERENCIA = 'Pago de Documento ' + NUM_DOC_AF`. Se agregaron 3 tableConfigs nuevas a
`AplicarRecibosCxC`: `ASIENTO_DE_DIARIO_REC`, `DIARIO_CREDITO_AR_REC`, `DIARIO_DEBITO_CAJA_REC`.

El consecutivo de `ASIENTO` para el paquete `'CC'` tiene un formato distinto al de `'FA'` usado
en `CargarFacturaCompleta`: `CATELLI.PAQUETE.ULTIMO_ASIENTO` para `'FA'` es numérico puro (ej.
`"2028299"`), pero para `'CC'` es un string que YA incluye el prefijo (ej. `"CC04286379"`) —
confirmado contra datos reales antes de escribir la fórmula. Requirió un incremento distinto:
extraer el substring desde la posición 3, convertir a `BIGINT`, incrementar, re-paddear a 8
dígitos con ceros, re-anteponer `'CC'`. Como `DOCUMENTOS_CC` no guarda `NUM_DOC_AF` directamente,
las 3 tableConfigs nuevas usan `AUXILIAR_CC` como puente (`JOIN` por `DEBITO=NUM_DOC_AF` /
`CREDITO=DOCUMENTO` del recibo) para encontrar el `ASIENTO` correcto ya generado por `CXC_` — por
eso `AUXILIAR_CC` pasó a `executionOrder:2` (antes que las tablas de asiento, que quedaron en
3/4/5).

**Gap preexistente descubierto y corregido también en `CargarFacturaCompleta`:** la tableConfig
`DOC_CC_FAC` (heredada de la legacy `Carga_Fac_To_CC`) nunca mapeaba el campo `ASIENTO` de
`DOCUMENTOS_CC` tipo `FAC` — quedaba `NULL` con `ASIENTO_PENDIENTE='S'` para siempre, a
diferencia de toda factura real cargada por el ERP nativo (confirmado contra facturas reales
`FV1517301`...`FV1517305`, todas con `ASIENTO` poblado = su propio `FACTURA.ASIENTO_DOCUMENTO` y
`ASIENTO_PENDIENTE='N'`). Se agregó el campo `ASIENTO` (`lookupFromTarget: SELECT
ASIENTO_DOCUMENTO FROM CATELLI.FACTURA WHERE FACTURA=@NUM_PED`, reutilizando el asiento ya
generado por `FAC_ENC` en el paso 1) y se cambió el default de `ASIENTO_PENDIENTE` a `'N'`. La
factura de prueba `9R01260000023`, ya cargada antes de este fix, se corrigió manualmente con un
`UPDATE` directo sobre su fila de `DOCUMENTOS_CC` (sin reprocesarla entera).

**Caso de prueba con datos de origen inconsistentes, manejado correctamente (no es un bug del
pipeline):** al procesar el recibo autorreferencia de `9R01260000023` se descubrió que el monto
en `ALCXC_MOV_DIR` (`MON_MOV_LOCAL=63919.78`) no coincidía con el monto real de la factura
(`3047.04`, confirmado de forma independiente por `FACTURA.TOTAL_MERCADERIA`,
`SUM(FACTURA_LINEA.PRECIO_TOTAL)` y el propio origen `FAC_ENC_PED.MON_SIV`/`MON_CIV`) — un error
en el dato de prueba de server2, no un bug del mapping (la lógica `SALDO = SALDO - MONTO` es
correcta; aplicada sobre un monto equivocado, el resultado fue una factura con `SALDO` negativo).
Se revirtió todo lo generado por ese intento (`DIARIO`, `ASIENTO_DE_DIARIO`, `AUXILIAR_CC`,
`DOCUMENTOS_CC` del recibo, `SALDO` de la factura), se corrigió el dato de origen en
`ALCXC_MOV_DIR`, y se reprocesó con éxito (balance exacto `3047.04` en ambos lados del asiento
del recibo). Se decidió **no** revertir los consecutivos ya "quemados" por ese intento
(`RC-00000016` y `CC04286380` quedaron como huecos permanentes en la numeración) — consistente
con la tolerancia a huecos que ya tiene este esquema por los intentos fallidos anteriores
(reservar-y-cancelar en Mongo nunca revierte el contador, solo marca la reserva como expirada).

**Sigue pendiente de la Fase 3:**
- El caso "documento viejo" (Fase 3, punto 5): un recibo que salda un `DOCUMENTOS_CC` que **no**
  fue creado en esta sesión. Candidato identificado: `9R01260000011` (tiene un `DOCUMENTOS_CC`
  real preexistente de la cadena legacy, el mismo que causó el fallo de PK en el batch mixto).
- Confirmar que `ALCXC_MOV_DIR.DOC_PRO` evita el reprocesamiento de la misma fila en una segunda
  corrida (Fase 3, punto 6) — ya se observó `DOC_PRO` marcándose correctamente tras cada éxito,
  pero falta la prueba explícita de "correr de nuevo y confirmar que no reprocesa".

## 14. `BODEGA` real del repartidor en vez de `'01'` fijo — fix + 3 bugs reales del motor genérico (2026-11-05)

**Pregunta original del usuario:** si `realizarTraspaso` mueve (documentalmente) mercadería de
Bodega Central a la bodega del repartidor antes de facturar, ¿`CargarFacturaCompleta` no estaría
descontando existencia dos veces al facturar también desde Bodega Central (`BODEGA='01'` fija,
ver hallazgo de la sección 2/5, línea 183/307)?

**Investigación: descartado — no hay doble descuento que revertir.** Se confirmó contra ~20
traspasos reales de producción que `DOCUMENTO_INV.SELECCIONADO` queda `'N'` para siempre
(`traspasoService.js` lo hardcodea así al insertar y no existe ningún `UPDATE` posterior en todo
el archivo que lo cambie a `'S'`; `APROBADO` tiene **0 referencias** en ese archivo — nunca se lee
ni se escribe). El traspaso nunca se "aplica" del lado de Catelli, así que hoy no tiene ningún
efecto real sobre existencia — no hay nada que revertir al facturar.

**El problema real sí era el hardcode de `BODEGA='01'`** (decisión temporal del 2026-10-30,
sección 2/5 de este documento): toda factura de este pipeline registraba el movimiento de
inventario contra Bodega Central sin importar que la mercancía ya estuviera (documentalmente) en
la bodega del repartidor.

### Fix: resolución de bodega en dos niveles

1. **Primario:** `FAC_ENC_PED.COD_BOD` (poblado por el DTS de TelyNet desde una corrección
   reciente; antes venía `NULL`).
2. **Fallback si `COD_BOD` es `NULL`:** mismo mecanismo que
   `LoadsSQLService.validateDeliveryPerson` — `SELECT U_BODEGA FROM CATELLI.VENDEDOR WHERE
   VENDEDOR=@VENDEDOR AND ACTIVO='S' AND U_ESVENDEDOR='Re'`.
3. **Si ninguno resuelve:** la fila debe fallar explícitamente (nada de default silencioso a
   `'01'` ni a una bodega "pendiente").

**Problema de propagación header→detalle:** `AUDIT_TRANS_INV`/`FACTURA_LINEA`/`TRANSACCION_INV`
necesitan esta bodega, pero `COD_BOD`/`VENDEDOR` solo existen en el header `FAC_ENC_PED` — una
tabla de detalle nunca recibe automáticamente valores del header (ver hallazgo de la sección 9
sobre `NIT`, mismo patrón). Se reutilizó `CATELLI.AUDIT_TRANS_INV.REFERENCIA` (tabla sin columna
`BODEGA` propia, 17 columnas fijas) como portador: `auditTransInv.REFERENCIA` ahora calcula
`'Cliente: ' + COD_CLT + ' | Bodega: ' + COALESCE(COD_BOD, fallback)`, y `FACTURA_LINEA.BODEGA`/
`TRANSACCION_INV.BODEGA` la releen vía `SUBSTRING`/`CHARINDEX` sobre esa `REFERENCIA`, igual
patrón que el pivot ya usado para `NIT`. Se reordenó `executionOrder`: `auditTransInv` pasó de 3
a 2 (antes de `FAC_DET`), `FAC_DET` de 2 a 3.

### 3 bugs reales encontrados en el motor genérico durante las pruebas (no específicos de esta mapping)

Probar el caso "ambos resuelven NULL" (`COD_BOD=NULL` + `VENDEDOR` no-repartidor) expuso 3 fallas
reales en `DynamicTransferService.js`/`transferMappingModel.js`, los 3 ya corregidos:

1. **Un `lookupParam` en `NULL` abortaba la query entera sin ejecutarla.** El motor trataba
   cualquier parámetro `NULL` como "falta un parámetro requerido" y cancelaba el lookup antes de
   que el `COALESCE` tuviera oportunidad de resolver el fallback. El flag `required: false` ya
   existía pero no servía — aunque evitaba el abort, igual omitía el parámetro del bind SQL,
   causando "Must declare the scalar variable". Fix: con `required: false` y valor `NULL`, ahora
   se bindea `NULL` explícito en vez de omitir el parámetro.
2. **`required: false` no se persistía en Mongo.** El sub-schema de `lookupParams` en
   `transferMappingModel.js` no declaraba ese campo — Mongoose lo descartaba en silencio al
   guardar (comportamiento estándar de Mongoose con un schema que no declara el path). Fix: se
   agregó `required: { type: Boolean, default: true }` al sub-schema.
3. **`failIfNotFound` no detectaba un valor `NULL` cuando la query sí devolvía una fila.** Un
   `SELECT (expr)` sin `FROM` siempre devuelve exactamente 1 fila aunque `expr` evalúe `NULL` —
   el chequeo `recordset.length > 0` lo daba por "éxito" con valor `null`, que el procesamiento de
   campo reemplazaba después por el `defaultValue` (`""`), insertando una bodega vacía en vez de
   fallar. Confirmado con datos reales: `9R01260000020` resultó tener **2 filas en `FAC_ENC_PED`
   para el mismo `NUM_PED`** (dato preexistente, no causado por este fix) — la segunda fila con
   `COD_BOD=NULL`/`VENDEDOR=12` (no repartidor) insertó `REFERENCIA=""` en vez de fallar. Fix: si
   el valor resuelto es `NULL`/`undefined` y el campo tiene `failIfNotFound: true`, se trata igual
   que "no se encontraron resultados".

Las 3 correcciones son genéricas del motor — no hay otro código en el repo que use `required` en
un `lookupParam` hoy, así que no rompen ningún otro mapping existente.

### Verificación end-to-end completa (dev, 2026-11-05)

1. `COD_BOD='R01'` poblado → `9R01260000024`: `FACTURA_LINEA.BODEGA`/`TRANSACCION_INV.BODEGA`/
   `AUDIT_TRANS_INV.REFERENCIA` en `R01`, asiento balanceado exacto
   (`87613.20`/`2384.27378740` débito=crédito), `FACTURA.AUDIT_TRANS_INV` autocompletado.
2. `COD_BOD=NULL` + `VENDEDOR='1'` válido → `9R01260000025`: fallback resolvió `R01` vía
   `CATELLI.VENDEDOR.U_BODEGA`, asiento balanceado (`116455.60`/`3169.95444140`).
3. `COD_BOD=NULL` + `VENDEDOR='12'` no-repartidor → `1654000000000264`: falló limpio
   (`"Fallos críticos en lookup": [{"field":"REFERENCIA","error":"El valor resuelto es NULL"}]`),
   rollback a savepoint en origen y destino, 0 registros insertados.
4. Reorden de `executionOrder` no rompió `ASIENTO_DE_DIARIO`/`DIARIO_*` (confirmado en los 2 casos
   exitosos de arriba).
5. El bug de desbalance en línea bonificada (sección 10/hallazgo del 2026-11-02) no se vio
   afectado — no aplicó en estos casos de prueba (sin línea bonificada), pero el reorden no toca
   esa lógica.

### Hallazgo nuevo, pendiente aparte: `CATELLI.EXISTENCIA_BODEGA` probablemente nunca se actualiza

Pregunta del usuario: ¿insertar en `TRANSACCION_INV` con la bodega correcta ahora sí actualiza el
saldo físico real en `CATELLI.EXISTENCIA_BODEGA`? Se revisaron los 3 triggers reales habilitados
sobre las tablas involucradas (`EXAUDIT_TRANS_INVIup`, `EXTRANSACCION_INVIup`,
`EXEXISTENCIA_BODEGAIup`, los 3 `is_disabled=0`) y **los 3 son boilerplate estándar de Exactus**:
solo actualizan `CreatedBy`/`CreateDate`/`UpdatedBy`/`RecordDate` de su propia tabla contra
`inserted`/`deleted`. Ninguno lee ni escribe en otra tabla — en particular, el trigger de
`TRANSACCION_INV` no toca `EXISTENCIA_BODEGA` en ningún punto.

Combinado con el hallazgo ya confirmado de la sección 10 (no hay SQL Agent Jobs habilitados que
toquen esto), **no queda ningún mecanismo automático a nivel de base de datos entre
`TRANSACCION_INV` y `EXISTENCIA_BODEGA`**. Es probable que el saldo de inventario por bodega nunca
se haya actualizado automáticamente para las facturas de este pipeline (ni con la versión vieja
`BODEGA='01'` fija ni con la nueva bodega real) — requeriría un stored procedure nativo de
Exactus (que este pipeline no invoca, al escribir directo a las tablas en vez de pasar por la capa
de negocio real) o un proceso de recálculo de cardex aparte. **Queda pendiente, fuera de alcance
de este fix:** confirmar con alguien que conozca el módulo de inventario de Exactus/Catelli si
existe tal mecanismo, y si corresponde implementarlo.

### Archivos modificados (sin commitear al momento de escribir esto)
`server/scripts/buildCargarFacturaCompleta.js`, `server/services/DynamicTransferService.js`,
`server/models/transferMappingModel.js`.
