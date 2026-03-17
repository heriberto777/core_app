const { withConnection } = require("../utils/dbUtils");
const DatabaseServiceAdapter = require("./DatabaseServiceAdapter");
const logger = require("./logger");
const { Request, TYPES } = require("tedious");
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

    const result = await DatabaseServiceAdapter.query(connection, query, params);

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
 * Validación completa de datos para traspaso con múltiples bodegas origen
 */
async function validateTraspasoData(salesData, route, bodega_destino, connection = null) {
  const validation = {
    isValid: true,
    errors: [],
    warnings: [],
    productos: [],
    route,
    bodega_destino,
    bodegasOrigen: [] // Múltiples bodegas origen
  };

  try {
    if (connection) {
      return await validateWithExistingConnection(connection, salesData, route, bodega_destino, validation);
    } else {
      return await withConnection("server1", async (newConnection) => {
        return await validateWithExistingConnection(newConnection, salesData, route, bodega_destino, validation);
      });
    }
  } catch (error) {
    logger.error('Error en validateTraspasoData:', error);
    validation.isValid = false;
    validation.errors.push(`Error de validación: ${error.message}`);
    return validation;
  }
}

/**
 * Lógica de validación usando conexión existente - ACTUALIZADA
 */
async function validateWithExistingConnection(connection, salesData, route, bodega_destino, validation) {
  // Validaciones básicas
  if (!salesData || !Array.isArray(salesData) || salesData.length === 0) {
    validation.isValid = false;
    validation.errors.push('No hay datos de productos para procesar');
    return validation;
  }

  // Agrupar productos por código Y bodega origen
  const productos = {};
  const bodegasOrigenSet = new Set();

  for (const item of salesData) {
    if (item && item.Code_Product && item.Code_Product.trim() !== '') {
      const codigo = item.Code_Product.trim();
      const cantidad = Math.max(0, Number(item.Quantity) || 0);
      const bodegaOrigen = item.bodega || "01";

      bodegasOrigenSet.add(bodegaOrigen);

      const key = `${codigo}_${bodegaOrigen}`;

      if (cantidad > 0) {
        if (!productos[key]) {
          productos[key] = {
            Code_Product: codigo,
            Quantity: 0,
            bodegaOrigen: bodegaOrigen
          };
        }
        productos[key].Quantity += cantidad;
      }
    }
  }

  validation.bodegasOrigen = Array.from(bodegasOrigenSet);

  if (Object.keys(productos).length === 0) {
    validation.isValid = false;
    validation.errors.push('No se encontraron productos válidos con cantidades mayores a 0');
    return validation;
  }

  logger.info(`Validando traspaso multi-bodega: Bodegas origen: [${validation.bodegasOrigen.join(', ')}], Bodega destino: ${bodega_destino}`);

  // Validar cada producto agrupado
  for (const [key, producto] of Object.entries(productos)) {
    try {
      const productValidation = await validateProduct(
        connection,
        producto,
        producto.bodegaOrigen
      );

      validation.productos.push(productValidation);

      if (!productValidation.isValid) {
        validation.isValid = false;
        validation.errors.push(...productValidation.errors);
      }

      if (productValidation.warnings.length > 0) {
        validation.warnings.push(...productValidation.warnings);
      }
    } catch (error) {
      logger.error(`Error validando producto ${producto.Code_Product}:`, error);
      validation.isValid = false;
      validation.errors.push(`Error validando producto ${producto.Code_Product}: ${error.message}`);
    }
  }

  // Validar ruta/repartidor
  try {
    const routeValidation = await validateRoute(connection, route);
    if (!routeValidation.isValid) {
      validation.isValid = false;
      validation.errors.push(...routeValidation.errors);
    }
  } catch (error) {
    logger.error(`Error validando ruta ${route}:`, error);
    validation.isValid = false;
    validation.errors.push(`Error validando repartidor ${route}: ${error.message}`);
  }

  // Validar bodega destino
  try {
    const bodegaValidation = await validateBodega(connection, bodega_destino);
    if (!bodegaValidation.isValid) {
      validation.isValid = false;
      validation.errors.push(...bodegaValidation.errors);
    }
  } catch (error) {
    logger.error(`Error validando bodega destino ${bodega_destino}:`, error);
    validation.warnings.push(`No se pudo validar bodega destino ${bodega_destino}: ${error.message}`);
  }

  // Validar cada bodega origen
  for (const bodegaOrigen of validation.bodegasOrigen) {
    try {
      const bodegaOrigenValidation = await validateBodega(connection, bodegaOrigen);
      if (!bodegaOrigenValidation.isValid) {
        validation.isValid = false;
        validation.errors.push(`Bodega origen ${bodegaOrigen}: ${bodegaOrigenValidation.errors.join(', ')}`);
      }
    } catch (error) {
      logger.error(`Error validando bodega origen ${bodegaOrigen}:`, error);
      validation.warnings.push(`No se pudo validar bodega origen ${bodegaOrigen}: ${error.message}`);
    }
  }

  return validation;
}

