// services/traspasoService.js

const sql = require("mssql");
const { connectToDB } = require("./dbService");
const logger = require("./logger");

/**
 * Realiza el traspaso de bodega basándose en los datos de ventas.
 *
 * Proceso:
 * 1. Agrupar salesData por Code_Product para obtener la cantidad total.
 * 2. Obtener el último consecutivo de la tabla Consecutivo_Ci para documentos tipo "TR",
 *    incrementarlo y actualizar la tabla.
 * 3. Insertar el encabezado en DOCUMENTO_INV (registro único).
 * 4. Insertar las líneas en LINEA_DOC_INV en batch (cada línea corresponde a un producto y cantidad),
 *    donde BODEGA es la bodega origen fija (por ejemplo, 2) y BODEGA_DESTINO es el valor de "route".
 *
 * @param {Object} params - Objeto con:
 *    - route: (Number) Bodega destino.
 *    - salesData: (Array) Datos de ventas (cada registro debe tener Code_Product y Quantity).
 * @returns {Object} Resultado con la información del documento generado.
 */
async function traspasoBodega({ route, salesData }) {
  // 1. Agrupar salesData por producto
  const aggregated = {};
  for (const sale of salesData) {
    // Suponemos que cada sale tiene: Code_Product y Quantity.
    const product = sale.Code_Product;
    const qty = Number(sale.Quantity) || 0;
    aggregated[product] = (aggregated[product] || 0) + qty;
  }
  const aggregatedSales = Object.keys(aggregated).map((product) => ({
    Code_Product: product,
    TotalQuantity: aggregated[product],
  }));

  // 2. Conectar a la base de datos y comenzar la transacción
  const pool = await connectToDB("server1"); // Ajusta según la configuración (o "server2" si corresponde)
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    // Crear un request para operaciones generales en la transacción
    const request = new sql.Request(transaction);

    // 3. Obtener el último consecutivo de CATELLI.CONSECUTIVO_CI filtrado por "TR%"
    const queryConse = `
      SELECT TOP 1 SIGUIENTE_CONSEC 
      FROM CATELLI.CONSECUTIVO_CI 
      WHERE CONSECUTIVO LIKE @prefix 
      ORDER BY CONSECUTIVO DESC
    `;
    request.input("prefix", sql.NVarChar, "TR%");
    const resultConsec = await request.query(queryConse);
    console.log("Obtenemos el consecutivo -> ", resultConsec);
    let lastConsec = "TRA0000000";
    if (
      resultConsec.recordset.length > 0 &&
      resultConsec.recordset[0].SIGUIENTE_CONSEC
    ) {
      lastConsec = resultConsec.recordset[0].SIGUIENTE_CONSEC;
    }
    console.log("Obtenemos el consecutivo TR -> ", lastConsec);

    // 4. Incrementar el consecutivo
    // Aquí reemplazamos "TRA" en lugar de "TR"
    const numPart = parseInt(lastConsec.replace("TRA", ""), 10);
    const newNum = numPart + 1;
    // Como la máscara es de 6 dígitos (NNN999999), usamos padStart(6, "0")
    const newConsec = "TRA" + newNum.toString().padStart(6, "0");
    console.log("Obtenemos el consecutivo nuevo TR -> ", newConsec);

    // 5. Actualizar la tabla Consecutivo_Ci
    const updateRequest = new sql.Request(transaction);
    updateRequest.input("newConsec", sql.NVarChar, newConsec);
    updateRequest.input("lastConsec", sql.NVarChar, lastConsec);
    await updateRequest.query(`
      UPDATE CATELLI.CONSECUTIVO_CI 
      SET SIGUIENTE_CONSEC = @newConsec 
      WHERE SIGUIENTE_CONSEC = @lastConsec
    `);

    // 6. Preparar el valor para DOCUMENTO_INV (por ejemplo, concatenar "TRA" + nuevo consecutivo)
    const documento_inv = newConsec;

    // 7. Insertar el encabezado en DOCUMENTO_INV
    const headerRequest = new sql.Request(transaction);
    headerRequest.input("paquete", sql.NVarChar, "CS");
    headerRequest.input("documento_inv", sql.NVarChar, documento_inv);
    headerRequest.input("consecutivo", sql.NVarChar, "TR");
    headerRequest.input("referencia", sql.NVarChar, `Trapaso de entre bodega del vendedor `);
    headerRequest.input("seleccionado", sql.NVarChar, "N");
    headerRequest.input("usuario", sql.NVarChar, "SA");
    await headerRequest.query(`
      INSERT INTO CATELLI.DOCUMENTO_INV 
        (PAQUETE_INVENTARIO, DOCUMENTO_INV, CONSECUTIVO, REFERENCIA, FECHA_HOR_CREACION, FECHA_DOCUMENTO, SELECCIONADO, USUARIO)
      VALUES 
        (@paquete, @documento_inv, @consecutivo, @referencia,  GETDATE(), GETDATE(), @seleccionado, @usuario)
    `);

    // 8. Insertar las líneas en LINEA_DOC_INV usando procesamiento en lotes.
    // Parámetros:
    // - BODEGA (origen) es fija, por ejemplo, 2.
    // - BODEGA_DESTINO es el valor de route.
    const batchSize = 100;
    let processedCount = 0;
    const bodega_origen = "01";
    for (let i = 0; i < aggregatedSales.length; i += batchSize) {
      const batch = aggregatedSales.slice(i, i + batchSize);
      for (const [index, detail] of batch.entries()) {
        const lineNumber = processedCount + index + 1; // Número de línea secuencial
        const lineRequest = new sql.Request(transaction);
        lineRequest.input("paquete", sql.NVarChar, "CS");
        lineRequest.input("documento_inv", sql.NVarChar, documento_inv);
        lineRequest.input("linea", sql.Int, lineNumber);
        lineRequest.input("ajuste", sql.NVarChar, "~TT~");
        lineRequest.input("articulo", sql.NVarChar, detail.Code_Product);
        lineRequest.input("bodega", sql.NVarChar, bodega_origen);
        lineRequest.input("bodegaDestino", sql.NVarChar, "02");
        lineRequest.input("tipo", sql.NVarChar, "T");
        lineRequest.input("subtipo", sql.NVarChar, "D");
        lineRequest.input("subsubtipo", sql.NVarChar, "");
        lineRequest.input("CostoTotalLocal", sql.Decimal, 0);
        lineRequest.input("CostoTotalDolar", sql.Decimal, 0);
        lineRequest.input("PrecioTotalLocal", sql.Decimal, 0);
        lineRequest.input("PrecioTotalDolar", sql.Decimal, 0);
        lineRequest.input("Localizacion", sql.NVarChar, "ND");
        lineRequest.input("LocalizacionTest", sql.NVarChar, "ND");
        lineRequest.input("CentroCosto", sql.NVarChar, "00-00-00");
        lineRequest.input("Secuencia", sql.NVarChar, "");
        // lineRequest.input("SerieCadena", sql.Int), null;
        lineRequest.input("UnidadDistri", sql.NVarChar, "UND");
        lineRequest.input("CuentaContable", sql.NVarChar, "100-01-05-99-00");
        lineRequest.input("CostoTotalLocalComp", sql.Decimal, 0);
        lineRequest.input("CostoTotalDolarComp", sql.Decimal, 0);
        lineRequest.input("Cai", sql.NVarChar, "");
        lineRequest.input("TipoOperacion", sql.NVarChar, "11");
        lineRequest.input("TipoPago", sql.NVarChar, "ND");
        lineRequest.input("cantidad", sql.Decimal, detail.TotalQuantity);
        await lineRequest.query(`
          INSERT INTO CATELLI.LINEA_DOC_INV 
            (PAQUETE_INVENTARIO, DOCUMENTO_INV, LINEA_DOC_INV, AJUSTE_CONFIG, ARTICULO, BODEGA, BODEGA_DESTINO, CANTIDAD, TIPO, 
            SUBTIPO, SUBSUBTIPO, COSTO_TOTAL_LOCAL, COSTO_TOTAL_DOLAR, PRECIO_TOTAL_LOCAL, PRECIO_TOTAL_DOLAR, LOCALIZACION_DEST, 
            CENTRO_COSTO,SECUENCIA, UNIDAD_DISTRIBUCIO, CUENTA_CONTABLE, COSTO_TOTAL_LOCAL_COMP, 
            COSTO_TOTAL_DOLAR_COMP, CAI, TIPO_OPERACION, TIPO_PAGO, LOCALIZACION )
          VALUES 
            (@paquete, @documento_inv, @linea, @ajuste, @articulo, @bodega, @bodegaDestino, @cantidad, @tipo, @subtipo,
            @subsubtipo, @CostoTotalLocal, @CostoTotalDolar,@PrecioTotalLocal,@PrecioTotalDolar,@LocalizacionTest, @CentroCosto,
             @Secuencia, @UnidadDistri, @CuentaContable, @CostoTotalLocalComp, @CostoTotalDolarComp, @Cai, 
             @TipoOperacion, @TipoPago, @Localizacion )
        `);
      }
      processedCount += batch.length;
      // Aquí podrías actualizar el progreso en la base de datos o enviar un SSE:
      // Por ejemplo: await TransferTask.findByIdAndUpdate(taskId, { progress: Math.round((processedCount / aggregatedSales.length) * 100) });
    }

    // 9. Commit de la transacción
    await transaction.commit();
    return {
      success: true,
      documento_inv,
      newConsec,
      aggregatedSales,
    };
  } catch (error) {
    await transaction.rollback();
    logger.error("Error en traspasoBodega:", error);
    throw error;
  }
}

module.exports = { traspasoBodega };
