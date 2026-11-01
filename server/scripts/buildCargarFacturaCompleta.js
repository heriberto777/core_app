// scripts/buildCargarFacturaCompleta.js
//
// Construye los 2 TransferMapping nuevos del pipeline de Factura
// (server2 -> CATELLI), descriptos en docs/archive/ANALISIS_MAPPING_CLIENTE_FACTURA.md
// y en el plan aprobado "Pipeline completo de Factura (server2 -> CATELLI) —
// transacción atómica real":
//
//   1. CargarFacturaCompleta: consolida CargarFacturas + Carga_Fac_To_CC +
//      CargaNCF_Fac (los 3 pasos que son parte atómica de "crear esta
//      factura") en UN solo TransferMapping, agregando AUDIT_TRANS_INV y
//      TRANSACCION_INV (inventario, hueco real confirmado) y ASIENTO_DE_DIARIO/
//      DIARIO (asiento contable, 8 tableConfigs de detalle, hueco real
//      confirmado). El motor ya da atomicidad real por documento vía
//      savepoints (DatabaseServiceAdapter.withConnections / DatabaseService
//      .withTransaction) en cuanto todo vive en un solo mapping. Esto requirió
//      3 fixes reales en DynamicTransferService.js/DatabaseService.js
//      (confirmados contra 9R01260000010/9R01260000019, ver docs/archive/
//      ANALISIS_MAPPING_CLIENTE_FACTURA.md): el rollback a savepoint nunca se
//      ejecutaba (processSingleDocumentSimple absorbía sus propios errores en
//      vez de relanzarlos), los lookups lookupFromTarget no corrían en tablas
//      de detalle, y un ReferenceError enmascaraba errores SQL reales en el
//      catch de executeLookupInTarget.
//
//      ⚠️ Queda por confirmar contra un INSERT real: nombre exacto de la
//      cuenta contable de descuento por bonificación (CTA_DESC_BONIF_LOC vs
//      CTA_DESC_VENTA_LOC) -- las 2 facturas de prueba hasta ahora no tenían
//      líneas bonificadas.
//
//   2. AplicarRecibosCxC: mapping independiente (no encadenado vía
//      workflowConfig) que resuelve el hueco de "recibo que salda un
//      documento viejo" -- fuente propia ALCXC_MOV_DIR, agrega el UPDATE de
//      SALDO que CargasRecibos nunca hizo.
//
// Lee los 4 mappings reales ya activos en Mongo (CargarFacturas,
// Carga_Fac_To_CC, CargaNCF_Fac, CargasRecibos), clona sus tableConfigs
// confirmados y aplica únicamente los fixes ya validados con datos reales --
// no se retranscribe nada a mano para evitar errores de transcripción en
// ~250+ fieldMappings existentes.
//
// Uso:
//   node scripts/buildCargarFacturaCompleta.js --dry-run   (solo imprime, no escribe Mongo)
//   node scripts/buildCargarFacturaCompleta.js             (crea los 2 mappings, con active:false)

const TransferMapping = require("../models/transferMappingModel");
const DynamicTransferService = require("../services/DynamicTransferService");
const {
  connectToDatabase,
  disconnectFromDatabase,
} = require("../utils/database");

const DRY_RUN = process.argv.includes("--dry-run");

// ===============================
// Helpers
// ===============================

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function stripIds(node) {
  if (Array.isArray(node)) {
    node.forEach(stripIds);
    return node;
  }
  if (node && typeof node === "object") {
    delete node._id;
    Object.values(node).forEach(stripIds);
  }
  return node;
}

function getTableConfig(mapping, name) {
  const tc = (mapping.tableConfigs || []).find((t) => t.name === name);
  if (!tc) {
    throw new Error(
      `No se encontró tableConfig '${name}' en mapping '${mapping.name}'`
    );
  }
  return stripIds(clone(tc));
}

function patchField(tableConfig, targetField, patch) {
  const fm = (tableConfig.fieldMappings || []).find(
    (f) => f.targetField === targetField
  );
  if (!fm) {
    throw new Error(
      `No se encontró fieldMapping '${targetField}' en tableConfig '${tableConfig.name}'`
    );
  }
  Object.assign(fm, patch);
  return fm;
}

function defaultTransform(overrides) {
  return {
    transformType: "",
    toUpperCase: false,
    toLowerCase: false,
    trim: true,
    decimalPlaces: 2,
    thousandsSeparator: false,
    dateFormat: "YYYY-MM-DD",
    datetimeFormat: "YYYY-MM-DDTHH:MM:SS",
    trueValues: ["S", "Y", "1", "true"],
    falseValues: ["N", "0", "false"],
    trueOutput: "S",
    falseOutput: "N",
    ...overrides,
  };
}

function baseFieldMapping(overrides = {}) {
  const { transform, ...rest } = overrides;
  return {
    sourceField: "",
    defaultValue: "",
    isRequired: false,
    removePrefix: "",
    valueMappings: [],
    lookupFromTarget: false,
    lookupQuery: "",
    lookupParams: [],
    validateExistence: false,
    failIfNotFound: false,
    unitConversion: { enabled: false, operation: "multiply" },
    isEditable: true,
    showInList: false,
    displayOrder: 0,
    displayName: "",
    fieldGroup: "",
    fieldType: "text",
    options: [],
    isConsecutive: false,
    consecutiveId: null,
    transform: defaultTransform(transform),
    ...rest,
  };
}

function addField(tableConfig, overrides) {
  tableConfig.fieldMappings.push(baseFieldMapping(overrides));
  return tableConfig;
}

// Subquery reutilizada: precio de la línea REGULAR hermana (misma factura +
// mismo artículo), ya insertada antes gracias a orderByColumn:'NUM_LN'. Se usa
// para las líneas de bonificación, donde MON_PRC_MN/MON_PRC_MX vienen en 0 en
// el origen (confirmado con datos reales de 3 pedidos sin cargar).
//
// OJO (hallazgo 2026-10-30, corrige el diseño original de esta sesión): NO se
// filtra por BODEGA='01'. La "DECISIÓN: bodega fija 01 para todo" (sección 3)
// significa que acá TANTO la línea regular como la de bono quedan con
// BODEGA='01' -- el BODEGA='02' visto en la factura real 3883332 (sección 9)
// es de una factura cargada manualmente en la app nativa de Catelli (no por
// este pipeline) y tiene el MISMO precio unitario que su línea BODEGA='01'
// hermana (85.49 en ambas) -- es un split real de bodega de picking, NO un
// indicador de bonificación. El único campo confiable para bonificación sigue
// siendo CANTIDAD_BONIFICADA en el origen (FAC_DET_PED). Acá, para encontrar
// "la hermana regular" dentro de FACTURA_LINEA ya insertada, alcanza con
// tomar la única fila de ese artículo que YA tiene precio > 0 -- al momento
// de procesar la línea de bono (después, por NUM_LN), la de bono todavía no
// existe, así que esta condición no puede matchear más de una fila.
const SIBLING_REGULAR_PRICE = `(SELECT TOP 1 PRECIO_UNITARIO FROM CATELLI.FACTURA_LINEA WHERE FACTURA=@NUM_PED AND ARTICULO=@COD_ART AND PRECIO_UNITARIO > 0)`;

// Tasa de cambio fija del proyecto (ver plan aprobado, sección "Fuera de
// alcance": "Tasa de cambio dinámica... hoy fija en 36.7, mejora futura, no
// bloqueante"). Se usa únicamente para las columnas _DOLAR de DIARIO/
// ASIENTO_DE_DIARIO que no tienen un campo dólar nativo en el origen (venta,
// ITBIS, AR) -- el costo SÍ tiene su propio campo dólar real (ARTICULO.
// COSTO_ULT_DOL) y no usa esta tasa.
const EXCHANGE_RATE = 36.7;

// ===============================
// CargarFacturaCompleta
// ===============================

