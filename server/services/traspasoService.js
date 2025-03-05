// services/traspasoService-tedious.js
const { connectToDB, closeConnection } = require("./dbService");
const { SqlService } = require("./tediousService");
const logger = require("./logger");
const { sendEmail } = require("./emailService"); // Importamos el servicio de email

/**
 * Envía notificación por correo del resultado del traspaso
 * @param {Object} result - Resultado del traspaso
 * @param {Array} detalleProductos - Detalle de productos traspasados
 * @param {String} route - Ruta o bodega destino
 */
async function enviarCorreoTraspaso(result, detalleProductos, route) {
  try {
    // Preparar datos para el correo
    const emailSubject = result.success
      ? `✅ Traspaso de Bodega Completado: ${result.documento_inv}`
      : `⚠️ Error en Traspaso de Bodega: ${result.documento_inv || "N/A"}`;

    let emailTextBody = `Se ha ejecutado un traspaso de bodega con los siguientes resultados:
      - Estado: ${result.success ? "Éxito" : "Error"}
      - Documento: ${result.documento_inv || "N/A"}
      - Total de líneas: ${result.totalLineas || 0}
      - Líneas exitosas: ${result.lineasExitosas || 0}
      - Líneas fallidas: ${result.lineasFallidas || 0}
      - Ruta/Bodega destino: ${route}
      ${
        result.success
          ? ""
          : `- Error: ${result.errorDetail || "No especificado"}`
      }
    `;

    // Generar HTML para el correo con tabla de productos
    let emailHtmlBody = `
      <h2>Resultado del Traspaso de Bodega</h2>
      <p><strong>Estado:</strong> ${
        result.success ? "✅ Éxito" : "❌ Error"
      }</p>
      <p><strong>Documento:</strong> ${result.documento_inv || "N/A"}</p>
      <p><strong>Total de líneas:</strong> ${result.totalLineas || 0}</p>
      <p><strong>Líneas exitosas:</strong> ${result.lineasExitosas || 0}</p>
      <p><strong>Líneas fallidas:</strong> ${result.lineasFallidas || 0}</p>
      <p><strong>Ruta/Bodega destino:</strong> ${route}</p>
      ${
        !result.success
          ? `<p><strong>Error:</strong> ${
              result.errorDetail || "No especificado"
            }</p>`
          : ""
      }
    `;

    // Agregar tabla de productos si hay registros
    if (detalleProductos && detalleProductos.length > 0) {
      emailHtmlBody += `
        <h3>Detalle de Productos Traspasados</h3>
        <table border="1" cellpadding="5" style="border-collapse: collapse; width: 100%;">
          <tr style="background-color: #f2f2f2;">
            <th>Artículo</th>
            <th>Descripción</th>
            <th style="text-align: right;">Cantidad</th>
          </tr>
      `;

      // Añadir filas para cada producto
      detalleProductos.forEach((producto) => {
        emailHtmlBody += `
          <tr>
            <td>${producto.codigo || ""}</td>
            <td>${producto.descripcion || "N/A"}</td>
            <td style="text-align: right;">${producto.cantidad || 0}</td>
          </tr>
        `;
      });

      emailHtmlBody += `</table>`;
    }

    // Añadir nota final
    emailHtmlBody += `<p>Este traspaso fue ejecutado a las ${new Date().toLocaleString()}.</p>`;

    // Enviar correo con los resultados
    await sendEmail(
      "heriberto777@gmail.com", // Destinatario (podría ser una configuración o parámetro)
      emailSubject,
      emailTextBody,
      emailHtmlBody
    );

    logger.info(
      `📧 Correo de notificación enviado para el traspaso: ${
        result.documento_inv || "N/A"
      }`
    );
    return true;
  } catch (emailError) {
    logger.error(
      `❌ Error al enviar correo de notificación: ${emailError.message}`
    );
    return false;
  }
}

/**
 * Obtiene información adicional de los productos desde la base de datos
 * @param {Connection} connection - Conexión a la base de datos
 * @param {Array} productos - Array de productos con código y cantidad
 * @returns {Promise<Array>} - Array con información completa de los productos
 */
async function obtenerDetalleProductos(connection, productos) {
  try {
    const detalleCompleto = [];

    // Obtener descripciones en un solo query para mejor rendimiento
    const codigos = productos
      .map((p) => `'${p.codigo || p.Code_Product}'`)
      .join(",");

    if (!codigos) {
      return productos.map((p) => ({
        codigo: p.codigo || p.Code_Product,
        descripcion: "Desconocido",
        cantidad: p.cantidad || p.TotalQuantity || 0,
      }));
    }

    const query = `
      SELECT ARTICULO, DESCRIPCION 
      FROM CATELLI.ARTICULO 
      WHERE ARTICULO IN (${codigos})
    `;

    const result = await SqlService.query(connection, query);

    // Crear un mapa para búsqueda rápida
    const descripcionesMap = {};
    result.recordset.forEach((item) => {
      descripcionesMap[item.ARTICULO] = item.DESCRIPCION;
    });

    // Completar la información
    for (const producto of productos) {
      const codigo = producto.codigo || producto.Code_Product;
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
      codigo: p.codigo || p.Code_Product,
      descripcion: "No disponible",
      cantidad: p.cantidad || p.TotalQuantity || 0,
    }));
  }
}

/**
 * Realiza el traspaso de bodega basándose en los datos de ventas.
 * Adaptado para usar Tedious directamente con manejo mejorado de nulos y tipos.
 * Incluye envío de correo con información detallada.
 *
 * @param {Object} params - Objeto con:
 *    - route: (Number) Bodega destino.
 *    - salesData: (Array) Datos de ventas (cada registro debe tener Code_Product y Quantity).
 * @returns {Object} Resultado con la información del documento generado.
 */
async function traspasoBodega({ route, salesData }) {
  let connection = null;
  let detalleProductos = [];

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

    logger.info(`Procesando traspaso con ${aggregatedSales.length} productos`);

    // 2. Conectar a la base de datos
    logger.debug(`Intentando conectar a server1 para traspaso de bodega...`);
    connection = await connectToDB("server1");

    if (!connection) {
      throw new Error("No se pudo establecer una conexión válida con server1");
    }
    logger.info(`Conexión establecida correctamente para traspaso de bodega`);

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
      referencia: `Trapaso de entre bodega del vendedor ${route}`,
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
    const bodega_origen = "01";
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
          bodega: bodega_origen,
          bodegaDestino: "02",
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
    };

    // Enviar correo con el resultado
    await enviarCorreoTraspaso(result, detalleProductos, route);

    return result;
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
    };

    // Intentar enviar correo de error
    try {
      await enviarCorreoTraspaso(errorResult, detalleProductos, route);
    } catch (emailError) {
      logger.error(`Error al enviar correo de error: ${emailError.message}`);
    }

    throw error;
  } finally {
    // Cerrar la conexión en el bloque finally
    try {
      if (connection) {
        await closeConnection(connection);
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

module.exports = { traspasoBodega, enviarCorreoTraspaso };
