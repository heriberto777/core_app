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
        code_product        VARCHAR(50)     NOT NULL,
        cantidad_original   NUMERIC(11,3)   NOT NULL,
        cantidad_ajustada   NUMERIC(11,3)   NOT NULL,
        motivo              VARCHAR(255)    NULL,
        ajustado_por        VARCHAR(100)    NOT NULL,
        fecha               DATETIME        NOT NULL DEFAULT GETDATE(),
        CONSTRAINT UQ_loads_orders_adjustments_linea
            UNIQUE (code_load, pedido, pedido_linea)
    );

    CREATE INDEX IX_loads_orders_adjustments_code_load
        ON core_app.loads_orders_adjustments (code_load);
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