function buildCargarFacturaCompleta({ cargarFacturas, cargaFacToCC, cargaNCF }) {
  // 1. FACTURA (de CargarFacturas.FAC_ENC)
  const facEnc = getTableConfig(cargarFacturas, "FAC_ENC");
  facEnc.executionOrder = 1;

  // hallazgo 3 (sección 5/6.4): columna inexistente en FAC_ENC_PED, residual.
  patchField(facEnc, "DESCUENTO_VOLUMEN", {
    sourceField: "",
    defaultValue: "0",
  });

  // 2026-10-31: OBS_PED viene NULL en pedidos reales sin observación
  // (confirmado contra 9R01260000010) -- isRequired:true (heredado de
  // CargarFacturas) rechazaba el documento entero por esto. No es un dato
  // realmente obligatorio del negocio, se relaja a opcional.
  patchField(facEnc, "PEDIDO", {
    isRequired: false,
  });

  // hallazgo 2/8: monto sin ITBIS, no "0".
  patchField(facEnc, "TOTAL_MERCADERIA", {
    sourceField: "MON_SIV",
    defaultValue: "",
  });

  // hallazgo 8: BASE_IMPUESTO1 = SUBTOTAL - DESCUENTO, no existía.
  patchField(facEnc, "BASE_IMPUESTO1", {
    sourceField: "",
    defaultValue: "",
    lookupFromTarget: true,
    lookupQuery: "SELECT (@MON_SIV - @MON_DSC)",
    lookupParams: [
      { sourceField: "MON_SIV", paramName: "MON_SIV", removePrefix: "" },
      { sourceField: "MON_DSC", paramName: "MON_DSC", removePrefix: "" },
    ],
  });

  // sección 7: consecutivo atómico de asiento — se consume UNA sola vez acá,
  // todo lo demás (AUDIT_TRANS_INV.ASIENTO, ASIENTO_DE_DIARIO.ASIENTO) lo lee
  // de vuelta por FACTURA, mismo patrón que ya usa CargaNCF_Fac.DOC_ROWPOINTER.
  addField(facEnc, {
    targetField: "ASIENTO_DOCUMENTO",
    lookupFromTarget: true,
    // CATELLI.PAQUETE tiene un trigger habilitado -- SQL Server prohíbe
    // OUTPUT directo al cliente (sin INTO) en un UPDATE sobre una tabla con
    // triggers ("cannot have any enabled triggers if the statement contains
    // an OUTPUT clause without INTO clause", confirmado 2026-10-31 contra
    // 10.0.11.49 real). Se captura en una tabla variable y se selecciona aparte.
    lookupQuery: `DECLARE @t TABLE (ASIENTO_DOCUMENTO VARCHAR(20));
UPDATE CATELLI.PAQUETE
SET ULTIMO_ASIENTO = CONVERT(VARCHAR(20), CONVERT(INT, ULTIMO_ASIENTO) + 1)
OUTPUT INSERTED.ULTIMO_ASIENTO INTO @t
WHERE PAQUETE = 'FA';
SELECT ASIENTO_DOCUMENTO FROM @t`,
    lookupParams: [],
    validateExistence: true,
    failIfNotFound: true,
  });

  // DOC_PRO unificado a IS NULL / 'S' en todas las tablas de este mapping
  // (hallazgo de inconsistencia, sección 5/6.4) — FAC_ENC ya lo tenía bien.

  // 2. FACTURA_LINEA (de CargarFacturas.FAC_DET)
  const facDet = getTableConfig(cargarFacturas, "FAC_DET");
  facDet.executionOrder = 2;
  // garantiza que la línea regular se inserte antes que su bono hermana,
  // requisito del lookup de PRECIO_UNITARIO/PRECIO_TOTAL de abajo.
  facDet.orderByColumn = "NUM_LN";

  // hallazgo 5/sección 9: lookup por artículo, no hardcode fijo.
  patchField(facDet, "CUENTA_CONTABLE", {
    sourceField: "",
    defaultValue: "",
    lookupFromTarget: true,
    lookupQuery: `SELECT ac.CTA_VENTAS_LOC
FROM CATELLI.ARTICULO a
INNER JOIN CATELLI.ARTICULO_CUENTA ac ON a.ARTICULO_CUENTA = ac.ARTICULO_CUENTA
WHERE a.ARTICULO = @COD_ART`,
    lookupParams: [{ sourceField: "COD_ART", paramName: "COD_ART" }],
    validateExistence: true,
    failIfNotFound: true,
  });

  // sección 12: COSTO_TOTAL/COSTO_TOTAL_DOLAR hardcodeados en '0'.
  patchField(facDet, "COSTO_TOTAL", {
    sourceField: "",
    defaultValue: "",
    lookupFromTarget: true,
    lookupQuery: `SELECT (CAST(COSTO_ULT_LOC AS DECIMAL(18,4)) * @CANTIDAD) FROM CATELLI.ARTICULO WHERE ARTICULO = @COD_ART`,
    lookupParams: [
      { sourceField: "COD_ART", paramName: "COD_ART" },
      { sourceField: "CNT_MAX", paramName: "CANTIDAD" },
    ],
    validateExistence: true,
    failIfNotFound: true,
  });

  patchField(facDet, "COSTO_TOTAL_DOLAR", {
    sourceField: "",
    defaultValue: "",
    lookupFromTarget: true,
    lookupQuery: `SELECT (CAST(COSTO_ULT_DOL AS DECIMAL(18,4)) * @CANTIDAD) FROM CATELLI.ARTICULO WHERE ARTICULO = @COD_ART`,
    lookupParams: [
      { sourceField: "COD_ART", paramName: "COD_ART" },
      { sourceField: "CNT_MAX", paramName: "CANTIDAD" },
    ],
    validateExistence: true,
    failIfNotFound: true,
  });

  // PRECIO_UNITARIO/PRECIO_TOTAL/DESC_TOT_LINEA: en la línea de bonificación
  // (CANTIDAD_BONIFICADA>0) MON_PRC_MN y MON_PRC_MX vienen ambos en 0 —
  // heredan el precio ya insertado de la línea regular hermana.
  patchField(facDet, "PRECIO_UNITARIO", {
    sourceField: "",
    defaultValue: "",
    lookupFromTarget: true,
    lookupQuery: `SELECT CASE WHEN @MON_PRC_MX > 0 THEN @MON_PRC_MX ELSE ${SIBLING_REGULAR_PRICE} END`,
    lookupParams: [
      { sourceField: "MON_PRC_MX", paramName: "MON_PRC_MX" },
      { sourceField: "NUM_PED", paramName: "NUM_PED" },
      { sourceField: "COD_ART", paramName: "COD_ART" },
    ],
    validateExistence: true,
    failIfNotFound: true,
  });

  patchField(facDet, "PRECIO_TOTAL", {
    sourceField: "",
    defaultValue: "",
    lookupFromTarget: true,
    lookupQuery: `SELECT CASE WHEN @MON_PRC_MX > 0 THEN (@MON_PRC_MX * @CANTIDAD) ELSE (${SIBLING_REGULAR_PRICE} * @CANTIDAD) END`,
    lookupParams: [
      { sourceField: "MON_PRC_MX", paramName: "MON_PRC_MX" },
      { sourceField: "CNT_MAX", paramName: "CANTIDAD" },
      { sourceField: "NUM_PED", paramName: "NUM_PED" },
      { sourceField: "COD_ART", paramName: "COD_ART" },
    ],
    validateExistence: true,
    failIfNotFound: true,
  });

  // sección 9: en la línea de bono, DESC_TOT_LINEA = PRECIO_TOTAL (100% de descuento).
  patchField(facDet, "DESC_TOT_LINEA", {
    sourceField: "",
    defaultValue: "",
    lookupFromTarget: true,
    lookupQuery: `SELECT CASE WHEN @MON_PRC_MX > 0 THEN 0 ELSE (${SIBLING_REGULAR_PRICE} * @CANTIDAD) END`,
    lookupParams: [
      { sourceField: "MON_PRC_MX", paramName: "MON_PRC_MX" },
      { sourceField: "CNT_MAX", paramName: "CANTIDAD" },
      { sourceField: "NUM_PED", paramName: "NUM_PED" },
      { sourceField: "COD_ART", paramName: "COD_ART" },
    ],
    validateExistence: true,
    failIfNotFound: true,
  });

  // PORC_IMPUESTO1 viene NULL en la línea de bono -> impuesto de línea 0,
  // consistente con que esas líneas no suman en el ITBIS del asiento (sección 9).
  patchField(facDet, "TOTAL_IMPUESTO1", {
    sourceField: "",
    defaultValue: "",
    lookupFromTarget: true,
    lookupQuery: `SELECT CASE WHEN @PORC_IMPUESTO1 IS NULL THEN 0 ELSE (@MON_PRC_MX * @CANTIDAD * @PORC_IMPUESTO1 / 100) END`,
    lookupParams: [
      { sourceField: "PORC_IMPUESTO1", paramName: "PORC_IMPUESTO1" },
      { sourceField: "MON_PRC_MX", paramName: "MON_PRC_MX" },
      { sourceField: "CNT_MAX", paramName: "CANTIDAD" },
    ],
  });

  // 3. AUDIT_TRANS_INV (nuevo — sección 10, 1 fila por factura)
  const auditTransInv = {
    name: "AUDIT_TRANS_INV",
    sourceTable: "FAC_ENC_PED",
    targetTable: "CATELLI.AUDIT_TRANS_INV",
    primaryKey: "NUM_PED",
    targetPrimaryKey: "AUDIT_TRANS_INV",
    isDetailTable: true,
    parentTableRef: "FAC_ENC",
    foreignKey: "",
    joinType: "INNER",
    useSameSourceTable: false,
    filterCondition: "",
    customQuery: "",
    orderByColumn: "",
    executionOrder: 3,
    dependsOn: [],
    fieldMappings: [
      baseFieldMapping({ targetField: "USUARIO", defaultValue: "FAC1" }),
      baseFieldMapping({
        targetField: "FECHA_HORA",
        defaultValue: "GETDATE()",
        fieldType: "date",
        transform: { transformType: "datetime", datetimeFormat: "YYYY-MM-DD HH:MM:SS" },
      }),
      baseFieldMapping({ targetField: "MODULO_ORIGEN", defaultValue: "FA" }),
      baseFieldMapping({
        targetField: "APLICACION",
        lookupFromTarget: true,
        lookupQuery: "SELECT ('FAC#' + @NUM_PED)",
        lookupParams: [{ sourceField: "NUM_PED", paramName: "NUM_PED" }],
        validateExistence: true,
        failIfNotFound: true,
      }),
      baseFieldMapping({
        targetField: "REFERENCIA",
        lookupFromTarget: true,
        lookupQuery: "SELECT ('Cliente: ' + @COD_CLT)",
        lookupParams: [
          { sourceField: "COD_CLT", paramName: "COD_CLT", removePrefix: "CN" },
        ],
        validateExistence: true,
        failIfNotFound: true,
      }),
      baseFieldMapping({
        targetField: "ASIENTO",
        lookupFromTarget: true,
        lookupQuery: "SELECT ASIENTO_DOCUMENTO FROM CATELLI.FACTURA WHERE FACTURA = @NUM_PED",
        lookupParams: [{ sourceField: "NUM_PED", paramName: "NUM_PED" }],
        validateExistence: true,
        failIfNotFound: true,
      }),
    ],
  };

  // 4. TRANSACCION_INV (nuevo — sección 10, 1 fila por línea de FAC_DET_PED)
  const transaccionInv = {
    name: "TRANSACCION_INV",
    sourceTable: "FAC_DET_PED",
    targetTable: "CATELLI.TRANSACCION_INV",
    primaryKey: "NUM_PED",
    targetPrimaryKey: "TRANSACCION_INV", // hallazgo 2026-10-30: copia/pega de AUDIT_TRANS_INV, corregido
    isDetailTable: true,
    parentTableRef: "FAC_ENC",
    foreignKey: "NUM_PED",
    joinType: "INNER",
    useSameSourceTable: false,
    filterCondition: "",
    customQuery: "",
    orderByColumn: "NUM_LN",
    executionOrder: 4,
    dependsOn: [],
    fieldMappings: [
      baseFieldMapping({
        targetField: "AUDIT_TRANS_INV",
        lookupFromTarget: true,
        lookupQuery:
          "SELECT AUDIT_TRANS_INV FROM CATELLI.AUDIT_TRANS_INV WHERE APLICACION = ('FAC#' + @NUM_PED)",
        lookupParams: [{ sourceField: "NUM_PED", paramName: "NUM_PED" }],
        validateExistence: true,
        failIfNotFound: true,
      }),
      // 2026-10-31: CONSECUTIVO es NOT NULL en CATELLI.TRANSACCION_INV y
      // nunca se mapeó (confirmado contra 9R01260000010: "Cannot insert the
      // value NULL into column 'CONSECUTIVO'"). No puede leerse del
      // lookupResult de AUDIT_TRANS_INV de arriba (executeLookupInTarget no
      // comparte resultados entre fieldMappings de la misma pasada), así que
      // se resuelve el AUDIT_TRANS_INV real de nuevo via subquery, mismo
      // patrón MAX+1 que DIARIO_CONSECUTIVO.
      baseFieldMapping({
        targetField: "CONSECUTIVO",
        fieldType: "number",
        lookupFromTarget: true,
        lookupQuery: `SELECT ISNULL(MAX(t.CONSECUTIVO),0)+1
FROM CATELLI.TRANSACCION_INV t
WHERE t.AUDIT_TRANS_INV = (SELECT AUDIT_TRANS_INV FROM CATELLI.AUDIT_TRANS_INV WHERE APLICACION = ('FAC#' + @NUM_PED))`,
        lookupParams: [{ sourceField: "NUM_PED", paramName: "NUM_PED" }],
        validateExistence: true,
        failIfNotFound: true,
      }),
      baseFieldMapping({ targetField: "ARTICULO", sourceField: "COD_ART" }),
      baseFieldMapping({ targetField: "BODEGA", defaultValue: "01" }),
      baseFieldMapping({
        targetField: "CANTIDAD",
        sourceField: "CNT_MAX",
        fieldType: "number",
      }),
      baseFieldMapping({
        targetField: "COSTO_TOT_FISC_LOC",
        lookupFromTarget: true,
        lookupQuery: `SELECT (CAST(COSTO_ULT_LOC AS DECIMAL(18,4)) * @CANTIDAD) FROM CATELLI.ARTICULO WHERE ARTICULO = @COD_ART`,
        lookupParams: [
          { sourceField: "COD_ART", paramName: "COD_ART" },
          { sourceField: "CNT_MAX", paramName: "CANTIDAD" },
        ],
        validateExistence: true,
        failIfNotFound: true,
      }),
      baseFieldMapping({
        targetField: "COSTO_TOT_FISC_DOL",
        lookupFromTarget: true,
        lookupQuery: `SELECT (CAST(COSTO_ULT_DOL AS DECIMAL(18,4)) * @CANTIDAD) FROM CATELLI.ARTICULO WHERE ARTICULO = @COD_ART`,
        lookupParams: [
          { sourceField: "COD_ART", paramName: "COD_ART" },
          { sourceField: "CNT_MAX", paramName: "CANTIDAD" },
        ],
        validateExistence: true,
        failIfNotFound: true,
      }),
      baseFieldMapping({
        targetField: "COSTO_TOT_COMP_LOC",
        lookupFromTarget: true,
        lookupQuery: `SELECT (CAST(COSTO_ULT_LOC AS DECIMAL(18,4)) * @CANTIDAD) FROM CATELLI.ARTICULO WHERE ARTICULO = @COD_ART`,
        lookupParams: [
          { sourceField: "COD_ART", paramName: "COD_ART" },
          { sourceField: "CNT_MAX", paramName: "CANTIDAD" },
        ],
        validateExistence: true,
        failIfNotFound: true,
      }),
      baseFieldMapping({
        targetField: "COSTO_TOT_COMP_DOL",
        lookupFromTarget: true,
        lookupQuery: `SELECT (CAST(COSTO_ULT_DOL AS DECIMAL(18,4)) * @CANTIDAD) FROM CATELLI.ARTICULO WHERE ARTICULO = @COD_ART`,
        lookupParams: [
          { sourceField: "COD_ART", paramName: "COD_ART" },
          { sourceField: "CNT_MAX", paramName: "CANTIDAD" },
        ],
        validateExistence: true,
        failIfNotFound: true,
      }),
      baseFieldMapping({
        targetField: "PRECIO_TOTAL_LOCAL",
        lookupFromTarget: true,
        lookupQuery: `SELECT CASE WHEN @MON_PRC_MX > 0 THEN (@MON_PRC_MX * @CANTIDAD) ELSE (${SIBLING_REGULAR_PRICE} * @CANTIDAD) END`,
        lookupParams: [
          { sourceField: "MON_PRC_MX", paramName: "MON_PRC_MX" },
          { sourceField: "CNT_MAX", paramName: "CANTIDAD" },
          { sourceField: "NUM_PED", paramName: "NUM_PED" },
          { sourceField: "COD_ART", paramName: "COD_ART" },
        ],
        validateExistence: true,
        failIfNotFound: true,
      }),
      // 2026-10-31: NOT NULL, nunca se mapeó (confirmado contra
      // 9R01260000010: "Cannot insert the value NULL into column
      // 'PRECIO_TOTAL_DOLAR'"). No existe un precio en dólares nativo en
      // FAC_DET_PED -- mismo cálculo que PRECIO_TOTAL_LOCAL, convertido con
      // EXCHANGE_RATE (igual convención que el resto de montos DOL sin
      // fuente USD propia, ver DIARIO_VENTA/DIARIO_AR).
      baseFieldMapping({
        targetField: "PRECIO_TOTAL_DOLAR",
        lookupFromTarget: true,
        lookupQuery: `SELECT CASE WHEN @MON_PRC_MX > 0 THEN (@MON_PRC_MX * @CANTIDAD / ${EXCHANGE_RATE}) ELSE (${SIBLING_REGULAR_PRICE} * @CANTIDAD / ${EXCHANGE_RATE}) END`,
        lookupParams: [
          { sourceField: "MON_PRC_MX", paramName: "MON_PRC_MX" },
          { sourceField: "CNT_MAX", paramName: "CANTIDAD" },
          { sourceField: "NUM_PED", paramName: "NUM_PED" },
          { sourceField: "COD_ART", paramName: "COD_ART" },
        ],
        validateExistence: true,
        failIfNotFound: true,
      }),
      // idéntico a FACTURA_LINEA.FECHA_FACTURA (sección 10) — mismo
      // defaultValue GETDATE() que ya usa esa tabla, no un campo de origen.
      baseFieldMapping({
        targetField: "FECHA",
        defaultValue: "GETDATE()",
        fieldType: "date",
        transform: { transformType: "datetime", datetimeFormat: "YYYY-MM-DD HH:MM:SS" },
      }),
      // 2026-10-31: COD_CLT no existe en FAC_DET_PED (sourceTable de esta
      // tabla) -- vive en el encabezado FAC_ENC_PED. El motor arma el SELECT
      // de la tabla de detalle incluyendo cualquier sourceField usado en
      // lookupParams, así que referenciar un campo del header rompe esa
      // query con "Invalid column name" (confirmado contra 9R01260000010).
      // Se resuelve igual que ASIENTO_LOOKUP: vía JOIN contra la FACTURA ya
      // insertada en destino (paso 1), usando NUM_PED -- que sí existe en
      // FAC_DET_PED -- en vez de COD_CLT.
      baseFieldMapping({
        targetField: "NIT",
        lookupFromTarget: true,
        lookupQuery: `SELECT c.CONTRIBUYENTE
FROM CATELLI.FACTURA f
INNER JOIN CATELLI.CLIENTE c ON f.CLIENTE = c.CLIENTE
WHERE f.FACTURA = @NUM_PED`,
        lookupParams: [{ sourceField: "NUM_PED", paramName: "NUM_PED" }],
        validateExistence: true,
        failIfNotFound: true,
      }),
      baseFieldMapping({ targetField: "AJUSTE_CONFIG", defaultValue: "~VV~" }),
      baseFieldMapping({ targetField: "TIPO", defaultValue: "V" }),
      baseFieldMapping({ targetField: "SUBTIPO", defaultValue: "D" }),
      baseFieldMapping({ targetField: "SUBSUBTIPO", defaultValue: "L" }),
      baseFieldMapping({ targetField: "NATURALEZA", defaultValue: "S" }),
      baseFieldMapping({ targetField: "CONTABILIZADA", defaultValue: "S" }),
    ],
  };

  // 5. DOCUMENTOS_CC tipo FAC (de Carga_Fac_To_CC.FAC_TO_CC)
  const docCcFac = getTableConfig(cargaFacToCC, "FAC_TO_CC");
  docCcFac.name = "DOC_CC_FAC";
  docCcFac.isDetailTable = true;
  docCcFac.parentTableRef = "FAC_ENC";
  docCcFac.executionOrder = 5;
  // ya no filtra por su cuenta — la selección de documentos la hace FAC_ENC
  // (el filtro propio traía DOC_PRO LIKE '1', la inconsistencia del hallazgo).
  docCcFac.filterCondition = "";
  // hallazgo 8 (discrepancia MON_SIV/MON_CIV detectada al revisar el JSON real
  // esta sesión): el documento real ya trae MON_SIV, se deja explícito igual.
  patchField(docCcFac, "SUBTOTAL", { sourceField: "MON_SIV" });

  // 2026-11-01 (hallazgo real contra 9R01260000023): Carga_Fac_To_CC NUNCA
  // mapeaba ASIENTO en DOCUMENTOS_CC tipo FAC -- quedaba NULL con
  // ASIENTO_PENDIENTE='S' para siempre, a diferencia de toda factura real
  // cargada por el ERP nativo (confirmado: FV1517301..305 todas con ASIENTO
  // poblado = su propio FACTURA.ASIENTO_DOCUMENTO, ASIENTO_PENDIENTE='N').
  // El asiento YA existe acá (generado por FAC_ENC.ASIENTO_DOCUMENTO,
  // ejecutado antes, executionOrder:1) -- solo hace falta leerlo de vuelta.
  addField(docCcFac, {
    targetField: "ASIENTO",
    lookupFromTarget: true,
    lookupQuery: "SELECT ASIENTO_DOCUMENTO FROM CATELLI.FACTURA WHERE FACTURA = @NUM_PED",
    lookupParams: [{ sourceField: "NUM_PED", paramName: "NUM_PED" }],
    validateExistence: true,
    failIfNotFound: true,
  });
  patchField(docCcFac, "ASIENTO_PENDIENTE", { defaultValue: "N" });

  // 6. NCF_DOCUMENTO (de CargaNCF_Fac.NCF_FAC)
  const ncfFac = getTableConfig(cargaNCF, "NCF_FAC");
  ncfFac.isDetailTable = true;
  ncfFac.parentTableRef = "FAC_ENC";
  ncfFac.executionOrder = 6;
  // hoy no filtraba por DOC_PRO en absoluto (bug) — tampoco hace falta acá,
  // FAC_ENC ya filtra los documentos a procesar.
  ncfFac.filterCondition = "";

  // Fórmula reutilizada para los 3 totales de ASIENTO_DE_DIARIO (DEBITO,
  // CREDITO y CONTROL) — balancean exactamente por diseño (sección 9: credito
  // de venta+bono+ITBIS = debito de AR+bono+costo, los pares bono/costo se
  // cancelan entre sí), así que es la MISMA query para los 3 campos _LOC y
  // los 3 campos _DOL. No necesita distinguir línea regular de bonificada:
  // suma TODAS las líneas de FACTURA_LINEA (ya insertada, executionOrder 2).
  const ASIENTO_TOTAL_LOC = `SELECT ISNULL(SUM(PRECIO_TOTAL),0) + ISNULL(SUM(COSTO_TOTAL),0) + ISNULL(SUM(TOTAL_IMPUESTO1),0) FROM CATELLI.FACTURA_LINEA WHERE FACTURA=@NUM_PED`;
  const ASIENTO_TOTAL_DOL = `SELECT ISNULL(SUM(PRECIO_TOTAL),0)/${EXCHANGE_RATE} + ISNULL(SUM(COSTO_TOTAL_DOLAR),0) + ISNULL(SUM(TOTAL_IMPUESTO1),0)/${EXCHANGE_RATE} FROM CATELLI.FACTURA_LINEA WHERE FACTURA=@NUM_PED`;
  const ASIENTO_LOOKUP = `SELECT ASIENTO_DOCUMENTO FROM CATELLI.FACTURA WHERE FACTURA=@NUM_PED`;
  // CONSECUTIVO atómico dentro del asiento — seguro porque el procesamiento
  // de detailTables es 100% secuencial dentro de la misma transacción
  // (DynamicTransferService.js:1034-1086, confirmado en código esta sesión).
  const DIARIO_CONSECUTIVO = `SELECT ISNULL(MAX(CONSECUTIVO),0)+1 FROM CATELLI.DIARIO WHERE ASIENTO=(${ASIENTO_LOOKUP})`;

  function diarioCommonFields() {
    return [
      baseFieldMapping({
        targetField: "ASIENTO",
        lookupFromTarget: true,
        lookupQuery: ASIENTO_LOOKUP,
        lookupParams: [{ sourceField: "NUM_PED", paramName: "NUM_PED" }],
        validateExistence: true,
        failIfNotFound: true,
      }),
      baseFieldMapping({
        targetField: "CONSECUTIVO",
        fieldType: "number",
        lookupFromTarget: true,
        lookupQuery: DIARIO_CONSECUTIVO,
        lookupParams: [{ sourceField: "NUM_PED", paramName: "NUM_PED" }],
        validateExistence: true,
        failIfNotFound: true,
      }),
      baseFieldMapping({ targetField: "NIT", defaultValue: "ND" }),
      baseFieldMapping({ targetField: "CENTRO_COSTO", defaultValue: "00-00-00" }),
      baseFieldMapping({
        targetField: "FUENTE",
        lookupFromTarget: true,
        lookupQuery: "SELECT ('FAC#' + @NUM_PED)",
        lookupParams: [{ sourceField: "NUM_PED", paramName: "NUM_PED" }],
        validateExistence: true,
        failIfNotFound: true,
      }),
      baseFieldMapping({
        targetField: "REFERENCIA",
        lookupFromTarget: true,
        lookupQuery: "SELECT ('FAC#' + @NUM_PED)",
        lookupParams: [{ sourceField: "NUM_PED", paramName: "NUM_PED" }],
        validateExistence: true,
        failIfNotFound: true,
      }),
    ];
  }

  function diarioBase(overrides) {
    return {
      sourceTable: "FAC_DET_PED",
      targetTable: "CATELLI.DIARIO",
      primaryKey: "NUM_PED",
      targetPrimaryKey: "DIARIO",
      isDetailTable: true,
      parentTableRef: "FAC_ENC",
      foreignKey: "NUM_PED",
      joinType: "INNER",
      useSameSourceTable: false,
      filterCondition: "",
      customQuery: "",
      orderByColumn: "NUM_LN",
      dependsOn: [],
      ...overrides,
    };
  }

  // 7. ASIENTO_DE_DIARIO (nuevo — sección 9, 1 fila por factura, cabecera del asiento)
  const asientoDeDiario = {
    name: "ASIENTO_DE_DIARIO",
    sourceTable: "FAC_ENC_PED",
    targetTable: "CATELLI.ASIENTO_DE_DIARIO",
    primaryKey: "NUM_PED",
    targetPrimaryKey: "ASIENTO_DE_DIARIO",
    isDetailTable: true,
    parentTableRef: "FAC_ENC",
    foreignKey: "",
    joinType: "INNER",
    useSameSourceTable: false,
    filterCondition: "",
    customQuery: "",
    orderByColumn: "",
    executionOrder: 7,
    dependsOn: [],
    fieldMappings: [
      baseFieldMapping({
        targetField: "ASIENTO",
        lookupFromTarget: true,
        lookupQuery: ASIENTO_LOOKUP,
        lookupParams: [{ sourceField: "NUM_PED", paramName: "NUM_PED" }],
        validateExistence: true,
        failIfNotFound: true,
      }),
      baseFieldMapping({ targetField: "PAQUETE", defaultValue: "FA" }),
      baseFieldMapping({ targetField: "TIPO_ASIENTO", defaultValue: "FA" }),
      baseFieldMapping({
        targetField: "FECHA",
        defaultValue: "GETDATE()",
        fieldType: "date",
        transform: { transformType: "datetime", datetimeFormat: "YYYY-MM-DD HH:MM:SS" },
      }),
      baseFieldMapping({ targetField: "CONTABILIDAD", defaultValue: "A" }),
      baseFieldMapping({ targetField: "ORIGEN", defaultValue: "FA" }),
      baseFieldMapping({ targetField: "CLASE_ASIENTO", defaultValue: "N" }),
      baseFieldMapping({
        targetField: "TOTAL_DEBITO_LOC",
        lookupFromTarget: true,
        lookupQuery: ASIENTO_TOTAL_LOC,
        lookupParams: [{ sourceField: "NUM_PED", paramName: "NUM_PED" }],
        validateExistence: true,
        failIfNotFound: true,
      }),
      baseFieldMapping({
        targetField: "TOTAL_DEBITO_DOL",
        lookupFromTarget: true,
        lookupQuery: ASIENTO_TOTAL_DOL,
        lookupParams: [{ sourceField: "NUM_PED", paramName: "NUM_PED" }],
        validateExistence: true,
        failIfNotFound: true,
      }),
      baseFieldMapping({
        targetField: "TOTAL_CREDITO_LOC",
        lookupFromTarget: true,
        lookupQuery: ASIENTO_TOTAL_LOC,
        lookupParams: [{ sourceField: "NUM_PED", paramName: "NUM_PED" }],
        validateExistence: true,
        failIfNotFound: true,
      }),
      baseFieldMapping({
        targetField: "TOTAL_CREDITO_DOL",
        lookupFromTarget: true,
        lookupQuery: ASIENTO_TOTAL_DOL,
        lookupParams: [{ sourceField: "NUM_PED", paramName: "NUM_PED" }],
        validateExistence: true,
        failIfNotFound: true,
      }),
      baseFieldMapping({ targetField: "ULTIMO_USUARIO", defaultValue: "FAC1" }),
      baseFieldMapping({
        targetField: "FECHA_ULT_MODIF",
        defaultValue: "GETDATE()",
        fieldType: "date",
        transform: { transformType: "datetime", datetimeFormat: "YYYY-MM-DD HH:MM:SS" },
      }),
      baseFieldMapping({ targetField: "MARCADO", defaultValue: "N" }),
      baseFieldMapping({
        targetField: "TOTAL_CONTROL_LOC",
        lookupFromTarget: true,
        lookupQuery: ASIENTO_TOTAL_LOC,
        lookupParams: [{ sourceField: "NUM_PED", paramName: "NUM_PED" }],
        validateExistence: true,
        failIfNotFound: true,
      }),
      baseFieldMapping({
        targetField: "TOTAL_CONTROL_DOL",
        lookupFromTarget: true,
        lookupQuery: ASIENTO_TOTAL_DOL,
        lookupParams: [{ sourceField: "NUM_PED", paramName: "NUM_PED" }],
        validateExistence: true,
        failIfNotFound: true,
      }),
      baseFieldMapping({ targetField: "USUARIO_CREACION", defaultValue: "FAC1" }),
      baseFieldMapping({
        targetField: "FECHA_CREACION",
        defaultValue: "GETDATE()",
        fieldType: "date",
        transform: { transformType: "datetime", datetimeFormat: "YYYY-MM-DD HH:MM:SS" },
      }),
    ],
  };

  // 8. DIARIO_VENTA (línea regular, CANTIDAD_BONIFICADA=0): crédito a la
  // cuenta de ventas del artículo, por el precio ya resuelto en FAC_DET.
  const diarioVenta = diarioBase({
    name: "DIARIO_VENTA",
    filterCondition: "CANTIDAD_BONIFICADA = 0",
    executionOrder: 8,
    fieldMappings: [
      ...diarioCommonFields(),
      baseFieldMapping({
        targetField: "CUENTA_CONTABLE",
        lookupFromTarget: true,
        lookupQuery: `SELECT ac.CTA_VENTAS_LOC FROM CATELLI.ARTICULO a INNER JOIN CATELLI.ARTICULO_CUENTA ac ON a.ARTICULO_CUENTA = ac.ARTICULO_CUENTA WHERE a.ARTICULO = @COD_ART`,
        lookupParams: [{ sourceField: "COD_ART", paramName: "COD_ART" }],
        validateExistence: true,
        failIfNotFound: true,
      }),
      baseFieldMapping({
        targetField: "CREDITO_LOCAL",
        fieldType: "number",
        lookupFromTarget: true,
        lookupQuery: "SELECT (@MON_PRC_MX * @CANTIDAD)",
        lookupParams: [
          { sourceField: "MON_PRC_MX", paramName: "MON_PRC_MX" },
          { sourceField: "CNT_MAX", paramName: "CANTIDAD" },
        ],
        validateExistence: true,
        failIfNotFound: true,
      }),
      baseFieldMapping({
        targetField: "CREDITO_DOLAR",
        fieldType: "number",
        lookupFromTarget: true,
        lookupQuery: `SELECT (@MON_PRC_MX * @CANTIDAD) / ${EXCHANGE_RATE}`,
        lookupParams: [
          { sourceField: "MON_PRC_MX", paramName: "MON_PRC_MX" },
          { sourceField: "CNT_MAX", paramName: "CANTIDAD" },
        ],
        validateExistence: true,
        failIfNotFound: true,
      }),
    ],
  });

  // 9/10. DIARIO_BONO_CREDITO / DIARIO_BONO_DEBITO (línea bonificada,
  // CANTIDAD_BONIFICADA>0): crédito a ventas + débito a descuento por
  // bonificación, mismo monto (heredado de la línea regular hermana vía
  // SIBLING_REGULAR_PRICE) -- se cancelan entre sí, no afectan el balance.
  //
  // OJO: CTA_DESC_BONIF_LOC es una suposición (ARTICULO_CUENTA tiene tanto
  // CTA_DESC_VENTA_LOC como CTA_DESC_BONIF_LOC según el análisis de la
  // sección 9, pero nunca se confirmó cuál de las dos usa este movimiento en
  // particular) -- confirmar contra un INSERT real de ASIENTO_DE_DIARIO/
  // DIARIO de una factura con bonificación antes de activar este mapping.
  const diarioBonoCredito = diarioBase({
    name: "DIARIO_BONO_CREDITO",
    filterCondition: "CANTIDAD_BONIFICADA > 0",
    executionOrder: 9,
    fieldMappings: [
      ...diarioCommonFields(),
      baseFieldMapping({
        targetField: "CUENTA_CONTABLE",
        lookupFromTarget: true,
        lookupQuery: `SELECT ac.CTA_VENTAS_LOC FROM CATELLI.ARTICULO a INNER JOIN CATELLI.ARTICULO_CUENTA ac ON a.ARTICULO_CUENTA = ac.ARTICULO_CUENTA WHERE a.ARTICULO = @COD_ART`,
        lookupParams: [{ sourceField: "COD_ART", paramName: "COD_ART" }],
        validateExistence: true,
        failIfNotFound: true,
      }),
      baseFieldMapping({
        targetField: "CREDITO_LOCAL",
        fieldType: "number",
        lookupFromTarget: true,
        lookupQuery: `SELECT (${SIBLING_REGULAR_PRICE} * @CANTIDAD)`,
        lookupParams: [
          { sourceField: "NUM_PED", paramName: "NUM_PED" },
          { sourceField: "COD_ART", paramName: "COD_ART" },
          { sourceField: "CNT_MAX", paramName: "CANTIDAD" },
        ],
        validateExistence: true,
        failIfNotFound: true,
      }),
      baseFieldMapping({
        targetField: "CREDITO_DOLAR",
        fieldType: "number",
        lookupFromTarget: true,
        lookupQuery: `SELECT (${SIBLING_REGULAR_PRICE} * @CANTIDAD) / ${EXCHANGE_RATE}`,
        lookupParams: [
          { sourceField: "NUM_PED", paramName: "NUM_PED" },
          { sourceField: "COD_ART", paramName: "COD_ART" },
          { sourceField: "CNT_MAX", paramName: "CANTIDAD" },
        ],
        validateExistence: true,
        failIfNotFound: true,
      }),
    ],
  });

  const diarioBonoDebito = diarioBase({
    name: "DIARIO_BONO_DEBITO",
    filterCondition: "CANTIDAD_BONIFICADA > 0",
    executionOrder: 10,
    fieldMappings: [
      ...diarioCommonFields(),
      baseFieldMapping({
        targetField: "CUENTA_CONTABLE",
        lookupFromTarget: true,
        lookupQuery: `SELECT ac.CTA_DESC_BONIF_LOC FROM CATELLI.ARTICULO a INNER JOIN CATELLI.ARTICULO_CUENTA ac ON a.ARTICULO_CUENTA = ac.ARTICULO_CUENTA WHERE a.ARTICULO = @COD_ART`,
        lookupParams: [{ sourceField: "COD_ART", paramName: "COD_ART" }],
        validateExistence: true,
        failIfNotFound: true,
      }),
      baseFieldMapping({
        targetField: "DEBITO_LOCAL",
        fieldType: "number",
        lookupFromTarget: true,
        lookupQuery: `SELECT (${SIBLING_REGULAR_PRICE} * @CANTIDAD)`,
        lookupParams: [
          { sourceField: "NUM_PED", paramName: "NUM_PED" },
          { sourceField: "COD_ART", paramName: "COD_ART" },
          { sourceField: "CNT_MAX", paramName: "CANTIDAD" },
        ],
        validateExistence: true,
        failIfNotFound: true,
      }),
      baseFieldMapping({
        targetField: "DEBITO_DOLAR",
        fieldType: "number",
        lookupFromTarget: true,
        lookupQuery: `SELECT (${SIBLING_REGULAR_PRICE} * @CANTIDAD) / ${EXCHANGE_RATE}`,
        lookupParams: [
          { sourceField: "NUM_PED", paramName: "NUM_PED" },
          { sourceField: "COD_ART", paramName: "COD_ART" },
          { sourceField: "CNT_MAX", paramName: "CANTIDAD" },
        ],
        validateExistence: true,
        failIfNotFound: true,
      }),
    ],
  });

  // 11/12. DIARIO_COSTO_CREDITO / DIARIO_COSTO_DEBITO: costo de venta, TODAS
  // las líneas (sin filtro) -- si el artículo no tiene costo cargado, el
  // renglón sale en 0 en ambos lados y no afecta el balance (ver nota de
  // filterCondition en el plan: no soporta subquery entre servidores).
  const diarioCostoCredito = diarioBase({
    name: "DIARIO_COSTO_CREDITO",
    executionOrder: 11,
    fieldMappings: [
      ...diarioCommonFields(),
      baseFieldMapping({
        targetField: "CUENTA_CONTABLE",
        lookupFromTarget: true,
        lookupQuery: `SELECT ac.CTA_INVENTARIO FROM CATELLI.ARTICULO a INNER JOIN CATELLI.ARTICULO_CUENTA ac ON a.ARTICULO_CUENTA = ac.ARTICULO_CUENTA WHERE a.ARTICULO = @COD_ART`,
        lookupParams: [{ sourceField: "COD_ART", paramName: "COD_ART" }],
        validateExistence: true,
        failIfNotFound: true,
      }),
      baseFieldMapping({
        targetField: "CREDITO_LOCAL",
        fieldType: "number",
        lookupFromTarget: true,
        lookupQuery: `SELECT (CAST(COSTO_ULT_LOC AS DECIMAL(18,4)) * @CANTIDAD) FROM CATELLI.ARTICULO WHERE ARTICULO = @COD_ART`,
        lookupParams: [
          { sourceField: "COD_ART", paramName: "COD_ART" },
          { sourceField: "CNT_MAX", paramName: "CANTIDAD" },
        ],
        validateExistence: true,
        failIfNotFound: true,
      }),
      baseFieldMapping({
        targetField: "CREDITO_DOLAR",
        fieldType: "number",
        lookupFromTarget: true,
        lookupQuery: `SELECT (CAST(COSTO_ULT_DOL AS DECIMAL(18,4)) * @CANTIDAD) FROM CATELLI.ARTICULO WHERE ARTICULO = @COD_ART`,
        lookupParams: [
          { sourceField: "COD_ART", paramName: "COD_ART" },
          { sourceField: "CNT_MAX", paramName: "CANTIDAD" },
        ],
        validateExistence: true,
        failIfNotFound: true,
      }),
    ],
  });

  const diarioCostoDebito = diarioBase({
    name: "DIARIO_COSTO_DEBITO",
    executionOrder: 12,
    fieldMappings: [
      ...diarioCommonFields(),
      baseFieldMapping({
        targetField: "CUENTA_CONTABLE",
        lookupFromTarget: true,
        lookupQuery: `SELECT ac.CTA_COST_VENTA_LOC FROM CATELLI.ARTICULO a INNER JOIN CATELLI.ARTICULO_CUENTA ac ON a.ARTICULO_CUENTA = ac.ARTICULO_CUENTA WHERE a.ARTICULO = @COD_ART`,
        lookupParams: [{ sourceField: "COD_ART", paramName: "COD_ART" }],
        validateExistence: true,
        failIfNotFound: true,
      }),
      baseFieldMapping({
        targetField: "DEBITO_LOCAL",
        fieldType: "number",
        lookupFromTarget: true,
        lookupQuery: `SELECT (CAST(COSTO_ULT_LOC AS DECIMAL(18,4)) * @CANTIDAD) FROM CATELLI.ARTICULO WHERE ARTICULO = @COD_ART`,
        lookupParams: [
          { sourceField: "COD_ART", paramName: "COD_ART" },
          { sourceField: "CNT_MAX", paramName: "CANTIDAD" },
        ],
        validateExistence: true,
        failIfNotFound: true,
      }),
      baseFieldMapping({
        targetField: "DEBITO_DOLAR",
        fieldType: "number",
        lookupFromTarget: true,
        lookupQuery: `SELECT (CAST(COSTO_ULT_DOL AS DECIMAL(18,4)) * @CANTIDAD) FROM CATELLI.ARTICULO WHERE ARTICULO = @COD_ART`,
        lookupParams: [
          { sourceField: "COD_ART", paramName: "COD_ART" },
          { sourceField: "CNT_MAX", paramName: "CANTIDAD" },
        ],
        validateExistence: true,
        failIfNotFound: true,
      }),
    ],
  });

  // 13. DIARIO_AR: débito a Cuentas por Cobrar, 1 fila por factura.
  //
  // 2026-10-31: originalmente usaba FACTURA.TOTAL_MERCADERIA (=MON_SIV del
  // origen) para evitar discriminar línea regular de bono en FACTURA_LINEA.
  // Confirmado contra 9R01260000019 que esto puede desbalancear el asiento:
  // MON_SIV (115274.88) no coincidió exacto con SUM(FACTURA_LINEA.PRECIO_
  // TOTAL) (115272.00, diferencia de $2.88 por redondeo propio del origen),
  // y como TOTAL_DEBITO_LOC/TOTAL_CREDITO_LOC (el total declarado del
  // asiento) se calcula con SUM(PRECIO_TOTAL), un DIARIO_AR basado en MON_SIV
  // quedaba descuadrado contra el resto de las líneas reales insertadas en
  // CATELLI.DIARIO. Se cambia a SUM(FACTURA_LINEA.PRECIO_TOTAL) -- la misma
  // fuente que usa TOTAL_DEBITO_LOC/CREDITO_LOC -- para garantizar balance
  // exacto siempre, sin depender de que el origen cuadre con nuestra suma.
  // Sigue sin hacer falta discriminar bono/regular: PRECIO_TOTAL ya está bien
  // calculado para ambos tipos de línea (ver SIBLING_REGULAR_PRICE arriba).
  const diarioAr = diarioBase({
    name: "DIARIO_AR",
    sourceTable: "FAC_ENC_PED",
    orderByColumn: "",
    executionOrder: 13,
    fieldMappings: [
      ...diarioCommonFields(),
      baseFieldMapping({ targetField: "CUENTA_CONTABLE", defaultValue: "100-01-04-01-00" }),
      baseFieldMapping({
        targetField: "DEBITO_LOCAL",
        fieldType: "number",
        lookupFromTarget: true,
        lookupQuery: `SELECT ISNULL(SUM(PRECIO_TOTAL),0) + ISNULL(SUM(TOTAL_IMPUESTO1),0) FROM CATELLI.FACTURA_LINEA WHERE FACTURA=@NUM_PED`,
        lookupParams: [{ sourceField: "NUM_PED", paramName: "NUM_PED" }],
        validateExistence: true,
        failIfNotFound: true,
      }),
      baseFieldMapping({
        targetField: "DEBITO_DOLAR",
        fieldType: "number",
        lookupFromTarget: true,
        lookupQuery: `SELECT (ISNULL(SUM(PRECIO_TOTAL),0) + ISNULL(SUM(TOTAL_IMPUESTO1),0)) / ${EXCHANGE_RATE} FROM CATELLI.FACTURA_LINEA WHERE FACTURA=@NUM_PED`,
        lookupParams: [{ sourceField: "NUM_PED", paramName: "NUM_PED" }],
        validateExistence: true,
        failIfNotFound: true,
      }),
    ],
  });

  // 14. DIARIO_ITBIS: crédito a ITBIS por pagar.
  //
  // 2026-10-31: rediseñado tras probar con 9R01260000019 (4 líneas, todas con
  // PORC_IMPUESTO1 NULL en el origen -- factura real sin ITBIS en ninguna
  // línea). El diseño original (1 fila fija por factura, sourceTable
  // FAC_ENC_PED, buscando "la primera línea con impuesto>0") fallaba con
  // failIfNotFound cuando NINGUNA línea tenía impuesto, abortando el
  // documento entero por algo que no es un error real -- una factura sin
  // ITBIS es un caso válido, no debería generar ninguna fila en DIARIO, igual
  // que ya pasa con DIARIO_BONO_CREDITO/DEBITO cuando no hay bonos.
  //
  // Se cambia a 1 fila POR LÍNEA con impuesto (sourceTable FAC_DET_PED,
  // filterCondition PORC_IMPUESTO1 IS NOT NULL -- 0 líneas = 0 filas, sin
  // fallar) en vez de 1 fila agregada por factura. Esto además resuelve de
  // paso la limitación ya documentada de "no soporta multi-tasa": si hay
  // líneas con distintas tasas/cuentas de ITBIS, cada una genera su propia
  // fila con su propia cuenta, en vez de intentar agregarlas en una sola.
  const diarioItbis = diarioBase({
    name: "DIARIO_ITBIS",
    filterCondition: "PORC_IMPUESTO1 IS NOT NULL",
    executionOrder: 14,
    fieldMappings: [
      ...diarioCommonFields(),
      baseFieldMapping({
        targetField: "CUENTA_CONTABLE",
        lookupFromTarget: true,
        lookupQuery: `SELECT i.CTA_IMP1_GEN
FROM CATELLI.ARTICULO a
INNER JOIN CATELLI.IMPUESTO i ON a.IMPUESTO = i.IMPUESTO
WHERE a.ARTICULO = @COD_ART`,
        lookupParams: [{ sourceField: "COD_ART", paramName: "COD_ART" }],
        validateExistence: true,
        failIfNotFound: true,
      }),
      baseFieldMapping({
        targetField: "CREDITO_LOCAL",
        fieldType: "number",
        lookupFromTarget: true,
        lookupQuery: `SELECT (@MON_PRC_MX * @CANTIDAD * @PORC_IMPUESTO1 / 100)`,
        lookupParams: [
          { sourceField: "MON_PRC_MX", paramName: "MON_PRC_MX" },
          { sourceField: "CNT_MAX", paramName: "CANTIDAD" },
          { sourceField: "PORC_IMPUESTO1", paramName: "PORC_IMPUESTO1" },
        ],
        validateExistence: true,
        failIfNotFound: true,
      }),
      baseFieldMapping({
        targetField: "CREDITO_DOLAR",
        fieldType: "number",
        lookupFromTarget: true,
        lookupQuery: `SELECT (@MON_PRC_MX * @CANTIDAD * @PORC_IMPUESTO1 / 100) / ${EXCHANGE_RATE}`,
        lookupParams: [
          { sourceField: "MON_PRC_MX", paramName: "MON_PRC_MX" },
          { sourceField: "CNT_MAX", paramName: "CANTIDAD" },
          { sourceField: "PORC_IMPUESTO1", paramName: "PORC_IMPUESTO1" },
        ],
        validateExistence: true,
        failIfNotFound: true,
      }),
    ],
  });

  return {
    name: "CargarFacturaCompleta",
    description:
      "Consolida CargarFacturas + Carga_Fac_To_CC + CargaNCF_Fac en un solo " +
      "TransferMapping (atomicidad real vía savepoint por documento), agrega " +
      "AUDIT_TRANS_INV/TRANSACCION_INV (inventario) y ASIENTO_DE_DIARIO/DIARIO " +
      "(asiento contable, 8 tableConfigs de detalle). Ver " +
      "docs/archive/ANALISIS_MAPPING_CLIENTE_FACTURA.md.",
    transferType: "down",
    active: false, // activar manualmente recién después de validar en desarrollo (Fase 3 del plan)
    sourceServer: "server2",
    targetServer: "server1",
    documentTypeRules: stripIds(clone(cargarFacturas.documentTypeRules || [])),
    tableConfigs: [
      facEnc,
      facDet,
      auditTransInv,
      transaccionInv,
      docCcFac,
      ncfFac,
      asientoDeDiario,
      diarioVenta,
      diarioBonoCredito,
      diarioBonoDebito,
      diarioCostoCredito,
      diarioCostoDebito,
      diarioAr,
      diarioItbis,
    ],
    markProcessedField: "DOC_PRO",
    // 2026-11-01: el motor ignora este campo por completo -- la estrategia
    // "individual" (markDocumentsIndividually, DynamicTransferService.js)
    // siempre escribe el literal 1 sin importar lo que diga acá (confirmado
    // contra datos reales: DOC_PRO quedó en '1', no 'S'). Se deja en 1 para
    // que la configuración documente la realidad, no para cambiar el
    // comportamiento -- NO se corrigió el motor porque Carga_Fac_To_CC
    // (legacy, activo) depende de ese '1' literal vía su propio
    // filterCondition "DOC_PRO LIKE '1'".
    markProcessedValue: 1,
    markProcessedStrategy: "individual",
    markProcessedConfig: {
      batchSize: 100,
      includeTimestamp: false,
      timestampField: null,
      allowRollback: false,
    },
    entityType: "invoices",
    consecutiveConfig: {
      enabled: false,
      lastValue: 0,
      prefix: "",
      updateAfterTransfer: true,
      startValue: 1,
      applyToTables: [],
    },
    foreignKeyDependencies: [],
    promotionConfig: stripIds(
      clone(
        cargarFacturas.promotionConfig || {
          enabled: false,
          detectFields: {},
          targetFields: {},
          rules: [],
        }
      )
    ),
    // ya no se encadena a nada vía workflowConfig: DOCUMENTOS_CC/NCF_DOCUMENTO
    // quedan DENTRO de este mapping, en la misma transacción.
    workflowConfig: { enabled: false, nextMappings: [], stopWorkflowOnError: true },
    allowDirectExecution: true,
    isWorkflowChild: false,
  };
}

