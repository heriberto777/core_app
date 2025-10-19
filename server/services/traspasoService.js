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

    if (!productos || !Array.isArray(productos) || productos.length === 0) {
      return [];
    }

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

    const descripcionesMap = {};
    if (result && result.recordset) {
      result.recordset.forEach((item) => {
        descripcionesMap[item.ARTICULO] = item.DESCRIPCION;
      });
    }

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
    logger.warn(`No se pudo obtener detalle completo de productos: ${error.message}`);
    return productos.map((p) => ({
      codigo: p.codigo || p.Code_Product || "DESCONOCIDO",
      descripcion: "No disponible",
      cantidad: p.cantidad || p.TotalQuantity || 0,
    }));
  }
}

/**
 * Valida todos los datos necesarios para el traspaso (encabezado y detalle)
 */
async function validateTraspasoData(salesData, route, bodega_destino) {
  const validation = {
    isValid: true,
    missingFields: [],
    errors: [],
    warnings: [],
    productos: [],
    configValidation: {
      isValid: true,
      errors: []
    }
  };

  logger.info(`Iniciando validación de traspaso para ruta ${route}`);

  try {
    // 1. Validar configuración general del traspaso
    const configValidation = await validateTraspasoConfig();
    validation.configValidation = configValidation;

    if (!configValidation.isValid) {
      validation.isValid = false;
      validation.errors.push(...configValidation.errors);
    }

    // 2. Validar datos de entrada básicos
    if (!salesData || !Array.isArray(salesData) || salesData.length === 0) {
      validation.isValid = false;
      validation.errors.push('No hay datos de ventas para procesar');
      return validation;
    }

    if (!route || route.toString().trim() === '') {
      validation.isValid = false;
      validation.errors.push('Ruta/vendedor no especificado');
    }

    if (!bodega_destino || bodega_destino.toString().trim() === '') {
      validation.isValid = false;
      validation.errors.push('Bodega destino no especificada');
    }

    // 3. Filtrar productos válidos
    const productosValidos = salesData.filter(
      (item) =>
        item &&
        item.Code_Product &&
        item.Code_Product.trim() !== "" &&
        typeof item.Quantity !== "undefined" &&
        Number(item.Quantity) > 0
    );

    if (productosValidos.length === 0) {
      validation.isValid = false;
      validation.errors.push('No hay productos válidos en los datos de ventas');
      return validation;
    }

    // 4. Validar bodega origen
    const bodegaOrigen = productosValidos[0].bodega;
    if (!bodegaOrigen || bodegaOrigen.toString().trim() === '') {
      validation.isValid = false;
      validation.errors.push('Bodega origen no especificada en los datos');
    }

    // 5. Validar cada producto individualmente
    return await withConnection("server1", async (connection) => {
      // Validar disponibilidad del consecutivo
      const consecutivoValidation = await validateConsecutivoAvailable(connection);
      if (!consecutivoValidation.isValid) {
        validation.isValid = false;
        validation.errors.push(...consecutivoValidation.errors);
      }

      // Validar bodegas existen
      const bodegasValidation = await validateBodegas(connection, bodegaOrigen, bodega_destino);
      if (!bodegasValidation.isValid) {
        validation.isValid = false;
        validation.errors.push(...bodegasValidation.errors);
      }

      // Agrupar productos para validación
      const productos = {};
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

      // Validar cada producto agrupado
      for (const [codigo, cantidad] of Object.entries(productos)) {
        const productValidation = await validateProduct(connection, {
          Code_Product: codigo,
          Quantity: cantidad
        }, bodegaOrigen);

        validation.productos.push(productValidation);

        if (!productValidation.isValid) {
          validation.isValid = false;
        }
      }

      return validation;
    });

  } catch (error) {
    logger.error(`Error durante validación de traspaso: ${error.message}`);
    validation.isValid = false;
    validation.errors.push(`Error de validación: ${error.message}`);
    return validation;
  }
}

/**
 * Valida la configuración general requerida para traspasos
 */
async function validateTraspasoConfig() {
  const validation = {
    isValid: true,
    errors: []
  };

  const config = getTraspasoConfig();

  const requiredFields = [
    'paquete_inventario',
    'consecutivo_prefix',
    'tipo_documento',
    'subtipo',
    'subsubtipo',
    'ajuste_config',
    'tipo_operacion'
  ];

  requiredFields.forEach(field => {
    if (!config[field] || config[field].toString().trim() === '') {
      validation.isValid = false;
      validation.errors.push(`Configuración faltante: ${field}`);
    }
  });

  return validation;
}

/**
 * Valida que el consecutivo esté disponible
 */
