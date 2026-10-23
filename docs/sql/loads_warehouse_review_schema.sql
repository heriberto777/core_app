-- ============================================================================
-- Revisión de Almacén en Despacho de Cargas — Fase 1 (Esquema)
-- Server: server1 (base donde viven core_app.loads_orders_staging /
-- loads_detail_staging, junto a CATELLI.*).
--
-- Pendiente de aplicar manualmente — no se ejecuta desde la app.
-- Ver plan completo: revisión de almacén antes de autorizar despacho.
-- ============================================================================

-- 1) Tabla de ajustes de Almacén. NUNCA se escribe en CATELLI.PEDIDO_LINEA —
--    esto es solo el registro de "para esta carga puntual, la cantidad real
--    armada fue X en vez de Y", auditado. getTransformedOrdersData hace
--    LEFT JOIN + COALESCE contra esta tabla para calcular la cantidad final.
--
--    tipo_linea ('P'/'B'): una misma PEDIDO_LINEA de CATELLI puede generar
--    DOS filas en el staging — la cantidad pagada (CANTIDAD_PEDIDA) y la
--    bonificada/regalo (CANTIDAD_BONIFICAD), ver LINEA_TIPO en
--    getTransformedOrdersData. Si Almacén ajusta la pagada por faltante de
--    stock, la bonificada es una decisión aparte (no sabemos la regla de
--    promoción de Preventa para recalcularla sola) — por eso el ajuste se
--    guarda por tipo, no solo por pedido_linea.
IF NOT EXISTS (
    SELECT 1 FROM sys.tables t
    INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE s.name = 'core_app' AND t.name = 'loads_orders_adjustments'
)
BEGIN
    CREATE TABLE core_app.loads_orders_adjustments (
        id                  INT IDENTITY(1,1) PRIMARY KEY,
        code_load           VARCHAR(50)     NOT NULL,
        pedido              VARCHAR(20)     NOT NULL,
        pedido_linea        INT             NOT NULL,
        tipo_linea          CHAR(1)         NOT NULL DEFAULT 'P',
        code_product        VARCHAR(50)     NOT NULL,
        cantidad_original   NUMERIC(11,3)   NOT NULL,
        cantidad_ajustada   NUMERIC(11,3)   NOT NULL,
        motivo              VARCHAR(255)    NULL,
        ajustado_por        VARCHAR(100)    NOT NULL,
        fecha               DATETIME        NOT NULL DEFAULT GETDATE(),
        CONSTRAINT UQ_loads_orders_adjustments_linea
            UNIQUE (code_load, pedido, pedido_linea, tipo_linea),
        CONSTRAINT CK_loads_orders_adjustments_tipo_linea
            CHECK (tipo_linea IN ('P', 'B'))
    );

    CREATE INDEX IX_loads_orders_adjustments_code_load
        ON core_app.loads_orders_adjustments (code_load);
END
GO

-- Migracion sobre un ambiente donde la tabla ya se creo con el esquema
-- viejo (sin tipo_linea) -- idempotente, no rompe si ya esta aplicada.
IF EXISTS (
    SELECT 1 FROM sys.tables t
    INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE s.name = 'core_app' AND t.name = 'loads_orders_adjustments'
)
AND NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('core_app.loads_orders_adjustments') AND name = 'tipo_linea'
)
BEGIN
    ALTER TABLE core_app.loads_orders_adjustments
        ADD tipo_linea CHAR(1) NOT NULL DEFAULT 'P';

    ALTER TABLE core_app.loads_orders_adjustments
        ADD CONSTRAINT CK_loads_orders_adjustments_tipo_linea CHECK (tipo_linea IN ('P', 'B'));

    DECLARE @oldConstraint NVARCHAR(200) = (
        SELECT kc.name FROM sys.key_constraints kc
        WHERE kc.parent_object_id = OBJECT_ID('core_app.loads_orders_adjustments')
          AND kc.type = 'UQ'
    );
    IF @oldConstraint IS NOT NULL
        EXEC('ALTER TABLE core_app.loads_orders_adjustments DROP CONSTRAINT ' + @oldConstraint);

    ALTER TABLE core_app.loads_orders_adjustments
        ADD CONSTRAINT UQ_loads_orders_adjustments_linea
            UNIQUE (code_load, pedido, pedido_linea, tipo_linea);
END
GO

-- 2) Gate de revisión, independiente de transfer_status. La tarea automática
--    de push (IMPLT_Orders / IMPLT_loads_detail) debe agregar
--    "AND review_status = 'approved'" a su WHERE (Fase 5, manual en Mongo)
--    para no subir nada a server2 hasta que Almacén autorice.
-- IMPORTANTE: el DEFAULT es 'approved', no 'pending'. Esta columna se agrega
-- sobre una tabla que ya puede tener filas (cargas despachadas con el código
-- viejo, antes de este cambio) y la tarea automática de push puede correr en
-- cualquier momento (cron diario + botón "Ejecutar" manual). Si el default
-- fuera 'pending', esas filas viejas (y cualquier fila que inserte el
-- backend viejo mientras dura el despliegue, que no conoce esta columna)
-- quedarían invisibles para siempre para la tarea de push una vez que se
-- agregue el filtro "AND review_status = 'approved'" (Fase 5) — nadie las
-- pasaría nunca a 'approved' porque nunca entran al flujo nuevo de
-- autorización. 'approved' como default deja el comportamiento actual
-- intacto para todo lo que ya existe o se inserte con el código viejo; el
-- backend nuevo siempre especifica review_status explícitamente en el
-- INSERT (nunca depende de este default).
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('core_app.loads_orders_staging') AND name = 'review_status'
)
BEGIN
    ALTER TABLE core_app.loads_orders_staging
        ADD review_status VARCHAR(20) NOT NULL DEFAULT 'approved';
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('core_app.loads_detail_staging') AND name = 'review_status'
)
BEGIN
    ALTER TABLE core_app.loads_detail_staging
        ADD review_status VARCHAR(20) NOT NULL DEFAULT 'approved';