// ===============================
// AplicarRecibosCxC
// ===============================

function buildAplicarRecibosCxC({ cargasRecibos }) {
  // CXC_ -> ahora fuente propia e independiente, ya no encadenada vía
  // workflowConfig.nextMappings desde Carga_Fac_To_CC (root cause del hueco
  // "documento viejo", sección 6.4 hallazgo 11).
  const cxc = getTableConfig(cargasRecibos, "CXC_");
  cxc.executionOrder = 1;
  cxc.filterCondition = "DOC_PRO IS NULL";

  // 2026-10-31: campo puramente de visualización -- la UI de "documentos
  // pendientes" (DocumentsDataTable.jsx) solo muestra columnas con
  // showInList:true, y el único campo así marcado acá era DOCUMENTO (el
  // destino, generado por consecutivo, sin sourceField). Como esa lista
  // muestra filas de ORIGEN (antes de procesar, antes de que "DOCUMENTO"
  // exista), esa columna nunca podía mostrar nada real -- quedaba "—" siempre
  // (confirmado contra AplicarRecibosCxC en la UI real). El prefijo "_" hace
  // que el motor lo excluya del INSERT real (ver isAuxiliaryField en
  // DynamicTransferService.js, generalizado para esto).
  addField(cxc, {
    targetField: "_DISPLAY_NUM_REC",
    sourceField: "NUM_REC",
    showInList: true,
    displayName: "RECIBO",
    displayOrder: 0,
  });

  // 2026-11-01: hallazgo real -- un recibo que salda una factura SÍ genera su
  // propio asiento contable en CATELLI (confirmado con 6 ejemplos reales,
  // paquete 'CC': débito 100-01-01-01-01 "caja", crédito 100-01-04-01-00
  // "CxC" -- la misma cuenta fija que usa DIARIO_AR de la factura -- por el
  // mismo monto exacto, FUENTE='REC'+DOCUMENTO, REFERENCIA='Pago de
  // Documento '+NUM_DOC_AF). CargasRecibos nunca lo hacía -- de ahí que los
  // recibos reales ya existentes (RC-00000009..014, procesados en mayo 2026)
  // quedaran con ASIENTO_PENDIENTE='S' para siempre, sin asiento real. Se
  // genera acá el consecutivo real de asiento para el paquete 'CC' --
  // DISTINTO del de 'FA' usado en CargarFacturaCompleta: CATELLI.PAQUETE
  // guarda ULTIMO_ASIENTO como 'FA'->numérico puro pero 'CC'->string con
  // prefijo incluido (ej. 'CC04286379'), confirmado con datos reales.
  addField(cxc, {
    targetField: "ASIENTO",
    lookupFromTarget: true,
    lookupQuery: `DECLARE @t TABLE (ASIENTO VARCHAR(20));
UPDATE CATELLI.PAQUETE
SET ULTIMO_ASIENTO = 'CC' + RIGHT('00000000' + CONVERT(VARCHAR(20), CONVERT(BIGINT, SUBSTRING(ULTIMO_ASIENTO, 3, 20)) + 1), 8)
OUTPUT INSERTED.ULTIMO_ASIENTO INTO @t
WHERE PAQUETE = 'CC';
SELECT ASIENTO FROM @t`,
    lookupParams: [],
    validateExistence: true,
    failIfNotFound: true,
  });
  // antes default 'S' (nunca se generaba el asiento) -- ahora sí se genera,
  // así que el recibo nuevo nace igual que uno ya contabilizado.
  patchField(cxc, "ASIENTO_PENDIENTE", { defaultValue: "N" });

  // el DOCUMENTO real clonado de CargasRecibos ya traía showInList:true con
  // este mismo displayName/displayOrder -- se apaga para no duplicar columna.
  patchField(cxc, "DOCUMENTO", { showInList: false });

  // 2026-11-01 (hallazgo tras la primera corrida real): el consecutivo de
  // mapping heredado de CargasRecibos (prefix:'', startValue:1) nunca se
  // había usado en producción -- su lastValue seguía en 0 -- y generaba
  // DOCUMENTO='1','2',... con riesgo real de colisión contra la numeración
  // manual de caja (CATELLI.CONSECUTIVO CONSECUTIVO='20' "RECIBOS_CAJAS",
  // formato real confirmado 'SF######', último valor real SF476511). El ERP
  // ya tiene un consecutivo PROPIO y separado para esta integración:
  // CONSECUTIVO='37' "RECIBO_TELYNET" (prefix 'RC-'), reflejado en Mongo como
  // el Consecutivo centralizado "RECIBO_FAC" (ya con sqlSync configurado
  // contra esa misma fila, currentValue=2 en sincro exacta con el
  // ULTIMO_VALOR real 'RC-00000002') -- se usa ese en vez de inventar uno
  // nuevo.
  //
  // CORRECCIÓN 2026-11-01 (segundo hallazgo real): el primer intento usó
  // "Multi-Consecutivo" por campo (isConsecutive+consecutiveId en DOCUMENTO
  // solamente) -- eso rompe a AUXILIAR_CC.CREDITO, que NO tiene su propio
  // fieldMapping con valor (sourceField/defaultValue vacíos): depende
  // 100% de que el mapping.consecutiveConfig (fieldName:'DOCUMENTO',
  // detailFieldName:'CREDITO') replique el MISMO currentConsecutive ya
  // generado para el encabezado. Con el campo individual, CREDITO quedaba
  // vacío -> FK "AUXCCCRD" (AUXILIAR_CC.CREDITO+TIPO_CREDITO debe existir en
  // DOCUMENTOS_CC.DOCUMENTO+TIPO) fallaba con cada documento. Fix real: usar
  // el consecutivo CENTRALIZADO a nivel de MAPPING (no de campo), que el
  // motor sí resuelve una sola vez por documento y reutiliza en ambos
  // campos -- ver consecutiveConfig más abajo (useCentralizedSystem +
  // selectedCentralizedConsecutive -> "RECIBO_FAC").

  // El filtro se unifica a IS NULL en el mapping nuevo (CargasRecibos usaba
  // IS NULL también acá, no era el problema) -- el valor real de marcado
  // queda en 1 siempre, el motor lo ignora (ver nota de markProcessedValue
  // más abajo, confirmado 2026-11-01).

  // APLICAR_AUXILIAR -> AUXILIAR_CC, sin cambios de fieldMappings conocidos
  // (DEBITO<-NUM_DOC_AF ya estaba correctamente mapeado).
  const auxiliar = getTableConfig(cargasRecibos, "APLICAR_AUXILIAR");
  auxiliar.parentTableRef = "CXC_";
  auxiliar.executionOrder = 2;

  // Hallazgo 2026-10-31 (primera corrida real de AplicarRecibosCxC): una
  // tableConfig separada "ACTUALIZAR_SALDO_CC" con su propio targetTable
  // apuntando a CATELLI.DOCUMENTOS_CC NO sirve solo para disparar el
  // UPDATE...OUTPUT como efecto lateral -- el motor, además de ejecutar el
  // lookupQuery, genera su PROPIO INSERT real con los fieldMappings de esa
  // tableConfig (DOCUMENTO, SALDO), insertando una fila corrupta de 2
  // columnas en DOCUMENTOS_CC y violando el NOT NULL de TIPO (confirmado con
  // el documento real 9R01260000012: "Cannot insert the value NULL into
  // column 'TIPO'", INSERT INTO CATELLI.DOCUMENTOS_CC (DOCUMENTO, SALDO)...).
  // El motor no tiene ningún modo "solo UPDATE, sin INSERT" para una
  // tableConfig. Fix: en vez de una tableConfig aparte, el UPDATE de SALDO se
  // cuela como un campo MÁS dentro de APLICAR_AUXILIAR (mismo truco que
  // _DISPLAY_NUM_REC) -- el lookupQuery se ejecuta igual como efecto lateral
  // durante el procesamiento normal de AUXILIAR_CC, y el prefijo "_" hace que
  // el motor excluya el campo del INSERT real de AUXILIAR_CC.
  addField(auxiliar, {
    targetField: "_UPDATE_SALDO_FAC",
    lookupFromTarget: true,
    // mismo problema de trigger+OUTPUT que CATELLI.PAQUETE (ver nota en
    // facEnc.ASIENTO_DOCUMENTO más arriba) -- se aplica preventivamente
    // acá también, sin confirmar aún si DOCUMENTOS_CC tiene trigger real.
    lookupQuery: `DECLARE @t TABLE (SALDO DECIMAL(18,4));
UPDATE CATELLI.DOCUMENTOS_CC
SET SALDO = SALDO - @MONTO
OUTPUT INSERTED.SALDO INTO @t
WHERE DOCUMENTO = @NUM_DOC_AF AND TIPO = 'FAC';
SELECT SALDO FROM @t`,
    lookupParams: [
      { sourceField: "MON_MOV_LOCAL", paramName: "MONTO" },
      { sourceField: "NUM_DOC_AF", paramName: "NUM_DOC_AF" },
    ],
    validateExistence: true,
    failIfNotFound: true,
  });

  // 2026-11-01: 3 tableConfigs nuevas para generar el asiento contable real
  // del recibo (hallazgo de esta sesión, ver nota de ASIENTO/ASIENTO_PENDIENTE
  // más arriba). AUXILIAR_CC (executionOrder:2) es el puente necesario: como
  // DOCUMENTOS_CC no guarda NUM_DOC_AF, es la única forma confiable de
  // encontrar, desde estas tablas, cuál es el DOCUMENTO/ASIENTO del recibo
  // que se está generando AHORA para esta factura -- vía su propio DEBITO
  // (=NUM_DOC_AF) / CREDITO (=DOCUMENTO del recibo), que ya quedó insertado.
  const ASIENTO_RECIBO_LOOKUP = `SELECT TOP 1 d.ASIENTO FROM CATELLI.AUXILIAR_CC a INNER JOIN CATELLI.DOCUMENTOS_CC d ON d.DOCUMENTO = a.CREDITO AND d.TIPO = 'REC' WHERE a.DEBITO = @NUM_DOC_AF ORDER BY d.DOCUMENTO DESC`;
  const DIARIO_REC_CONSECUTIVO = `SELECT ISNULL(MAX(CONSECUTIVO),0)+1 FROM CATELLI.DIARIO WHERE ASIENTO=(${ASIENTO_RECIBO_LOOKUP})`;
  const MONTO_DOLAR_LOOKUP = `SELECT (@MONTO / ${EXCHANGE_RATE})`;

  function diarioRecComunFields() {
    return [
      baseFieldMapping({
        targetField: "ASIENTO",
        lookupFromTarget: true,
        lookupQuery: ASIENTO_RECIBO_LOOKUP,
        lookupParams: [{ sourceField: "NUM_DOC_AF", paramName: "NUM_DOC_AF" }],
        validateExistence: true,
        failIfNotFound: true,
      }),
      baseFieldMapping({
        targetField: "CONSECUTIVO",
        fieldType: "number",
        lookupFromTarget: true,
        lookupQuery: DIARIO_REC_CONSECUTIVO,
        lookupParams: [{ sourceField: "NUM_DOC_AF", paramName: "NUM_DOC_AF" }],
        validateExistence: true,
        failIfNotFound: true,
      }),
      baseFieldMapping({ targetField: "NIT", defaultValue: "ND" }),
      baseFieldMapping({ targetField: "CENTRO_COSTO", defaultValue: "00-00-00" }),
      baseFieldMapping({
        targetField: "FUENTE",
        lookupFromTarget: true,
        lookupQuery: `SELECT TOP 1 ('REC' + a.CREDITO) FROM CATELLI.AUXILIAR_CC a WHERE a.DEBITO = @NUM_DOC_AF ORDER BY a.CREDITO DESC`,
        lookupParams: [{ sourceField: "NUM_DOC_AF", paramName: "NUM_DOC_AF" }],
        validateExistence: true,
        failIfNotFound: true,
      }),
      baseFieldMapping({
        targetField: "REFERENCIA",
        lookupFromTarget: true,
        lookupQuery: `SELECT ('Pago de Documento ' + @NUM_DOC_AF)`,
        lookupParams: [{ sourceField: "NUM_DOC_AF", paramName: "NUM_DOC_AF" }],
        validateExistence: true,
        failIfNotFound: true,
      }),
    ];
  }

  function diarioRecBase(overrides) {
    return {
      sourceTable: "ALCXC_MOV_DIR",
      targetTable: "CATELLI.DIARIO",
      primaryKey: "NUM_REC",
      targetPrimaryKey: "DIARIO",
      isDetailTable: true,
      parentTableRef: "CXC_",
      foreignKey: "",
      joinType: "INNER",
      useSameSourceTable: false,
      filterCondition: "",
      customQuery: "",
      orderByColumn: "",
      dependsOn: [],
      ...overrides,
    };
  }

  // Cabecera del asiento -- 1 fila por recibo. Totales = monto del recibo,
  // iguales en débito y crédito (confirmado con 6 asientos reales: una
  // aplicación de recibo siempre es un asiento de 2 líneas que se cancelan).
  const asientoDeDiarioRec = {
    name: "ASIENTO_DE_DIARIO_REC",
    sourceTable: "ALCXC_MOV_DIR",
    targetTable: "CATELLI.ASIENTO_DE_DIARIO",
    primaryKey: "NUM_REC",
    targetPrimaryKey: "ASIENTO_DE_DIARIO",
    isDetailTable: true,
    parentTableRef: "CXC_",
    foreignKey: "",
    joinType: "INNER",
    useSameSourceTable: false,
    filterCondition: "",
    customQuery: "",
    orderByColumn: "",
    executionOrder: 3,
    dependsOn: [],
    fieldMappings: [
      baseFieldMapping({
        targetField: "ASIENTO",
        lookupFromTarget: true,
        lookupQuery: ASIENTO_RECIBO_LOOKUP,
        lookupParams: [{ sourceField: "NUM_DOC_AF", paramName: "NUM_DOC_AF" }],
        validateExistence: true,
        failIfNotFound: true,
      }),
      baseFieldMapping({ targetField: "PAQUETE", defaultValue: "CC" }),
      baseFieldMapping({ targetField: "TIPO_ASIENTO", defaultValue: "CC" }),
      baseFieldMapping({ targetField: "FECHA", sourceField: "FEC_DOC", fieldType: "date" }),
      baseFieldMapping({ targetField: "CONTABILIDAD", defaultValue: "F" }),
      baseFieldMapping({ targetField: "ORIGEN", defaultValue: "CC" }),
      baseFieldMapping({ targetField: "CLASE_ASIENTO", defaultValue: "N" }),
      baseFieldMapping({ targetField: "TOTAL_DEBITO_LOC", sourceField: "MON_MOV_LOCAL", fieldType: "number" }),
      baseFieldMapping({
        targetField: "TOTAL_DEBITO_DOL", fieldType: "number", lookupFromTarget: true,
        lookupQuery: MONTO_DOLAR_LOOKUP,
        lookupParams: [{ sourceField: "MON_MOV_LOCAL", paramName: "MONTO" }],
        validateExistence: true, failIfNotFound: true,
      }),
      baseFieldMapping({ targetField: "TOTAL_CREDITO_LOC", sourceField: "MON_MOV_LOCAL", fieldType: "number" }),
      baseFieldMapping({
        targetField: "TOTAL_CREDITO_DOL", fieldType: "number", lookupFromTarget: true,
        lookupQuery: MONTO_DOLAR_LOOKUP,
        lookupParams: [{ sourceField: "MON_MOV_LOCAL", paramName: "MONTO" }],
        validateExistence: true, failIfNotFound: true,
      }),
      baseFieldMapping({ targetField: "ULTIMO_USUARIO", defaultValue: "FAC1" }),
      baseFieldMapping({
        targetField: "FECHA_ULT_MODIF", defaultValue: "GETDATE()", fieldType: "date",
        transform: { transformType: "datetime", datetimeFormat: "YYYY-MM-DD HH:MM:SS" },
      }),
      baseFieldMapping({ targetField: "MARCADO", defaultValue: "N" }),
      baseFieldMapping({ targetField: "TOTAL_CONTROL_LOC", sourceField: "MON_MOV_LOCAL", fieldType: "number" }),
      baseFieldMapping({
        targetField: "TOTAL_CONTROL_DOL", fieldType: "number", lookupFromTarget: true,
        lookupQuery: MONTO_DOLAR_LOOKUP,
        lookupParams: [{ sourceField: "MON_MOV_LOCAL", paramName: "MONTO" }],
        validateExistence: true, failIfNotFound: true,
      }),
      baseFieldMapping({ targetField: "USUARIO_CREACION", defaultValue: "FAC1" }),
      baseFieldMapping({
        targetField: "FECHA_CREACION", defaultValue: "GETDATE()", fieldType: "date",
        transform: { transformType: "datetime", datetimeFormat: "YYYY-MM-DD HH:MM:SS" },
      }),
    ],
  };

  // Crédito a CxC (100-01-04-01-00, la misma cuenta fija que usa DIARIO_AR de
  // la factura) -- confirmado idéntico en los 6 asientos reales revisados.
  const diarioCreditoArRec = diarioRecBase({
    name: "DIARIO_CREDITO_AR_REC",
    executionOrder: 4,
    fieldMappings: [
      ...diarioRecComunFields(),
      baseFieldMapping({ targetField: "CUENTA_CONTABLE", defaultValue: "100-01-04-01-00" }),
      baseFieldMapping({ targetField: "CREDITO_LOCAL", sourceField: "MON_MOV_LOCAL", fieldType: "number" }),
      baseFieldMapping({
        targetField: "CREDITO_DOLAR", fieldType: "number", lookupFromTarget: true,
        lookupQuery: MONTO_DOLAR_LOOKUP,
        lookupParams: [{ sourceField: "MON_MOV_LOCAL", paramName: "MONTO" }],
        validateExistence: true, failIfNotFound: true,
      }),
    ],
  });

  // Débito a Caja/Efectivo (100-01-01-01-01) -- confirmado idéntico en los 6
  // asientos reales revisados (ALCXC_MOV_DIR = cobros de contado/contra-entrega).
  const diarioDebitoCajaRec = diarioRecBase({
    name: "DIARIO_DEBITO_CAJA_REC",
    executionOrder: 5,
    fieldMappings: [
      ...diarioRecComunFields(),
      baseFieldMapping({ targetField: "CUENTA_CONTABLE", defaultValue: "100-01-01-01-01" }),
      baseFieldMapping({ targetField: "DEBITO_LOCAL", sourceField: "MON_MOV_LOCAL", fieldType: "number" }),
      baseFieldMapping({
        targetField: "DEBITO_DOLAR", fieldType: "number", lookupFromTarget: true,
        lookupQuery: MONTO_DOLAR_LOOKUP,
        lookupParams: [{ sourceField: "MON_MOV_LOCAL", paramName: "MONTO" }],
        validateExistence: true, failIfNotFound: true,
      }),
    ],
  });

  return {
    name: "AplicarRecibosCxC",
    description:
      "Aplica recibos de ALCXC_MOV_DIR a DOCUMENTOS_CC de forma independiente " +
      "(no encadenado desde CargarFacturaCompleta) -- cubre tanto el recibo del " +
      "mismo día (contra-entrega) como el que salda un documento viejo, actualiza " +
      "SALDO y genera el asiento contable real del recibo (ASIENTO_DE_DIARIO/DIARIO, " +
      "paquete 'CC', débito Caja 100-01-01-01-01 / crédito CxC 100-01-04-01-00 -- " +
      "gaps de CargasRecibos). Ver docs/archive/ANALISIS_MAPPING_CLIENTE_FACTURA.md sección 6.4.",
    transferType: "down",
    active: false,
    sourceServer: "server2",
    targetServer: "server1",
    documentTypeRules: [],
    tableConfigs: [cxc, auxiliar, asientoDeDiarioRec, diarioCreditoArRec, diarioDebitoCajaRec],
    markProcessedField: "DOC_PRO",
    // 2026-11-01: el motor ignora este campo por completo -- la estrategia
    // "individual" (markDocumentsIndividually, DynamicTransferService.js)
    // siempre escribe el literal 1 sin importar lo que diga acá (confirmado
    // contra datos reales: DOC_PRO quedó en '1', no 'S'). Se deja en 1 para
    // que la configuración documente la realidad, no para cambiar el
    // comportamiento -- NO se corrigió el motor porque Carga_Fac_To_CC
    // (legacy, activo) depende de ese '1' literal vía su propio
    // filterCondition "DOC_PRO LIKE '1'".
    markProcessedValue: 1,
    markProcessedStrategy: "individual",
    markProcessedConfig: {
      batchSize: 100,
      includeTimestamp: false,
      timestampField: null,
      allowRollback: false,
    },
    entityType: "other",
    // DOCUMENTO (header, CXC_) y CREDITO (detalle, AUXILIAR_CC) deben recibir
    // el MISMO valor generado una sola vez por documento -- el motor hace esa
    // réplica automáticamente vía fieldName/detailFieldName, siempre que
    // apunte al consecutivo centralizado real del ERP ("RECIBO_FAC",
    // sincronizado con CATELLI.CONSECUTIVO CONSECUTIVO='37').
    consecutiveConfig: {
      enabled: true,
      fieldName: "DOCUMENTO",
      detailFieldName: "CREDITO",
      useCentralizedSystem: true,
      selectedCentralizedConsecutive: "69b8cab9e8d79850941accaf", // Consecutive "RECIBO_FAC"
      lastValue: 0,
      prefix: "",
      updateAfterTransfer: false,
      startValue: 1,
      applyToTables: [],
    },
    foreignKeyDependencies: [],
    promotionConfig: { enabled: false, detectFields: {}, targetFields: {}, rules: [] },
    workflowConfig: { enabled: false, nextMappings: [], stopWorkflowOnError: true },
    allowDirectExecution: true,
    isWorkflowChild: false,
  };
}