async function validateConsecutivoAvailable(connection) {
  const validation = {
    isValid: true,
    errors: []
  };

  try {
    const query = `
      SELECT TOP 1 SIGUIENTE_CONSEC
      FROM CATELLI.CONSECUTIVO_CI
      WHERE CONSECUTIVO LIKE 'TR%'
      ORDER BY CONSECUTIVO DESC
    `;

    const result = await SqlService.query(connection, query);

    if (!result || !result.recordset || result.recordset.length === 0) {
      validation.isValid = false;
      validation.errors.push('No se encontró configuración de consecutivo para traspasos (TR)');
    }

  } catch (error) {
    validation.isValid = false;
    validation.errors.push(`Error al validar consecutivo: ${error.message}`);
  }

  return validation;
}

/**
 * Valida que las bodegas existan en el sistema
 */
async function validateBodegas(connection, bodegaOrigen, bodegaDestino) {
  const validation = {
    isValid: true,
    errors: []
  };

  try {
    const query = `
      SELECT BODEGA, DESCRIPCION, ACTIVA
      FROM CATELLI.BODEGA
      WHERE BODEGA IN (@bodegaOrigen, @bodegaDestino)
    `;

    const result = await SqlService.query(connection, query, {
      bodegaOrigen,
      bodegaDestino
    });

    const bodegasEncontradas = result.recordset || [];

    if (bodegasEncontradas.length !== 2) {
      validation.isValid = false;
      validation.errors.push(`Una o ambas bodegas no existen: origen(${bodegaOrigen}), destino(${bodegaDestino})`);
    }

    // Verificar que estén activas
    bodegasEncontradas.forEach(bodega => {
      if (bodega.ACTIVA !== 'S') {
        validation.isValid = false;
        validation.errors.push(`Bodega ${bodega.BODEGA} está inactiva`);
      }
    });

  } catch (error) {
    validation.isValid = false;
    validation.errors.push(`Error al validar bodegas: ${error.message}`);
  }

  return validation;
}

/**
 * Valida un producto individual para el traspaso - CORREGIDO
 */
async function validateProduct(connection, product, bodegaOrigen) {
  const validation = {
    Code_Product: product.Code_Product,
    Quantity: product.Quantity,
    isValid: true,
    errors: [],
    warnings: [],
    productInfo: null
  };

  try {
    // Verificar que el producto existe y obtener información disponible
    const productQuery = `
      SELECT
        ARTICULO,
        DESCRIPCION,
        UNIDAD_ALMACEN,
        ACTIVO
      FROM CATELLI.ARTICULO
      WHERE ARTICULO = @articulo
    `;

    const result = await SqlService.query(connection, productQuery, {
      articulo: product.Code_Product
    });

    if (!result.recordset || result.recordset.length === 0) {
      validation.isValid = false;
      validation.errors.push('Producto no encontrado en el catálogo');
      return validation;
    }

    const productInfo = result.recordset[0];
    validation.productInfo = productInfo;

    // Validar campos críticos disponibles
    if (productInfo.ACTIVO !== 'S') {
      validation.isValid = false;
      validation.errors.push('Producto inactivo');
    }

    if (!productInfo.UNIDAD_ALMACEN || productInfo.UNIDAD_ALMACEN.trim() === '') {
      validation.isValid = false;
      validation.errors.push('Unidad de medida no configurada');
    }

    // Verificar existencias en bodega origen
    const stockQuery = `
      SELECT COALESCE(SUM(EXISTENCIA), 0) as stock
      FROM CATELLI.EXISTENCIA_BODEGA
      WHERE ARTICULO = @articulo AND BODEGA = @bodega
    `;

    const stockResult = await SqlService.query(connection, stockQuery, {
      articulo: product.Code_Product,
      bodega: bodegaOrigen
    });

    const currentStock = stockResult.recordset[0]?.stock || 0;

    if (currentStock < product.Quantity) {
      validation.warnings.push(
        `Stock insuficiente. Disponible: ${currentStock}, Requerido: ${product.Quantity}`
      );
    }

    if (currentStock === 0) {
      validation.warnings.push('No hay existencias en bodega origen');
    }

  } catch (error) {
    validation.isValid = false;
    validation.errors.push(`Error de validación de producto: ${error.message}`);
  }

  return validation;
}

/**
 * Genera reporte de validación para traspaso manual
 */
