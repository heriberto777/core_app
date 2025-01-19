const logger = require("../services/logger");
const { connectToServer1, connectToServer2 } = require("./dbService");
const retry = require("../utils/retry");
const { validateData } = require("./validator");
const validationRules = require("./validationRules");

// Detectar cambios en los datos
const detectChanges = async (newData, server2Pool, tableName) => {
  const existingData = await server2Pool
    .request()
    .query(`SELECT cliente FROM ${tableName}`);

  const existingCliente = new Set(
    existingData.recordset.map((row) => row.cliente)
  );

  return newData.filter((cliente) => !existingCliente.has(cliente.cliente));
};

// Transferencia de Clientes
const transferClientes = async () => {
  const taskName = "Transferencia de Clientes";
  return await retry(
    async () => {
      const server1Pool = await connectToServer1;
      const server2Pool = await connectToServer2;

      const result = await server1Pool.request().query(`
      WITH CleanedData AS (
            SELECT
                cl.CLIENTE,
                cl.NOMBRE,
                RTRIM(LTRIM(REPLACE(REPLACE(cl.CONTRIBUYENTE, '|', ''), '-', ''))) AS NIF,
                cl.DIRECCION,
                cl.PAIS,
                cl.TELEFONO1,
                cl.FAX,
                cl.E_MAIL,
                cl.U_CLUSTER,
                cl.ACTIVO,
                cl.CATEGORIA_CLIENTE,
                cl.ZONA,
                cl.NIVEL_PRECIO,
                cl.U_LATITUD,
                cl.U_LONGITUD,
                cl.MONEDA,
                cl.U_607_CLIENTE_GENERICO,
                cl.EXENTO_IMPUESTOS,
                cl.CONTACTO,
                cl.VENDEDOR,
                z.NOMBRE AS ZONA_NOMBRE
            FROM CATELLI.CLIENTE cl
            INNER JOIN CATELLI.zona z ON cl.zona = z.zona
            WHERE cl.ACTIVO = 'S'
                AND cl.CLIENTE NOT LIKE 'N%'
                AND cl.VENDEDOR NOT IN ('999', '998', '22')
                AND cl.NIVEL_PRECIO NOT LIKE 'OTROS'
        )
        SELECT
            CASE
                WHEN SUBSTRING(CLIENTE, PATINDEX('%[A-Za-z]%', CLIENTE), 1) NOT LIKE 'O' THEN 'CN' + CLIENTE
                ELSE CLIENTE
            END AS Code_ofClient,
            RTRIM(LTRIM(REPLACE(REPLACE(NOMBRE, '|', ''), ',', ''))) AS Name1,
            RTRIM(LTRIM(REPLACE(REPLACE(NOMBRE, '|', ''), ',', ''))) AS Name2,
            NIF,
            PAIS AS Code_Country,
            SUBSTRING(LTRIM(REPLACE(REPLACE(REPLACE(CAST(DIRECCION AS VARCHAR(MAX)), '|', ''), CHAR(13), ''), CHAR(10), '')), 1, 75) AS Address1,
            SUBSTRING(LTRIM(REPLACE(REPLACE(REPLACE(CAST(DIRECCION AS VARCHAR(MAX)), '|', ''), CHAR(13), ''), CHAR(10), '')), 76, 150) AS Address2,
            CASE
                WHEN SUBSTRING(ZONA, PATINDEX('%[A-Za-z]%', ZONA), 1) NOT LIKE 'O' THEN 'CN' + ZONA
                ELSE ZONA
            END AS Code_Province,
            ZONA_NOMBRE AS Province,
            SUBSTRING(LTRIM(REPLACE(TELEFONO1, '/', '')), 1, 12) AS Phone1,
            SUBSTRING(LTRIM(REPLACE(TELEFONO1, '/', '')), 13, 30) AS Phone2,
            RTRIM(LTRIM(REPLACE(FAX, '/', ''))) AS Fax,
            E_MAIL AS E_mail,
            '02' AS Code_Type,
            CASE
                WHEN U_CLUSTER IS NULL THEN 'N'
                ELSE U_CLUSTER
            END AS Code_Potential,
            CASE
                WHEN ACTIVO = 'S' THEN 1
                ELSE 0
            END AS Code_Status,
            CATEGORIA_CLIENTE AS Code_Agrupation1,
            NIVEL_PRECIO AS Code_Price_List,
            U_LATITUD AS Latitude,
            U_LONGITUD AS Longitude,
            MONEDA AS Code_Currency,
            CASE
                WHEN NIVEL_PRECIO IN ('COLGATE', 'BRONZE', 'GOLD', 'SILVER', 'LISTA_MA', 'LISTA_INN', 'LISTA_SM', 'LISTA_IND', 'IND_VIP') THEN '01'
                ELSE '999999999999999999999999999999'
            END AS Code_Warehouse,
            CASE
                WHEN U_607_CLIENTE_GENERICO = 'NO' THEN '0'
                ELSE '1'
            END AS Gen_Account
      FROM CleanedData;
        `);
      const clientes = result.recordset;

      if (clientes.length === 0) {
        logger.info(`${taskName}: No hay datos para transferir`);
        return {
          success: true,
          message: "No hay datos para transferir",
          rows: 0,
        };
      }

      // const clientesNuevos = await detectChanges(
      //   clientes,
      //   server2Pool,
      //   "dbo.IMPLT_accounts"
      // );

      // Validar datos
      const { validData, invalidData } = await validateData(
        clientes,
        validationRules.clientes,
        server2Pool
      );

      if (validData.length === 0) {
        logger.info(`${taskName}: Todos los registros son invalidos`);
        return {
          success: true,
          message:
            "No se transfirieron registros debido a errores de validación",
          rows: 0,
        };
      }

      const transaction = server2Pool.transaction();
      await transaction.begin();

      const request = transaction.request();

      for (const cliente of validData) {
        await request.query(`
                INSERT INTO dbo.IMPLT_accounts (Code_ofClient, Name1, Name2, nif, Code_Country, Address1, Address2, Code_Province, Province, Phone1, Phone2, Fax, E_mail, Code_Type, Code_Potential, Code_Status,Code_Agrupation1, Code_Price_List, Latitude, Longitude, Code_Currency, Code_Warehouse, Gen_Account )
                VALUES ('${cliente.Code_ofClient}','${cliente.Name1}','${cliente.Name2}','${cliente.nif}','${cliente.Code_Country}','${cliente.Address1}','${cliente.Address2}','${cliente.Code_Province}','${cliente.Province}','${cliente.Phone1}','${cliente.Phone2}','${cliente.Fax}','${cliente.E_mail}','${cliente.Code_Type}','${cliente.Code_Potential}','${cliente.Code_Status}','${cliente.Code_Agrupation1}','${cliente.Code_Price_List}','${cliente.Latitude}','${cliente.Longitude}','${cliente.Code_Currency}','${cliente.Code_Warehouse}', '${cliente.Gen_Account}')`);
      }

      await transaction.commit();
      logger.info(`${taskName} completada con exito`);
      return {
        success: true,
        message: "Transferencia completada",
        rows: validateData.length,
      };
    },
    3,
    3000,
    taskName
  ); // 3 intentos, 3 segundos de espera
};

// Transferencia de Productos
const transferProductos = async () => {
  const taskName = "Transferencia de Productos";
  return await retry(
    async () => {
      const server1Pool = await connectToServer1;
      const server2Pool = await connectToServer2;

      const result = await server1Pool
        .request()
        .query("SELECT * FROM CATELLI.PRODUCTOS");
      const productos = result.recordset;

      if (productos.length === 0) {
        logger.info(`${taskName}: No hay datos para transferir`);
        return {
          success: true,
          message: "No hay datos para transferir",
          rows: 0,
        };
      }

      const transaction = server2Pool.transaction();
      await transaction.begin();

      const request = transaction.request();

      for (const producto of productos) {
        await request.query(`
                INSERT INTO telynet.implt_product (producto, descripcion, precio, stock)
                VALUES ('${producto.producto}', '${producto.descripcion}', ${producto.precio}, ${producto.stock})
            `);
      }

      await transaction.commit();
      logger.info(`${taskName} completada`);
      return {
        success: true,
        message: "Transferencia completada",
        rows: productos.length,
      };
    },
    3,
    3000,
    taskName
  );
};

module.exports = { transferClientes, transferProductos };
