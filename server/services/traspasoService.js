const { withConnection } = require("../utils/dbUtils");
const { SqlService } = require("./SqlService");
const logger = require("./logger");
const { sendTraspasoEmail } = require("./emailService");
const PDFService = require("./pdfService");
const TransferSummary = require("../models/transferSummaryModel");

/**
 * Obtiene información adicional de los productos desde la base de datos
 * @param {Connection} connection - Conexión a la base de datos
 * @param {Array} productos - Array de productos con código y cantidad
 * @returns {Promise<Array>} - Array con información completa de los productos
 */
async function obtenerDetalleProductos(connection, productos) {
  try {
    const detalleCompleto = [];

    // Si no hay productos, devolver array vacío
    if (!productos || !Array.isArray(productos) || productos.length === 0) {
      return [];
    }

    // Obtener descripciones en un solo query para mejor rendimiento
    const params = {};
    const placeholders = productos
      .map((p, index) => {
        const codigo = p.codigo || p.Code_Product;
        if (!codigo) return null;

        const paramName = `p${index}`;
        params[paramName] = codigo;
        return `@${paramName}`;
      })
      .filter((p) => p !== null);

    if (placeholders.length === 0) {
      return productos.map((p) => ({
        codigo: p.codigo || p.Code_Product || "DESCONOCIDO",
        descripcion: "Desconocido",
        cantidad: p.cantidad || p.TotalQuantity || 0,
      }));
    }

    const query = `
      SELECT ARTICULO, DESCRIPCION
      FROM CATELLI.ARTICULO
      WHERE ARTICULO IN (${placeholders.join(", ")})
    `;

    const result = await SqlService.query(connection, query, params);

    // Crear un mapa para búsqueda rápida
    const descripcionesMap = {};
    if (result && result.recordset) {
      result.recordset.forEach((item) => {
        descripcionesMap[item.ARTICULO] = item.DESCRIPCION;
      });
    }

    // Completar la información
    for (const producto of productos) {
      const codigo = producto.codigo || producto.Code_Product || "DESCONOCIDO";
      detalleCompleto.push({
        codigo,
        descripcion: descripcionesMap[codigo] || "Descripción no disponible",
        cantidad: producto.cantidad || producto.TotalQuantity || 0,
      });
    }

    return detalleCompleto;
  } catch (error) {
    logger.warn(
      `No se pudo obtener detalle completo de productos: ${error.message}`
    );
    // En caso de error, devolver lo que tenemos sin descripción
    return productos.map((p) => ({
      codigo: p.codigo || p.Code_Product || "DESCONOCIDO",
      descripcion: "No disponible",
      cantidad: p.cantidad || p.TotalQuantity || 0,
    }));
  }
}

/**
 * Realiza el traspaso de bodega basándose en los datos de ventas.
 * Adaptado para usar SqlService optimizado con manejo mejorado de nulos y tipos.
 * Incluye envío de correo con información detallada.
 *
 * @param {Object} params - Objeto con:
 *    - route: (Number) Bodega destino.
 *    - salesData: (Array) Datos de ventas (cada registro debe tener Code_Product y Quantity).
 * @returns {Object} Resultado con la información del documento generado.
 */