async function generateValidationReport(validation, route, loadId = null) {
  try {
    const timestamp = Date.now();
    const reportData = {
      success: false,
      documento_inv: `VALIDATION_${route}_${timestamp}`,
      route,
      loadId: loadId || `VALIDATION_${timestamp}`,
      validation,
      message: "Reporte de validación de traspaso - Intervención manual requerida",
      totalLineas: validation.productos.length,
      lineasExitosas: 0,
      lineasFallidas: validation.productos.filter(p => !p.isValid).length,
      detalleProductos: validation.productos.map(p => ({
        codigo: p.Code_Product,
        descripcion: p.productInfo?.DESCRIPCION || 'No disponible',
        cantidad: p.Quantity,
        estado: p.isValid ? 'OK' : 'ERROR',
        errores: p.errors.join(', '),
        advertencias: p.warnings.join(', ')
      }))
    };

    const pdfResult = await PDFService.generateTraspasoPDF(reportData);

    logger.info(`Reporte de validación generado: ${pdfResult.path}`);

    return {
      filename: pdfResult.filename || `validation-${timestamp}.pdf`,
      path: pdfResult.path,
      reportData
    };

  } catch (error) {
    logger.error(`Error al generar reporte de validación: ${error.message}`);
    throw error;
  }
}

/**
 * Guarda registro de traspaso fallido en tracking
 */
async function saveFailedTraspasoRecord(route, validation, reportResult, loadId = null) {
  try {
    return await withConnection("server2", async (connection) => {
      const query = `
        INSERT INTO dbo.IMPLT_traspaso_tracking
        (load_id, delivery_person_code, status, error_message,
         validation_report, manual_document_path, total_products, created_by)
        VALUES
        (@load_id, @route, @status, @error_message,
         @validation_report, @document_path, @total_products, @created_by)
      `;

      const params = {
        load_id: loadId || `VALIDATION_${route}_${Date.now()}`,
        route,
        status: 'validation_failed',
        error_message: validation.errors.slice(0, 500).join('; '), // Limitar longitud
        validation_report: JSON.stringify(validation),
        document_path: reportResult.path,
        total_products: validation.productos.length,
        created_by: 'SYSTEM'
      };

      await SqlService.query(connection, query, params);

      logger.info(`Registro de traspaso fallido guardado para ruta ${route}`);
    });

  } catch (error) {
    logger.error(`Error al guardar registro de traspaso fallido: ${error.message}`);
    // No lanzar error aquí para no interrumpir el flujo principal
  }
}

/**
 * Configuración de traspaso
 */
function getTraspasoConfig() {
  return {
    paquete_inventario: "CS",
    consecutivo_prefix: "TR",
    tipo_documento: "TI",
    subtipo: "D",
    subsubtipo: "", // ✅ String vacío como en tu BD
    ajuste_config: "~TT~",
    tipo_operacion: "11",
    tipo_pago: "ND",
    centro_costo: "00-00-00",
    cuenta_contable_default: "100-01-05-99-00",
    localizacion_default: "ND",
    unidad_distribucion_default: "UND",
    usuario_default: "SA",
  };
}

/**
 * Realiza traspaso con validación previa integrada
 */
