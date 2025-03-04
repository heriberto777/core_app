// services/traspasoService.js
const { connectToDB } = require("./dbService");
const logger = require("./logger");

/**
 * Realiza el traspaso de bodega basándose en los datos de ventas.
 * Versión sin transacciones.
 *
 * @param {Object} params - Objeto con:
 *    - route: (Number) Bodega destino.
 *    - salesData: (Array) Datos de ventas (cada registro debe tener Code_Product y Quantity).
 * @returns {Object} Resultado con la información del documento generado.
 */
async function traspasoBodega({ route, salesData }) {
  let pool = null;

  try {
    // 1. Agrupar salesData por producto
    const aggregated = {};
    for (const sale of salesData) {
      const product = sale.Code_Product;
      const qty = Number(sale.Quantity) || 0;
      aggregated[product] = (aggregated[product] || 0) + qty;
    }
    const aggregatedSales = Object.keys(aggregated).map((product) => ({
      Code_Product: product,
      TotalQuantity: aggregated[product],
    }));

    // 2. Conectar a la base de datos
    logger.debug(`Intentando conectar a server1 para traspaso de bodega...`);
    pool = await connectToDB("server1");

    if (!pool || !pool.connected) {
      throw new Error("No se pudo establecer una conexión válida con server1");
    }
    logger.info(`Conexión establecida correctamente para traspaso de bodega`);

    // 3. Obtener el último consecutivo con request directo
    const request = pool.request();
    request.timeout = 30000;

    const queryConse = `
      SELECT TOP 1 SIGUIENTE_CONSEC 
      FROM CATELLI.CONSECUTIVO_CI 
      WHERE CONSECUTIVO LIKE @prefix 
      ORDER BY CONSECUTIVO DESC
    `;
    request.input("prefix", "TR%");
    const resultConsec = await request.query(queryConse);

    let lastConsec = "TRA0000000";
    if (
      resultConsec.recordset.length > 0 &&
      resultConsec.recordset[0].SIGUIENTE_CONSEC
    ) {
      lastConsec = resultConsec.recordset[0].SIGUIENTE_CONSEC;
    }
    logger.info(`Consecutivo actual: ${lastConsec}`);

    // 4. Incrementar el consecutivo
    const numPart = parseInt(lastConsec.replace("TRA", ""), 10);
    const newNum = numPart + 1;
    const newConsec = "TRA" + newNum.toString().padStart(6, "0");
    logger.info(`Nuevo consecutivo calculado: ${newConsec}`);

    // 5. Actualizar la tabla Consecutivo_Ci
    const updateRequest = pool.request();
    updateRequest.timeout = 30000;
    updateRequest.input("newConsec", newConsec);
    updateRequest.input("lastConsec", lastConsec);
    await updateRequest.query(`
      UPDATE CATELLI.CONSECUTIVO_CI 
      SET SIGUIENTE_CONSEC = @newConsec 
      WHERE SIGUIENTE_CONSEC = @lastConsec
    `);

    // 6. Preparar el valor para DOCUMENTO_INV
    const documento_inv = newConsec;

    // 7. Insertar el encabezado en DOCUMENTO_INV
    const headerRequest = pool.request();
    headerRequest.timeout = 30000;
    headerRequest.input("paquete", "CS");
    headerRequest.input("documento_inv", documento_inv);
    headerRequest.input("consecutivo", "TR");
    headerRequest.input("referencia", `Trapaso de entre bodega del vendedor`);
    headerRequest.input("seleccionado", "N");
    headerRequest.input("usuario", "SA");
    await headerRequest.query(`
      INSERT INTO CATELLI.DOCUMENTO_INV 
        (PAQUETE_INVENTARIO, DOCUMENTO_INV, CONSECUTIVO, REFERENCIA, FECHA_HOR_CREACION, FECHA_DOCUMENTO, SELECCIONADO, USUARIO)
      VALUES 
        (@paquete, @documento_inv, @consecutivo, @referencia, GETDATE(), GETDATE(), @seleccionado, @usuario)
    `);

    // 8. Insertar las líneas en LINEA_DOC_INV una por una
    const bodega_origen = "01";
    let successCount = 0;

    for (let i = 0; i < aggregatedSales.length; i++) {
      const detail = aggregatedSales[i];
      const lineNumber = i + 1;

      try {
        const lineRequest = pool.request();
        lineRequest.timeout = 30000;
        lineRequest.input("paquete", "CS");
        lineRequest.input("documento_inv", documento_inv);
        lineRequest.input("linea", lineNumber);
        lineRequest.input("ajuste", "~TT~");
        lineRequest.input("articulo", detail.Code_Product);
        lineRequest.input("bodega", bodega_origen);
        lineRequest.input("bodegaDestino", "02");
        lineRequest.input("tipo", "T");
        lineRequest.input("subtipo", "D");
        lineRequest.input("subsubtipo", "");
        lineRequest.input("CostoTotalLocal", 0);
        lineRequest.input("CostoTotalDolar", 0);
        lineRequest.input("PrecioTotalLocal", 0);
        lineRequest.input("PrecioTotalDolar", 0);
        lineRequest.input("Localizacion", "ND");
        lineRequest.input("LocalizacionTest", "ND");
        lineRequest.input("CentroCosto", "00-00-00");
        lineRequest.input("Secuencia", "");
        lineRequest.input("UnidadDistri", "UND");
        lineRequest.input("CuentaContable", "100-01-05-99-00");
        lineRequest.input("CostoTotalLocalComp", 0);
        lineRequest.input("CostoTotalDolarComp", 0);
        lineRequest.input("Cai", "");
        lineRequest.input("TipoOperacion", "11");
        lineRequest.input("TipoPago", "ND");
        lineRequest.input("cantidad", detail.TotalQuantity);

        await lineRequest.query(`
          INSERT INTO CATELLI.LINEA_DOC_INV 
            (PAQUETE_INVENTARIO, DOCUMENTO_INV, LINEA_DOC_INV, AJUSTE_CONFIG, ARTICULO, BODEGA, BODEGA_DESTINO, CANTIDAD, TIPO, 
            SUBTIPO, SUBSUBTIPO, COSTO_TOTAL_LOCAL, COSTO_TOTAL_DOLAR, PRECIO_TOTAL_LOCAL, PRECIO_TOTAL_DOLAR, LOCALIZACION_DEST, 
            CENTRO_COSTO, SECUENCIA, UNIDAD_DISTRIBUCIO, CUENTA_CONTABLE, COSTO_TOTAL_LOCAL_COMP, 
            COSTO_TOTAL_DOLAR_COMP, CAI, TIPO_OPERACION, TIPO_PAGO, LOCALIZACION)
          VALUES 
            (@paquete, @documento_inv, @linea, @ajuste, @articulo, @bodega, @bodegaDestino, @cantidad, @tipo, @subtipo,
            @subsubtipo, @CostoTotalLocal, @CostoTotalDolar, @PrecioTotalLocal, @PrecioTotalDolar, @LocalizacionTest, @CentroCosto,
            @Secuencia, @UnidadDistri, @CuentaContable, @CostoTotalLocalComp, @CostoTotalDolarComp, @Cai, 
            @TipoOperacion, @TipoPago, @Localizacion)
        `);

        successCount++;
        logger.debug(`Línea ${lineNumber} insertada correctamente`);
      } catch (lineError) {
        logger.error(`Error al insertar línea ${lineNumber}:`, lineError);
        // Continuar con la siguiente línea aunque falle esta
      }
    }

    // Verificar resultados
    if (successCount === 0 && aggregatedSales.length > 0) {
      throw new Error(
        "No se pudo insertar ninguna línea de detalle en el documento"
      );
    }

    return {
      success: true,
      documento_inv,
      newConsec,
      totalLineas: aggregatedSales.length,
      lineasProcesadas: successCount,
    };
  } catch (error) {
    // Manejo general de errores
    logger.error("Error en traspasoBodega:", error);
    throw error;
  } finally {
    // Cerrar la conexión en el bloque finally
    try {
      if (pool && pool.connected) {
        await pool.close();
        logger.debug("Conexión cerrada correctamente para traspaso de bodega");
      }
    } catch (closeError) {
      logger.error(
        "Error al cerrar la conexión para traspaso de bodega:",
        closeError
      );
    }
  }
}

module.exports = { traspasoBodega };
