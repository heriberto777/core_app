# Análisis: Gestor Universal — Mapping de Cliente y Factura (server2 → CATELLI)

**Fecha:** 2026-10-27
**Estado:** PAUSADO — el usuario va a hacer algunas pruebas antes de seguir. Esto es un
snapshot del análisis hecho hasta acá, para retomarlo sin perder contexto.
**Objetivo original:** diseñar el mapping (vía el motor genérico `TransferMapping` +
`DynamicTransferService.js`, el "Gestor Universal" ya existente) para crear, en CATELLI
(server1), clientes y facturas nuevos que hoy se originan en server2.

No se tocó código en ninguna parte de este análisis — es 100% investigación de estructura
real de tablas, con datos de ejemplo reales traídos por el usuario (no inventados).

---

## 1. Cliente — mapping server2 → CLIENTE / DETALLE_DIRECCION / DIRECC_EMBARQUE / CLIENTE_VENDEDOR

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
custom, `NULL` en todos los ejemplos — candidato a usarse como puente con
`core_app.accounts_syncs`/`route_accounts_syncs.code_account`, a confirmar con el usuario).
El usuario indicó que para el caso mínimo alcanza con pocos campos (`CLIENTE`, `DIRECCION='ND'`),
aunque sería ideal pasar la info completa cuando esté disponible.

### `CLIENTE_VENDEDOR`

Tabla puente simple: `CLIENTE` + `VENDEDOR` (código de `CATELLI.VENDEDOR`) + auditoría
estándar + `u_code_account` (mismo patrón custom que en `DIRECC_EMBARQUE`, también `NULL`
en los ejemplos).

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

- Confirmar si `u_code_account` (en `DIRECC_EMBARQUE` y `CLIENTE_VENDEDOR`) debe poblarse
  con el `code_account` de `route_accounts_syncs`.
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
 │         └─ (más tarde, no parte de "crear factura") AUXILIAR_CC — cobros/NC aplicados
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
entre 7-8 tablas. No existe un SP del ERP para esto (confirmado explícitamente por el
usuario) — hay que armarlo a mano.

**AUXILIAR_CC** es cuenta por cobrar / sub-mayor de cobros — confirmado con datos reales
que se llena DESPUÉS, cuando se aplican recibos o notas de crédito contra la factura. **No
es parte del proceso de creación de la factura**, es un flujo separado (cobros).

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
- **`ALCXC_MOV_DIR`** — cobros/recibos aplicados a documentos (`NUM_DOC_AF` = documento
  afectado, `COD_CLT`, `MON_MOV_LOCAL`). Confirmado con datos reales que mapea a
  `AUXILIAR_CC`, no a la creación de la factura.

### Hallazgo grande: el NCF YA viene resuelto desde server2

`FAC_ENC_PED.NCF` ya trae el NCF real asignado (ejemplos reales: `'00116649609'` y
`'B0190007371'`) — **no hace falta construir lógica de secuencia fiscal nosotros**, se toma
tal cual y se usa al crear `DOCUMENTOS_CC`/`NCF_DOCUMENTO`. Esto resuelve el riesgo más
grande que se había identificado (compliance fiscal de NCF).

### Regla de negocio nueva: bodega de bonificación según NIVEL_PRECIO

El usuario aclaró: la bodega a usar para la porción bonificada de una línea **depende del
`NIVEL_PRECIO`** del cliente/pedido — hace falta una tabla de equivalencia
(`NIVEL_PRECIO` → bodega de bonificación) que el usuario tiene que construir con nosotros
(conocimiento de negocio, no algo que se pueda inferir de los datos).

---

## 4. Preguntas abiertas, pendientes de responder con datos reales antes de diseñar el mapping

1. **Legend NIVEL_PRECIO → bodega de bonificación**: valores reales de `NIVEL_PRECIO` que
   maneja el ERP (se vio `"Silver"` en una factura real de CATELLI) y su bodega
   correspondiente.
2. En los dos pedidos de ejemplo revisados, `FAC_ENC_PED.NIVEL_PRECIO` vino `NULL` — ¿de
   dónde sale el valor real si no viene en el pedido? ¿Hay que resolverlo contra
   `CATELLI.CLIENTE.NIVEL_PRECIO` del cliente dueño del pedido?
3. Todavía no se vio ninguna fila real de `FAC_DET_PED` con `ART_BON=1` o
   `CANTIDAD_BONIFICADA > 0` — falta confirmar si la bonificación viene en la MISMA línea
   (cantidad extra) o en una línea separada, antes de poder derivar la partición de bodega
   igual que se hace hoy con `PEDIDO_LINEA.CANTIDAD_BONIFICAD` en Cargas.
4. `ALCXC_MOV_DIR` filtrado por un mismo `NUM_DOC_AF` devolvió 2 filas idénticas (mismo
   monto, mismo cliente) — confirmar si es normal (duplicado esperado) o si hace falta
   deduplicar al cargar cobros, como ya hubo que hacer en otro pipeline de este proyecto
   (`IMPLT_hist_orders`, duplicados por carreras de ejecución).
5. `NCF`/`NCF_PREFIJO` inconsistentes entre ejemplos: a veces `NCF_PREFIJO=NULL` y
   `NCF` trae solo el número (`'00116649609'`), otras veces ambos campos traen el mismo
   valor completo con letra (`'B0190007371'`). Definir cuál usar siempre, o cómo combinarlos.
6. Confirmar si `u_code_account` (Cliente) debe poblarse con `route_accounts_syncs.code_account`.
7. Resolver el origen de los 14 campos "requeridos con valor de negocio real" de `CLIENTE`
   (ver sección 1).
8. Para los 14 campos restantes de `FACTURA` que son FK a catálogos (`RUTA`, `COBRADOR`,
   `ZONA`, `CONDICION_PAGO`, etc.) — confirmar si server2 los trae resueltos con el mismo
   código que usa CATELLI, o si hace falta tabla de traducción.

## Próximo paso al retomar

Seguir el mismo método usado hasta acá: el usuario trae datos reales (no se corren queries
ad-hoc desde acá), se reconcilian campo por campo contra lo ya mapeado, y recién ahí se
diseña el `TransferMapping` concreto en el Gestor Universal. No se ha escrito ningún mapping
ni tocado código todavía — todo este documento es insumo para cuando el usuario retome tras
sus pruebas.