END
GO

-- 3) code_warehouse_sou pasó a significar "bodega del repartidor" (destino
--    real del traspaso, antes tomaba por error la bodega central del
--    vendedor dueño de cada pedido). processInventoryTransfer (traspaso
--    diferido manual, server1) necesitaba seguir sabiendo la bodega ORIGEN
--    real para hacer el traspaso correctamente -- se guarda aparte en esta
--    columna nueva, SOLO en server1 (core_app.loads_detail_staging). No se
--    lleva a server2/IMPLT_loads_detail -- ahí lo único que se llena es
--    Code_Warehouse_Sou (la bodega del repartidor), que es lo que ya
--    consume executeTransferByLoadId (traspasoService.js) para mover
--    inventario desde la bodega del repartidor hacia bodega_destino -- eso
--    queda bien con el significado nuevo, sin tocar nada en server2.
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('core_app.loads_detail_staging') AND name = 'code_warehouse_orig'
)
BEGIN
    ALTER TABLE core_app.loads_detail_staging
        ADD code_warehouse_orig VARCHAR(20) NULL;
END
GO

-- 4) Order_Num_Cli vuelve a ser PEDIDO (como era antes de un cambio reciente
--    mal informado); RUBRO2 pasa a un campo NUEVO, Order_Alt_Num -- no un
--    reemplazo de Order_Num_Cli. Columna nueva en server1.
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('core_app.loads_orders_staging') AND name = 'order_alt_num'
)
BEGIN
    ALTER TABLE core_app.loads_orders_staging
        ADD order_alt_num VARCHAR(20) NULL;
END
GO

-- ============================================================================
-- PENDIENTE EN SERVER2 (TELYNET) -- correr esto ahi, no en server1.
-- ============================================================================
-- dbo.IMPLT_Orders no tiene columna para Order_Alt_Num todavia (confirmado
-- con el usuario). Hace falta:
--   1) Esta columna nueva en dbo.IMPLT_Orders (server2/TELYNET):
--
--      IF NOT EXISTS (
--          SELECT 1 FROM sys.columns
--          WHERE object_id = OBJECT_ID('dbo.IMPLT_Orders') AND name = 'Order_Alt_Num'
--      )
--      BEGIN
--          ALTER TABLE dbo.IMPLT_Orders
--              ADD Order_Alt_Num VARCHAR(20) NULL;
--      END
--
--   2) Agregar "order_alt_num AS Order_Alt_Num" al SELECT de la tarea Mongo
--      "IMPLT_Orders", despues de la linea "order_num_cli AS Order_Num_Cli".
--      Texto completo de la query actualizada:
--
--      SELECT
--        code_load          AS Code_load,
--        num_line           AS Num_Line,
--        code_unit_org       AS Code_Unit_Org,
--        code_sales_org      AS Code_Sales_Org,
--        order_num_ofclient  AS Order_Num_ofClient,
--        order_num           AS Order_Num,
--        type_rec            AS Type_Rec,
--        date_delivery       AS Date_Delivery,
--        order_date          AS Order_Date,
--        code_account        AS Code_Account,
--        code_product        AS Code_Product,
--        lot_number          AS Lot_Number,
--        quantity            AS Quantity,
--        quantity_order      AS Quantity_Order,
--        unit_measure        AS Unit_Measure,
--        price_br            AS Price_Br,
--        price               AS Price,
--        total_amount        AS Total_Amount,
--        por_discount1       AS Por_Discount1,
--        amount_discount1    AS Amount_Discount1,
--        por_tax1            AS Por_Tax1,
--        amount_tax1         AS Amount_Tax1,
--        por_tax2            AS Por_Tax2,
--        amount_tax2         AS Amount_Tax2,
--        code_currency       AS Code_Currency,
--        secuence            AS Secuence,
--        order_num_cli       AS Order_Num_Cli,
--        order_alt_num       AS Order_Alt_Num,
--        CASE
--             WHEN code_seller NOT LIKE '%[A-Z]%' THEN 'C' + code_seller   -- puramente numerico
--              ELSE code_seller                                              -- tiene alguna letra: sin cambio
--        END AS Code_Seller,
--        sale_type           AS Sale_Type,
--        code_address        AS Code_Address,
--        transport           AS Transport,
--        transfer_status     AS Transfer_status
--      FROM core_app.loads_orders_staging
--      WHERE transfer_status = 1 AND review_status = 'approved'