// ===============================
// Main
// ===============================

async function main() {
  await connectToDatabase();
  try {
    const [cargarFacturas, cargaFacToCC, cargaNCF, cargasRecibos] = await Promise.all([
      TransferMapping.findOne({ name: "CargarFacturas" }).lean(),
      TransferMapping.findOne({ name: "Carga_Fac_To_CC" }).lean(),
      TransferMapping.findOne({ name: "CargaNCF_Fac" }).lean(),
      TransferMapping.findOne({ name: "CargasRecibos" }).lean(),
    ]);

    if (!cargarFacturas) throw new Error("No se encontró el mapping 'CargarFacturas'");
    if (!cargaFacToCC) throw new Error("No se encontró el mapping 'Carga_Fac_To_CC'");
    if (!cargaNCF) throw new Error("No se encontró el mapping 'CargaNCF_Fac'");
    if (!cargasRecibos) throw new Error("No se encontró el mapping 'CargasRecibos'");

    const cargarFacturaCompleta = buildCargarFacturaCompleta({
      cargarFacturas,
      cargaFacToCC,
      cargaNCF,
    });
    const aplicarRecibosCxC = buildAplicarRecibosCxC({ cargasRecibos });

    console.log(
      JSON.stringify({ cargarFacturaCompleta, aplicarRecibosCxC }, null, 2)
    );

    console.log(
      "\n⚠️  Antes de activar: confirmar CTA_DESC_BONIF_LOC (cuenta de descuento por " +
      "bonificación en ARTICULO_CUENTA, usada por DIARIO_BONO_DEBITO) contra un INSERT " +
      "real -- ninguna de las facturas de prueba hasta ahora tenía líneas bonificadas."
    );

    if (DRY_RUN) {
      console.log("\n--dry-run: no se escribió nada en Mongo.");
      return;
    }

    const existing1 = await TransferMapping.findOne({ name: cargarFacturaCompleta.name });
    if (existing1) {
      throw new Error(
        `Ya existe un mapping llamado '${cargarFacturaCompleta.name}' — bórralo o cambia el nombre antes de reintentar.`
      );
    }
    const existing2 = await TransferMapping.findOne({ name: aplicarRecibosCxC.name });
    if (existing2) {
      throw new Error(
        `Ya existe un mapping llamado '${aplicarRecibosCxC.name}' — bórralo o cambia el nombre antes de reintentar.`
      );
    }

    // 2026-10-31: usar DynamicTransferService.createMapping (el mismo método
    // que usa la UI) en vez de TransferMapping.create directo -- ese método
    // ya crea el TransferTask asociado y lo vincula via mapping.taskId. Sin
    // esto, el motor nunca actualiza progress/currentStep/lastProcessingResult
    // en ningún lado consultable (solo lo hace "if (mapping.taskId)"), y el
    // modal de progreso del frontend (ProcessingStatusModal.jsx) tampoco
    // arranca su polling sin taskId -- se queda pegado en 0% para siempre
    // aunque el proceso ya haya terminado (confirmado contra 9R01260000010).
    const created1 = await DynamicTransferService.createMapping(cargarFacturaCompleta);
    const created2 = await DynamicTransferService.createMapping(aplicarRecibosCxC);

    console.log(`\n✅ Creado '${created1.name}' (_id ${created1._id}, active:false, taskId:${created1.taskId})`);
    console.log(`✅ Creado '${created2.name}' (_id ${created2._id}, active:false, taskId:${created2.taskId})`);
    console.log(
      "\n⚠️  Los 4 mappings viejos (CargarFacturas, Carga_Fac_To_CC, CargasRecibos, " +
      "CargaNCF_Fac) NO se desactivaron automáticamente. Desactivalos (active:false) " +
      "manualmente una vez que valides los nuevos en desarrollo (Fase 3 del plan)."
    );
  } finally {
    await disconnectFromDatabase();
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("❌ Error:", error);
      process.exit(1);
    });
}