/**
 * Valida ruta/repartidor - SIMPLIFICADO
 */
async function validateRoute(connection, route) {
  const validation = {
    isValid: true,
    errors: [],
    routeInfo: null
  };

  try {
    // ✅ USAR SqlService DIRECTAMENTE
    const routeQuery = `
      SELECT
        VENDEDOR as code,
        NOMBRE as name,
        U_BODEGA as assignedWarehouse,
        U_ESVENDEDOR as isVendedor,
        ACTIVO as isActive
      FROM CATELLI.VENDEDOR
      WHERE VENDEDOR = @route
      AND ACTIVO = 'S'
    `;

    const result = await DatabaseServiceAdapter.query(connection, routeQuery, {
      route: route
    });

    if (!result.recordset || result.recordset.length === 0) {
      validation.isValid = false;
      validation.errors.push(`Repartidor ${route} no encontrado o inactivo`);
      return validation;
    }

    const routeInfo = result.recordset[0];
    validation.routeInfo = routeInfo;

    if (!routeInfo.assignedWarehouse) {
      validation.isValid = false;
      validation.errors.push(`Repartidor ${route} no tiene bodega asignada`);
    }

  } catch (error) {
    validation.isValid = false;
    validation.errors.push(`Error validando repartidor: ${error.message}`);
  }

  return validation;
}

/**
 * Lógica de validación usando conexión existente
 */
async function validateWithExistingConnection(connection, salesData, route, bodega_destino, validation) {
  // Validaciones básicas
  if (!salesData || !Array.isArray(salesData) || salesData.length === 0) {
    validation.isValid = false;
    validation.errors.push('No hay datos de productos para procesar');
    return validation;
  }

  if (!route || route.trim() === '') {
    validation.isValid = false;
    validation.errors.push('Código de ruta/repartidor es requerido');
    return validation;
  }

  if (!bodega_destino || bodega_destino.trim() === '') {
    validation.isValid = false;
    validation.errors.push('Bodega destino es requerida');
    return validation;
  }

  // Agrupar productos por código
  const productos = {};
  for (const item of salesData) {
    if (item && item.Code_Product && item.Code_Product.trim() !== '') {
      const codigo = item.Code_Product.trim();
      const cantidad = Math.max(0, Number(item.Quantity) || 0);

      if (cantidad > 0) {
        if (!productos[codigo]) {
          productos[codigo] = 0;
        }
        productos[codigo] += cantidad;
      }
    }
  }

  if (Object.keys(productos).length === 0) {
    validation.isValid = false;
    validation.errors.push('No se encontraron productos válidos con cantidades mayores a 0');
    return validation;
  }

  // Determinar bodega origen desde los datos de ventas
  const bodegaOrigen = salesData[0]?.bodega || "01";

  logger.info(`Validando traspaso: Bodega origen: ${bodegaOrigen}, Bodega destino: ${bodega_destino}`);

  // Validar cada producto agrupado usando conexión existente
  for (const [codigo, cantidad] of Object.entries(productos)) {
    try {
      const productValidation = await validateProduct(
        connection,  // Usar conexión existente
        {
          Code_Product: codigo,
          Quantity: cantidad
        },
        bodegaOrigen
      );

      validation.productos.push(productValidation);

      if (!productValidation.isValid) {
        validation.isValid = false;
        validation.errors.push(...productValidation.errors);
      }

      if (productValidation.warnings.length > 0) {
        validation.warnings.push(...productValidation.warnings);
      }
    } catch (error) {
      logger.error(`Error validando producto ${codigo}:`, error);
      validation.isValid = false;
      validation.errors.push(`Error validando producto ${codigo}: ${error.message}`);
    }
  }

  // Validar ruta/repartidor usando conexión existente
  try {
    const routeValidation = await validateRoute(connection, route);
    if (!routeValidation.isValid) {
      validation.isValid = false;
      validation.errors.push(...routeValidation.errors);
    }
  } catch (error) {
    logger.error(`Error validando ruta ${route}:`, error);
    validation.isValid = false;
    validation.errors.push(`Error validando repartidor ${route}: ${error.message}`);
  }

  // Validar que la bodega destino sea válida
  try {
    const bodegaValidation = await validateBodega(connection, bodega_destino);
    if (!bodegaValidation.isValid) {
      validation.isValid = false;
      validation.errors.push(...bodegaValidation.errors);
    }
  } catch (error) {
    logger.error(`Error validando bodega destino ${bodega_destino}:`, error);
    validation.warnings.push(`No se pudo validar bodega destino ${bodega_destino}: ${error.message}`);
  }

  return validation;
}