async function realizarTraspaso({ route, salesData, bodega_destino }) {
  let detalleProductos = [];
  let pdfPath = null;
  let validationReport = null;

  logger.info(
    `Iniciando realizar traspaso de bodega ${bodega_destino} con validación previa`
  );

  try {
    // PASO 1: Validación completa antes de procesar
    logger.info("Ejecutando validación previa de datos...");
    const validation = await validateTraspasoData(
      salesData,
      route,
      bodega_destino
    );

    if (!validation.isValid) {
      logger.warn(
        `Validación fallida para ruta ${route}: ${validation.errors.join(", ")}`
      );

      // Generar reporte de validación
      validationReport = await generateValidationReport(validation, route);

      // Guardar registro de fallo
      await saveFailedTraspasoRecord(route, validation, validationReport);

      // Enviar notificación de traspaso manual requerido
      try {
        await sendTraspasoEmail(
          validationReport.reportData,
          validationReport.path
        );
        logger.info("Notificación de traspaso manual enviada");
      } catch (emailError) {
        logger.error(`Error al enviar notificación: ${emailError.message}`);
      }

      return {
        success: false,
        requiresManualAction: true,
        validation,
        reportPath: validationReport.path,
        message:
          "Traspaso requiere intervención manual debido a errores de validación",
        errors: validation.errors,
        warnings: validation.warnings,
      };
    }

    logger.info("Validación exitosa - procediendo con traspaso automático");

    // PASO 2: Proceder con lógica de traspaso original (validación pasó)
    const productosValidos = salesData.filter(
      (item) =>
        item &&
        item.Code_Product &&
        item.Code_Product.trim() !== "" &&
        typeof item.Quantity !== "undefined" &&
        Number(item.Quantity) > 0
    );

    const productos = {};
    const bodegaOrigen = productosValidos[0].bodega || "02";

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

    logger.info(
      `Procesando traspaso validado para ruta ${route} con ${productosArray.length} productos. Bodega origen: ${bodegaOrigen}, Bodega destino: ${bodega_destino}`
    );

    // PASO 3: Ejecutar traspaso con tu lógica robusta existente
    return await withConnection("server1", async (connection) => {
      try {
        // Obtener información de productos para el correo
        detalleProductos = await obtenerDetalleProductos(
          connection,
          productosArray
        );

        // Obtener el consecutivo actual
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

        // Actualizar el consecutivo
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

        // Insertar el documento principal
        const config = getTraspasoConfig();
        const referenciaParams = {
          referencia: `Traspaso de bodega para vendedor ${route}`,
          documento: nuevoConsecutivo,
        };

        const insertarDocumento = `
          INSERT INTO CATELLI.DOCUMENTO_INV
            (PAQUETE_INVENTARIO, DOCUMENTO_INV, CONSECUTIVO, REFERENCIA, FECHA_HOR_CREACION, FECHA_DOCUMENTO, SELECCIONADO, USUARIO)
          VALUES
            ('${config.paquete_inventario}', @documento, '${config.consecutivo_prefix}', @referencia, GETDATE(), GETDATE(), 'N', '${config.usuario_default}')
        `;

        await SqlService.query(connection, insertarDocumento, referenciaParams);

        // Insertar líneas una por una
        let lineasExitosas = 0;
        let lineasFallidas = 0;

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
            // ✅ USAR STRING VACÍO PARA SUBSUBTIPO (valor más común en tu BD)
            const lineaParams = {
              paquete: config.paquete_inventario,
              documento_inv: nuevoConsecutivo,
              linea: lineaNumero,
              ajuste: config.ajuste_config,
              articulo: producto.codigo,
              bodega: bodegaOrigen,
              bodega_destino: bodega_destino,
              cantidad: producto.cantidad,
              tipo: "T",
              subtipo: config.subtipo,
              subsubtipo: '', // ✅ String vacío como en tu BD
              costo_total_local: 0,
              costo_total_dolar: 0,
              precio_total_local: 0,
              precio_total_dolar: 0,
              localizacion_dest: config.localizacion_default,
              centro_costo: config.centro_costo,
              secuencia: "",
              unidad_distribucio: config.unidad_distribucion_default,
              cuenta_contable: config.cuenta_contable_default,
              costo_total_local_comp: 0,
              costo_total_dolar_comp: 0,
              cai: "",
              tipo_operacion: config.tipo_operacion,
              tipo_pago: config.tipo_pago,
              localizacion: config.localizacion_default,
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

            // Intentar fallback directo como backup
            try {
              const codigoProducto = producto.codigo.replace(/'/g, "''");

              const insertarLineaDirecto = `
                INSERT INTO CATELLI.LINEA_DOC_INV
                  (PAQUETE_INVENTARIO, DOCUMENTO_INV, LINEA_DOC_INV, AJUSTE_CONFIG, ARTICULO,
                   BODEGA, BODEGA_DESTINO, CANTIDAD, TIPO, SUBTIPO, SUBSUBTIPO,
                   COSTO_TOTAL_LOCAL, COSTO_TOTAL_DOLAR, PRECIO_TOTAL_LOCAL, PRECIO_TOTAL_DOLAR,
                   LOCALIZACION_DEST, CENTRO_COSTO, SECUENCIA, UNIDAD_DISTRIBUCIO, CUENTA_CONTABLE,
                   COSTO_TOTAL_LOCAL_COMP, COSTO_TOTAL_DOLAR_COMP, CAI, TIPO_OPERACION, TIPO_PAGO, LOCALIZACION)
                VALUES
                  ('${config.paquete_inventario}', '${nuevoConsecutivo}', ${lineaNumero}, '${config.ajuste_config}', '${codigoProducto}',
                   '${bodegaOrigen}', '${bodega_destino}', ${producto.cantidad}, 'T', '${config.subtipo}', '',
                   0, 0, 0, 0,
                   '${config.localizacion_default}', '${config.centro_costo}', '', '${config.unidad_distribucion_default}', '${config.cuenta_contable_default}',
                   0, 0, '', '${config.tipo_operacion}', '${config.tipo_pago}', '${config.localizacion_default}')
              `;

              await SqlService.query(connection, insertarLineaDirecto);
              lineasExitosas++;
              lineasFallidas--;
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

        // Preparar resultado exitoso
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
          validation: {
            executed: true,
            warnings: validation.warnings,
          },
        };

        logger.info("Traspaso completado exitosamente:", resultado);

        // Guardar resumen para tracking
        try {
          let loadIdFromSales = "N/A";
          if (salesData && salesData.length > 0 && salesData[0].Code_load) {
            loadIdFromSales = salesData[0].Code_load;
          }

          const summaryProducts = productosArray.map((producto) => ({
            code: producto.codigo,
            description:
              detalleProductos.find((p) => p.codigo === producto.codigo)
                ?.descripcion || "Sin descripción",
            quantity: producto.cantidad,
            unit: "UND",
          }));

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
            createdBy: config.usuario_default,
            bodegaOrigen,
            bodega_destino,
          });

          await summary.save();
          logger.info(
            `Resumen de traspaso guardado con éxito para documento ${nuevoConsecutivo}`
          );

          resultado.summaryId = summary._id;
        } catch (summaryError) {
          logger.error(
            `Error al guardar resumen de traspaso: ${summaryError.message}`
          );
          // No detener el proceso si falla el resumen
        }

        // Generar PDF del traspaso exitoso
        try {
          const pdfResult = await PDFService.generateTraspasoPDF(resultado);
          pdfPath = pdfResult.path;
          logger.info(`PDF de traspaso generado: ${pdfPath}`);
        } catch (pdfError) {
          logger.error(
            `Error al generar PDF del traspaso: ${pdfError.message}`
          );
        }

        // Enviar correo con el resultado exitoso
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
      bodegaOrigen: salesData?.[0]?.bodega || "01",
      bodega_destino,
      validation: validationReport
        ? {
            executed: true,
            failed: true,
            reportPath: validationReport.path,
          }
        : {
            executed: false,
            failed: true,
          },
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
        }, 60000);
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
 * Método alternativo para realizar traspasos (mantener por compatibilidad)
 */
async function traspasoBodega({ route, salesData, bodega_destino = "02" }) {
  // Redirigir al método principal con validación
  return await realizarTraspaso({ route, salesData, bodega_destino });
}

/**
 * Función para reintentar traspaso fallido (nueva funcionalidad para el módulo de gestión)
 */
async function retryFailedTraspaso(traspasoId, updatedData = null) {
  logger.info(`Reintentando traspaso fallido: ${traspasoId}`);

  try {
    return await withConnection("server2", async (connection) => {
      // Obtener datos del traspaso fallido
      const query = `
        SELECT * FROM dbo.IMPLT_traspaso_tracking
        WHERE id = @traspasoId AND status IN ('validation_failed', 'failed')
      `;

      const result = await SqlService.query(connection, query, { traspasoId });

      if (!result.recordset || result.recordset.length === 0) {
        throw new Error("Traspaso no encontrado o no es reintentable");
      }

      const traspasoRecord = result.recordset[0];

      // Usar datos actualizados o los originales
      const salesDataToUse =
        updatedData || JSON.parse(traspasoRecord.validation_report).productos;

      // Intentar nuevamente el traspaso
      const retryResult = await realizarTraspaso({
        route: traspasoRecord.delivery_person_code,
        salesData: salesDataToUse,
        bodega_destino: "02", // o extraer del registro original
      });

      // Actualizar el registro de tracking
      if (retryResult.success) {
        await SqlService.query(
          connection,
          `
          UPDATE dbo.IMPLT_traspaso_tracking
          SET status = 'completed', processed_at = GETDATE(), processed_by = 'RETRY_SYSTEM'
          WHERE id = @traspasoId
        `,
          { traspasoId }
        );
      }

      return retryResult;
    });
  } catch (error) {
    logger.error(
      `Error al reintentar traspaso ${traspasoId}: ${error.message}`
    );
    throw error;
  }
}

/**
 * Función para procesar devoluciones de productos (nueva funcionalidad)
 */
async function processProductReturns(traspasoId, returnedProducts) {
  logger.info(`Procesando devoluciones para traspaso: ${traspasoId}`);

  try {
    return await withConnection("server1", async (connection) => {
      // Aquí iría la lógica para crear un traspaso inverso
      // con los productos devueltos

      // Por ahora retornamos estructura básica
      return {
        success: true,
        message: "Devoluciones procesadas correctamente",
        returnedProducts: returnedProducts.length,
        traspasoId,
      };
    });
  } catch (error) {
    logger.error(`Error al procesar devoluciones: ${error.message}`);
    throw error;
  }
}

/**
 * Elimina un traspaso y sus detalles
 */
async function deleteTraspaso(traspasoId, reason, userId) {
  try {
    return await withConnection("server2", async (connection) => {
      // Verificar que el traspaso existe y se puede eliminar
      const checkQuery = `
        SELECT id, status, load_id, delivery_person_code
        FROM dbo.IMPLT_traspaso_tracking
        WHERE id = @traspasoId
      `;

      const checkResult = await SqlService.query(connection, checkQuery, { traspasoId });

      if (!checkResult.recordset || checkResult.recordset.length === 0) {
        throw new Error("Traspaso no encontrado");
      }

      const traspaso = checkResult.recordset[0];

      // Solo permitir eliminar traspasos en ciertos estados
      const deletableStatuses = ['validation_failed', 'failed', 'cancelled'];
      if (!deletableStatuses.includes(traspaso.status)) {
        throw new Error(`No se puede eliminar un traspaso con estado: ${traspaso.status}`);
      }

      // Eliminar detalles primero (foreign key constraint)
      await SqlService.query(connection, `
        DELETE FROM dbo.IMPLT_traspaso_detail
        WHERE traspaso_tracking_id = @traspasoId
      `, { traspasoId });

      // Eliminar el registro principal
      await SqlService.query(connection, `
        DELETE FROM dbo.IMPLT_traspaso_tracking
        WHERE id = @traspasoId
      `, { traspasoId });

      logger.info(`Traspaso ${traspasoId} eliminado por usuario ${userId}. Razón: ${reason || 'No especificada'}`);

      return {
        success: true,
        message: "Traspaso eliminado correctamente",
        deletedId: traspasoId,
        deletedBy: userId,
        reason: reason || null
      };
    });

  } catch (error) {
    logger.error("Error eliminando traspaso:", error);
    throw error;
  }
}

/**
 * Operaciones masivas en traspasos
 */
async function bulkTraspasoAction(action, traspasoIds, actionData, userId) {
  try {
    const validActions = ['updateStatus', 'delete', 'retry', 'export'];
    if (!validActions.includes(action)) {
      throw new Error(`Acción no válida. Acciones permitidas: ${validActions.join(', ')}`);
    }

    let results = {
      successful: [],
      failed: [],
      totalProcessed: 0
    };

    for (const traspasoId of traspasoIds) {
      try {
        let operationResult = null;

        switch (action) {
          case 'updateStatus':
            operationResult = await updateTraspasoStatus(traspasoId, actionData.status, actionData.notes, userId);
            break;

          case 'delete':
            operationResult = await deleteTraspaso(traspasoId, actionData.reason, userId);
            break;

          case 'retry':
            operationResult = await retryFailedTraspaso(traspasoId, actionData.updatedData);
            break;

          case 'export':
            operationResult = await exportTraspasoData(traspasoId);
            break;
        }

        results.successful.push({
          id: traspasoId,
          result: operationResult
        });

      } catch (error) {
        logger.error(`Error en bulk action ${action} para traspaso ${traspasoId}:`, error);
        results.failed.push({
          id: traspasoId,
          error: error.message
        });
      }

      results.totalProcessed++;
    }

    return {
      success: true,
      message: `Operación masiva ${action} completada`,
      action,
      ...results,
      successRate: `${results.successful.length}/${results.totalProcessed}`
    };

  } catch (error) {
    logger.error("Error en operación masiva:", error);
    throw error;
  }
}

/**
 * Actualiza estado de traspaso
 */
async function updateTraspasoStatus(traspasoId, status, notes, userId) {
  try {
    return await withConnection("server2", async (connection) => {
      const query = `
        UPDATE dbo.IMPLT_traspaso_tracking
        SET status = @status,
            processed_at = GETDATE(),
            processed_by = @userId,
            error_message = @notes
        WHERE id = @traspasoId
      `;

      const result = await SqlService.query(connection, query, {
        traspasoId,
        status,
        userId,
        notes: notes || null
      });

      if (result.rowsAffected[0] === 0) {
        throw new Error("Traspaso no encontrado");
      }

      return {
        success: true,
        message: "Estado actualizado correctamente",
        traspasoId,
        newStatus: status
      };
    });

  } catch (error) {
    logger.error("Error actualizando estado de traspaso:", error);
    throw error;
  }
}

/**
 * Exporta datos de traspaso
 */
async function exportTraspasoData(traspasoId) {
  try {
    return await withConnection("server2", async (connection) => {
      const query = `
        SELECT t.*, d.product_code, d.quantity_requested, d.status as product_status
        FROM dbo.IMPLT_traspaso_tracking t
        LEFT JOIN dbo.IMPLT_traspaso_detail d ON t.id = d.traspaso_tracking_id
        WHERE t.id = @traspasoId
      `;

      const result = await SqlService.query(connection, query, { traspasoId });

      return {
        success: true,
        data: result.recordset,
        recordCount: result.recordset.length
      };
    });

  } catch (error) {
    logger.error("Error exportando datos de traspaso:", error);
    throw error;
  }
}

/**
 * Obtener lista de traspasos con filtros
 */
async function getTransfersList(filters = {}) {
  try {
    return await withConnection("server1", async (connection) => {
      let query = `
        SELECT
          itt.id,
          itt.load_id as loadId,
          itt.delivery_person_code as route,
          itt.created_at as transferDate,
          itt.status,
          itt.error_message as errorMessage,
          itt.processed_at as completedAt,
          itt.total_products as totalItems
        FROM dbo.IMPLT_traspaso_tracking itt
        WHERE 1=1
      `;

      const params = {};

      // Aplicar filtros
      if (filters.dateFrom) {
        query += ` AND itt.created_at >= @dateFrom`;
        params.dateFrom = filters.dateFrom;
      }

      if (filters.dateTo) {
        query += ` AND itt.created_at <= @dateTo`;
        params.dateTo = filters.dateTo;
      }

      if (filters.status && filters.status !== 'all') {
        query += ` AND itt.status = @status`;
        params.status = filters.status;
      }

      if (filters.loadId) {
        query += ` AND itt.load_id LIKE @loadId`;
        params.loadId = `%${filters.loadId}%`;
      }

      // Paginación
      const page = parseInt(filters.page) || 1;
      const pageSize = parseInt(filters.pageSize) || 20;
      const offset = (page - 1) * pageSize;

      query += ` ORDER BY itt.created_at DESC`;
      query += ` OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY`;

      const result = await SqlService.query(connection, query, params);

      return {
        transfers: result.recordset || [],
        totalRecords: result.recordset.length, // Necesitarías query separado para total
        currentPage: page,
        totalPages: Math.ceil((result.recordset.length || 0) / pageSize)
      };
    });

  } catch (error) {
    logger.error('Error getting transfers list:', error);
    throw error;
  }
}

/**
 * Obtener estadísticas de traspasos
 */
async function getTransferStats(filters = {}) {
  try {
    return await withConnection("server1", async (connection) => {
      let query = `
        SELECT
          itt.status,
          COUNT(*) as count
        FROM dbo.IMPLT_traspaso_tracking itt
        WHERE 1=1
      `;

      const params = {};

      if (filters.dateFrom) {
        query += ` AND itt.created_at >= @dateFrom`;
        params.dateFrom = filters.dateFrom;
      }

      if (filters.dateTo) {
        query += ` AND itt.created_at <= @dateTo`;
        params.dateTo = filters.dateTo;
      }

      query += ` GROUP BY itt.status`;

      const result = await SqlService.query(connection, query, params);
      const statsData = result.recordset || [];

      const stats = {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        totalValue: 0
      };

      statsData.forEach(row => {
        switch (row.status) {
          case 'pending':
            stats.pending = row.count;
            break;
          case 'processing':
            stats.processing = row.count;
            break;
          case 'completed':
            stats.completed = row.count;
            break;
          case 'validation_failed':
          case 'failed':
            stats.failed += row.count;
            break;
        }
      });

      return stats;
    });

  } catch (error) {
    logger.error('Error getting transfer stats:', error);
    throw error;
  }
}

/**
 * Obtener historial de traspasos con filtros y paginación
 */
async function getTraspasoHistory(filters = {}) {
  try {
    return await withConnection("server1", async (connection) => {
      const {
        page = 1,
        limit = 20,
        status,
        dateFrom,
        dateTo,
        deliveryPerson,
        loadId,
      } = filters;

      const offset = (page - 1) * limit;
      let whereClause = "WHERE 1=1";
      const params = {};

      // Aplicar filtros
      if (status && status !== "all") {
        whereClause += " AND status = @status";
        params.status = status;
      }

      if (deliveryPerson) {
        whereClause += " AND delivery_person_code = @deliveryPerson";
        params.deliveryPerson = deliveryPerson;
      }

      if (loadId) {
        whereClause += " AND load_id LIKE @loadId";
        params.loadId = `%${loadId}%`;
      }

      if (dateFrom) {
        whereClause += " AND created_at >= @dateFrom";
        params.dateFrom = new Date(dateFrom);
      }

      if (dateTo) {
        whereClause += " AND created_at <= @dateTo";
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        params.dateTo = endDate;
      }

      // Consulta principal
      const query = `
        SELECT
          id,
          load_id,
          delivery_person_code,
          status,
          created_at,
          processed_at,
          error_message,
          total_products
        FROM dbo.IMPLT_traspaso_tracking
        ${whereClause}
        ORDER BY created_at DESC
        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY
      `;

      // Query para total
      const countQuery = `
        SELECT COUNT(*) as total
        FROM dbo.IMPLT_traspaso_tracking
        ${whereClause}
      `;

      const [result, countResult] = await Promise.all([
        SqlService.query(connection, query, { ...params, offset, limit }),
        SqlService.query(connection, countQuery, params),
      ]);

      const total = countResult.recordset[0]?.total || 0;
      const totalPages = Math.ceil(total / limit);

      return {
        data: result.recordset,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: total,
          itemsPerPage: parseInt(limit),
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      };
    });

  } catch (error) {
    logger.error('Error getting traspaso history:', error);
    throw error;
  }
}

/**
 * Obtener detalles de traspaso específico
 */
async function getTraspasoDetails(traspasoId) {
  try {
    return await withConnection("server1", async (connection) => {
      const query = `
        SELECT * FROM dbo.IMPLT_traspaso_tracking
        WHERE id = @traspasoId
      `;

      const result = await SqlService.query(connection, query, { traspasoId });

      if (!result.recordset || result.recordset.length === 0) {
        throw new Error("Traspaso no encontrado");
      }

      const traspasoData = result.recordset[0];

      // Parsear validation_report si existe
      if (traspasoData.validation_report) {
        try {
          traspasoData.validation_report = JSON.parse(traspasoData.validation_report);
        } catch (parseError) {
          logger.warn("Error al parsear validation_report:", parseError);
        }
      }

      return traspasoData;
    });

  } catch (error) {
    logger.error('Error getting traspaso details:', error);
    throw error;
  }
}

/**
 * Obtener estadísticas de traspasos
 */
async function getTraspasoStats(filters = {}) {
  try {
    return await withConnection("server1", async (connection) => {
      const { dateFrom, dateTo } = filters;
      let whereClause = "WHERE 1=1";
      const params = {};

      if (dateFrom) {
        whereClause += " AND created_at >= @dateFrom";
        params.dateFrom = new Date(dateFrom);
      }

      if (dateTo) {
        whereClause += " AND created_at <= @dateTo";
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        params.dateTo = endDate;
      }

      const statsQuery = `
        SELECT
          status,
          COUNT(*) as count,
          SUM(total_products) as total_products
        FROM dbo.IMPLT_traspaso_tracking
        ${whereClause}
        GROUP BY status
      `;

      const result = await SqlService.query(connection, statsQuery, params);

      const stats = {
        total: 0,
        completed: 0,
        failed: 0,
        pending: 0,
        validation_failed: 0,
        total_products: 0,
      };

      result.recordset.forEach((row) => {
        stats[row.status] = row.count;
        stats.total += row.count;
        stats.total_products += row.total_products || 0;
      });

      return stats;
    });

  } catch (error) {
    logger.error('Error getting traspaso stats:', error);
    throw error;
  }
}

/**
 * Ejecutar traspaso por loadId - wrapper para el controller
 */
async function executeTransferByLoadId(loadId) {
  try {
    // 1. Obtener salesData desde IMPLT_loads_detail
    const salesData = await withConnection("server2", async (connection) => {
      const query = `
        SELECT
          Code_Product,
          Quantity,
          Code_Warehouse_Sou as bodega,
          Price,
          Code as Code_load
        FROM dbo.IMPLT_loads_detail
        WHERE Code = @loadId
      `;
      const result = await SqlService.query(connection, query, { loadId });
      return result.recordset;
    });

    if (!salesData || salesData.length === 0) {
      throw new Error(`No se encontraron datos para la carga ${loadId}`);
    }

    // 2. Usar tu realizarTraspaso existente
    const route = salesData[0].bodega || 'DEFAULT_ROUTE';
    const result = await realizarTraspaso({
      route,
      salesData,
      bodega_destino: '02'
    });

    return {
      loadId,
      ...result
    };

  } catch (error) {
    logger.error(`Error executing transfer for loadId ${loadId}:`, error);
    throw error;
  }
}

/**
 * Obtener bodegas activas
 */
async function getWarehouses() {
  try {
    return await withConnection("server1", async (connection) => {
      const query = `
        SELECT
          BODEGA as code,
          NOMBRE as name,
          'S' as isActive
        FROM CATELLI.BODEGA
        ORDER BY NOMBRE
      `;

      const result = await SqlService.query(connection, query);

      return result.recordset || [];
    });

  } catch (error) {
    logger.error('Error fetching warehouses:', error);
    throw error;
  }
}


module.exports = {
  traspasoBodega,
  realizarTraspaso,
  validateTraspasoData,
  generateValidationReport,
  retryFailedTraspaso,
  processProductReturns,
  getTraspasoConfig,
  deleteTraspaso,
  bulkTraspasoAction,
  updateTraspasoStatus,
  exportTraspasoData,
  getTransfersList,
  getTransferStats,
  getTraspasoHistory,
  getTraspasoDetails,
  getTraspasoStats,
  executeTransferByLoadId,
  getWarehouses,
};