async function traspasoBodega({ route, salesData, bodega_destino = "02" }) {
  let detalleProductos = [];
  let pdfPath = null;

  logger.info("Iniciando traspaso de bodega...");
  try {
    // Validar datos de entrada
    if (!salesData || !Array.isArray(salesData) || salesData.length === 0) {
      throw new Error("No hay datos de ventas para procesar");
    }

    // Filtrar y verificar productos válidos
    const productosValidos = salesData.filter(
      (item) =>
        item &&
        item.Code_Product &&
        typeof item.Quantity !== "undefined" &&
        Number(item.Quantity) > 0
    );

    if (productosValidos.length === 0) {
      throw new Error("No hay productos válidos en los datos de ventas");
    }

    // Extraer la bodega origen del primer item
    const bodegaOrigen = productosValidos[0].bodega || "02"; // Valor por defecto "01" si no viene

    logger.info(
      `Extraída bodega origen: ${bodegaOrigen} de los datos de ventas`
    );

    // 1. Agrupar salesData por producto
    const aggregated = {};
    for (const sale of productosValidos) {
      const product = sale.Code_Product.trim();
      const qty = Math.max(0, Number(sale.Quantity) || 0);

      if (product && qty > 0) {
        aggregated[product] = (aggregated[product] || 0) + qty;
      }
    }

    const aggregatedSales = Object.keys(aggregated).map((product) => ({
      Code_Product: product,
      TotalQuantity: aggregated[product],
    }));

    if (aggregatedSales.length === 0) {
      throw new Error(
        "No hay productos válidos para traspasar después de la validación"
      );
    }

    logger.info(
      `Procesando traspaso con ${aggregatedSales.length} productos, bodega origen: ${bodegaOrigen}, bodega destino: ${bodega_destino}`
    );

    // Usar el patrón withConnection para el acceso a la base de datos
    return await withConnection("server1", async (connection) => {
      try {
        // Obtener información detallada de los productos para el correo
        detalleProductos = await obtenerDetalleProductos(
          connection,
          aggregatedSales
        );

        // 3. Obtener el último consecutivo
        const queryConse = `
          SELECT TOP 1 SIGUIENTE_CONSEC
          FROM CATELLI.CONSECUTIVO_CI
          WITH (UPDLOCK, ROWLOCK)
          WHERE CONSECUTIVO LIKE @prefix
          ORDER BY CONSECUTIVO DESC
        `;

        const resultConsec = await SqlService.query(connection, queryConse, {
          prefix: "TR%",
        });

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
        const updateParams = SqlService.sanitizeParams({
          newConsec: newConsec,
          lastConsec: lastConsec,
        });

        const updateResult = await SqlService.query(
          connection,
          `UPDATE CATELLI.CONSECUTIVO_CI
           SET SIGUIENTE_CONSEC = @newConsec
           WHERE SIGUIENTE_CONSEC = @lastConsec`,
          updateParams
        );

        // Verificar que la actualización fue exitosa
        if (updateResult.rowsAffected === 0) {
          throw new Error(
            "No se pudo actualizar el consecutivo. El valor puede haber cambiado por otro proceso."
          );
        }

        // 6. Preparar el valor para DOCUMENTO_INV
        const documento_inv = newConsec;

        // 7. Verificar si el documento ya existe (para evitar duplicados)
        const checkParams = SqlService.sanitizeParams({
          documento_inv: documento_inv,
        });

        const checkResult = await SqlService.query(
          connection,
          `SELECT COUNT(*) AS doc_count
           FROM CATELLI.DOCUMENTO_INV
           WHERE DOCUMENTO_INV = @documento_inv`,
          checkParams
        );

        if (checkResult.recordset[0].doc_count > 0) {
          throw new Error(
            `El documento ${documento_inv} ya existe en la base de datos.`
          );
        }

        // 8. Insertar el encabezado en DOCUMENTO_INV
        const headerParams = SqlService.sanitizeParams({
          paquete: "CS",
          documento_inv: documento_inv,
          consecutivo: "TR",
          referencia: `Traspaso de bodega del vendedor ${route}`,
          seleccionado: "N",
          usuario: "SA",
        });

        await SqlService.query(
          connection,
          `INSERT INTO CATELLI.DOCUMENTO_INV
            (PAQUETE_INVENTARIO, DOCUMENTO_INV, CONSECUTIVO, REFERENCIA, FECHA_HOR_CREACION, FECHA_DOCUMENTO, SELECCIONADO, USUARIO)
           VALUES
            (@paquete, @documento_inv, @consecutivo, @referencia, GETDATE(), GETDATE(), @seleccionado, @usuario)`,
          headerParams
        );

        // 9. Insertar las líneas en LINEA_DOC_INV una por una
        let successCount = 0;
        let failedCount = 0;

        // Obtener los tipos de columnas para LINEA_DOC_INV
        let columnTypes = {};
        try {
          columnTypes = await SqlService.getColumnTypes(
            connection,
            "CATELLI.LINEA_DOC_INV"
          );
          logger.debug(
            `Tipos de columnas obtenidos correctamente para LINEA_DOC_INV`
          );
        } catch (typesError) {
          logger.warn(
            `No se pudieron obtener los tipos de columnas para LINEA_DOC_INV: ${typesError.message}. Se utilizará inferencia automática.`
          );
        }

        for (let i = 0; i < aggregatedSales.length; i++) {
          const detail = aggregatedSales[i];
          const lineNumber = i + 1;

          try {
            // Validar y sanitizar los datos de la línea
            const lineParams = SqlService.validateRecord({
              paquete: "CS",
              documento_inv: documento_inv,
              linea: lineNumber,
              ajuste: "~TT~",
              articulo: detail.Code_Product,
              bodega: bodegaOrigen, // Usamos la bodega origen extraída de los datos
              bodega_destino: bodega_destino, // Usamos la bodega destino pasada como parámetro
              tipo: "T",
              subtipo: "D",
              subsubtipo: "",
              CostoTotalLocal: 0,
              CostoTotalDolar: 0,
              PrecioTotalLocal: 0,
              PrecioTotalDolar: 0,
              Localizacion: "ND",
              LocalizacionTest: "ND",
              CentroCosto: "00-00-00",
              Secuencia: "",
              UnidadDistri: "UND",
              CuentaContable: "100-01-05-99-00",
              CostoTotalLocalComp: 0,
              CostoTotalDolarComp: 0,
              Cai: "",
              TipoOperacion: "11",
              TipoPago: "ND",
              cantidad: detail.TotalQuantity,
            });

            // Preparar la consulta SQL con los campos existentes
            const columns = Object.keys(lineParams)
              .map((k) => `[${k}]`)
              .join(", ");

            const paramPlaceholders = Object.keys(lineParams)
              .map((k) => `@${k}`)
              .join(", ");

            const sql = `
              INSERT INTO CATELLI.LINEA_DOC_INV
                (${columns})
              VALUES
                (${paramPlaceholders})
            `;

            // Ejecutar la consulta con tipos explícitos si están disponibles
            await SqlService.query(connection, sql, lineParams, columnTypes);

            successCount++;
            logger.debug(`Línea ${lineNumber} insertada correctamente`);
          } catch (lineError) {
            failedCount++;
            logger.error(`Error al insertar línea ${lineNumber}:`, lineError);
            logger.debug(
              `Detalles del registro: ${JSON.stringify(detail, null, 2)}`
            );
            // Continuar con la siguiente línea
          }
        }

        // 10. Verificar resultados
        if (successCount === 0 && aggregatedSales.length > 0) {
          throw new Error(
            "No se pudo insertar ninguna línea de detalle en el documento"
          );
        }

        // Preparar el resultado
        const result = {
          success: true,
          documento_inv,
          newConsec,
          totalLineas: aggregatedSales.length,
          lineasExitosas: successCount,
          lineasFallidas: failedCount,
          detalleProductos,
          route,
          bodegaOrigen, // Incluir la bodega origen en el resultado
          bodega_destino, // Incluir la bodega destino en el resultado
        };

        // Save transfer summary for tracking and returns
        try {
          // Format products for the summary
          const summaryProducts = detalleProductos.map((producto) => ({
            code: producto.codigo,
            description: producto.descripcion || "Sin descripción",
            quantity: producto.cantidad,
            unit: "UND",
          }));

          // Create a new summary
          const summary = new TransferSummary({
            loadId: "N/A", // loadId from the parameter if available
            route: route, // route from the parameter
            documentId: documento_inv, // The transfer document ID
            products: summaryProducts,
            totalProducts: summaryProducts.length,
            totalQuantity: summaryProducts.reduce(
              (sum, p) => sum + p.quantity,
              0
            ),
            createdBy: "SA", // Default user or get from request if available
            bodegaOrigen, // Incluir la bodega origen
            bodega_destino, // Incluir la bodega destino
          });

          logger.info("Resumen de traspaso:", summary);
          await summary.save();
          logger.info(
            `✅ Resumen de traspaso guardado con éxito para documento ${documento_inv}`
          );

          // Add summary to the result
          result.summaryId = summary._id;
        } catch (summaryError) {
          logger.error(
            `Error al guardar resumen de traspaso: ${summaryError.message}`
          );
          // Don't stop the process if summary creation fails
        }

        // Generar PDF del traspaso
        try {
          const pdfResult = await PDFService.generateTraspasoPDF(result);
          pdfPath = pdfResult.path;
          logger.info(`PDF de traspaso generado: ${pdfPath}`);
        } catch (pdfError) {
          logger.error(
            `Error al generar PDF del traspaso: ${pdfError.message}`
          );
          // Continuamos aunque falle la generación del PDF
        }

        // Enviar correo con el resultado y PDF adjunto si se generó correctamente
        await sendTraspasoEmail(result, pdfPath);
        logger.info(
          `Correo de notificación enviado para el traspaso: ${
            result.documento_inv || "N/A"
          }`
        );

        return result;
      } catch (operationError) {
        // Capture errors from DB operations
        logger.error(
          `Error en operaciones de base de datos: ${operationError.message}`
        );
        throw operationError;
      }
    });
  } catch (error) {
    // Manejo general de errores
    logger.error("Error en traspasoBodega:", error);

    // Preparar resultado de error
    const errorResult = {
      success: false,
      mensaje: error.message,
      errorDetail: error.stack,
      totalLineas: detalleProductos.length,
      lineasExitosas: 0,
      lineasFallidas: detalleProductos.length,
      detalleProductos,
      route,
      bodegaOrigen: bodegaOrigen || "01", // Incluir la bodega origen
      bodega_destino, // Incluir la bodega destino
    };

    // Intentar generar PDF del error
    try {
      const pdfResult = await PDFService.generateTraspasoPDF(errorResult);
      pdfPath = pdfResult.path;
      logger.info(`PDF de error de traspaso generado: ${pdfPath}`);
    } catch (pdfError) {
      logger.error(`Error al generar PDF del error: ${pdfError.message}`);
      // Continuamos aunque falle la generación del PDF
    }

    // Intentar enviar correo de error con PDF si se generó
    try {
      await sendTraspasoEmail(errorResult, pdfPath);
      logger.info(`Correo de error enviado para el traspaso fallido`);
    } catch (emailError) {
      logger.error(`Error al enviar correo de error: ${emailError.message}`);
    }

    // Limpiar archivo PDF temporal si existe
    try {
      if (pdfPath) {
        setTimeout(async () => {
          await PDFService.cleanupTempFile(pdfPath);
        }, 60000); // Eliminar después de 1 minuto para asegurar que se envió el correo
      }
    } catch (cleanupError) {
      logger.warn(
        `Error al programar limpieza de PDF temporal: ${cleanupError.message}`
      );
    }

    throw error;
  }
}