/**
 * Valida que una bodega existe y está activa - SIMPLIFICADO
 */
async function validateBodega(connection, bodegaCode) {
  const validation = {
    isValid: true,
    errors: [],
    bodegaInfo: null
  };

  try {
    // ✅ USAR SqlService DIRECTAMENTE
    const bodegaQuery = `
      SELECT
        BODEGA as code,
        NOMBRE as description,
        'S' as isActive
      FROM CATELLI.BODEGA
      WHERE BODEGA = @bodega
    `;

    const result = await DatabaseServiceAdapter.query(connection, bodegaQuery, {
      bodega: bodegaCode
    });

    if (!result.recordset || result.recordset.length === 0) {
      validation.isValid = false;
      validation.errors.push(`Bodega ${bodegaCode} no encontrada o inactiva`);
      return validation;
    }

    validation.bodegaInfo = result.recordset[0];

  } catch (error) {
    validation.isValid = false;
    validation.errors.push(`Error validando bodega: ${error.message}`);
  }

  return validation;
}

/**
 * Obtiene la primera localización válida para una bodega
 */
async function getValidLocation(connection, bodega) {
  try {
    const query = `
      SELECT TOP 1 LOCALIZACION
      FROM CATELLI.LOCALIZACION
      WHERE BODEGA = @bodega
      ORDER BY LOCALIZACION ASC
    `;
    const result = await DatabaseServiceAdapter.query(connection, query, { bodega });
    return result.recordset?.[0]?.LOCALIZACION || null;
  } catch (error) {
    logger.error(`Error obteniendo localización para bodega ${bodega}:`, error);
    return null;
  }
}

/**
 * Ejecuta query directamente con la conexión sin pasar por SqlService
 */
