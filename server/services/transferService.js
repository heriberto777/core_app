const logger = require("../services/logger");
const { connectToServer1, connectToServer2 } = require("./dbService");
const retry = require("../utils/retry");
const { validateData } = require("./validator");
const validationRules = require("./validationRules");
const { addTransferTask } = require("./queueService");

// Detectar cambios en los datos
// const detectChanges = async (newData, server2Pool, tableName) => {
//   const existingData = await server2Pool
//     .request()
//     .query(`SELECT cliente FROM ${tableName}`);

//   const existingCliente = new Set(
//     existingData.recordset.map((row) => row.cliente)
//   );

//   return newData.filter((cliente) => !existingCliente.has(cliente.cliente));
// };

// Transferencia de Clientes
const transferClientes = async () => {
  const taskName = "Transferencia de Clientes";
  return await retry(
    async () => {
      const server1Pool = await connectToServer1;
      const server2Pool = await connectToServer2;

      const result = await server1Pool.request().query(`
      WITH IMPLT_accounts AS (
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
      FROM IMPLT_accounts
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

      // const request = transaction.request();

      for (const cliente of validData) {
        const request = transaction.request(); // Nueva instancia de request en cada iteración

        await request
          .input("Code_ofClient", cliente.Code_ofClient)
          .input("Name1", cliente.Name1)
          .input("Name2", cliente.Name2)
          .input("nif", cliente.nif)
          .input("Code_Country", cliente.Code_Country)
          .input("Address1", cliente.Address1)
          .input("Address2", cliente.Address2)
          .input("Code_Province", cliente.Code_Province)
          .input("Province", cliente.Province)
          .input("Phone1", cliente.Phone1)
          .input("Phone2", cliente.Phone2)
          .input("Fax", cliente.Fax)
          .input("E_mail", cliente.E_mail)
          .input("Code_Type", cliente.Code_Type)
          .input("Code_Potential", cliente.Code_Potential)
          .input("Code_Status", cliente.Code_Status)
          .input("Code_Agrupation1", cliente.Code_Agrupation1)
          .input("Code_Price_List", cliente.Code_Price_List)
          .input("Latitude", cliente.Latitude)
          .input("Length", cliente.Length)
          .input("Code_Currency", cliente.Code_Currency)
          .input("Code_Warehouse", cliente.Code_Warehouse)
          .input("Gen_Account", cliente.Gen_Account).query(`
            INSERT INTO dbo.IMPLT_accounts (
                Code_ofClient, Name1, Name2, nif, Code_Country, Address1, Address2,
                Code_Province, Province, Phone1, Phone2, Fax, E_mail, Code_Type,
                Code_Potential, Code_Status, Code_Agrupation1, Code_Price_List,
                Latitude, Length, Code_Currency, Code_Warehouse, Gen_Account
            )
            VALUES (
                @Code_ofClient, @Name1, @Name2, @nif, @Code_Country, @Address1, @Address2,
                @Code_Province, @Province, @Phone1, @Phone2, @Fax, @E_mail, @Code_Type,
                @Code_Potential, @Code_Status, @Code_Agrupation1, @Code_Price_List,
                @Latitude, @Length, @Code_Currency, @Code_Warehouse, @Gen_Account
            )
        `);
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

const transferaccounts_agrupation1 = async () => {
  const taskName = "Transferencia de accounts_agrupation1";
  return await retry(
    async () => {
      const server1Pool = await connectToServer1;
      const server2Pool = await connectToServer2;
      const result = await server1Pool.request().query(`                  
          WITH accounts_agrupation1 AS (
            select 
              categoria_cliente,
              descripcion,
              '1' as estado
            from catelli.CATEGORIA_CLIENTE
            where 
              categoria_cliente not in ('1',
          '3',
          'A1',
          'INT',
          'EXT',
          'A2',
          'B1',
          'C1',
          'CA',
          'CA1',
          'CA2',
          'CA3',
          'CA4',
          'CA5',
          'CA6',
          'CA7',
          'CD',
          'CO1',
          'CO2',
          'CO3',
          'CO4',
          'CO5',
          'CO6',
          'CO7',
          'D1',
          'D2',
          'D3',
          'E2',
          'EM',
          'OT',
          'SM',
          'SU',
          'VE',
          'VT',
          'ND',
          'LOC',
          'FA',
          'SUR',
          'FE',
          'T1',
          'V1',
          'H1',
          'LI',
          'Q1',
          'PA',
          'UN',
          'CO',
          'SA',
          'CM',
          'E3',
          'IND',
          'ALM',
          'DIS',
          'SURALM',
          'ALMIND',
          'CHU',
          'BARECA')
          )
          SELECT 
            categoria_cliente as 'Code',
            descripcion as 'Description',
            estado as 'Transfer_Status' 
          FROM accounts_agrupation1
          `);

      const datos = result.recordset;

      if (datos.length === 0) {
        logger.info(`${taskName} : No hay datos para transferir `);
        return {
          success: true,
          message: "No hay datos para transferir",
          row: 0,
        };
      }

      //Validar datos
      const { validData, invalidData } = await validateData(
        datos,
        validationRules.accounts_agrupation1,
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

      for (const dato of validData) {
        const request = transaction.request();

        await request
          .input("Code", dato.Code)
          .input("Description", dato.Description)
          .input("Transfer_status", dato.Transfer_Status).query(`
          INSERT INTO dbo.IMPLT_accounts_agrupation1 
          (Code, Description, Transfer_status) VALUES (@Code, @Description, @Transfer_status)`);
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
    300,
    taskName
  );
};

const transferaccounts_agrupation2 = async () => {
  const taskName = "Transferencia de accounts_agrupation2";
  return await retry(
    async () => {
      const server1Pool = await connectToServer1;
      const server2Pool = await connectToServer2;
      const result = await server1Pool.request().query(`
        WITH accounts_agrupation2 AS (
            select 
              CATEGORIA_CLIENTE,
              CATEGORIA_CLIENTE As Code_Agrupacion ,
            DESCRIPCION,
              '1' as 'Transfer_Status'
              
            from  CATELLI.CATEGORIA_CLIENTE 
            where CATEGORIA_CLIENTE not in ('1',
            '3',
            'A1',
            'INT',
            'EXT',
            'A2',
            'B1',
            'C1',
            'CA',
            'CA1',
            'CA2',
            'CA3',
            'CA4',
            'CA5',
            'CA6',
            'CA7',
            'CD',
            'CO1',
            'CO2',
            'CO3',
            'CO4',
            'CO5',
            'CO6',
            'CO7',
            'D1',
            'D2',
            'D3',
            'E2',
            'EM',
            'OT',
            'SM',
            'SU',
            'VE',
            'VT',
            'ND',
            'LOC',
            'FA',
            'SUR',
            'FE',
            'T1',
            'V1',
            'H1',
            'LI',
            'Q1',
            'PA',
            'UN',
            'CO',
            'SA',
            'CM',
            'E3',
            'IND',
            'ALM',
            'DIS',
            'SURALM',
            'ALMIND',
            'CHU',
            'BARECA')
            )
            SELECT CATEGORIA_CLIENTE as 'Code',
              Code_Agrupacion as 'Code_Agrupation1',
            DESCRIPCION as 'Description',
              '1' as 'Transfer_Status' 
            FROM accounts_agrupation2
        `);

      const datos = result.recordset;

      if (datos.length === 0) {
        logger.info(`${taskName} : No hay datos para transferir `);
        return {
          success: true,
          message: "No hay datos para transferir",
          row: 0,
        };
      }

      //Validar datos
      const { validData, invalidData } = await validateData(
        datos,
        validationRules.accounts_agrupation2,
        server2Pool
      );

      const transaction = server2Pool.transaction();
      await transaction.begin();

      for (const dato of validData) {
        const request = transaction.request();

        await request
          .input("Code", dato.Code)
          .input("Code_Agrupation1", dato.Code_Agrupation1)
          .input("Description", dato.Description)
          .input("Transfer_status", dato.Transfer_status).query(`
          INSERT INTO dbo.IMPLT_accounts_agrupation2 (Code, Code_Agrupation1, Description, Transfer_status) VALUES (@Code, @Code_Agrupation1, @Description, @Transfer_status )`);
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
    300,
    taskName
  );
};

const transferaccounts_agrupation3 = async () => {
  const taskName = "Transferencia de accounts_agrupation3";
  return await retry(
    async () => {
      const server1Pool = await connectToServer1;
      const server2Pool = await connectToServer2;
      const result = await server1Pool.request().query(`
              select 
        cc.CATEGORIA_CLIENTE as 'Code',
        cc.CATEGORIA_CLIENTE as 'Code_Agrupation1',
        cc.CATEGORIA_CLIENTE as 'Code_Agrupation2',
        cc.DESCRIPCION as 'Description',
        '1' as 'Transfer_Status'
        
      from  catelli.CATEGORIA_CLIENTE cc
      where cc.CATEGORIA_CLIENTE not in ('1',
      '3',
      'A1',
      'INT',
      'EXT',
      'A2',
      'B1',
      'C1',
      'CA',
      'CA1',
      'CA2',
      'CA3',
      'CA4',
      'CA5',
      'CA6',
      'CA7',
      'CD',
      'CO1',
      'CO2',
      'CO3',
      'CO4',
      'CO5',
      'CO6',
      'CO7',
      'D1',
      'D2',
      'D3',
      'E2',
      'EM',
      'OT',
      'SM',
      'SU',
      'VE',
      'VT',
      'ND',
      'LOC',
      'FA',
      'SUR',
      'FE',
      'T1',
      'V1',
      'H1',
      'LI',
      'Q1',
      'PA',
      'UN',
      'CO',
      'SA',
      'CM',
      'E3',
      'IND',
      'ALM',
      'DIS',
      'SURALM',
      'ALMIND',
      'CHU',
      'BARECA')`);

      const datos = result.recordset;

      if (datos.length === 0) {
        logger.info(`${taskName} : No hay datos para transferir `);
        return {
          success: true,
          message: "No hay datos para transferir",
          row: 0,
        };
      }

      //Validar datos
      const { validData, invalidData } = await validateData(
        datos,
        validationRules.accounts_agrupation3,
        server2Pool
      );

      const transaction = server2Pool.transaction();
      await transaction.begin();

      for (const dato of validData) {
        const request = transaction.request();

        await request
          .input("Code", dato.Code)
          .input("Code_Agrupation1", dato.Code_Agrupation1)
          .input("Code_Agrupation2", dato.Code_Agrupation2)
          .input("Description", dato.Description)
          .input("Transfer_Status", dato.Transfer_Status).query(`
          INSERT INTO dbo.IMPLT_accounts_agrupation3 (Code, Code_Agrupation1,Code_Agrupation2,Description , Transfer_Status ) VALUES (@Code, @Code_Agrupation1, @Code_Agrupation2, @Description, @Transfer_Status)`);
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
    300,
    taskName
  );
};

const transferaccounts_credit = async () => {
  const taskName = "Transferencia de accounts_credit";
  return await retry(
    async () => {
      const server1Pool = await connectToServer1;
      const server2Pool = await connectToServer2;
      const result = await server1Pool.request().query(`
        SELECT 
          CASE 
              WHEN SUBSTRING(CL.CLIENTE, PATINDEX('%[A-Za-z]%', CL.CLIENTE), 1) NOT LIKE 'O' 
              THEN 'CN' + CL.CLIENTE 
              ELSE CL.CLIENTE 
          END AS Code_Account,
          CAST(CL.LIMITE_CREDITO AS NUMERIC(15,2)) AS Credit_Limit,
          CAST(CL.SALDO AS NUMERIC(15,2)) AS Credit_Consum,
          CL.MOROSO AS Lock_Credit,
          '1' AS Transfer_Status
    FROM 
        CATELLI.CLIENTE CL
    WHERE 
        CL.ACTIVO = 'S' 
        AND CL.CLIENTE NOT LIKE 'N%' 
        AND CL.VENDEDOR NOT IN ('999', '998', '22');`);

      const datos = result.recordset;

      if (datos.length === 0) {
        logger.info(`${taskName} : No hay datos para transferir `);
        return {
          success: true,
          message: "No hay datos para transferir",
          row: 0,
        };
      }

      //Validar datos
      const { validData, invalidData } = await validateData(
        datos,
        validationRules.accounts_credit,
        server2Pool
      );

      const transaction = server2Pool.transaction();
      await transaction.begin();

      for (const dato of validData) {
        const request = transaction.request();

        await request
          .input("Code_Account", dato.Code_Account)
          .input("Credit_Limit", dato.Credit_Limit)
          .input("Credit_Consum", dato.Credit_Consum)
          .input("Lock_Credit", dato.Lock_Credit)
          .input("Transfer_Status", dato.Transfer_Status).query(`
          INSERT INTO dbo.IMPLT_accounts_credit (Code_Account, Credit_Limit, Credit_Consum, Lock_Credit, Transfer_Status) VALUES (@Code_Account, @Credit_Limit, @Credit_Consum, @Lock_Credit, @Transfer_Status)`);
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
    300,
    taskName
  );
};

const transferpayment_termt = async () => {
  const taskName = "Transferencia de payment_termt";
  return await retry(
    async () => {
      const server1Pool = await connectToServer1;
      const server2Pool = await connectToServer2;
      const result = await server1Pool.request().query(`
        SELECT 
            CP.CONDICION_PAGO AS Code,
            CP.DESCRIPCION AS Description,
            CASE 
                WHEN CP.DIAS_NETO = 0 OR CP.DIAS_NETO = 1 THEN 0 
                ELSE 1 
            END AS Credit, -- Indicador: 0=Contado, 1=Crédito
            CP.DIAS_NETO AS Days,
            '1' AS Transfer_Status
        FROM 
            CATELLI.CONDICION_PAGO CP
        WHERE 
            CP.CONDICION_PAGO NOT IN (
                'C', 'C10', 'C20', '0', '21', '30', '1', '45', '7', 
            '15', '14', '28', '11', '41', '5', '22', '60'
          );`);

      const datos = result.recordset;

      if (datos.length === 0) {
        logger.info(`${taskName} : No hay datos para transferir `);
        return {
          success: true,
          message: "No hay datos para transferir",
          row: 0,
        };
      }

      //Validar datos
      const { validData, invalidData } = await validateData(
        datos,
        validationRules.payment_termt,
        server2Pool
      );

      const transaction = server2Pool.transaction();
      await transaction.begin();

      for (const dato of validData) {
        const request = transaction.request();

        await request
          .input("Code", dato.Code)
          .input("Description", dato.Description)
          .input("Credit", dato.Credit)
          .input("Days", dato.Days)
          .input("Transfer_Status", dato.Transfer_Status).query(`
          INSERT INTO dbo.IMPLT_payment_term (Code, Description, Credit, Days, Transfer_Status ) VALUES (@Code, @Description, @Credit, @Days, @Transfer_Status)`);
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
    300,
    taskName
  );
};
const transferproducts = async () => {
  const taskName = "Transferencia de products";
  return await retry(
    async () => {
      const server1Pool = await connectToServer1;
      const server2Pool = await connectToServer2;
      const result = await server1Pool.request().query(`
        SELECT 
            AR.ARTICULO AS Code_ofClient,
            AR.DESCRIPCION AS Description,
            'NULL' AS Description_short,
            '01' AS Code_Hierarchy1, -- 01=Producto venta
            'NULL' AS Code_Hierarchy2,
            'NULL' AS Code_Hierarchy3,
            'NULL' AS Code_Hierarchy4,
            AR.CLASIFICACION_1 AS Code_ClassificationA,
            AR.CLASIFICACION_2 AS Code_ClassificationB,
            AR.CLASIFICACION_3 AS Code_ClassificationC,
            AR.CLASIFICACION_4 AS Code_ClassificationD,
            AR.CLASIFICACION_5 AS Code_ClassificationE,
            CASE 
                WHEN AR.ACTIVO = 'S' THEN 1 
                ELSE 0 
            END AS Code_Status,
            'NULL' AS Ean14,
            CAST(AR.PESO_BRUTO AS NUMERIC(15,2)) AS Factor_Conversion, 
            CASE 
                WHEN MANUFACTURADOR LIKE 'CA%' AND PESO_BRUTO = 1 THEN 'CAJA'
                WHEN MANUFACTURADOR LIKE 'FA%' AND PESO_BRUTO = 1 THEN 'FDR'
                ELSE UNIDAD_VENTA 
            END AS Unit_Type_Sales,
            CASE 
                WHEN UNIDAD_EMPAQUE LIKE 'CA%' THEN 'CAJA'
                ELSE UNIDAD_EMPAQUE 
            END AS Unit_Type_Inv,
            CAST(AR.PESO_NETO AS NUMERIC(15,2)) AS Weight,
            CAST(AR.VOLUMEN AS NUMERIC(15,2)) AS Volume,
            CAST(IM.IMPUESTO1 AS NUMERIC(15,2)) AS Tax1,
            '1' AS Transfer_Status
        FROM 
            CATELLI.ARTICULO AR
        INNER JOIN 
            CATELLI.IMPUESTO IM ON IM.IMPUESTO = AR.IMPUESTO
        WHERE 
            AR.ACTIVO = 'S' 
            AND AR.CLASIFICACION_4 NOT LIKE 'GND*';
        `);

      const datos = result.recordset;

      if (datos.length === 0) {
        logger.info(`${taskName} : No hay datos para transferir `);
        return {
          success: true,
          message: "No hay datos para transferir",
          row: 0,
        };
      }

      //Validar datos
      const { validData, invalidData } = await validateData(
        datos,
        validationRules.products,
        server2Pool
      );

      const transaction = server2Pool.transaction();
      await transaction.begin();

      for (const dato of validData) {
        const request = transaction.request();

        await request
          .input("Code_ofClient", dato.Code_ofClient)
          .input("Description", dato.Description)
          .input("Description_short", dato.Description_short)
          .input("Code_Hierarchy1", dato.Code_Hierarchy1)
          .input("Code_Hierarchy2", dato.Code_Hierarchy2)
          .input("Code_Hierarchy3", dato.Code_Hierarchy3)
          .input("Code_Hierarchy4", dato.Code_Hierarchy4)
          .input("Code_ClassificationA", dato.Code_ClassificationA)
          .input("Code_ClassificationB", dato.Code_ClassificationB)
          .input("Code_ClassificationC", dato.Code_ClassificationC)
          .input("Code_ClassificationD", dato.Code_ClassificationD)
          .input("Code_ClassificationE", dato.Code_ClassificationE)
          .input("Code_Status", dato.Code_Status)
          .input("Ean14", dato.Ean14)
          .input("Factor_Conversion", dato.Factor_Conversion)
          .input("Unit_Type_Sales", dato.Unit_Type_Sales)
          .input("Unit_Type_Inv", dato.Unit_Type_Inv)
          .input("Weight", dato.Weight)
          .input("Volume", dato.Volume)
          .input("Tax1", dato.Tax1)
          .input("Transfer_Status", dato.Transfer_Status).query(`
          INSERT INTO dbo.IMPLT_products (Code_ofClient,
                Description,
                Description_short,
                Code_Hierarchy1,
                Code_Hierarchy2,
                Code_Hierarchy3,
                Code_Hierarchy4,
                Code_ClassificationA,
                Code_ClassificationB,
                Code_ClassificationC,
                Code_ClassificationD,
                Code_ClassificationE,
                Code_Status,
                Ean14,
                Factor_Conversion,
                Unit_Type_Sales,
                Unit_Type_Inv,
                Weight,
                Volume,
                Tax1, Transfer_Status) VALUES (@Code_ofClient,
                @Description,
                @Description_short,
                @Code_Hierarchy1,
                @Code_Hierarchy2,
                @Code_Hierarchy3,
                @Code_Hierarchy4,
                @Code_ClassificationA,
                @Code_ClassificationB,
                @Code_ClassificationC,
                @Code_ClassificationD,
                @Code_ClassificationE,
                @Code_Status,
                @Ean14,
                @Factor_Conversion,
                @Unit_Type_Sales,
                @Unit_Type_Inv,
                @Weight,
                @Volume,
                @Tax1, @Transfer_Status)`);
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
    300,
    taskName
  );
};
const transferproducts_hierarchy2 = async () => {
  const taskName = "Transferencia de products_hierarchy2";
  return await retry(
    async () => {
      const server1Pool = await connectToServer1;
      const server2Pool = await connectToServer2;
      const result = await server1Pool.request().query(`
        SELECT 
          CL.CLASIFICACION AS Code,
          '1' AS Code_Hierarchy1,
          CL.DESCRIPCION AS Description,
          '1' AS Transfer_Status
        FROM 
            CATELLI.CLASIFICACION CL
        WHERE 
            CL.AGRUPACION = 1 
            AND CL.U_jerarquia = '1';`);

      const datos = result.recordset;

      if (datos.length === 0) {
        logger.info(`${taskName} : No hay datos para transferir `);
        return {
          success: true,
          message: "No hay datos para transferir",
          row: 0,
        };
      }

      //Validar datos
      const { validData, invalidData } = await validateData(
        datos,
        validationRules.products_hierarchy2,
        server2Pool
      );

      const transaction = server2Pool.transaction();
      await transaction.begin();

      for (const dato of validData) {
        const request = transaction.request();

        await request
          .input("Code", dato.Code)
          .input("Code_Hierarchy1", dato.Code_Hierarchy1)
          .input("Description", dato.Description)
          .input("Transfer_status", dato.Transfer_status).query(`
          INSERT INTO dbo.IMPLT_products_hierarchy2 (Code,
          Code_Hierarchy1,
          Description,
          Transfer_status) VALUES (@Code,
          @Code_Hierarchy1,
          @Description,
          @Transfer_status)`);
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
    300,
    taskName
  );
};
const transferproducts_hierarchy3 = async () => {
  const taskName = "Transferencia de products_hierarchy3";
  return await retry(
    async () => {
      const server1Pool = await connectToServer1;
      const server2Pool = await connectToServer2;
      const result = await server1Pool.request().query(`SELECT 
    CL.CLASIFICACION AS Code,
    '1' AS Code_Hierarchy1,
    CL.U_jerarquia AS Code_Hierarchy2,
    CL.DESCRIPCION AS Description,
    '1' AS Transfer_Status
FROM 
    CATELLI.CLASIFICACION CL
WHERE 
    CL.AGRUPACION = 2 
    AND CL.U_jerarquia IS NOT NULL;`);

      const datos = result.recordset;

      if (datos.length === 0) {
        logger.info(`${taskName} : No hay datos para transferir `);
        return {
          success: true,
          message: "No hay datos para transferir",
          row: 0,
        };
      }

      //Validar datos
      const { validData, invalidData } = await validateData(
        datos,
        validationRules.products_hierarchy3,
        server2Pool
      );

      const transaction = server2Pool.transaction();
      await transaction.begin();

      for (const dato of validData) {
        const request = transaction.request();

        await request
          .input("Code", dato.Code)
          .input("Code_Hierarchy1", dato.Code_Hierarchy1)
          .input("Code_Hierarchy2", dato.Code_Hierarchy2)
          .input("Description", dato.Description)
          .input("Transfer_Status", dato.Transfer_Status).query(`
          INSERT INTO dbo.IMPLT_products_hierarchy3 (Code,
            Code_Hierarchy1,
            Code_Hierarchy2,
            Description,
            Transfer_Status) VALUES (@Code,
            @Code_Hierarchy1,
            @Code_Hierarchy2,
            @Description,
            @Transfer_Status)`);
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
    300,
    taskName
  );
};
const transferproducts_hierarchy4 = async () => {
  const taskName = "Transferencia de products_hierarchy4";
  return await retry(
    async () => {
      const server1Pool = await connectToServer1;
      const server2Pool = await connectToServer2;
      const result = await server1Pool.request().query(`
        SELECT 
              T1.CLASIFICACION AS Code,
              '1' AS Code_Hierarchy1,
              T3.CLASIFICACION AS Code_Hierarchy2,
              T2.CLASIFICACION AS Code_Hierarchy3,
              T1.DESCRIPCION AS Description,
              '1' AS Transfer_Status
          FROM 
              (SELECT CL.CLASIFICACION, CL.DESCRIPCION, CL.AGRUPACION, CL.U_JERARQUIA 
              FROM CATELLI.CLASIFICACION CL
              WHERE CL.AGRUPACION = 3 AND CL.U_JERARQUIA IS NOT NULL) T1
          LEFT JOIN 
              (SELECT CL.CLASIFICACION, CL.DESCRIPCION, CL.AGRUPACION, CL.U_JERARQUIA 
              FROM CATELLI.CLASIFICACION CL
              WHERE CL.AGRUPACION = 2 AND CL.U_JERARQUIA IS NOT NULL) T2
          ON T1.U_JERARQUIA = T2.CLASIFICACION
          LEFT JOIN 
              (SELECT CL.CLASIFICACION, CL.DESCRIPCION, CL.AGRUPACION, CL.U_JERARQUIA 
              FROM CATELLI.CLASIFICACION CL
              WHERE CL.AGRUPACION = 1 AND CL.U_JERARQUIA IS NOT NULL) T3
          ON T2.U_JERARQUIA = T3.CLASIFICACION;`);

      const datos = result.recordset;

      if (datos.length === 0) {
        logger.info(`${taskName} : No hay datos para transferir `);
        return {
          success: true,
          message: "No hay datos para transferir",
          row: 0,
        };
      }

      //Validar datos
      const { validData, invalidData } = await validateData(
        datos,
        validationRules.products_hierarchy4,
        server2Pool
      );

      const transaction = server2Pool.transaction();
      await transaction.begin();

      for (const dato of validData) {
        const request = transaction.request();

        await request
          .input("Code", dato.Code)
          .input("Code_Hierarchy1", dato.Code_Hierarchy1)
          .input("Code_Hierarchy2", dato.Code_Hierarchy2)
          .input("Code_Hierarchy3", dato.Code_Hierarchy3)
          .input("Description", dato.Description)
          .input("Transfer_Status", dato.Transfer_Status).query(`
          INSERT INTO dbo.IMPLT_products_hierarchy4 (Code,
            Code_Hierarchy1,
            Code_Hierarchy2,
            Code_Hierarchy3,
            Description,
            Transfer_Status) VALUES (@Code,
            @Code_Hierarchy1,
            @Code_Hierarchy2,
            @Code_Hierarchy3,
            @Description,
            @Transfer_Status)`);
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
    300,
    taskName
  );
};
const transferproducts_measure = async () => {
  const taskName = "Transferencia de products_measure";
  return await retry(
    async () => {
      const server1Pool = await connectToServer1;
      const server2Pool = await connectToServer2;
      const result = await server1Pool.request().query(`
        SELECT 
            AR.ARTICULO AS Code_Product,
            CASE 
                WHEN AR.MANUFACTURADOR LIKE 'CA%' THEN 'CAJA'
                ELSE 'UND' 
            END AS Unit_Measure,
            CAST(AR.PESO_BRUTO AS NUMERIC(15,2)) AS Factor_Conversion,
            '1' AS Transfer_Status
        FROM 
            CATELLI.ARTICULO AR
        INNER JOIN 
            CATELLI.UNIDAD_DE_MEDIDA UN ON AR.UNIDAD_VENTA = UN.UNIDAD_MEDIDA
        WHERE 
            AR.ACTIVO = 'S' 
            AND AR.CLASIFICACION_4 NOT IN ('GND') 
            AND AR.TIPO NOT IN ('K');`);

      const datos = result.recordset;

      if (datos.length === 0) {
        logger.info(`${taskName} : No hay datos para transferir `);
        return {
          success: true,
          message: "No hay datos para transferir",
          row: 0,
        };
      }

      //Validar datos
      const { validData, invalidData } = await validateData(
        datos,
        validationRules.products_measure,
        server2Pool
      );

      const transaction = server2Pool.transaction();
      await transaction.begin();

      for (const dato of validData) {
        const request = transaction.request();

        await request
          .input("Code_Product", dato.Code_Product)
          .input("Unit_Measure", dato.Unit_Measure)
          .input("Factor_Conversion", dato.Factor_Conversion)
          .input("Transfer_Status", dato.Transfer_Status).query(`
          INSERT INTO dbo.IMPLT_products_measure (Code_Product,
            Unit_Measure,
            Factor_Conversion,
            Transfer_Status) VALUES (@Code_Product,
            @Unit_Measure,
            @Factor_Conversion,
            @Transfer_Status)`);
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
    300,
    taskName
  );
};
const transfercollections_pending = async () => {
  const taskName = "Transferencia de collections_pending";
  return await retry(
    async () => {
      const server1Pool = await connectToServer1;
      const server2Pool = await connectToServer2;
      const result = await server1Pool.request().query(`
        SELECT 
              DO.DOCUMENTO AS Num_Invoice,
              DO.DOCUMENTO AS NumDocum,
              CONVERT(VARCHAR, DO.FECHA_DOCUMENTO, 112) AS Date_Doc,
              CASE 
                  WHEN SUBSTRING(DO.CLIENTE, PATINDEX('%[A-Za-z]%', DO.CLIENTE), 1) NOT LIKE 'O' 
                  THEN 'CN' + DO.CLIENTE 
                  ELSE DO.CLIENTE 
              END AS Code_Account,
              CASE 
                  WHEN DO.TIPO = 'FAC' THEN '01'
                  ELSE 'ND' 
              END AS Code_Type,
              CAST(DO.MONTO AS NUMERIC(15,2)) AS Total_Amount,
              CAST(DO.MONTO AS NUMERIC(15,2)) - CAST(DO.SALDO AS NUMERIC(15,2)) AS Total_Collected,
              CONVERT(VARCHAR, DO.FECHA_VENCE, 112) AS Date_End,
              DO.CONDICION_PAGO AS Code_Payment,
              CAST(DO.SUBTOTAL AS NUMERIC(15,2)) AS Amount_Gross,
              '1' AS Transfer_Status
          FROM 
              CATELLI.DOCUMENTOS_CC DO
          WHERE 
              DO.FECHA >= '2024-02-01' 
              AND DO.SALDO > 0 
              AND DO.TIPO IN ('FAC', 'N/D', 'O/D');`);

      const datos = result.recordset;

      if (datos.length === 0) {
        logger.info(`${taskName} : No hay datos para transferir `);
        return {
          success: true,
          message: "No hay datos para transferir",
          row: 0,
        };
      }

      //Validar datos
      const { validData, invalidData } = await validateData(
        datos,
        validationRules.collections_pending,
        server2Pool
      );

      const transaction = server2Pool.transaction();
      await transaction.begin();

      for (const dato of validData) {
        const request = transaction.request();

        await request
          .input("Num_Invoice", dato.Num_Invoice)
          .input("NumDocum", dato.NumDocum)
          .input("Date_Doc", dato.Date_Doc)
          .input("Code_Account", dato.Code_Account)
          .input("Code_Type", dato.Code_Type)
          .input("Total_Amount", dato.Total_Amount)
          .input("Total_Collected", dato.Total_Collected)
          .input("Date_End", dato.Date_End)
          .input("Code_Payment", dato.Code_Payment)
          .input("Amount_Gross", dato.Amount_Gross)
          .input("Transfer_Status", dato.Transfer_Status).query(`
          INSERT INTO dbo.IMPLT_collections_pending (Num_Invoice,
              NumDocum,
              Date_Doc,
              Code_Account,
              Code_Type,
              Total_Amount,
              Total_Collected,
              Date_End,
              Code_Payment,
              Amount_Gross,
              Transfer_Status) VALUES (@Num_Invoice,
              @NumDocum,
              @Date_Doc,
              @Code_Account,
              @Code_Type,
              @Total_Amount,
              @Total_Collected,
              @Date_End,
              @Code_Payment,
              @Amount_Gross,
              @Transfer_Status)`);
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
    300,
    taskName
  );
};
const transferhist_orders = async () => {
  const taskName = "Transferencia de hist_orders";
  return await retry(
    async () => {
      const server1Pool = await connectToServer1;
      const server2Pool = await connectToServer2;
      const result = await server1Pool.request().query(`
        SELECT 
            pel.PEDIDO AS Order_Num,
            pel.PEDIDO_LINEA AS Num_Line,
            pel.PEDIDO AS Order_Num_ofClient,
            'S' AS Type_Rec, -- Tipo de Documento: S=Ventas, R=Devolución
            CONVERT(VARCHAR, pel.FECHA_ENTREGA, 112) AS Date_Delivery,
            CONVERT(VARCHAR, pe.FECHA_PEDIDO, 112) AS Order_Date,
            CASE 
                WHEN SUBSTRING(pe.CLIENTE, PATINDEX('%[A-Za-z]%', pe.CLIENTE), 1) NOT LIKE 'O' 
                THEN 'CN' + pe.CLIENTE 
                ELSE pe.CLIENTE 
            END AS Code_Account,
            pel.ARTICULO AS Code_Product,
            pel.LOTE AS Lot_Number,
            CAST(pel.CANTIDAD_FACTURADA AS NUMERIC(15, 2)) AS Quantity,
            CAST(pel.CANTIDAD_PEDIDA AS NUMERIC(15, 2)) AS Quantity_Order,
            ar.UNIDAD_VENTA AS Unit_Measure,
            CAST(pel.PRECIO_UNITARIO AS NUMERIC(15, 2)) AS Price_Br,
            CAST(
                pel.PRECIO_UNITARIO - 
                (pel.MONTO_DESCUENTO / NULLIF(pel.CANTIDAD_PEDIDA, 0)) 
                AS NUMERIC(15, 2)
            ) AS Price,
            CAST(
                (pel.PRECIO_UNITARIO - 
                (pel.MONTO_DESCUENTO / NULLIF(pel.CANTIDAD_PEDIDA, 0))) 
                * pel.CANTIDAD_PEDIDA AS NUMERIC(15, 2)
            ) AS Total_Amount,
            CAST(pel.PORC_DESCUENTO AS NUMERIC(5, 2)) AS Por_Discount1,
            CAST(pel.MONTO_DESCUENTO AS NUMERIC(15, 2)) AS Amount_Discount1,
            0.00 AS Por_Discount2,
            0.00 AS Amount_Discount2,
            0.00 AS Por_Discount3,
            0.00 AS Amount_Discount3,
            CAST(im.IMPUESTO1 AS NUMERIC(5, 2)) AS Por_Tax1,
            CAST(
                ((pel.PRECIO_UNITARIO - 
                (pel.MONTO_DESCUENTO / NULLIF(pel.CANTIDAD_PEDIDA, 0))) 
                * pel.CANTIDAD_PEDIDA) * (im.IMPUESTO1 / 100) 
                AS NUMERIC(15, 2)
            ) AS Amount_Tax1,
            CAST(im.IMPUESTO2 AS NUMERIC(5, 2)) AS Por_Tax2,
            CAST(
                ((pel.PRECIO_UNITARIO - 
                (pel.MONTO_DESCUENTO / NULLIF(pel.CANTIDAD_PEDIDA, 0))) 
                * pel.CANTIDAD_PEDIDA) * (im.IMPUESTO2 / 100) 
                AS NUMERIC(15, 2)
            ) AS Amount_Tax2,
            'RD' AS Code_Currency,
            pel.PEDIDO AS Order_Num_Cli,
            pe.CONDICION_PAGO AS Code_Paymentway,
            CASE 
                WHEN SUBSTRING(pe.VENDEDOR, PATINDEX('%[A-Za-z]%', pe.VENDEDOR), 1) NOT LIKE 'O' 
                THEN 'C' + pe.VENDEDOR 
                ELSE pe.VENDEDOR 
            END AS Code_Seller,
            '' AS Order_Type,
            0 AS Sale_Type, -- 0=Venta, 1=Regalo
            '' AS Code_ReturnCause,
            '' AS Code_Promotion,
            '' AS Code_Status,
            '1' AS Transfer_Status
        FROM 
            CATELLI.PEDIDO_LINEA pel
        INNER JOIN 
            CATELLI.PEDIDO pe ON pe.PEDIDO = pel.PEDIDO
        INNER JOIN 
            CATELLI.ARTICULO ar ON ar.ARTICULO = pel.ARTICULO
        INNER JOIN 
            CATELLI.IMPUESTO im ON im.IMPUESTO = ar.IMPUESTO
        WHERE 
            pe.FECHA_PEDIDO >= '2024-05-01' 
            AND pel.CANTIDAD_PEDIDA <> 0 
            AND pe.estado = 'F' 
            AND pe.VENDEDOR NOT IN ('999', '998', '22');`);

      const datos = result.recordset;

      if (datos.length === 0) {
        logger.info(`${taskName} : No hay datos para transferir `);
        return {
          success: true,
          message: "No hay datos para transferir",
          row: 0,
        };
      }

      //Validar datos
      const { validData, invalidData } = await validateData(
        datos,
        validationRules.hist_orders,
        server2Pool
      );

      const transaction = server2Pool.transaction();
      await transaction.begin();

      for (const dato of validData) {
        const request = transaction.request();

        await request
          .input("Order_Num", dato.Order_Num)
          .input("Num_Line", dato.Num_Line)
          .input("Order_Num_ofClient", dato.Order_Num_ofClient)
          .input("Type_Rec", dato.Type_Rec)
          .input("Date_Delivery", dato.Date_Delivery)
          .input("Order_Date", dato.Order_Date)
          .input("Code_Account", dato.Code_Account)
          .input("Code_Product", dato.Code_Product)
          .input("Lot_Number", dato.Lot_Number)
          .input("Quantity", dato.Quantity)
          .input("Quantity_Order", dato.Quantity_Order)
          .input("Unit_Measure", dato.Unit_Measure)
          .input("Price", dato.Price)
          .input("Total_Amount", dato.Total_Amount)
          .input("Por_Discount1", dato.Por_Discount1)
          .input("Amount_Discount1", dato.Amount_Discount1)
          .input("Por_Discount2", dato.Por_Discount2)
          .input("Amount_Discount2", dato.Amount_Discount2)
          .input("Por_Discount3", dato.Por_Discount3)
          .input("Amount_Discount3", dato.Amount_Discount3)
          .input("Por_Tax1", dato.Por_Tax1)
          .input("Amount_Tax1", dato.Amount_Tax1)
          .input("Amount_Tax2", dato.Amount_Tax2)
          .input("Code_Currency", dato.Code_Currency)
          .input("Order_Num_Cli", dato.Order_Num_Cli)
          .input("Code_Paymentway", dato.Code_Paymentway)
          .input("Code_Seller", dato.Code_Seller)
          .input("Order_Type", dato.Order_Type)
          .input("Sale_Type", dato.Sale_Type)
          .input("Code_ReturnCause", dato.Code_ReturnCause)
          .input("Code_Promotion", dato.Code_Promotion)
          .input("Code_Status", dato.Code_Status)
          .input("Transfer_Status", dato.Transfer_Status).query(`
          INSERT INTO dbo.IMPLT_hist_orders (Order_Num,
              Num_Line,
              Order_Num_ofClient,
              Type_Rec,
              Date_Delivery,
              Order_Date,
              Code_Account,
              Code_Product,
              Lot_Number,
              Quantity,
              Quantity_Order,
              Unit_Measure,
              Price,
              Total_Amount,
              Por_Discount1,
              Amount_Discount1,
              Por_Discount2,
              Amount_Discount2,
              Por_Discount3,
              Amount_Discount3,
              Por_Tax1,
              Amount_Tax1,
              Amount_Tax2,
              Code_Currency,
              Order_Num_Cli,
              Code_Paymentway,
              Code_Seller,
              Order_Type,
              Sale_Type,
              Code_ReturnCause,
              Code_Promotion,
              Code_Status,
              Transfer_Status) VALUES (@Order_Num,
              @Num_Line,
              @Order_Num_ofClient,
              @Type_Rec,
              @Date_Delivery,
              @Order_Date,
              @Code_Account,
              @Code_Product,
              @Lot_Number,
              @Quantity,
              @Quantity_Order,
              @Unit_Measure,
              @Price,
              @Total_Amount,
              @Por_Discount1,
              @Amount_Discount1,
              @Por_Discount2,
              @Amount_Discount2,
              @Por_Discount3,
              @Amount_Discount3,
              @Por_Tax1,
              @Amount_Tax1,
              @Amount_Tax2,
              @Code_Currency,
              @Order_Num_Cli,
              @Code_Paymentway,
              @Code_Seller,
              @Order_Type,
              @Sale_Type,
              @Code_ReturnCause,
              @Code_Promotion,
              @Code_Status,
              @Transfer_Status)`);
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
    300,
    taskName
  );
};
const transfertrucks = async () => {
  const taskName = "Transferencia de trucks";
  return await retry(
    async () => {
      const server1Pool = await connectToServer1;
      const server2Pool = await connectToServer2;
      const result = await server1Pool.request().query(`
        SELECT 
            Code,
            Code_Unit_Org,
            Code_Sales_Org,
            Description,
            Plate,
            CASE 
                WHEN SUBSTRING(Code_Seller, PATINDEX('%[A-Za-z]%', Code_Seller), 1) NOT LIKE 'O' 
                THEN 'C' + Code_Seller 
                ELSE Code_Seller 
            END AS Code_Seller,
            Source_Create,
            Transfer_status
        FROM 
            CATELLI.trucks;`);

      const datos = result.recordset;

      if (datos.length === 0) {
        logger.info(`${taskName} : No hay datos para transferir `);
        return {
          success: true,
          message: "No hay datos para transferir",
          row: 0,
        };
      }

      //Validar datos
      const { validData } = await validateData(
        datos,
        validationRules.trucks,
        server2Pool
      );

      const transaction = server2Pool.transaction();
      await transaction.begin();

      for (const dato of validData) {
        const request = transaction.request();

        await request
          .input("Code", dato.Code)
          .input("Code_Unit_Org", dato.Code_Unit_Org)
          .input("Code_Sales_Org", dato.Code_Sales_Org)
          .input("Description", dato.Description)
          .input("Plate", dato.Plate)
          .input("Code_Seller", dato.Code_Seller)
          .input("Source_Create", dato.Source_Create)
          .input("Transfer_status", dato.Transfer_status).query(`
          INSERT INTO dbo.IMPLT_trucks (
            Code,
            Code_Unit_Org,
            Code_Sales_Org,
            Description,
            Plate,
            Code_Seller, 
            Source_Create, 
            Transfer_status) VALUES (@Code,
            @Code_Unit_Org,
            @Code_Sales_Org,
            @Description,
            @Plate,
            @Code_Seller, 
            @Source_Create, 
            @Transfer_status)`);
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
    300,
    taskName
  );
};

addTransferTask("Transferencia de cliente", transferClientes);
addTransferTask(
  "Transferencia de account_agrupation1",
  transferaccounts_agrupation1
);
addTransferTask(
  "Transferencia de account_agrupation2",
  transferaccounts_agrupation2
);
addTransferTask(
  "Transferencia de accounts_agrupation3",
  transferaccounts_agrupation3
);
addTransferTask("Transferencia de account_credit", transferaccounts_credit);
addTransferTask("Transferencia de payment_termt", transferpayment_termt);
addTransferTask("Transferencia de products", transferproducts);
addTransferTask(
  "Transferencia de product_hierarchy2",
  transferproducts_hierarchy2
);
addTransferTask(
  "Transferencia de product_hierarchy3",
  transferproducts_hierarchy3
);
addTransferTask(
  "Transferencia de product_hierarchy4",
  transferproducts_hierarchy4
);
addTransferTask("Transferencia de products_measure", transferproducts_measure);
addTransferTask(
  "Transferencia de collections_pending",
  transfercollections_pending
);
addTransferTask("Transferencia de hist_orders", transferhist_orders);
addTransferTask("Transferencia de trucks", transfertrucks);

module.exports = {
  transferClientes,
  transferaccounts_agrupation1,
  transferaccounts_agrupation2,
  transferaccounts_agrupation3,
  transferaccounts_credit,
  transferpayment_termt,
  transferproducts,
  transferproducts_hierarchy2,
  transferproducts_hierarchy3,
  transferproducts_hierarchy4,
  transferproducts_measure,
  transferhist_orders,
  transfercollections_pending,
  transfertrucks,
};