/**
 * Método alternativo para realizar traspasos
 * Usa SQL directo sin parámetros para evitar problemas de validación
 */

async function realizarTraspaso({ route, salesData, bodega_destino }) {
  let detalleProductos = [];
  let pdfPath = null;

  logger.info(`Iniciando realizar traspaso de bodega ${bodega_destino} `);

  try {
    // 1. Validar datos de entrada - filtrar productos válidos
    if (!salesData || !Array.isArray(salesData) || salesData.length === 0) {
      throw new Error("No hay datos de ventas para procesar");
    }

    // Filtrar y verificar productos válidos
    const productosValidos = salesData.filter(
      (item) =>
        item &&
        item.Code_Product &&
        item.Code_Product.trim() !== "" &&
        typeof item.Quantity !== "undefined" &&
        Number(item.Quantity) > 0
    );

    if (productosValidos.length === 0) {
      throw new Error("No hay productos válidos en los datos de ventas");
    }

    // 2. Agrupar productos
    const productos = {};
    // Extraer la bodega origen del primer item (asumiendo que todos tienen la misma)
    const bodegaOrigen = productosValidos[0].bodega || "02"; // Valor por defecto "01" si no viene

    for (const item of productosValidos) {
      const codigo = item.Code_Product.trim();
      const cantidad = Math.max(0, Number(item.Quantity) || 0);

      if (codigo && cantidad > 0) {
        if (!productos[codigo]) {
          productos[codigo] = 0;
        }
        productos[codigo] += cantidad;
      }
    }

    const productosArray = Object.entries(productos)
      .filter(([codigo, cantidad]) => codigo && cantidad > 0)
      .map(([codigo, cantidad]) => ({
        codigo,
        cantidad,
      }));

    if (productosArray.length === 0) {
      throw new Error("No hay productos válidos después de agrupar");
    }

    logger.info(
      `Iniciando traspaso de bodega para ruta ${route} con ${productosArray.length} productos. Bodega origen: ${bodegaOrigen}, Bodega destino: ${bodega_destino}`
    );

    // Usar el nuevo patrón de conexión
    return await withConnection("server1", async (connection) => {
      try {
        // 4. Obtener información de productos para el correo
        detalleProductos = await obtenerDetalleProductos(
          connection,
          productosArray
        );

        logger.info(
          `Dentro del traspaso de bodega para ruta ${route} con ${productosArray.length} productos. Bodega origen: ${bodegaOrigen}, Bodega destino: ${bodega_destino}`
        );

        // 5. Obtener el consecutivo actual con SQL directo
        const consultaConsecutivo = `
          SELECT TOP 1 SIGUIENTE_CONSEC
          FROM CATELLI.CONSECUTIVO_CI
          WITH (UPDLOCK, ROWLOCK)
          WHERE CONSECUTIVO LIKE 'TR%'
          ORDER BY CONSECUTIVO DESC
        `;

        const resultadoConsecutivo = await SqlService.query(
          connection,
          consultaConsecutivo
        );

        if (
          !resultadoConsecutivo ||
          !resultadoConsecutivo.recordset ||
          resultadoConsecutivo.recordset.length === 0
        ) {
          throw new Error("No se pudo obtener el consecutivo actual");
        }

        const ultimoConsecutivo =
          resultadoConsecutivo.recordset[0].SIGUIENTE_CONSEC || "TRA0000000";
        const numeroActual =
          parseInt(ultimoConsecutivo.replace("TRA", ""), 10) || 0;
        const nuevoConsecutivo =
          "TRA" + (numeroActual + 1).toString().padStart(6, "0");

        logger.info(
          `Consecutivo actual: ${ultimoConsecutivo}, Nuevo consecutivo: ${nuevoConsecutivo}`
        );

        // 6. Actualizar el consecutivo con parámetros seguros
        const actualizarConsecutivoParams = {
          nuevo: nuevoConsecutivo,
          actual: ultimoConsecutivo,
        };

        const resultadoActualizacion = await SqlService.query(
          connection,
          `UPDATE CATELLI.CONSECUTIVO_CI
           SET SIGUIENTE_CONSEC = @nuevo
           WHERE SIGUIENTE_CONSEC = @actual`,
          actualizarConsecutivoParams
        );

        if (
          !resultadoActualizacion ||
          resultadoActualizacion.rowsAffected === 0
        ) {
          throw new Error("No se pudo actualizar el consecutivo");
        }

        // 7. Insertar el documento principal con parámetros
        const referenciaParams = {
          referencia: `Traspaso de bodega para vendedor ${route}`,
          documento: nuevoConsecutivo,
        };

        const insertarDocumento = `
          INSERT INTO CATELLI.DOCUMENTO_INV
            (PAQUETE_INVENTARIO, DOCUMENTO_INV, CONSECUTIVO, REFERENCIA, FECHA_HOR_CREACION, FECHA_DOCUMENTO, SELECCIONADO, USUARIO)
          VALUES
            ('CS', @documento, 'TR', @referencia, GETDATE(), GETDATE(), 'N', 'SA')
        `;

        await SqlService.query(connection, insertarDocumento, referenciaParams);

        // 8. Insertar líneas una por una con parámetros
        let lineasExitosas = 0;
        let lineasFallidas = 0;

        // Obtener tipos de columnas
        let columnTypes = {};
        try {
          columnTypes = await SqlService.getColumnTypes(
            connection,
            "CATELLI.LINEA_DOC_INV"
          );
        } catch (typesError) {
          logger.warn(
            `No se pudieron obtener tipos de columnas: ${typesError.message}`
          );
        }

        for (let i = 0; i < productosArray.length; i++) {
          const producto = productosArray[i];
          const lineaNumero = i + 1;

          try {
            // Usar parámetros con SqlService
            const lineaParams = {
              paquete: "CS",
              documento_inv: nuevoConsecutivo,
              linea: lineaNumero,
              ajuste: "~TT~",
              articulo: producto.codigo,
              bodega: bodegaOrigen, // Bodega origen desde los datos
              bodega_destino: bodega_destino, // Bodega destino parametrizada
              cantidad: producto.cantidad,
              tipo: "T",
              subtipo: "D",
              subsubtipo: "",
              costo_total_local: 0,
              costo_total_dolar: 0,
              precio_total_local: 0,
              precio_total_dolar: 0,
              localizacion_dest: "ND",
              centro_costo: "00-00-00",
              secuencia: "",
              unidad_distribucio: "UND",
              cuenta_contable: "100-01-05-99-00",
              costo_total_local_comp: 0,
              costo_total_dolar_comp: 0,
              cai: "",
              tipo_operacion: "11",
              tipo_pago: "ND",
              localizacion: "ND",
            };

            const insertarLinea = `
              INSERT INTO CATELLI.LINEA_DOC_INV
                (PAQUETE_INVENTARIO, DOCUMENTO_INV, LINEA_DOC_INV, AJUSTE_CONFIG, ARTICULO,
                 BODEGA, BODEGA_DESTINO, CANTIDAD, TIPO, SUBTIPO, SUBSUBTIPO,
                 COSTO_TOTAL_LOCAL, COSTO_TOTAL_DOLAR, PRECIO_TOTAL_LOCAL, PRECIO_TOTAL_DOLAR,
                 LOCALIZACION_DEST, CENTRO_COSTO, SECUENCIA, UNIDAD_DISTRIBUCIO, CUENTA_CONTABLE,
                 COSTO_TOTAL_LOCAL_COMP, COSTO_TOTAL_DOLAR_COMP, CAI, TIPO_OPERACION, TIPO_PAGO, LOCALIZACION)
              VALUES
                (@paquete, @documento_inv, @linea, @ajuste, @articulo,
                 @bodega, @bodega_destino, @cantidad, @tipo, @subtipo, @subsubtipo,
                 @costo_total_local, @costo_total_dolar, @precio_total_local, @precio_total_dolar,
                 @localizacion_dest, @centro_costo, @secuencia, @unidad_distribucio, @cuenta_contable,
                 @costo_total_local_comp, @costo_total_dolar_comp, @cai, @tipo_operacion, @tipo_pago, @localizacion)
            `;

            await SqlService.query(
              connection,
              insertarLinea,
              lineaParams,
              columnTypes
            );

            lineasExitosas++;
            logger.debug(
              `Línea ${lineaNumero} insertada correctamente: ${producto.codigo} x ${producto.cantidad}`
            );
          } catch (lineError) {
            lineasFallidas++;
            logger.error(`Error al insertar línea ${lineaNumero}:`, lineError);

            // Intentar un fallback directo sin parámetros si la validación falla
            try {
              const codigoProducto = producto.codigo.replace(/'/g, "''"); // Escapar comillas simples

              const insertarLineaDirecto = `
                INSERT INTO CATELLI.LINEA_DOC_INV
                  (PAQUETE_INVENTARIO, DOCUMENTO_INV, LINEA_DOC_INV, AJUSTE_CONFIG, ARTICULO,
                   BODEGA, BODEGA_DESTINO, CANTIDAD, TIPO, SUBTIPO, SUBSUBTIPO,
                   COSTO_TOTAL_LOCAL, COSTO_TOTAL_DOLAR, PRECIO_TOTAL_LOCAL, PRECIO_TOTAL_DOLAR,
                   LOCALIZACION_DEST, CENTRO_COSTO, SECUENCIA, UNIDAD_DISTRIBUCIO, CUENTA_CONTABLE,
                   COSTO_TOTAL_LOCAL_COMP, COSTO_TOTAL_DOLAR_COMP, CAI, TIPO_OPERACION, TIPO_PAGO, LOCALIZACION)
                VALUES
                  ('CS', '${nuevoConsecutivo}', ${lineaNumero}, '~TT~', '${codigoProducto}',
                   '${bodegaOrigen}', '${bodega_destino}', ${producto.cantidad}, 'T', 'D', '',
                   0, 0, 0, 0,
                   'ND', '00-00-00', '', 'UND', '100-01-05-99-00',
                   0, 0, '', '11', 'ND', 'ND')
              `;

              await SqlService.query(connection, insertarLineaDirecto);

              lineasExitosas++;
              lineasFallidas--; // Corregir el contador porque el intento original falló
              logger.debug(
                `Línea ${lineaNumero} insertada correctamente (modo fallback): ${codigoProducto} x ${producto.cantidad}`
              );
            } catch (fallbackError) {
              logger.error(
                `Fallo también en modo fallback para línea ${lineaNumero}:`,
                fallbackError
              );
            }
          }
        }

        if (lineasExitosas === 0 && productosArray.length > 0) {
          throw new Error(
            "No se pudo insertar ninguna línea de detalle en el documento"
          );
        }

        // 9. Preparar resultado
        const resultado = {
          success: true,
          documento_inv: nuevoConsecutivo,
          totalLineas: productosArray.length,
          lineasExitosas,
          lineasFallidas,
          detalleProductos,
          route,
          bodegaOrigen,
          bodega_destino,
        };
        logger.info("Resultado final:", resultado);

        // Save transfer summary for tracking and returns
        try {
          // Obtener el ID de carga de los datos de ventas si existe (buscando en primera venta)
          let loadIdFromSales = "N/A";
          if (salesData && salesData.length > 0 && salesData[0].Code_load) {
            loadIdFromSales = salesData[0].Code_load;
          }

          // Format products for the summary
          const summaryProducts = productosArray.map((producto) => ({
            code: producto.codigo,
            description:
              detalleProductos.find((p) => p.codigo === producto.codigo)
                ?.descripcion || "Sin descripción",
            quantity: producto.cantidad,
            unit: "UND",
          }));

          // Create a new summary
          const summary = new TransferSummary({
            loadId: loadIdFromSales,
            route: route,
            documentId: nuevoConsecutivo,
            products: summaryProducts,
            totalProducts: summaryProducts.length,
            totalQuantity: summaryProducts.reduce(
              (sum, p) => sum + p.quantity,
              0
            ),
            createdBy: "SA", // Default user or get from request if available
            bodegaOrigen,
            bodega_destino,
          });

          await summary.save();
          logger.info(
            `✅ Resumen de traspaso guardado con éxito para documento ${nuevoConsecutivo}`
          );

          // Add summary to the result
          resultado.summaryId = summary._id;
        } catch (summaryError) {
          logger.error(
            `Error al guardar resumen de traspaso: ${summaryError.message}`
          );
          // Don't stop the process if summary creation fails
        }

        // 10. Generar PDF del traspaso
        try {
          const pdfResult = await PDFService.generateTraspasoPDF(resultado);
          pdfPath = pdfResult.path;
          logger.info(`PDF de traspaso generado: ${pdfPath}`);
        } catch (pdfError) {
          logger.error(
            `Error al generar PDF del traspaso: ${pdfError.message}`
          );
          // Continuamos aunque falle la generación del PDF
        }

        // 11. Enviar correo con el resultado y PDF adjunto
        try {
          await sendTraspasoEmail(resultado, pdfPath);
          logger.info(
            `Correo de notificación enviado para el traspaso: ${
              resultado.documento_inv || "N/A"
            }`
          );
        } catch (errorCorreo) {
          logger.error(
            `Error al enviar correo de traspaso: ${errorCorreo.message}`
          );
        }

        return resultado;
      } catch (dbError) {
        // Manejo de errores específicos de base de datos
        logger.error(
          `Error en operaciones de base de datos durante traspaso: ${dbError.message}`
        );
        throw dbError;
      }
    });
  } catch (error) {
    logger.error("Error en realizarTraspaso:", error);

    // Preparar resultado de error
    const resultadoError = {
      success: false,
      mensaje: error.message,
      errorDetail: error.stack,
      totalLineas: detalleProductos.length,
      lineasExitosas: 0,
      lineasFallidas: detalleProductos.length,
      detalleProductos,
      route,
      bodegaOrigen: bodegaOrigen || "01",
      bodegaDebodega_destinotino,
    };

    // Intentar generar PDF del error
    try {
      const pdfResult = await PDFService.generateTraspasoPDF(resultadoError);
      pdfPath = pdfResult.path;
      logger.info(`PDF de error de traspaso generado: ${pdfPath}`);
    } catch (pdfError) {
      logger.error(`Error al generar PDF del error: ${pdfError.message}`);
    }

    // Intentar enviar correo de error con PDF
    try {
      await sendTraspasoEmail(resultadoError, pdfPath);
      logger.info(`Correo de error enviado para el traspaso fallido`);
    } catch (errorCorreo) {
      logger.error(`Error al enviar correo de error: ${errorCorreo.message}`);
    }

    // Limpiar archivo PDF temporal después de un tiempo
    try {
      if (pdfPath) {
        setTimeout(async () => {
          await PDFService.cleanupTempFile(pdfPath);
        }, 60000); // Eliminar después de 1 minuto
      }
    } catch (cleanupError) {
      logger.warn(
        `Error al programar limpieza de PDF temporal: ${cleanupError.message}`
      );
    }

    throw error;
  }
}

module.exports = { traspasoBodega, realizarTraspaso };