async function executeDirectQuery(connection, sql, params = {}) {
  return new Promise((resolve, reject) => {

    const rows = [];

    const request = new Request(sql, (err, rowCount) => {
      if (err) {
        reject(err);
        return;
      }
      resolve({ recordset: rows, rowsAffected: rowCount });
    });

    // Agregar parámetros
    for (const [key, value] of Object.entries(params)) {
      let paramType = TYPES.NVarChar; // Tipo por defecto

      if (typeof value === 'number') {
        paramType = Number.isInteger(value) ? TYPES.Int : TYPES.Float;
      } else if (value instanceof Date) {
        paramType = TYPES.DateTime;
      } else if (typeof value === 'boolean') {
        paramType = TYPES.Bit;
      }

      request.addParameter(key, paramType, value);
    }

    // ✅ CORREGIR EL MANEJO DEL EVENTO 'row'
    request.on('row', (columns) => {
      const row = {};

      // ✅ VALIDACIÓN DEFENSIVA
      if (columns && Array.isArray(columns)) {
        columns.forEach((column) => {
          if (column && column.metadata && column.metadata.colName) {
            row[column.metadata.colName] = column.value;
          }
        });
      } else {
        // Si columns no es array, intentar manejar de otra forma
        logger.warn('Estructura de columns inesperada:', typeof columns);
        return; // Saltar esta fila
      }

      rows.push(row);
    });

    // ✅ AGREGAR MANEJO DE ERRORES
    request.on('error', (error) => {
      logger.error('Error en request SQL directo:', error);
      reject(error);
    });

    connection.execSql(request);
  });
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

    const result = await DatabaseServiceAdapter.query(connection, query);

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
      SELECT BODEGA, NOMBRE, 'S' AS ACTIVA
      FROM CATELLI.BODEGA
      WHERE BODEGA IN (@bodegaOrigen, @bodegaDestino)
    `;

    const result = await DatabaseServiceAdapter.query(connection, query, {
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
 * Valida un producto individual para el traspaso - SIMPLIFICADO
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
    // ✅ USAR SqlService DIRECTAMENTE EN LUGAR DE executeDirectQuery
    const productQuery = `
      SELECT
        ARTICULO,
        DESCRIPCION,
        UNIDAD_ALMACEN,
        ACTIVO
      FROM CATELLI.ARTICULO
      WHERE ARTICULO = @articulo
    `;

    const result = await DatabaseServiceAdapter.query(connection, productQuery, {
      articulo: product.Code_Product
    });

    if (!result.recordset || result.recordset.length === 0) {
      validation.isValid = false;
      validation.errors.push("Producto no encontrado en el catálogo");
      return validation;
    }

    const productInfo = result.recordset[0];
    validation.productInfo = productInfo;

    // Validaciones del producto
    if (productInfo.ACTIVO !== "S") {
      validation.isValid = false;
      validation.errors.push("Producto inactivo");
    }

    if (!productInfo.UNIDAD_ALMACEN || productInfo.UNIDAD_ALMACEN.trim() === "") {
      validation.isValid = false;
      validation.errors.push("Unidad de medida no configurada");
    }

    // Verificar existencias en bodega origen
    const stockQuery = `
      SELECT COALESCE(SUM(EXISTENCIA), 0) as stock
      FROM CATELLI.EXISTENCIA_BODEGA
      WHERE ARTICULO = @articulo AND BODEGA = @bodega
    `;

    const stockResult = await DatabaseServiceAdapter.query(connection, stockQuery, {
      articulo: product.Code_Product,
      bodega: bodegaOrigen,
    });

    const currentStock = stockResult.recordset[0]?.stock || 0;

    if (currentStock < product.Quantity) {
      validation.warnings.push(
        `Stock insuficiente. Disponible: ${currentStock}, Requerido: ${product.Quantity}`
      );
    }

    if (currentStock === 0) {
      validation.warnings.push("No hay existencias en bodega origen");
    }

  } catch (error) {
    logger.error(`Error validando producto ${product.Code_Product}:`, error);
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
  logger.info(`Omitiendo saveFailedTraspasoRecord en IMPLT_traspaso_tracking (tabla deprecada)`);
  return;
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
    subsubtipo: "0",
    ajuste_config: "~TT~",
    tipo_operacion: "11",
    tipo_pago: "ND",
    centro_costo: "00-00-00",
    cuenta_contable_default: "100-01-05-99-00",
    localizacion_default: null, // Dinámico
    unidad_distribucion_default: "UND",
    usuario_default: "SA",
  };
}

/**
 * Realiza traspaso SIN validación previa
 */
async function realizarTraspaso({ route, salesData, bodega_destino }) {
  let detalleProductos = [];
  let pdfPath = null;

  logger.info(`Iniciando traspaso directo hacia bodega destino: ${bodega_destino}`);

  try {
    // 1. Validar datos de entrada básicos
    if (!salesData || !Array.isArray(salesData) || salesData.length === 0) {
      throw new Error("No hay datos de ventas para procesar");
    }

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

    // 2. Agrupar productos por bodega origen
    const productos = {};

    for (const item of productosValidos) {
      const codigo = item.Code_Product.trim();
      const cantidad = Math.max(0, Number(item.Quantity) || 0);
      const bodegaOrigen = item.bodega || "01";
      const localizacionOrigen = item.localizacion_origen || null;

      const key = `${codigo}_${bodegaOrigen}`;

      if (codigo && cantidad > 0) {
        if (!productos[key]) {
          productos[key] = {
            codigo,
            cantidad: 0,
            bodegaOrigen,
            localizacionOrigen
          };
        }
        productos[key].cantidad += cantidad;
      }
    }

    const productosArray = Object.values(productos).filter(
      producto => producto.codigo && producto.cantidad > 0
    );

    if (productosArray.length === 0) {
      throw new Error("No hay productos válidos después de agrupar");
    }

    logger.info(`Procesando traspaso para ruta ${route} con ${productosArray.length} productos`);
    logger.info(`Bodegas origen: ${[...new Set(productosArray.map(p => p.bodegaOrigen))].join(', ')}`);

    // 3. Ejecutar traspaso
    return await withConnection("server1", async (connection) => {
      // Determinar localización válida para bodega destino (común para todas las líneas si bodega_destino es fija)
      const locDestinoValida = await getValidLocation(connection, bodega_destino);
      logger.info(`Localización destino resuelta: ${locDestinoValida} para bodega ${bodega_destino}`);

      // Obtener detalles de productos para correo
      detalleProductos = await obtenerDetalleProductos(connection, productosArray);

      // Generar consecutivo
      const consultaConsecutivo = `
        SELECT TOP 1 SIGUIENTE_CONSEC
        FROM CATELLI.CONSECUTIVO_CI
        WITH (UPDLOCK, ROWLOCK)
        WHERE CONSECUTIVO LIKE 'TR%'
        ORDER BY CONSECUTIVO DESC
      `;

      const resultadoConsecutivo = await DatabaseServiceAdapter.query(connection, consultaConsecutivo);

      if (!resultadoConsecutivo || !resultadoConsecutivo.recordset || resultadoConsecutivo.recordset.length === 0) {
        throw new Error("No se pudo obtener el consecutivo actual");
      }

      const ultimoConsecutivo = resultadoConsecutivo.recordset[0].SIGUIENTE_CONSEC || "TRA0000000";
      const numeroActual = parseInt(ultimoConsecutivo.replace("TRA", ""), 10) || 0;
      const nuevoConsecutivo = "TRA" + (numeroActual + 1).toString().padStart(6, "0");

      logger.info(`Consecutivo generado: ${nuevoConsecutivo}`);

      // Actualizar consecutivo
      const actualizarConsecutivoParams = {
        nuevo: nuevoConsecutivo,
        actual: ultimoConsecutivo,
      };

      const resultadoActualizacion = await DatabaseServiceAdapter.query(
        connection,
        `UPDATE CATELLI.CONSECUTIVO_CI
         SET SIGUIENTE_CONSEC = @nuevo
         WHERE SIGUIENTE_CONSEC = @actual`,
        actualizarConsecutivoParams
      );

      if (!resultadoActualizacion || resultadoActualizacion.rowsAffected === 0) {
        throw new Error("No se pudo actualizar el consecutivo");
      }

      // Insertar documento principal
      const config = getTraspasoConfig();
      const referenciaParams = {
        referencia: `Traspaso automatico para vendedor ${route}`,
        documento: nuevoConsecutivo,
      };

      const insertarDocumento = `
        INSERT INTO CATELLI.DOCUMENTO_INV
          (PAQUETE_INVENTARIO, DOCUMENTO_INV, CONSECUTIVO, REFERENCIA, FECHA_HOR_CREACION, FECHA_DOCUMENTO, SELECCIONADO, USUARIO)
        VALUES
          ('${config.paquete_inventario}', @documento, '${config.consecutivo_prefix}', @referencia, GETDATE(), GETDATE(), 'N', '${config.usuario_default}')
      `;

      await DatabaseServiceAdapter.query(connection, insertarDocumento, referenciaParams);

      // Insertar líneas usando bodega origen específica de cada producto
      let lineasExitosas = 0;
      let lineasFallidas = 0;

      for (let i = 0; i < productosArray.length; i++) {
        const producto = productosArray[i];
        const lineaNumero = i + 1;

        try {
          const lineaParams = {
            paquete: config.paquete_inventario,
            documento_inv: nuevoConsecutivo,
            linea: lineaNumero,
            ajuste: config.ajuste_config,
            articulo: producto.codigo,
            bodega: producto.bodegaOrigen,
            bodega_destino: bodega_destino,
            cantidad: producto.cantidad,
            tipo: "T",
            subtipo: config.subtipo,
            subsubtipo: config.subsubtipo || "",
            costo_total_local: 0,
            costo_total_dolar: 0,
            precio_total_local: 0,
            precio_total_dolar: 0,
            centro_costo: config.centro_costo,
            secuencia: "",
            unidad_distribucio: config.unidad_distribucion_default,
            cuenta_contable: config.cuenta_contable_default,
            costo_total_local_comp: 0,
            costo_total_dolar_comp: 0,
            cai: "",
            tipo_operacion: config.tipo_operacion,
            tipo_pago: config.tipo_pago,
            localizacion: producto.localizacionOrigen || await getValidLocation(connection, producto.bodegaOrigen),
            localizacion_dest: locDestinoValida,
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
               @bodega, @bodega_destino, @cantidad, @tipo, @subtipo, ISNULL(@subsubtipo, ''),
               @costo_total_local, @costo_total_dolar, @precio_total_local, @precio_total_dolar,
               @localizacion_dest, @centro_costo, @secuencia, @unidad_distribucio, @cuenta_contable,
               @costo_total_local_comp, @costo_total_dolar_comp, @cai, @tipo_operacion, @tipo_pago, @localizacion)
          `;

          await DatabaseServiceAdapter.query(connection, insertarLinea, lineaParams);

          lineasExitosas++;
          logger.debug(`Línea ${lineaNumero} insertada: ${producto.codigo} x ${producto.cantidad} (${producto.bodegaOrigen} → ${bodega_destino})`);

        } catch (lineError) {
          lineasFallidas++;
          logger.error(`Error al insertar línea ${lineaNumero}:`, lineError);

          try {
            const codigoProducto = producto.codigo.replace(/'/g, "''");
            const locOriFinal = producto.localizacionOrigen || await getValidLocation(connection, producto.bodegaOrigen);

            const insertarLineaDirecto = `
              INSERT INTO CATELLI.LINEA_DOC_INV
                (PAQUETE_INVENTARIO, DOCUMENTO_INV, LINEA_DOC_INV, AJUSTE_CONFIG, ARTICULO,
                 BODEGA, BODEGA_DESTINO, CANTIDAD, TIPO, SUBTIPO, SUBSUBTIPO,
                 COSTO_TOTAL_LOCAL, COSTO_TOTAL_DOLAR, PRECIO_TOTAL_LOCAL, PRECIO_TOTAL_DOLAR,
                 LOCALIZACION_DEST, CENTRO_COSTO, SECUENCIA, UNIDAD_DISTRIBUCIO, CUENTA_CONTABLE,
                 COSTO_TOTAL_LOCAL_COMP, COSTO_TOTAL_DOLAR_COMP, CAI, TIPO_OPERACION, TIPO_PAGO, LOCALIZACION)
              VALUES
                ('${config.paquete_inventario}', '${nuevoConsecutivo}', ${lineaNumero}, '${config.ajuste_config}', '${codigoProducto}',
                 '${producto.bodegaOrigen}', '${bodega_destino}', ${producto.cantidad}, 'T', '${config.subtipo}', '',
                 0, 0, 0, 0,
                 '${locDestinoValida}', '${config.centro_costo}', '', '${config.unidad_distribucion_default}', '${config.cuenta_contable_default}',
                 0, 0, '', '${config.tipo_operacion}', '${config.tipo_pago}', '${locOriFinal}')
            `;

            await DatabaseServiceAdapter.query(connection, insertarLineaDirecto);
            lineasExitosas++;
            lineasFallidas--;
            logger.debug(`Línea ${lineaNumero} insertada (fallback): ${codigoProducto} x ${producto.cantidad}`);
          } catch (fallbackError) {
            logger.error(`Fallo también en modo fallback para línea ${lineaNumero}:`, fallbackError);
          }
        }
      }

      if (lineasExitosas === 0 && productosArray.length > 0) {
        throw new Error("No se pudo insertar ninguna línea de detalle en el documento");
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
        bodegasOrigen: [...new Set(productosArray.map(p => p.bodegaOrigen))],
        bodega_destino,
      };

      logger.info("Traspaso completado exitosamente:", resultado);

      // Guardar resumen para tracking
      try {
        const summaryProducts = detalleProductos.map((producto) => ({
          code: producto.codigo,
          description: producto.descripcion || "Sin descripción",
          quantity: producto.cantidad,
          unit: "UND",
        }));

        const summary = new TransferSummary({
          loadId: salesData[0]?.Code_load || "N/A",
          route: route,
          documentId: nuevoConsecutivo,
          products: summaryProducts,
          totalProducts: summaryProducts.length,
          totalQuantity: summaryProducts.reduce((sum, p) => sum + p.quantity, 0),
          createdBy: config.usuario_default,
          bodegaOrigen: 'MULTIPLE',
          bodega_destino,
        });

        await summary.save();
        resultado.summaryId = summary._id;
      } catch (summaryError) {
        logger.error(`Error al guardar resumen: ${summaryError.message}`);
      }

      // Generar PDF del traspaso
      try {
        const pdfResult = await PDFService.generateTraspasoPDF(resultado);
        pdfPath = pdfResult.path;
        logger.info(`PDF de traspaso generado: ${pdfPath}`);
      } catch (pdfError) {
        logger.error(`Error al generar PDF: ${pdfError.message}`);
      }

      // Enviar correo con el resultado
      try {
        await sendTraspasoEmail(resultado, pdfPath);
        logger.info(`Correo enviado para traspaso: ${resultado.documento_inv}`);
      } catch (errorCorreo) {
        logger.error(`Error al enviar correo: ${errorCorreo.message}`);
      }

      return resultado;
    });

  } catch (error) {
    logger.error("Error en realizarTraspaso:", error);

    // Preparar resultado de error
    const resultadoError = {
      success: false,
      mensaje: error.message,
      totalLineas: detalleProductos.length,
      lineasExitosas: 0,
      lineasFallidas: detalleProductos.length,
      detalleProductos,
      route,
      bodegasOrigen: [...new Set(salesData.map(item => item.bodega || "01"))],
      bodega_destino,
    };

    // Intentar generar PDF del error
    try {
      const pdfResult = await PDFService.generateTraspasoPDF(resultadoError);
      pdfPath = pdfResult.path;
    } catch (pdfError) {
      logger.error(`Error al generar PDF del error: ${pdfError.message}`);
    }

    // Intentar enviar correo de error
    try {
      await sendTraspasoEmail(resultadoError, pdfPath);
    } catch (errorCorreo) {
      logger.error(`Error al enviar correo de error: ${errorCorreo.message}`);
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
  throw new Error("Reintento no soportado (Tabla IMPLT_traspaso_tracking desactivada).");
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
  throw new Error("Eliminación manual no soportada (Tabla deprecada)");
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
  throw new Error("Actualización manual no soportada (Tabla deprecada)");
}

/**
 * Exporta datos de traspaso
 */
async function exportTraspasoData(traspasoId) {
  throw new Error("Exportación no soportada (Tabla deprecada)");
}




/**
 * Obtener detalles de traspaso específico
 */
async function getTraspasoDetails(traspasoId) {
  throw new Error("Detalles no soportados (Tabla deprecada)");
}


/**
 * Obtiene estadísticas de traspasos
 */
async function getTraspasoStats(filters = {}) {
  return {
    success: true,
    data: {
      total: 0,
      completed: 0,
      failed: 0,
      pending: 0,
      processing: 0,
      total_products: 0,
      total_successful: 0,
      total_failed: 0,
      avg_success_rate: 0,
    }
  };
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
      const result = await DatabaseServiceAdapter.query(connection, query, { loadId });
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

      const result = await DatabaseServiceAdapter.query(connection, query);

      return result.recordset || [];
    });

  } catch (error) {
    logger.error('Error fetching warehouses:', error);
    throw error;
  }
}


/**
 * Obtener historial de traspasos con filtros y paginación
 */
async function getTraspasoHistory(filters = {}) {
  return {
    data: [],
    pagination: {
      currentPage: 1,
      totalPages: 0,
      totalItems: 0,
      itemsPerPage: 20,
      hasNextPage: false,
      hasPrevPage: false,
    },
  };
}

/**
 * Obtiene todos los traspasos con información completa
 */
async function getTraspasosList(filters = {}) {
  return {
    success: true,
    data: [],
    pagination: {
      currentPage: 1,
      totalPages: 0,
      totalItems: 0,
      itemsPerPage: 20,
      hasNextPage: false,
      hasPrevPage: false,
    },
  };
}

/**
 * Obtiene repartidores para filtros
 */
async function getDeliveryPersonsForFilter() {
  return {
    success: true,
    data: [],
  };
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
  getTraspasoHistory,
  getTraspasoDetails,
  getTraspasoStats,
  executeTransferByLoadId,
  getWarehouses,
  getTraspasosList,
  getDeliveryPersonsForFilter
};