module.exports = { buildCargarFacturaCompleta, buildAplicarRecibosCxC };

// ===============================
// NOTAS: ASIENTO_DE_DIARIO / DIARIO (2026-10-30, ya escritas arriba)
// ===============================
//
// Las 8 tableConfigs (ASIENTO_DE_DIARIO, DIARIO_VENTA, DIARIO_BONO_CREDITO/
// DEBITO, DIARIO_COSTO_CREDITO/DEBITO, DIARIO_AR, DIARIO_ITBIS) ya están
// completas en buildCargarFacturaCompleta(), con el diccionario real de
// columnas (INFORMATION_SCHEMA.COLUMNS) confirmado por el usuario y el bug
// de BODEGA (ver comentario de SIBLING_REGULAR_PRICE más arriba) corregido.
//
// Hallazgo clave (2026-10-30): la "DECISIÓN: bodega fija 01 para todo"
// (sección 3) significa que TANTO la línea regular como la de bono quedan
// con BODEGA='01' en este pipeline -- el BODEGA='02' visto en la factura
// real 3883332 (sección 9) es de una factura cargada manualmente (no por
// este pipeline) y tenía el MISMO precio unitario que su hermana BODEGA='01'
// (es un split real de bodega de picking, no un indicador de bonificación).
// El único criterio confiable de bonificación sigue siendo CANTIDAD_BONIFICADA
// en el origen (FAC_DET_PED), usado en los filterCondition de DIARIO_VENTA/
// DIARIO_BONO_*. Esto obligó a corregir SIBLING_REGULAR_PRICE (ya no filtra
// por BODEGA, filtra por PRECIO_UNITARIO > 0) y a calcular los totales de
// ASIENTO_DE_DIARIO/DIARIO_AR sumando TODAS las líneas de FACTURA_LINEA (o
// usando FACTURA.TOTAL_MERCADERIA para AR) en vez de intentar separar
// regular/bono en el destino -- ver ASIENTO_TOTAL_LOC/DOL y diarioAr arriba.
//
// Queda por confirmar antes de activar en producción (ver warnings en main()
// y en el encabezado del archivo):
//   - Nombre real de la cuenta de descuento por bonificación en
//     ARTICULO_CUENTA (usé CTA_DESC_BONIF_LOC, no CTA_DESC_VENTA_LOC) --
//     ninguna factura de prueba hasta ahora tenía líneas bonificadas.
//   - TOTAL_CONTROL_LOC/DOL: se asumió que replican TOTAL_DEBITO_LOC/DOL
//     (hipótesis razonable por el nombre y porque balanceaban igual en el
//     registro real de 3883332, pero nunca se preguntó explícitamente su
//     propósito).
