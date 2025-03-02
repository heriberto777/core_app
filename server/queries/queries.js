const queries = [
  {
    name: "IMPLT_accounts",
    query: `WITH IMPLT_accounts AS (
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
            U_LONGITUD AS Length,
            MONEDA AS Code_Currency,
            CASE
                WHEN NIVEL_PRECIO IN ('COLGATE', 'BRONZE', 'GOLD', 'SILVER', 'LISTA_MA', 'LISTA_INN', 'LISTA_SM', 'LISTA_IND', 'IND_VIP') THEN '01'
                ELSE '999999999999999999999999999999'
            END AS Code_Warehouse,
            CASE
                WHEN U_607_CLIENTE_GENERICO = 'NO' THEN '0'
                ELSE '1'
            END AS Gen_Account
      FROM IMPLT_accounts`,
  },
  {
    name: "IMPLT_accounts_agrupation1",
    query: `
    SELECT 
        TRIM(cc.CATEGORIA_CLIENTE) AS Code,
        TRIM(cc.DESCRIPCION) AS Description,
        '1' AS Transfer_Status
    FROM CATELLI.CATEGORIA_CLIENTE cc
    WHERE cc.CATEGORIA_CLIENTE IS NOT NULL`,
  },
  {
    name: "IMPLT_accounts_agrupation2",
    query: `
    SELECT 
        TRIM(cc.CATEGORIA_CLIENTE) AS Code,
        TRIM(cc.CATEGORIA_CLIENTE) AS Code_Agrupation1,
        TRIM(cc.DESCRIPCION) AS Description,
        '1' AS Transfer_Status
    FROM CATELLI.CATEGORIA_CLIENTE cc
    WHERE cc.CATEGORIA_CLIENTE IS NOT NULL;
`,
  },
  {
    name: "IMPLT_accounts_agrupation3",
    query: `
        SELECT 
        cc.CATEGORIA_CLIENTE AS 'Code',
        cc.CATEGORIA_CLIENTE AS 'Code_Agrupation1',
        cc.DESCRIPCION AS 'Description',
        '1' AS 'Transfer_Status'
        FROM CATELLI.CATEGORIA_CLIENTE cc
        WHERE cc.CATEGORIA_CLIENTE IS NOT NULL`,
  },

  {
    name: "IMPLT_accounts_credit",
    query: `SELECT 
        CASE 
            WHEN SUBSTRING(CL.CLIENTE, PATINDEX('%[A-Za-z]%', CL.CLIENTE), 1) NOT LIKE 'O' 
            THEN CONCAT('CN', CL.CLIENTE) 
            ELSE CL.CLIENTE 
        END AS Code_Account,
        CAST(CL.LIMITE_CREDITO AS NUMERIC(15,2)) AS Credit_Limit,
        CAST(CL.SALDO AS NUMERIC(15,2)) AS Credit_Consum,
        CL.MOROSO AS Lock_Credit,
        '0' As Source_Create,
        '1' AS Transfer_Status
    FROM CATELLI.CLIENTE CL
    WHERE CL.ACTIVO = 'S' 
        AND CL.CLIENTE NOT LIKE 'N%' 
        AND CL.VENDEDOR NOT IN ('999', '998', '22');`,
  },
  {
    name: "IMPLT_payment_term",
    query: `SELECT 
        cp.CONDICION_PAGO AS Code,
        cp.DESCRIPCION AS Description,
        CASE 
            WHEN cp.DIAS_NETO IN (0, 1) THEN 0 
            ELSE 1 
        END AS Credit, -- Indicador del termino: 0=Contado, 1=Credito
        cp.DIAS_NETO AS Days,
        '1' AS Transfer_Status
    FROM CATELLI.CONDICION_PAGO cp
    WHERE cp.CONDICION_PAGO NOT IN (
        'C', 'C10', 'C20', '0', '21', '30', '1', 
        '45', '7', '15', '14', '28', '11', '41', 
        '5', '22', '60'
    );`,
  },
  {
    name: "IMPLT_products",
    query: `
    SELECT 
        ar.ARTICULO AS Code_ofClient,
        ar.DESCRIPCION AS Description,
        NULL AS Description_short,
        '01' AS Code_Hierarchy1,
        NULL AS Code_Hierarchy2,
        NULL AS Code_Hierarchy3,
        NULL AS Code_Hierarchy4,
        ar.CLASIFICACION_1 AS Code_ClassificationA,
        ar.CLASIFICACION_2 AS Code_ClassificationB,
        ar.CLASIFICACION_3 AS Code_ClassificationC,
        ar.CLASIFICACION_4 AS Code_ClassificationD,
        ar.CLASIFICACION_5 AS Code_ClassificationE,
        CASE WHEN ar.ACTIVO = 'S' THEN 1 ELSE 0 END AS Code_Status,
        NULL AS Ean14,
        CAST(ar.PESO_BRUTO AS NUMERIC(15,2)) AS Factor_Conversion,
        
        COALESCE(tu.Descripcion, ar.UNIDAD_VENTA) AS Unit_Type_Sales,
        COALESCE(tui.Descripcion, ar.UNIDAD_EMPAQUE) AS Unit_Type_Inv,

        CAST(ar.PESO_NETO AS NUMERIC(15,2)) AS Weight,
        NULL AS Unit_Type_Weight,
        NULL AS Factor_Convert_W,
        0 AS Trazability,
        CAST(ar.VOLUMEN AS NUMERIC(15,2)) AS Volume,
        NULL AS Unit_type_volume,
        CAST(im.IMPUESTO1 AS NUMERIC(15,2)) AS Tax1,
        COALESCE(tui.Descripcion, ar.UNIDAD_EMPAQUE) AS Code_Unit_Type_Box,
        '0' As Source_Create,
        '1' AS Transfer_Status
    FROM CATELLI.ARTICULO ar
    LEFT JOIN CATELLI.IMPUESTO im ON im.IMPUESTO = ar.IMPUESTO
    LEFT JOIN CATELLI.UNIDAD_DE_MEDIDA un ON ar.UNIDAD_VENTA = un.UNIDAD_MEDIDA
    LEFT JOIN Tipo_Unidad tu ON LEFT(ar.MANUFACTURADOR, 2) = tu.Cod_Unidad
    LEFT JOIN Tipo_Unidad tui ON LEFT(ar.UNIDAD_EMPAQUE, 2) = tui.Cod_Unidad
    WHERE ar.ACTIVO = 'S' AND ar.CLASIFICACION_4 NOT LIKE 'GND%';`,
  },

  {
    name: "IMPLT_products_hierarchy2",
    query: `
        SELECT 
            CAST(cl.CLASIFICACION AS VARCHAR(50)) AS Code,
            '1' AS Code_Hierarchy1,
            CAST(cl.DESCRIPCION AS VARCHAR(255)) AS Description,
            '1' AS Transfer_Status
        FROM CATELLI.CLASIFICACION cl
        WHERE cl.AGRUPACION = 1 AND cl.U_jerarquia = '1';
    `,
  },
  {
    name: "IMPLT_products_hierarchy3",
    query: `
        SELECT 
            CAST(cl.CLASIFICACION AS VARCHAR(50)) AS Code,
            '1' AS Code_Hierarchy1,
            CAST(cl.U_jerarquia AS VARCHAR(50)) AS Code_Hierarchy2,
            CAST(cl.DESCRIPCION AS VARCHAR(255)) AS Description,
            '1' AS Transfer_Status
        FROM CATELLI.CLASIFICACION cl
        WHERE cl.AGRUPACION = 2 AND cl.U_jerarquia <> '';
    `,
  },
  {
    name: "IMPLT_products_hierarchy4",
    query: `
        WITH HierarchyLevel1 AS (
            SELECT CLASIFICACION, DESCRIPCION, AGRUPACION, U_JERARQUIA
            FROM CATELLI.CLASIFICACION
            WHERE AGRUPACION = 1 AND U_JERARQUIA <> ''
        ),
        HierarchyLevel2 AS (
            SELECT CLASIFICACION, DESCRIPCION, AGRUPACION, U_JERARQUIA
            FROM CATELLI.CLASIFICACION
            WHERE AGRUPACION = 2 AND U_JERARQUIA <> ''
        ),
        HierarchyLevel3 AS (
            SELECT CLASIFICACION, DESCRIPCION, AGRUPACION, U_JERARQUIA
            FROM CATELLI.CLASIFICACION
            WHERE AGRUPACION = 3 AND U_JERARQUIA <> ''
        )
        SELECT 
            t1.CLASIFICACION AS Code,
            '1' AS Code_Hierarchy1,
            t3.CLASIFICACION AS Code_Hierarchy2,
            t2.CLASIFICACION AS Code_Hierarchy3,
            t1.DESCRIPCION AS Description,
            '1' AS Transfer_Status
        FROM HierarchyLevel3 t1
        LEFT JOIN HierarchyLevel2 t2 ON t1.U_JERARQUIA = t2.CLASIFICACION
        LEFT JOIN HierarchyLevel1 t3 ON t2.U_JERARQUIA = t3.CLASIFICACION;
    `,
  },
  {
    name: "IMPLT_products_measure",
    query: `
        WITH ProductMeasure AS (
            SELECT 
                ar.ARTICULO AS Code_Product,
                CASE 
                    WHEN LEFT(ar.MANUFACTURADOR, 2) IN ('CA', 'FA', 'CO', 'GA', 'SA', 'DI', 'RI', 'UN', 'CB') 
                        THEN 
                            CASE LEFT(ar.MANUFACTURADOR, 2)
                                WHEN 'CA' THEN 'CAJA'
                                WHEN 'FA' THEN 'FDR'
                                WHEN 'CO' THEN 'CMB'
                                WHEN 'GA' THEN 'GLN'
                                WHEN 'SA' THEN 'SACO'
                                WHEN 'DI' THEN 'DSP'
                                WHEN 'RI' THEN 'RST'
                                WHEN 'UN' THEN 'UND'
                                WHEN 'CB' THEN 'CB'
                            END
                    ELSE 'UND' 
                END AS Unit_Measure,
                CAST(ar.PESO_BRUTO AS numeric(15,2)) AS Factor_Conversion, 
                '1' AS Transfer_Status
            FROM CATELLI.ARTICULO ar
            INNER JOIN CATELLI.UNIDAD_DE_MEDIDA un ON ar.UNIDAD_VENTA = un.UNIDAD_MEDIDA
            WHERE 
                ar.ACTIVO = 'S' 
                AND ar.CLASIFICACION_4 NOT IN ('GND') 
                AND ar.TIPO NOT IN ('K')
                AND LEFT(ar.MANUFACTURADOR, 2) NOT IN ('UN', 'DI')

            UNION ALL

            SELECT 
                ar.ARTICULO AS Code_Product,
                ar.UNIDAD_VENTA AS Unit_Measure,
                CAST(ar.FACTOR_CONVER_1 AS numeric(15,2)) AS Factor_Conversion,
                '1' AS Transfer_Status
            FROM CATELLI.ARTICULO ar
            INNER JOIN CATELLI.UNIDAD_DE_MEDIDA un ON ar.UNIDAD_VENTA = un.UNIDAD_MEDIDA
            WHERE 
                ar.ACTIVO = 'S' 
                AND ar.CLASIFICACION_4 NOT IN ('GND') 
                AND ar.TIPO NOT IN ('K')
                AND NOT (
                    (LEFT(ar.MANUFACTURADOR, 2) IN ('CO', 'CA', 'FA', 'GA', 'SA', 'FA', 'CB') AND ar.PESO_BRUTO = 1)
                )
        )
        SELECT * FROM ProductMeasure;
    `,
  },

  {
    name: "IMPLT_collections_pending",
    query: `
        WITH CollectionsPending AS (
            SELECT 
                do.DOCUMENTO AS Num_Invoice,
                do.DOCUMENTO AS NumDocum,
                CONVERT(VARCHAR, do.FECHA_DOCUMENTO, 112) AS Date_Doc,
                CASE 
                    WHEN LEFT(do.CLIENTE, 1) BETWEEN 'A' AND 'Z' AND LEFT(do.CLIENTE, 1) <> 'O' 
                        THEN 'CN' + do.CLIENTE 
                    ELSE do.CLIENTE 
                END AS Code_Account,
                CASE 
                    WHEN do.TIPO IN ('FAC') THEN '01'
                    WHEN do.TIPO IN ('N/D') THEN '02'
                    WHEN do.TIPO IN ('N/C') THEN 'NC'
                    ELSE 'ND' 
                END AS Code_Type,
                CAST(do.MONTO AS numeric(15,2)) AS Total_Amount,
                CAST((do.MONTO - do.SALDO) AS numeric(15,2)) AS Total_Collected,
                CONVERT(VARCHAR, do.FECHA_VENCE, 112) AS Date_End,
                do.CONDICION_PAGO AS Code_Payment,
                CAST(do.SUBTOTAL AS numeric(15,2)) AS Amount_Gross,
                '1' AS Transfer_Status
            FROM CATELLI.DOCUMENTOS_CC do
            WHERE 
                do.FECHA >= '2024-02-01 00:00:00.000'
                AND do.SALDO > 0
                AND do.TIPO IN ('FAC', 'N/D', 'O/D')
        )
        SELECT * FROM CollectionsPending;
    `,
  },
  {
    name: "IMPLT_hist_orders",
    query: `
        WITH HistOrders AS (
            SELECT 
                pel.PEDIDO AS Order_Num,
                pel.PEDIDO_LINEA AS Num_Line,
                pel.PEDIDO AS Order_Num_ofClient,
                'S' AS Type_Rec,
                CONVERT(VARCHAR, pel.FECHA_ENTREGA, 112) AS Date_Delivery,
                CONVERT(VARCHAR, pe.FECHA_PEDIDO, 112) AS Order_Date,
                CASE 
                    WHEN LEFT(pe.CLIENTE, 1) BETWEEN 'A' AND 'Z' AND LEFT(pe.CLIENTE, 1) <> 'O' 
                        THEN 'CN' + pe.CLIENTE 
                    ELSE pe.CLIENTE 
                END AS Code_Account,
                pel.ARTICULO AS Code_Product,
                pel.LOTE AS Lot_Number,
                CAST(pel.CANTIDAD_FACTURADA AS NUMERIC(15,2)) AS Quantity,
                CAST(pel.CANTIDAD_PEDIDA AS NUMERIC(15,2)) AS Quantity_Order,
                ar.UNIDAD_VENTA AS Unit_Measure,
                CAST(pel.PRECIO_UNITARIO AS NUMERIC(15,2)) AS Price_Br,
                CAST(pel.PRECIO_UNITARIO - (pel.MONTO_DESCUENTO / NULLIF(pel.CANTIDAD_PEDIDA, 0)) AS NUMERIC(15,2)) AS Price,
                CAST((pel.PRECIO_UNITARIO - (pel.MONTO_DESCUENTO / NULLIF(pel.CANTIDAD_PEDIDA, 0))) * pel.CANTIDAD_PEDIDA AS NUMERIC(15,2)) AS Total_Amount,
                CAST(im.IMPUESTO1 AS NUMERIC(5,2)) AS Por_Tax1,
                CAST(((pel.PRECIO_UNITARIO - (pel.MONTO_DESCUENTO / NULLIF(pel.CANTIDAD_PEDIDA, 0))) * pel.CANTIDAD_PEDIDA) * (im.IMPUESTO1 / 100) AS NUMERIC(15,2)) AS Amount_Tax1,
                'RD' AS Code_Currency,
                pe.CONDICION_PAGO AS Code_Paymentway,
                CASE 
                    WHEN LEFT(pe.VENDEDOR, 1) BETWEEN 'A' AND 'Z' AND LEFT(pe.VENDEDOR, 1) <> 'O' 
                        THEN 'C' + pe.VENDEDOR 
                    ELSE pe.VENDEDOR 
                END AS Code_Seller,
                '1' AS Transfer_Status
            FROM CATELLI.PEDIDO_LINEA pel
            INNER JOIN CATELLI.PEDIDO pe ON pe.PEDIDO = pel.PEDIDO
            INNER JOIN CATELLI.ARTICULO ar ON ar.ARTICULO = pel.ARTICULO
            INNER JOIN CATELLI.IMPUESTO im ON im.IMPUESTO = ar.IMPUESTO
            WHERE 
                pe.FECHA_PEDIDO >= '2024-05-01 00:00:00.000'
                AND pel.CANTIDAD_PEDIDA <> 0
                AND pe.ESTADO = 'F'
                AND pe.VENDEDOR NOT IN ('999','998','22')
        )
        SELECT * FROM HistOrders;
    `,
  },
  {
    name: "IMPLT_trucks",
    query: `
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
            CATELLI.trucks;`,
  },
  {
    name: "IMPLT_accounts_function",
    query: `
  WITH AccountsFunction AS (
    SELECT 
        CASE 
            WHEN LEFT(cl.CLIENTE, 1) BETWEEN 'A' AND 'Z' AND LEFT(cl.CLIENTE, 1) <> 'O' 
                THEN 'CN' + cl.CLIENTE 
            ELSE cl.CLIENTE 
        END AS Code_Account,
        'CATELLI' AS Code_Unit_Org,
        'CATELLI' AS Code_Sales_Org,
        CASE 
            WHEN LEFT(cl.CLIENTE, 1) BETWEEN 'A' AND 'Z' AND LEFT(cl.CLIENTE, 1) <> 'O' 
                THEN 'CN' + cl.CLIENTE 
            ELSE cl.CLIENTE 
        END AS Code_Function,
        NULL AS Code_Type_Function,
        '1' AS By_Default,
        NULL AS Notes,
        NULL AS Specialties,
        NULL AS Sub_Specialties,
        NULL AS Additional,
        '0' AS Is_Plus,
        SUBSTRING(LTRIM(REPLACE(REPLACE(COALESCE(cl.TELEFONO1, ''), '/', ''), '|', '')), 1, 12) AS Phone1,
        SUBSTRING(LTRIM(REPLACE(REPLACE(COALESCE(cl.TELEFONO1, ''), '/', ''), '|', '')), 13, 30) AS Phone2,
        cl.E_MAIL AS E_mail,
        'Q' AS Code_Frecuency,
        '1' AS Code_Week1,
        MAX(CASE WHEN rc.DIA = 0 THEN '1' ELSE '0' END) AS Visit_Mon1,
        MAX(CASE WHEN rc.DIA = 1 THEN '1' ELSE '0' END) AS Visit_Tue1,
        MAX(CASE WHEN rc.DIA = 2 THEN '1' ELSE '0' END) AS Visit_Wen1,
        MAX(CASE WHEN rc.DIA = 3 THEN '1' ELSE '0' END) AS Visit_Thu1,
        MAX(CASE WHEN rc.DIA = 4 THEN '1' ELSE '0' END) AS Visit_Fri1,
        MAX(CASE WHEN rc.DIA = 5 THEN '1' ELSE '0' END) AS Visit_Sat1,
        MAX(CASE WHEN rc.DIA = 6 THEN '1' ELSE '0' END) AS Visit_Sun1,
        '0' AS Code_Week2,
        MAX(CASE WHEN rc.DIA = 0 THEN '1' ELSE '0' END) AS Visit_Mon2,
        MAX(CASE WHEN rc.DIA = 1 THEN '1' ELSE '0' END) AS Visit_Tue2,
        MAX(CASE WHEN rc.DIA = 2 THEN '1' ELSE '0' END) AS Visit_Wen2,
        MAX(CASE WHEN rc.DIA = 3 THEN '1' ELSE '0' END) AS Visit_Thu2,
        MAX(CASE WHEN rc.DIA = 4 THEN '1' ELSE '0' END) AS Visit_Fri2,
        MAX(CASE WHEN rc.DIA = 5 THEN '1' ELSE '0' END) AS Visit_Sat2,
        MAX(CASE WHEN rc.DIA = 6 THEN '1' ELSE '0' END) AS Visit_Sun2,
        1 AS Transfer_status
    FROM CATELLI.CLIENTE cl
    INNER JOIN erpadmin.ruta_cliente rc ON cl.CLIENTE = rc.CLIENTE
    WHERE cl.ACTIVO = 'S' 
        AND cl.CLIENTE NOT LIKE 'N%' 
        AND cl.VENDEDOR NOT IN ('999', '998', '22')
    GROUP BY cl.CLIENTE, cl.TELEFONO1, cl.E_MAIL
)
SELECT * FROM AccountsFunction;`,
  },
  {
    name: "IMPLT_accounts_org",
    query: `WITH AccountsOrg AS (
    SELECT 
        CASE 
            WHEN LEFT(cl.CLIENTE, 1) BETWEEN 'A' AND 'Z' AND LEFT(cl.CLIENTE, 1) <> 'O' 
                THEN 'CN' + cl.CLIENTE 
            ELSE cl.CLIENTE 
        END AS Code_Account,
        'CATELLI' AS Code_Unit_Org,
        'CATELLI' AS Code_Sales_Org,
        CASE WHEN cl.ACTIVO = 'S' THEN 1 ELSE 0 END AS Code_Status,
        cl.CONDICION_PAGO AS Code_Payment,
        cl.NIVEL_PRECIO AS Code_Price_List,
        NULL AS Code_Plant,
        cl.MONEDA AS Code_Currency,
        '1' AS Price_Schema,
        NULL AS IBAN,
        cl.TIPO_CONTRIBUYENTE AS Code_Segment,
        CASE WHEN cp.DIAS_NETO <> 0 THEN '1' ELSE '0' END AS Code_Payment_method,
        1 AS Transfer_status
    FROM CATELLI.CLIENTE cl
    INNER JOIN CATELLI.CONDICION_PAGO cp 
        ON cp.CONDICION_PAGO = cl.CONDICION_PAGO
    WHERE cl.VENDEDOR NOT IN ('999', '998', '22')
)
SELECT * FROM AccountsOrg;
`,
  },
  {
    name: "IMPLT_accounts_organ_credit",
    query: `
    WITH AccountsOrganCredit AS (
        SELECT 
            CASE 
                WHEN LEFT(cl.CLIENTE, 1) BETWEEN 'A' AND 'Z' AND LEFT(cl.CLIENTE, 1) <> 'O' 
                    THEN 'CN' + cl.CLIENTE 
                ELSE cl.CLIENTE 
            END AS Code_Account,
            'CATELLI' AS Code_Unit_Org,
            'CATELLI' AS Code_Sales_Org,
            CAST(cl.LIMITE_CREDITO AS NUMERIC(15,2)) AS Credit_Limit,
            CAST(cl.SALDO AS NUMERIC(15,2)) AS Credit_Consum,
            cl.MOROSO AS Lock_Credit,
            1 AS Transfer_status
        FROM CATELLI.CLIENTE cl
        WHERE cl.ACTIVO = 'S' 
            AND cl.CLIENTE NOT LIKE 'N%' 
            AND cl.VENDEDOR NOT IN ('999', '998', '22')
    )
    SELECT * FROM AccountsOrganCredit;
  `,
  },
  {
    name: "IMPLT_accounts_organization",
    query: `
    WITH AccountsOrganization AS (
        SELECT 
            CASE 
                WHEN LEFT(CL.CLIENTE, 1) BETWEEN 'A' AND 'Z' AND LEFT(CL.CLIENTE, 1) <> 'O' 
                    THEN 'CN' + CL.CLIENTE 
                ELSE CL.CLIENTE 
            END AS Code_Account,
            'CATELLI' AS Code_Unit_Org,
            'CATELLI' AS Code_Sales_Org,
            CASE 
                WHEN LEFT(CL.VENDEDOR, 1) BETWEEN 'A' AND 'Z' AND LEFT(CL.VENDEDOR, 1) <> 'O' 
                    THEN 'C' + CL.VENDEDOR 
                ELSE CL.VENDEDOR 
            END AS Code_Seller,
            CASE WHEN CL.ACTIVO = 'S' THEN 1 ELSE 0 END AS Code_Status,
            1 AS Transfer_status
        FROM CATELLI.CLIENTE CL
        WHERE CL.CLIENTE NOT LIKE 'N%' 
            AND CL.CATEGORIA_CLIENTE NOT LIKE 'EM'  
            AND CL.VENDEDOR NOT IN ('999', '998', '22')
    )
    SELECT * FROM AccountsOrganization;
  `,
  },
  {
    name: "IMPLT_accounts_payment",
    query: `
    WITH AccountsPayment AS (
        SELECT 
            CASE 
                WHEN LEFT(CL.CLIENTE, 1) BETWEEN 'A' AND 'Z' AND LEFT(CL.CLIENTE, 1) <> 'O' 
                    THEN 'CN' + CL.CLIENTE 
                ELSE CL.CLIENTE 
            END AS Code_Account,
            'CATELLI' AS Code_Sales_Org,
            CL.CONDICION_PAGO AS Code_Payment,
            1 AS Transfer_status
        FROM CATELLI.CLIENTE CL
        WHERE CL.ACTIVO = 'S' 
            AND CL.CLIENTE NOT LIKE 'N%' 
            AND CL.VENDEDOR NOT IN ('999', '998', '22')
    )
    SELECT * FROM AccountsPayment;
  `,
  },
  {
    name: "IMPLT_addresses",
    query: `
    WITH AddressData AS (
        SELECT 
            CASE 
                WHEN LEFT(cl.CLIENTE, 1) BETWEEN 'A' AND 'Z' AND LEFT(cl.CLIENTE, 1) <> 'O' 
                    THEN 'CN' + cl.CLIENTE 
                ELSE cl.CLIENTE 
            END AS Code_ofClient,
            cl.PAIS AS Code_Country,
            CASE 
                WHEN LEFT(cl.ZONA, 1) BETWEEN 'A' AND 'Z' AND LEFT(cl.ZONA, 1) <> 'O' 
                    THEN 'CN' + cl.ZONA 
                ELSE cl.ZONA 
            END AS Code_Region,
            NULL AS ZIP,
            LEFT(LTRIM(REPLACE(REPLACE(REPLACE(CAST(cl.DIRECCION AS VARCHAR(8000)), '|', ''), 'DETALLE:', ''), ',', '')), 75) AS Address1,
            RIGHT(LTRIM(REPLACE(REPLACE(REPLACE(CAST(cl.DIRECCION AS VARCHAR(8000)), '|', ''), 'DETALLE:', ''), ',', '')), 75) AS Address2,
            NULL AS Population,
            LEFT(RTRIM(LTRIM(REPLACE(REPLACE(cl.TELEFONO1, '/', ''), '|', ''))), 12) AS Phone1,
            RIGHT(RTRIM(LTRIM(REPLACE(REPLACE(cl.TELEFONO1, '/', ''), '|', ''))), 30) AS Phone2,
            LTRIM(REPLACE(REPLACE(cl.FAX, '/', ''), '|', '')) AS Fax,
            cl.E_MAIL AS E_mail,
            CASE WHEN cl.ACTIVO = 'S' THEN 1 ELSE 0 END AS Code_Status,
            1 AS Transfer_status
        FROM CATELLI.CLIENTE cl
        WHERE cl.ACTIVO = 'S' 
            AND cl.CLIENTE NOT LIKE 'N%' 
            AND cl.VENDEDOR NOT IN ('999', '998', '22')
    )
    SELECT * FROM AddressData;
  `,
  },
  {
    name: "IMPLT_addresses_accounts",
    query: `
    WITH AddressAccounts AS (
        SELECT 
            CASE 
                WHEN LEFT(cl.CLIENTE, 1) BETWEEN 'A' AND 'Z' AND LEFT(cl.CLIENTE, 1) <> 'O' 
                    THEN 'CN' + cl.CLIENTE 
                ELSE cl.CLIENTE 
            END AS Code_Address,
            'CATELLI' AS Code_Unit_Org,
            'CATELLI' AS Code_Sales_Org,
            cl.CLIENTE AS Code_Account,
            '1' AS By_Default,
            1 AS Transfer_status
        FROM CATELLI.CLIENTE cl
        WHERE cl.ACTIVO = 'S' 
            AND cl.CLIENTE NOT LIKE 'N%' 
            AND cl.VENDEDOR NOT IN ('999', '998', '22')
    )
    SELECT * FROM AddressAccounts;
  `,
  },
  {
    name: "IMPLT_addresses_org",
    query: `
    WITH AddressesOrg AS (
        SELECT 
            CASE 
                WHEN LEFT(cl.CLIENTE, 1) BETWEEN 'A' AND 'Z' AND LEFT(cl.CLIENTE, 1) <> 'O' 
                    THEN 'CN' + cl.CLIENTE 
                ELSE cl.CLIENTE 
            END AS Code_Address,
            'CATELLI' AS Code_Unit_Org,
            'CATELLI' AS Code_Sales_Org,
            CASE WHEN cl.ACTIVO = 'S' THEN 1 ELSE 0 END AS Code_Status,
            1 AS Transfer_status
        FROM CATELLI.CLIENTE cl
        WHERE cl.ACTIVO = 'S' 
            AND cl.CLIENTE NOT LIKE 'N%' 
            AND cl.VENDEDOR NOT IN ('999', '998', '22')
    )
    SELECT * FROM AddressesOrg;
  `,
  },
  {
    name: "IMPLT_addresses_organization",
    query: `
    WITH AddressesOrg AS (
        SELECT 
            CASE 
                WHEN LEFT(cl.CLIENTE, 1) BETWEEN 'A' AND 'Z' AND LEFT(cl.CLIENTE, 1) <> 'O' 
                    THEN 'CN' + cl.CLIENTE 
                ELSE cl.CLIENTE 
            END AS Code_Address,
            'CATELLI' AS Code_Unit_Org,
            'CATELLI' AS Code_Sales_Org,
            cl.VENDEDOR AS Code_Seller,
            CASE WHEN cl.ACTIVO = 'S' THEN 1 ELSE 0 END AS Code_Status,
            1 AS Transfer_status
        FROM CATELLI.CLIENTE cl
        WHERE cl.ACTIVO = 'S' 
            AND cl.CLIENTE NOT LIKE 'N%' 
            AND cl.VENDEDOR NOT IN ('999', '998', '22')
    )
    SELECT * FROM AddressesOrg;
  `,
  },
  {
    name: "IMPLT_contacts",
    query: `
    WITH Contacts AS (
        SELECT 
            CASE 
                WHEN LEFT(cl.CLIENTE, 1) BETWEEN 'A' AND 'Z' AND LEFT(cl.CLIENTE, 1) <> 'O' 
                    THEN 'CN' + cl.CLIENTE 
                ELSE cl.CLIENTE 
            END AS Code_ofClient,
            LEFT(LTRIM(REPLACE(CAST(cl.CONTACTO AS VARCHAR(8000)), ',', '')), 75) AS Name1,
            LTRIM(REPLACE(cl.CONTRIBUYENTE, '|', '')) AS NIF,
            LEFT(LTRIM(REPLACE(REPLACE(REPLACE(CAST(cl.DIRECCION AS VARCHAR(8000)), '|', ''), 'DETALLE:', ''), ',', '')), 75) AS Address,
            LEFT(LTRIM(REPLACE(REPLACE(cl.TELEFONO1, '/', ''), '|', '')), 12) AS Phone1,
            SUBSTRING(LTRIM(REPLACE(REPLACE(cl.TELEFONO1, '/', ''), '|', '')), 13, 30) AS Phone2,
            CONVERT(VARCHAR, cl.FECHA_INGRESO, 112) AS Date_Bird,
            NULLIF(LTRIM(cl.E_MAIL), '') AS E_mail,
            CASE WHEN cl.ACTIVO = 'S' THEN '1' ELSE '0' END AS Code_Status,
            '1' AS Code_ClassificationA,
            '4' AS Code_ClassificationB,
            '5' AS Code_ClassificationC,
            '1' AS Principal,
            LEFT(LTRIM(REPLACE(CAST(cl.CONTACTO AS VARCHAR(8000)), ',', '')), 75) AS Description,
            1 AS Transfer_status
        FROM CATELLI.CLIENTE cl
        WHERE cl.ACTIVO = 'S' 
            AND cl.CLIENTE NOT LIKE 'N%' 
            AND cl.VENDEDOR NOT IN ('999', '998', '22')
    )
    SELECT * FROM Contacts;
  `,
  },
  {
    name: "IMPLT_contacts_accounts",
    query: `
    WITH ContactsAccounts AS (
        SELECT 
            CASE 
                WHEN LEFT(cl.CLIENTE, 1) BETWEEN 'A' AND 'Z' AND LEFT(cl.CLIENTE, 1) <> 'O' 
                    THEN 'CN' + cl.CLIENTE 
                ELSE cl.CLIENTE 
            END AS Code_Contact,
            'CATELLI' AS Code_Unit_Org,
            'CATELLI' AS Code_Sales_Org,
            '1' AS Code_Account,
            1 AS Transfer_status
        FROM CATELLI.CLIENTE cl
        WHERE cl.CLIENTE NOT LIKE 'N%'
            AND cl.VENDEDOR NOT IN ('999', '998', '22')
    )
    SELECT * FROM ContactsAccounts;
  `,
  },
  {
    name: "IMPLT_contacts_array",
    query: `
    WITH ContactsArray AS (
        SELECT 
            code AS Code,
            type AS Type,
            description AS Description,
            Transfer_status AS Transfer_Status
        FROM catelli.contacts_array
    )
    SELECT * FROM ContactsArray;
  `,
  },
  {
    name: "IMPLT_contacts_organization",
    query: `
    WITH ContactsOrganization AS (
        SELECT 
            CASE 
                WHEN SUBSTRING(CL.cliente, PATINDEX('%[A-Za-z]%', CL.cliente), 1) NOT LIKE 'O' 
                THEN 'CN' + CL.cliente 
                ELSE CL.cliente 
            END AS Code_Contact,
            'CATELLI' AS Code_Unit_Org,
            'CATELLI' AS Code_Sales_Org,
            1 AS Transfer_status
        FROM CATELLI.CLIENTE CL 
        WHERE CL.cliente NOT LIKE 'N%' 
          AND CL.VENDEDOR NOT IN ('999','998','22')
    )
    SELECT * FROM ContactsOrganization;
  `,
  },
  {
    name: "IMPLT_payment_org_terms",
    query: `
    WITH PaymentOrgTerms AS (
        SELECT 
            cp.CONDICION_PAGO AS Code,
            'CATELLI' AS Code_Unit_Org,
            'CATELLI' AS Code_Sales_Org,
            cp.DESCRIPCION AS Description,
            cp.DIAS_NETO AS Days,
            CASE WHEN cp.DIAS_NETO <> 0 THEN '1' ELSE '0' END AS Credit,
            COALESCE(cp.PLAZO_CONDPAGO, '') AS Days_EP,
            cp.DESCUENTO_CONTADO AS Discount,
            1 AS Transfer_status
        FROM CATELLI.CONDICION_PAGO cp
    )
    SELECT * FROM PaymentOrgTerms;
  `,
  },
  {
    name: "IMPLT_products_organization",
    query: `
    WITH ProductOrganization AS (
        SELECT 
            ar.ARTICULO AS Code_Product,
            'CATELLI' AS Code_Unit_Org,
            'CATELLI' AS Code_Sales_Org,
            CASE WHEN ar.ACTIVO = 'S' THEN 1 ELSE 0 END AS Code_Status,
            '1' AS Unit_Box,
            CASE 
                WHEN ar.MANUFACTURADOR LIKE 'CA%' AND ar.PESO_BRUTO = 1 THEN 'CAJA'
                WHEN ar.MANUFACTURADOR LIKE 'FA%' AND ar.PESO_BRUTO = 1 THEN 'FDR'
                WHEN ar.MANUFACTURADOR LIKE 'CO%' AND ar.PESO_BRUTO = 1 THEN 'CMB'
                WHEN ar.MANUFACTURADOR LIKE 'GA%' AND ar.PESO_BRUTO = 1 THEN 'GLN'
                WHEN ar.MANUFACTURADOR LIKE 'SA%' AND ar.PESO_BRUTO = 1 THEN 'SACO'
                WHEN ar.MANUFACTURADOR LIKE 'DI%' AND ar.PESO_BRUTO = 1 THEN 'DSP'
                WHEN ar.MANUFACTURADOR LIKE 'RI%' AND ar.PESO_BRUTO = 1 THEN 'RST'
                WHEN ar.MANUFACTURADOR LIKE 'UN%' AND ar.PESO_BRUTO = 1 THEN 'UND' 
                ELSE ar.UNIDAD_VENTA 
            END AS Unit_Type_Sales,
            CASE 
                WHEN ar.UNIDAD_EMPAQUE LIKE 'CA%' THEN 'CAJA'
                WHEN ar.UNIDAD_EMPAQUE LIKE 'FA%' THEN 'FDR'
                WHEN ar.UNIDAD_EMPAQUE LIKE 'CO%' THEN 'CMB'
                WHEN ar.UNIDAD_EMPAQUE LIKE 'GA%' THEN 'GLN'
                WHEN ar.UNIDAD_EMPAQUE LIKE 'SA%' THEN 'SACO'
                WHEN ar.UNIDAD_EMPAQUE LIKE 'DI%' THEN 'DSP'
                WHEN ar.UNIDAD_EMPAQUE LIKE 'RI%' THEN 'RST'
                WHEN ar.UNIDAD_EMPAQUE LIKE 'UN%' THEN 'UND' 
                ELSE ar.UNIDAD_EMPAQUE 
            END AS Unit_Type_Inv,
            CAST(ar.PESO_BRUTO AS NUMERIC(15,2)) AS Factor_Conversion,
            '0' AS Trazability,
            1 AS Transfer_status
        FROM CATELLI.ARTICULO ar
        WHERE ar.ACTIVO = 'S' 
        AND ar.CLASIFICACION_4 NOT LIKE 'GND%'
    )
    SELECT * FROM ProductOrganization;
  `,
  },
  {
    name: "IMPLT_route_org_accounts",
    query: `
    WITH RouteAccounts AS (
        SELECT 
            CASE 
                WHEN SUBSTRING(rc.cliente, PATINDEX('%[A-Za-z]%', rc.cliente), 1) NOT LIKE 'O' 
                THEN 'CN' + rc.cliente ELSE rc.cliente 
            END AS Code_Account,
            'CATELLI' AS Code_Unit_Org,
            'CATELLI' AS Code_Sales_Org,
            ru.RUTA AS Code_Route,
            ru.DESCRIPCION AS Description,
            CASE 
                WHEN SUBSTRING(ra.AGENTE, PATINDEX('%[A-Za-z]%', ra.AGENTE), 1) NOT LIKE 'O' 
                THEN 'C' + ra.AGENTE ELSE ra.AGENTE 
            END AS Code_Seller,
            -- Visit days
            CASE WHEN rc.DIA = 0 THEN '1' ELSE '0' END AS Visit_Mon,
            CASE WHEN rc.DIA = 1 THEN '1' ELSE '0' END AS Visit_Tue,
            CASE WHEN rc.DIA = 2 THEN '1' ELSE '0' END AS Visit_Wen,
            CASE WHEN rc.DIA = 3 THEN '1' ELSE '0' END AS Visit_Thu,
            CASE WHEN rc.DIA = 4 THEN '1' ELSE '0' END AS Visit_Fri,
            CASE WHEN rc.DIA = 5 THEN '1' ELSE '0' END AS Visit_Sat,
            CASE WHEN rc.DIA = 6 THEN '1' ELSE '0' END AS Visit_Sun,
            'S' AS Code_Frecuency,
            '1' AS Code_Week,
            1 AS Transfer_status
        FROM erpadmin.RUTA_CLIENTE rc
        INNER JOIN erpadmin.RUTA_RT ru ON rc.RUTA = ru.RUTA
        INNER JOIN erpadmin.RUTA_ASIGNADA_RT ra ON ra.RUTA = ru.RUTA
        INNER JOIN CATELLI.CLIENTE C ON C.CLIENTE = RC.CLIENTE
        WHERE C.ACTIVO LIKE 'S' 
        AND RC.RUTA NOT IN ('C999') 
        AND RU.ACTIVA LIKE 'S' 
        AND C.VENDEDOR NOT IN ('999','998','22')
    )
    SELECT * FROM RouteAccounts;
  `,
  },
  {
    name: "IMPLT_accounts_array",
    query: `
    WITH AccountsArray AS (
        SELECT 
            CASE 
                WHEN u_type = '19' THEN '1'
                WHEN u_descrip IN ('A', 'B', 'C', 'D', 'F', 'N', 'S') THEN u_descrip
                ELSE 'NULL' 
            END AS Code,
            u_type AS Type,
            u_descrip AS Description,
            1 AS Transfer_status
        FROM CATELLI.U_ACCOUNTS_ARRAY

        UNION ALL

        SELECT 
            tipo_contribuyente AS Code,
            '32' AS Type,
            descripcion AS Description,
            1 AS Transfer_status
        FROM CATELLI.NCF_CONSECUTIVO
        WHERE prefijo LIKE 'b%'

        UNION ALL

        SELECT 
            pais AS Code,
            '50' AS Type,
            nombre AS Description,
            1 AS Transfer_status
        FROM CATELLI.pais

        UNION ALL

        SELECT 
            nivel_precio AS Code,
            '53' AS Type,
            nivel_precio AS Description,
            1 AS Transfer_status
        FROM CATELLI.nivel_precio

        UNION ALL

        SELECT 
            moneda AS Code,
            '54' AS Type,
            nombre AS Description,
            1 AS Transfer_status
        FROM CATELLI.MONEDA

        UNION ALL

        SELECT 
            categoria_cliente AS Code,
            '1' AS Type,
            descripcion AS Description,
            1 AS Transfer_status
        FROM CATELLI.categoria_cliente
    )
    SELECT * FROM AccountsArray;
  `,
  },
  {
    name: "IMPLT_products_array",
    query: `
    WITH Clasification AS (
        SELECT 
            CLASIFICACION AS Code,
            CASE 
                WHEN agrupacion BETWEEN '1' AND '5' THEN agrupacion 
                ELSE 'NULL' 
            END AS Type,
            descripcion AS Description,
            1 AS Transfer_status
        FROM CATELLI.CLASIFICACION
        WHERE agrupacion BETWEEN '1' AND '5'
    ),
    ProductArray AS (
        SELECT 
            CASE 
                WHEN MANUFACTURADOR LIKE 'CA%' THEN 'CAJA'
                WHEN MANUFACTURADOR LIKE 'FA%' THEN 'FDR'
                WHEN MANUFACTURADOR LIKE 'CO%' THEN 'CMB'
                WHEN MANUFACTURADOR LIKE 'GA%' THEN 'GLN'
                WHEN MANUFACTURADOR LIKE 'SA%' THEN 'SACO'
                WHEN MANUFACTURADOR LIKE 'DI%' THEN 'DSP'
                WHEN MANUFACTURADOR LIKE 'RI%' THEN 'RST'
                WHEN MANUFACTURADOR LIKE 'UN%' THEN 'UND'
                WHEN MANUFACTURADOR LIKE 'CB%' THEN 'COMBO'
                ELSE 'UND' 
            END AS Code,
            '50' AS Type,
            pa.u_descrip AS Description,
            1 AS Transfer_status
        FROM CATELLI.articulo A
        INNER JOIN CATELLI.U_PRODUCTS_ARRAY pa  
            ON (
                CASE 
                    WHEN MANUFACTURADOR LIKE 'CA%' THEN 'CAJA'
                    WHEN MANUFACTURADOR LIKE 'FA%' THEN 'FDR'
                    WHEN MANUFACTURADOR LIKE 'CO%' THEN 'CMB'
                    WHEN MANUFACTURADOR LIKE 'GA%' THEN 'GLN'
                    WHEN MANUFACTURADOR LIKE 'SA%' THEN 'SACO'
                    WHEN MANUFACTURADOR LIKE 'DI%' THEN 'DSP'
                    WHEN MANUFACTURADOR LIKE 'RI%' THEN 'RST'
                    WHEN MANUFACTURADOR LIKE 'UN%' THEN 'UND'
                    WHEN MANUFACTURADOR LIKE 'CB%' THEN 'COMBO'
                    ELSE 'UND' 
                END
            ) = pa.u_codCATELLI
    )
    SELECT * FROM Clasification
    UNION ALL
    SELECT * FROM ProductArray;
  `,
  },
  {
    name: "IMPLT_route_accounts",
    query: `
    WITH RouteData AS (
        SELECT 
            CASE 
                WHEN SUBSTRING(rc.cliente, PATINDEX('%[A-Za-z]%', rc.cliente), 1) NOT LIKE 'O' 
                THEN 'CN' + rc.cliente ELSE rc.cliente 
            END AS Code_Account,
            rc.RUTA AS Code_Route,
            ru.DESCRIPCION AS Description,
            CASE 
                WHEN SUBSTRING(ra.AGENTE, PATINDEX('%[A-Za-z]%', ra.AGENTE), 1) NOT LIKE 'O' 
                THEN 'C' + ra.AGENTE ELSE ra.AGENTE 
            END AS Code_Seller,
            CASE WHEN DIA = 0 THEN '1' ELSE '0' END AS Visit_Mon,
            CASE WHEN DIA = 1 THEN '1' ELSE '0' END AS Visit_Tue,
            CASE WHEN DIA = 2 THEN '1' ELSE '0' END AS Visit_Wen,
            CASE WHEN DIA = 3 THEN '1' ELSE '0' END AS Visit_Thu,
            CASE WHEN DIA = 4 THEN '1' ELSE '0' END AS Visit_Fri,
            CASE WHEN DIA = 5 THEN '1' ELSE '0' END AS Visit_Sat,
            CASE WHEN DIA = 6 THEN '1' ELSE '0' END AS Visit_Sun,
            'S' AS Code_Frecuency,
            0 AS Code_Week,
            0 AS Source_Create,
            1 AS Transfer_status
        FROM erpadmin.RUTA_CLIENTE rc
        INNER JOIN erpadmin.RUTA_RT ru ON rc.RUTA = ru.RUTA
        INNER JOIN erpadmin.RUTA_ASIGNADA_RT ra ON ra.RUTA = ru.RUTA
        INNER JOIN CATELLI.CLIENTE C ON C.CLIENTE = RC.CLIENTE
        WHERE C.ACTIVO LIKE 'S' 
          AND RC.RUTA NOT IN ('C999') 
          AND RU.ACTIVA LIKE 'S'  
          AND C.VENDEDOR NOT IN ('999','998','22')
    )
    SELECT * FROM RouteData;
  `,
  },
  {
    name: "IMPLT_sellers",
    query: `
    WITH SellerData AS (
        SELECT 
            CASE 
                WHEN SUBSTRING(ve.VENDEDOR, PATINDEX('%[A-Za-z]%', ve.VENDEDOR), 1) NOT LIKE 'O' 
                THEN 'C' + ve.VENDEDOR ELSE ve.VENDEDOR 
            END AS Code_Seller,
            ve.NOMBRE AS Name,
            '02' AS Type,
            'ND' AS Code_Warehouse,
            CASE 
                WHEN SUBSTRING(ve.VENDEDOR, PATINDEX('%[A-Za-z]%', ve.VENDEDOR), 1) NOT LIKE 'O' 
                THEN 'C' + ve.VENDEDOR ELSE ve.VENDEDOR 
            END AS Code_Seller_Del,
            NULL AS Code_Manager,
            'RD' AS Code_Country,
            NULL AS Phone,
            NULL AS Email,
            0 AS Source_Create,
            1 AS Transfer_status
        FROM CATELLI.VENDEDOR ve
        WHERE ve.ACTIVO = 'S' 
          AND ve.VENDEDOR NOT LIKE 'V%' 
          AND ve.VENDEDOR NOT LIKE 'N%' 
          AND ve.VENDEDOR NOT IN ('999', '998', '22', '23', 'o6')
    )
    SELECT * FROM SellerData;
  `,
  },
  {
    name: "IMPLT_sellers_org",
    query: `
    WITH SellerOrgData AS (
        SELECT 
            CASE 
                WHEN SUBSTRING(ve.VENDEDOR, PATINDEX('%[A-Za-z]%', ve.VENDEDOR), 1) NOT LIKE 'O' 
                THEN 'C' + ve.VENDEDOR ELSE ve.VENDEDOR 
            END AS Code_Seller,
            'CATELLI' AS Code_Unit_Org,
            'CATELLI' AS Code_Sales_Org,
            NULL AS Code_Manager,
            1 AS Transfer_status
        FROM CATELLI.VENDEDOR ve
        WHERE ve.ACTIVO = 'S' 
          AND ve.VENDEDOR NOT LIKE 'V%' 
          AND ve.VENDEDOR NOT LIKE 'N%' 
          AND ve.VENDEDOR NOT IN ('999', '998', '22')
    )
    SELECT * FROM SellerOrgData;
  `,
  },
  {
    name: "IMPLT_pricing",
    query: `
            WITH BaseQuery AS (
            SELECT 
                'ZPR0' AS Secuence,
                '001' AS Code_Table,
                'CATELLI' AS Code1,
                ap.NIVEL_PRECIO AS Code2,
                ar.ARTICULO AS Code3,
                ISNULL(ar.CLASIFICACION_1, 'NULL') AS Code4,
                ISNULL(ar.CLASIFICACION_2, 'NULL') AS Code5,
                ISNULL(ar.CLASIFICACION_3, 'NULL') AS Code6,
                ISNULL(ar.CLASIFICACION_4, 'NULL') AS Code7,
                ISNULL(ar.CLASIFICACION_5, 'NULL') AS Code8,
                CAST(ap.PRECIO * ISNULL(AR.PESO_BRUTO, 1) AS NUMERIC(15,2)) AS Value,
                '1' AS Base,
                CASE 
                    WHEN MANUFACTURADOR LIKE 'CA%' THEN 'CAJA'
                    WHEN MANUFACTURADOR LIKE 'FA%' THEN 'FDR'
                    WHEN MANUFACTURADOR LIKE 'CO%' THEN 'CMB'
                    WHEN MANUFACTURADOR LIKE 'GA%' THEN 'GLN'
                    WHEN MANUFACTURADOR LIKE 'SA%' THEN 'SACO'
                    WHEN MANUFACTURADOR LIKE 'DI%' THEN 'DSP'
                    WHEN MANUFACTURADOR LIKE 'RI%' THEN 'RST'
                    WHEN MANUFACTURADOR LIKE 'UN%' THEN 'UND'
                    ELSE '99999999' 
                END AS Unit_Measure,
                '0' AS Type_Value,
                'RD' AS Code_Currency,
                CONVERT(VARCHAR, ap.FECHA_INICIO, 112) AS Date_Ini,
                CONVERT(VARCHAR, ap.FECHA_FIN, 112) AS Date_Fin,
                'NULL' AS ValueKey,
                'NULL' AS ID_ERP,
                1 AS Transfer_status
            FROM CATELLI.ARTICULO_PRECIO ap
            INNER JOIN CATELLI.ARTICULO ar ON ap.ARTICULO = ar.ARTICULO
            INNER JOIN CATELLI.UNIDAD_DE_MEDIDA un ON ar.UNIDAD_VENTA = un.UNIDAD_MEDIDA
            INNER JOIN CATELLI.NIVEL_PRECIO np ON np.NIVEL_PRECIO = ap.NIVEL_PRECIO
            INNER JOIN CATELLI.VERSION_NIVEL ve ON ve.NIVEL_PRECIO = ap.NIVEL_PRECIO 
                AND ve.MONEDA = ap.MONEDA 
                AND ve.VERSION = ap.VERSION
            WHERE ve.estado = 'A' 
                AND AR.ACTIVO = 'S' 
                AND ve.ESTADO = 'A' 
                AND NOT (MANUFACTURADOR LIKE 'un%' OR MANUFACTURADOR LIKE 'di%')
        )
        SELECT * FROM BaseQuery
        UNION ALL
        SELECT 
            'ZPR0' AS Secuence,
            '001' AS Code_Table,
            'CATELLI' AS Code1,
            ap.NIVEL_PRECIO AS Code2,
            ar.ARTICULO AS Code3,
            ar.CLASIFICACION_1 AS Code4,
            ar.CLASIFICACION_2 AS Code5,
            ar.CLASIFICACION_3 AS Code6,
            ar.CLASIFICACION_4 AS Code7,
            ISNULL(ar.CLASIFICACION_5, 'NULL') AS Code8,
            CAST(ap.PRECIO AS NUMERIC(15,2)) AS Value,
            '1' AS Base,
            AR.UNIDAD_VENTA AS Unit_Measure,
            0 AS Type_Value,
            'RD' AS Code_Currency,
            CONVERT(VARCHAR, ap.FECHA_INICIO, 112) AS Date_Ini,
            CONVERT(VARCHAR, ap.FECHA_FIN, 112) AS Date_Fin,
            'NULL' AS ValueKey,
            'NULL' AS ID_ERP,
            1 AS Transfer_status
        FROM CATELLI.ARTICULO_PRECIO ap
        INNER JOIN CATELLI.ARTICULO ar ON ap.ARTICULO = ar.ARTICULO
        INNER JOIN CATELLI.UNIDAD_DE_MEDIDA un ON ar.UNIDAD_VENTA = un.UNIDAD_MEDIDA
        INNER JOIN CATELLI.NIVEL_PRECIO np ON np.NIVEL_PRECIO = ap.NIVEL_PRECIO
        INNER JOIN CATELLI.VERSION_NIVEL ve ON ve.NIVEL_PRECIO = ap.NIVEL_PRECIO 
            AND ve.MONEDA = ap.MONEDA 
            AND ve.VERSION = ap.VERSION
        WHERE ve.estado = 'A' 
            AND AR.ACTIVO = 'S' 
            AND ve.ESTADO = 'A' 
            AND NOT (
                MANUFACTURADOR LIKE 'co%' AND PESO_BRUTO = 1
                OR MANUFACTURADOR LIKE 'ca%' AND PESO_BRUTO = 1
                OR MANUFACTURADOR LIKE 'fa%' AND PESO_BRUTO = 1
                OR MANUFACTURADOR LIKE 'ga%' AND PESO_BRUTO = 1
                OR MANUFACTURADOR LIKE 'sa%' AND PESO_BRUTO = 1
            )
        UNION ALL
        SELECT 
            'MWST' AS Secuence,
            '003' AS Code_Table,
            'CATELLI' AS Code1,
            ap.NIVEL_PRECIO AS Code2,
            ar.ARTICULO AS Code3,
            ISNULL(ar.CLASIFICACION_1, 'NULL') AS Code4,
            ISNULL(ar.CLASIFICACION_2, 'NULL') AS Code5,
            ISNULL(ar.CLASIFICACION_3, 'NULL') AS Code6,
            ISNULL(ar.CLASIFICACION_4, 'NULL') AS Code7,
            ISNULL(ar.CLASIFICACION_5, 'NULL') AS Code8,
            CASE 
                WHEN I.IMPUESTO1 = 0 THEN CAST(ap.PRECIO * 0.00 AS NUMERIC(15,2))
                WHEN I.IMPUESTO1 = 8 THEN CAST(ap.PRECIO * 0.08 AS NUMERIC(15,2))
                WHEN I.IMPUESTO1 = 9 THEN CAST(ap.PRECIO * 0.09 AS NUMERIC(15,2))
                WHEN I.IMPUESTO1 = 13 THEN CAST(ap.PRECIO * 0.13 AS NUMERIC(15,2))
                WHEN I.IMPUESTO1 = 16 THEN CAST(ap.PRECIO * 0.16 AS NUMERIC(15,2))
                WHEN I.IMPUESTO1 = 18 THEN CAST(ap.PRECIO * 0.18 AS NUMERIC(15,2))
                ELSE 0 
            END AS Value,
            '1' AS Base,
            AR.UNIDAD_VENTA AS Unit_Measure,
            0 AS Type_Value,
            'RD' AS Code_Currency,
            CONVERT(VARCHAR, ap.FECHA_INICIO, 112) AS Date_Ini,
            CONVERT(VARCHAR, ap.FECHA_FIN, 112) AS Date_Fin,
            'NULL' AS ValueKey,
            'NULL' AS ID_ERP,
            1 AS Transfer_status
        FROM CATELLI.ARTICULO_PRECIO ap
        INNER JOIN CATELLI.ARTICULO ar ON ap.ARTICULO = ar.ARTICULO
        INNER JOIN CATELLI.IMPUESTO I ON ar.IMPUESTO = i.IMPUESTO
        INNER JOIN CATELLI.UNIDAD_DE_MEDIDA un ON ar.UNIDAD_VENTA = un.UNIDAD_MEDIDA
        INNER JOIN CATELLI.NIVEL_PRECIO np ON np.NIVEL_PRECIO = ap.NIVEL_PRECIO
        INNER JOIN CATELLI.VERSION_NIVEL ve ON ve.NIVEL_PRECIO = ap.NIVEL_PRECIO 
            AND ve.MONEDA = ap.MONEDA 
            AND ve.VERSION = ap.VERSION
        WHERE ve.estado = 'A' 
            AND AR.ACTIVO = 'S' 
            AND ve.ESTADO = 'A' 
            AND NOT (MANUFACTURADOR LIKE 'un%' OR MANUFACTURADOR LIKE 'di%');
  `,
  },
  {
    name: "IMPLT_loads_detail",
    query: `
    WITH LoadDetails AS (
        SELECT 
            'CO' + SUBSTRING(fa.FACTURA, 2, 20) AS Code,
            'CATELLI' AS Code_Unit_Org,
            'CATELLI' AS Code_Sales_Org,
            fl.LINEA AS Num_Line,
            '999999999' AS Lot_Group,
            fl.ARTICULO AS Code_Product,
            CONVERT(VARCHAR, fl.FECHA_FACTURA, 112) AS Date_Load,
            CAST(fl.CANTIDAD AS numeric(15,2)) AS Quantity,
            ar.UNIDAD_ALMACEN AS Unit_Type,
            p.BODEGA AS Code_Warehouse_Sou,
            fa.VENDEDOR AS Code_Route,
            1 AS Transfer_status
        FROM CATELLI.FACTURA_LINEA fl
        INNER JOIN CATELLI.ARTICULO ar ON ar.ARTICULO = fl.ARTICULO
        INNER JOIN CATELLI.FACTURA fa ON fa.TIPO_DOCUMENTO = fl.TIPO_DOCUMENTO 
                                      AND fa.FACTURA = fl.FACTURA
        INNER JOIN CATELLI.PEDIDO p ON p.pedido = fa.pedido
        WHERE fa.ANULADA = 'N' 
          AND fa.FECHA >= '2025-01-01 00:00:00.000'
    )
    SELECT * FROM LoadDetails ORDER BY Code;
  `,
  },
  {
    name: "IMPLT_products_packs",
    query: `
    WITH ProductPacks AS (
        SELECT 
            ae.ARTICULO_PADRE AS Code_Product,
            ae.ARTICULO_HIJO AS Code_Component,
            CAST(ae.cantidad AS NUMERIC(10,2)) AS Quantity,
            a.UNIDAD_ALMACEN AS Unit_Type_Sales,
            '1' AS Transfer_Status
        FROM CATELLI.articulo_ensamble ae
        INNER JOIN CATELLI.ARTICULO a ON ae.ARTICULO_HIJO = a.ARTICULO
        WHERE a.ACTIVO = 'S'
    )
    SELECT * FROM ProductPacks;
  `,
  },
  {
    name: "IMPLT_provinces",
    query: `
    WITH Provinces AS (
        SELECT 
            CASE 
                WHEN SUBSTRING(zona, PATINDEX('%[A-Za-z]%', ZONA), 1) NOT LIKE 'O' THEN 'CN' + ZONA 
                ELSE ZONA 
            END AS Code,
            'RD' AS Code_Country,
            nombre AS Description,
            1 AS Transfer_Status
        FROM CATELLI.zona
    )
    SELECT * FROM Provinces;
  `,
  },
  {
    name: "IMPLT_Sales_Quota",
    query: `
    WITH SalesQuota AS (
        SELECT 
            'CATELLI' AS Code_Unit_Org,
            'CATELLI' AS Code_Sales_Org,
            eb.Bodega AS Code_Warehouse,
            eb.Articulo AS Code_Product,
            b.Nombre AS Description,
            '9999999999' AS Lot_Group,
            CAST(eb.CANT_DISPONIBLE AS NUMERIC(18,3)) AS Quantity,
            ar.UNIDAD_ALMACEN AS Unit_Type,
            ar.PESO_BRUTO AS Factor_Conversion
        FROM CATELLI.Existencia_Bodega eb
        INNER JOIN CATELLI.Bodega b ON eb.Bodega = b.Bodega
        INNER JOIN CATELLI.Articulo ar ON eb.Articulo = ar.Articulo
        WHERE eb.Bodega IN ('01', '02', '09', '10')
    )
    SELECT * FROM SalesQuota;
  `,
  },
  {
    name: "IMPLT_warehouses_stock",
    query: `
    WITH WarehouseStock AS (
        SELECT 
            'CATELLI' AS Code_Unit_Org,
            'CATELLI' AS Code_Sales_Org,
            COALESCE(NULLIF(B.BODEGA, ''), '01') AS Code_Warehouse, 
            A.ARTICULO AS Code_Product,
            CASE WHEN B.BODEGA = '01' THEN 'BODEGA PRINCIPAL' ELSE '' END AS Description,
            '999999' AS Lot_Group,
            B.CANT_DISPONIBLE AS Quantity,
            A.UNIDAD_VENTA AS Unit_Type,
            CAST(A.PESO_BRUTO AS VARCHAR) AS Factor_Conversion
        FROM CATELLI.ARTICULO A
        JOIN CATELLI.EXISTENCIA_BODEGA B ON A.ARTICULO = B.ARTICULO
        WHERE B.BODEGA = '01' AND A.ACTIVO = 'S'
    )
    SELECT * FROM WarehouseStock ORDER BY Code_Product;
  `,
  },
];

module.exports = queries;
