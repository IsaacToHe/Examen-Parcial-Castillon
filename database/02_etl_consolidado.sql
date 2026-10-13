/* =====================================================================
   02_etl_consolidado.sql  -  ETL (Extraer - Transformar - Cargar)
   ---------------------------------------------------------------------
   EXTRAER     : vistas consolidado.V_ETL_CLIENTES / V_ETL_PRODUCTOS
                 leen de las 4 fuentes (vet, castillon, samar, dw).
   TRANSFORMAR : en esas mismas vistas se limpian textos (espacios
                 duros CHAR(160), comillas tipograficas), se
                 estandarizan genero / estado civil / estado, se
                 calcula edad y rango de edad, se agrega categoria.
   CARGAR      : consolidado.SP_SYNC_CLIENTES / SP_SYNC_PRODUCTOS
                 hacen MERGE (insert / update / delete) en las tablas
                 CLIENTE_CONSOLIDADO y PRODUCTO_CONSOLIDADO.
   TIEMPO REAL : un TRIGGER por tabla fuente llama al SP solo con las
                 filas afectadas -> cada registro de la web llega al
                 consolidado en la misma transaccion.
   ===================================================================== */
SET NOCOUNT ON;
GO

/* ------------------------------ Tablas destino ------------------------------ */
IF OBJECT_ID('consolidado.CLIENTE_CONSOLIDADO') IS NULL
CREATE TABLE consolidado.CLIENTE_CONSOLIDADO (
    ID_CONSOLIDADO      int IDENTITY(1,1) NOT NULL CONSTRAINT PK_CLIENTE_CONSOLIDADO PRIMARY KEY,
    ORIGEN_BD           varchar(40)   NOT NULL,
    SISTEMA             varchar(20)   NOT NULL,
    ID_ORIGEN           nvarchar(50)  NOT NULL,
    DOCUMENTO           varchar(20)   NULL,
    NOMBRES             nvarchar(150) NULL,
    APELLIDOS           nvarchar(150) NULL,
    NOMBRE_COMPLETO     nvarchar(300) NULL,
    GENERO              varchar(15)   NOT NULL,
    ESTADO_CIVIL        varchar(15)   NOT NULL,
    EDAD                int           NULL,
    RANGO_EDAD          varchar(15)   NOT NULL,
    CELULAR             varchar(15)   NULL,
    CORREO              varchar(80)   NULL,
    UBICACION           nvarchar(255) NULL,
    ESTADO              varchar(10)   NOT NULL,
    FECHA_CARGA         datetime2(0)  NOT NULL,
    FECHA_ACTUALIZACION datetime2(0)  NOT NULL,
    CONSTRAINT UQ_CLIENTE_CONSOLIDADO_ORIGEN UNIQUE (ORIGEN_BD, ID_ORIGEN)
);
GO
IF OBJECT_ID('consolidado.PRODUCTO_CONSOLIDADO') IS NULL
CREATE TABLE consolidado.PRODUCTO_CONSOLIDADO (
    ID_CONSOLIDADO      int IDENTITY(1,1) NOT NULL CONSTRAINT PK_PRODUCTO_CONSOLIDADO PRIMARY KEY,
    ORIGEN_BD           varchar(40)   NOT NULL,
    SISTEMA             varchar(20)   NOT NULL,
    ID_ORIGEN           nvarchar(50)  NOT NULL,
    NOMBRE              nvarchar(255) NULL,
    DESCRIPCION         nvarchar(500) NULL,
    CATEGORIA           nvarchar(100) NOT NULL,
    UNIDAD_MEDIDA       varchar(30)   NULL,
    MARCA               nvarchar(50)  NULL,
    MONEDA              char(3)       NOT NULL,
    PRECIO              decimal(12,2) NULL,
    COSTO               decimal(12,2) NULL,
    MARGEN              AS (PRECIO - COSTO),
    STOCK               int           NULL,
    ESTADO              varchar(10)   NOT NULL,
    FECHA_CARGA         datetime2(0)  NOT NULL,
    FECHA_ACTUALIZACION datetime2(0)  NOT NULL,
    CONSTRAINT UQ_PRODUCTO_CONSOLIDADO_ORIGEN UNIQUE (ORIGEN_BD, ID_ORIGEN)
);
GO
IF OBJECT_ID('consolidado.ETL_LOG') IS NULL
CREATE TABLE consolidado.ETL_LOG (
    ID_LOG     int IDENTITY(1,1) NOT NULL CONSTRAINT PK_ETL_LOG PRIMARY KEY,
    FECHA      datetime2(0)  NOT NULL,
    ENTIDAD    varchar(20)   NOT NULL,   -- CLIENTE | PRODUCTO
    ORIGEN_BD  varchar(40)   NULL,       -- NULL = todas
    OPERACION  varchar(20)   NOT NULL,   -- CARGA_COMPLETA | TIEMPO_REAL
    FILAS      int           NOT NULL
);
GO
IF TYPE_ID('consolidado.LISTA_IDS') IS NULL
CREATE TYPE consolidado.LISTA_IDS AS TABLE (ID nvarchar(50) NOT NULL PRIMARY KEY);
GO

/* ------------------------------ Funciones de transformacion ------------------------------ */
-- Hora de Peru (Azure SQL trabaja en UTC)
CREATE OR ALTER FUNCTION consolidado.FN_AHORA()
RETURNS datetime2(0)
AS BEGIN
    RETURN CAST(SYSDATETIMEOFFSET() AT TIME ZONE 'SA Pacific Standard Time' AS datetime2(0));
END;
GO
-- Limpia espacios duros (CHAR 160), comillas tipograficas y espacios dobles
CREATE OR ALTER FUNCTION consolidado.FN_LIMPIAR(@s nvarchar(500))
RETURNS nvarchar(500)
AS BEGIN
    IF @s IS NULL RETURN NULL;
    SET @s = REPLACE(REPLACE(REPLACE(REPLACE(@s, NCHAR(160), N' '), NCHAR(8220), N''), NCHAR(8221), N''), NCHAR(9), N' ');
    WHILE CHARINDEX(N'  ', @s) > 0 SET @s = REPLACE(@s, N'  ', N' ');
    SET @s = LTRIM(RTRIM(@s));
    RETURN NULLIF(@s, N'');
END;
GO
CREATE OR ALTER FUNCTION consolidado.FN_EDAD(@fecnac date)
RETURNS int
AS BEGIN
    IF @fecnac IS NULL RETURN NULL;
    DECLARE @hoy date = CAST(consolidado.FN_AHORA() AS date);
    RETURN DATEDIFF(YEAR, @fecnac, @hoy) - CASE WHEN DATEADD(YEAR, DATEDIFF(YEAR, @fecnac, @hoy), @fecnac) > @hoy THEN 1 ELSE 0 END;
END;
GO
CREATE OR ALTER FUNCTION consolidado.FN_ESTADO_CIVIL(@ec nvarchar(50))
RETURNS varchar(15)
AS BEGIN
    SET @ec = UPPER(consolidado.FN_LIMPIAR(@ec));
    RETURN CASE
        WHEN @ec IN ('SO','S','SOLTERO','SOLTERA')       THEN 'SOLTERO'
        WHEN @ec IN ('CA','C','CASADO','CASADA')         THEN 'CASADO'
        WHEN @ec IN ('DI','D','DIVORCIADO','DIVORCIADA') THEN 'DIVORCIADO'
        WHEN @ec IN ('VI','V','VIUDO','VIUDA')           THEN 'VIUDO'
        WHEN @ec IN ('CO','CONVIVIENTE')                 THEN 'CONVIVIENTE'
        ELSE 'NO REGISTRA' END;
END;
GO

/* ------------------------------ EXTRAER + TRANSFORMAR ------------------------------ */
CREATE OR ALTER VIEW consolidado.V_ETL_CLIENTES
AS
WITH src AS (
    -- 1) BD_CASTILLON_VETERINARIA
    SELECT CAST('BD_CASTILLON_VETERINARIA' AS varchar(40)) AS ORIGEN_BD,
           CAST('VETERINARIA' AS varchar(20))              AS SISTEMA,
           CAST(p.IDPERSONA AS nvarchar(50))               AS ID_ORIGEN,
           CAST(LTRIM(RTRIM(p.DNI)) AS varchar(20))        AS DOCUMENTO,
           CAST(consolidado.FN_LIMPIAR(p.NOMBRE) AS nvarchar(150))  AS NOMBRES,
           CAST(consolidado.FN_LIMPIAR(CONCAT(p.APE_PATERNO, N' ', p.APE_MATERNO)) AS nvarchar(150)) AS APELLIDOS,
           CAST(CASE p.GENERO WHEN 'M' THEN 'MASCULINO' WHEN 'F' THEN 'FEMENINO' ELSE 'NO REGISTRA' END AS varchar(15)) AS GENERO,
           consolidado.FN_ESTADO_CIVIL(p.EST_CIVIL)        AS ESTADO_CIVIL,
           consolidado.FN_EDAD(p.FECHNAC)                  AS EDAD,
           CAST(LTRIM(RTRIM(p.CELULAR)) AS varchar(15))    AS CELULAR,
           CAST(LOWER(LTRIM(RTRIM(p.CORREO))) AS varchar(80)) AS CORREO,
           CAST(consolidado.FN_LIMPIAR(d.NOMDISTRITO) AS nvarchar(255)) AS UBICACION,
           CAST(CASE WHEN p.ESTADO = '1' THEN 'ACTIVO' ELSE 'INACTIVO' END AS varchar(10)) AS ESTADO
    FROM vet.PERSONA p
    LEFT JOIN vet.DISTRITO d ON d.IDDISTRITO = p.IDDISTRITO
    UNION ALL
    -- 2) CASTILLONV2
    SELECT 'CASTILLONV2', 'VETERINARIA', CAST(p.IDPERSONA AS nvarchar(50)),
           LTRIM(RTRIM(p.DNI)),
           consolidado.FN_LIMPIAR(p.NOMBRES),
           consolidado.FN_LIMPIAR(CONCAT(p.APEPATERNO, N' ', p.APEMATERNO)),
           'NO REGISTRA',
           consolidado.FN_ESTADO_CIVIL(p.EST_CIVIL),
           consolidado.FN_EDAD(p.FECNAC),
           LTRIM(RTRIM(p.CELULAR)),
           LOWER(LTRIM(RTRIM(p.CORREO))),
           consolidado.FN_LIMPIAR(p.DIRECCION),
           CASE WHEN p.ESTADO = '1' THEN 'ACTIVO' ELSE 'INACTIVO' END
    FROM castillon.PERSONA p
    UNION ALL
    -- 3) SamarImportadora
    SELECT 'SAMARIMPORTADORA', 'SAMAR', c.ID_CLIENTE,
           CAST(c.ID_CLIENTE AS varchar(20)),
           consolidado.FN_LIMPIAR(c.NOMBRE),
           consolidado.FN_LIMPIAR(c.APELLIDO),
           'NO REGISTRA',
           consolidado.FN_ESTADO_CIVIL(c.ESTADO_CIVIL),
           c.EDAD,
           NULL, NULL,
           consolidado.FN_LIMPIAR(c.RESIDENCIA),
           'ACTIVO'
    FROM samar.CLIENTES c
    UNION ALL
    -- 4) DW_SamarImportadora (OLAP)
    SELECT 'DW_SAMARIMPORTADORA', 'SAMAR', d.ID_CLIENTE,
           CAST(d.ID_CLIENTE AS varchar(20)),
           consolidado.FN_LIMPIAR(d.NOMBRE_COMPLETO),
           NULL,
           'NO REGISTRA',
           consolidado.FN_ESTADO_CIVIL(d.ESTADO_CIVIL),
           d.EDAD,
           NULL, NULL,
           consolidado.FN_LIMPIAR(d.ORIGEN),
           'ACTIVO'
    FROM dw.DIM_CLIENTE d
)
SELECT ORIGEN_BD, SISTEMA, ID_ORIGEN, DOCUMENTO, NOMBRES, APELLIDOS,
       CAST(consolidado.FN_LIMPIAR(CONCAT(NOMBRES, N' ', APELLIDOS)) AS nvarchar(300)) AS NOMBRE_COMPLETO,
       GENERO, ESTADO_CIVIL, EDAD,
       CAST(CASE WHEN EDAD IS NULL THEN 'NO REGISTRA'
                 WHEN EDAD < 18 THEN 'MENOR DE 18'
                 WHEN EDAD < 30 THEN '18-29'
                 WHEN EDAD < 45 THEN '30-44'
                 WHEN EDAD < 60 THEN '45-59'
                 ELSE '60 A MAS' END AS varchar(15)) AS RANGO_EDAD,
       CELULAR, CORREO, UBICACION, ESTADO
FROM src;
GO

CREATE OR ALTER VIEW consolidado.V_ETL_PRODUCTOS
AS
    -- 1) BD_CASTILLON_VETERINARIA  (precios en soles)
    SELECT CAST('BD_CASTILLON_VETERINARIA' AS varchar(40)) AS ORIGEN_BD,
           CAST('VETERINARIA' AS varchar(20))              AS SISTEMA,
           CAST(p.IDPRODUCTO AS nvarchar(50))              AS ID_ORIGEN,
           CAST(consolidado.FN_LIMPIAR(p.NOMPRODUCTO) AS nvarchar(255)) AS NOMBRE,
           CAST(consolidado.FN_LIMPIAR(p.DESCRIPCION) AS nvarchar(500)) AS DESCRIPCION,
           CAST(ISNULL(UPPER(consolidado.FN_LIMPIAR(c.NOMCATEGORIA)), 'SIN CATEGORIA') AS nvarchar(100)) AS CATEGORIA,
           CAST(u.NOMUNIDAD_MEDIDA AS varchar(30))         AS UNIDAD_MEDIDA,
           CAST(NULL AS nvarchar(50))                      AS MARCA,
           CAST('PEN' AS char(3))                          AS MONEDA,
           CAST(p.PRECIO_UNITARIO AS decimal(12,2))        AS PRECIO,
           CAST(NULL AS decimal(12,2))                     AS COSTO,
           p.STOCK_ACTUAL                                  AS STOCK,
           CAST(CASE WHEN p.ESTADO = '1' THEN 'ACTIVO' ELSE 'INACTIVO' END AS varchar(10)) AS ESTADO
    FROM vet.PRODUCTO p
    LEFT JOIN vet.CATEGORIA c     ON c.IDCATEGORIA = p.IDCATEGORIA
    LEFT JOIN vet.UNIDAD_MEDIDA u ON u.IDUNIDAD_MEDIDA = p.IDUNIDAD_MEDIDA
    UNION ALL
    -- 2) CASTILLONV2  (precios en soles)
    SELECT 'CASTILLONV2', 'VETERINARIA', CAST(p.IDPRODUCTO AS nvarchar(50)),
           consolidado.FN_LIMPIAR(p.NOMPRODUCTO),
           consolidado.FN_LIMPIAR(p.DESCRIPCION),
           ISNULL(UPPER(consolidado.FN_LIMPIAR(c.NOMCATEGORIA)), 'SIN CATEGORIA'),
           NULL,
           consolidado.FN_LIMPIAR(p.MARCA),
           'PEN',
           CAST(p.PRECIO AS decimal(12,2)),
           NULL, NULL,
           CASE WHEN p.ESTADO = '1' THEN 'ACTIVO' ELSE 'INACTIVO' END
    FROM castillon.PRODUCTO p
    LEFT JOIN castillon.CATEGORIA c ON c.IDCATEGORIA = p.IDCATEGORIA
    UNION ALL
    -- 3) SamarImportadora  (empresa chilena: precios en pesos chilenos)
    SELECT 'SAMARIMPORTADORA', 'SAMAR', a.CODIGO_PRODUCTO,
           consolidado.FN_LIMPIAR(a.NOMBRE),
           NULL,
           ISNULL(UPPER(consolidado.FN_LIMPIAR(a.CATEGORIA)), 'SIN CATEGORIA'),
           NULL, NULL,
           'CLP',
           CAST(a.PRECIO_UNITARIO AS decimal(12,2)),
           CAST(a.COSTO_UNITARIO AS decimal(12,2)),
           NULL,
           'ACTIVO'
    FROM samar.ARTICULOS a;
GO

/* ------------------------------ CARGAR (MERGE) ------------------------------ */
CREATE OR ALTER PROCEDURE consolidado.SP_SYNC_CLIENTES
    @ORIGEN_BD      varchar(40) = NULL,             -- NULL = todas las fuentes
    @IDS            consolidado.LISTA_IDS READONLY, -- filas afectadas (trigger)
    @CARGA_COMPLETA bit = 0
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ahora datetime2(0) = consolidado.FN_AHORA(), @filas int = 0;

    WITH s AS (
        SELECT * FROM consolidado.V_ETL_CLIENTES v
        WHERE (@ORIGEN_BD IS NULL OR v.ORIGEN_BD = @ORIGEN_BD)
          AND (@CARGA_COMPLETA = 1 OR v.ID_ORIGEN IN (SELECT ID FROM @IDS))
    )
    MERGE consolidado.CLIENTE_CONSOLIDADO AS t
    USING s ON t.ORIGEN_BD = s.ORIGEN_BD AND t.ID_ORIGEN = s.ID_ORIGEN
    WHEN MATCHED AND EXISTS (
            SELECT s.DOCUMENTO, s.NOMBRES, s.APELLIDOS, s.GENERO, s.ESTADO_CIVIL, s.EDAD, s.CELULAR, s.CORREO, s.UBICACION, s.ESTADO
            EXCEPT
            SELECT t.DOCUMENTO, t.NOMBRES, t.APELLIDOS, t.GENERO, t.ESTADO_CIVIL, t.EDAD, t.CELULAR, t.CORREO, t.UBICACION, t.ESTADO)
        THEN UPDATE SET DOCUMENTO = s.DOCUMENTO, NOMBRES = s.NOMBRES, APELLIDOS = s.APELLIDOS,
                        NOMBRE_COMPLETO = s.NOMBRE_COMPLETO, GENERO = s.GENERO, ESTADO_CIVIL = s.ESTADO_CIVIL,
                        EDAD = s.EDAD, RANGO_EDAD = s.RANGO_EDAD, CELULAR = s.CELULAR, CORREO = s.CORREO,
                        UBICACION = s.UBICACION, ESTADO = s.ESTADO, SISTEMA = s.SISTEMA,
                        FECHA_ACTUALIZACION = @ahora
    WHEN NOT MATCHED BY TARGET
        THEN INSERT (ORIGEN_BD, SISTEMA, ID_ORIGEN, DOCUMENTO, NOMBRES, APELLIDOS, NOMBRE_COMPLETO, GENERO,
                     ESTADO_CIVIL, EDAD, RANGO_EDAD, CELULAR, CORREO, UBICACION, ESTADO, FECHA_CARGA, FECHA_ACTUALIZACION)
             VALUES (s.ORIGEN_BD, s.SISTEMA, s.ID_ORIGEN, s.DOCUMENTO, s.NOMBRES, s.APELLIDOS, s.NOMBRE_COMPLETO, s.GENERO,
                     s.ESTADO_CIVIL, s.EDAD, s.RANGO_EDAD, s.CELULAR, s.CORREO, s.UBICACION, s.ESTADO, @ahora, @ahora);
    SET @filas = @@ROWCOUNT;

    -- Filas borradas fisicamente en la fuente -> se borran del consolidado
    DELETE t FROM consolidado.CLIENTE_CONSOLIDADO t
    WHERE (@ORIGEN_BD IS NULL OR t.ORIGEN_BD = @ORIGEN_BD)
      AND (@CARGA_COMPLETA = 1 OR t.ID_ORIGEN IN (SELECT ID FROM @IDS))
      AND NOT EXISTS (SELECT 1 FROM consolidado.V_ETL_CLIENTES v WHERE v.ORIGEN_BD = t.ORIGEN_BD AND v.ID_ORIGEN = t.ID_ORIGEN);
    SET @filas += @@ROWCOUNT;

    INSERT consolidado.ETL_LOG (FECHA, ENTIDAD, ORIGEN_BD, OPERACION, FILAS)
    VALUES (@ahora, 'CLIENTE', @ORIGEN_BD, CASE WHEN @CARGA_COMPLETA = 1 THEN 'CARGA_COMPLETA' ELSE 'TIEMPO_REAL' END, @filas);
END;
GO

CREATE OR ALTER PROCEDURE consolidado.SP_SYNC_PRODUCTOS
    @ORIGEN_BD      varchar(40) = NULL,
    @IDS            consolidado.LISTA_IDS READONLY,
    @CARGA_COMPLETA bit = 0
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ahora datetime2(0) = consolidado.FN_AHORA(), @filas int = 0;

    WITH s AS (
        SELECT * FROM consolidado.V_ETL_PRODUCTOS v
        WHERE (@ORIGEN_BD IS NULL OR v.ORIGEN_BD = @ORIGEN_BD)
          AND (@CARGA_COMPLETA = 1 OR v.ID_ORIGEN IN (SELECT ID FROM @IDS))
    )
    MERGE consolidado.PRODUCTO_CONSOLIDADO AS t
    USING s ON t.ORIGEN_BD = s.ORIGEN_BD AND t.ID_ORIGEN = s.ID_ORIGEN
    WHEN MATCHED AND EXISTS (
            SELECT s.NOMBRE, s.DESCRIPCION, s.CATEGORIA, s.UNIDAD_MEDIDA, s.MARCA, s.MONEDA, s.PRECIO, s.COSTO, s.STOCK, s.ESTADO
            EXCEPT
            SELECT t.NOMBRE, t.DESCRIPCION, t.CATEGORIA, t.UNIDAD_MEDIDA, t.MARCA, t.MONEDA, t.PRECIO, t.COSTO, t.STOCK, t.ESTADO)
        THEN UPDATE SET NOMBRE = s.NOMBRE, DESCRIPCION = s.DESCRIPCION, CATEGORIA = s.CATEGORIA,
                        UNIDAD_MEDIDA = s.UNIDAD_MEDIDA, MARCA = s.MARCA, MONEDA = s.MONEDA, PRECIO = s.PRECIO,
                        COSTO = s.COSTO, STOCK = s.STOCK, ESTADO = s.ESTADO, SISTEMA = s.SISTEMA,
                        FECHA_ACTUALIZACION = @ahora
    WHEN NOT MATCHED BY TARGET
        THEN INSERT (ORIGEN_BD, SISTEMA, ID_ORIGEN, NOMBRE, DESCRIPCION, CATEGORIA, UNIDAD_MEDIDA, MARCA, MONEDA,
                     PRECIO, COSTO, STOCK, ESTADO, FECHA_CARGA, FECHA_ACTUALIZACION)
             VALUES (s.ORIGEN_BD, s.SISTEMA, s.ID_ORIGEN, s.NOMBRE, s.DESCRIPCION, s.CATEGORIA, s.UNIDAD_MEDIDA, s.MARCA, s.MONEDA,
                     s.PRECIO, s.COSTO, s.STOCK, s.ESTADO, @ahora, @ahora);
    SET @filas = @@ROWCOUNT;

    DELETE t FROM consolidado.PRODUCTO_CONSOLIDADO t
    WHERE (@ORIGEN_BD IS NULL OR t.ORIGEN_BD = @ORIGEN_BD)
      AND (@CARGA_COMPLETA = 1 OR t.ID_ORIGEN IN (SELECT ID FROM @IDS))
      AND NOT EXISTS (SELECT 1 FROM consolidado.V_ETL_PRODUCTOS v WHERE v.ORIGEN_BD = t.ORIGEN_BD AND v.ID_ORIGEN = t.ID_ORIGEN);
    SET @filas += @@ROWCOUNT;

    INSERT consolidado.ETL_LOG (FECHA, ENTIDAD, ORIGEN_BD, OPERACION, FILAS)
    VALUES (@ahora, 'PRODUCTO', @ORIGEN_BD, CASE WHEN @CARGA_COMPLETA = 1 THEN 'CARGA_COMPLETA' ELSE 'TIEMPO_REAL' END, @filas);
END;
GO

CREATE OR ALTER PROCEDURE consolidado.SP_CARGA_COMPLETA
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @vacio consolidado.LISTA_IDS;
    EXEC consolidado.SP_SYNC_CLIENTES  @ORIGEN_BD = NULL, @IDS = @vacio, @CARGA_COMPLETA = 1;
    EXEC consolidado.SP_SYNC_PRODUCTOS @ORIGEN_BD = NULL, @IDS = @vacio, @CARGA_COMPLETA = 1;
END;
GO

/* ------------------------------ Triggers originales de la BD veterinaria ------------------------------ */
CREATE OR ALTER TRIGGER vet.TR_INSERT_PERSONA_CLIENTE ON vet.PERSONA AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO vet.CLIENTE (IDPERSONA, IDEMPRESA, USUCRE, PCCRE, FECCRE, ESTADO)
    SELECT IDPERSONA, NULL, ISNULL(USUCRE, 'LCASTILLON'), ISNULL(PCCRE, LEFT(@@SERVERNAME, 30)), consolidado.FN_AHORA(), '1'
    FROM inserted;
END;
GO
CREATE OR ALTER TRIGGER vet.TR_INSERT_EMPRESA_CLIENTE ON vet.EMPRESA AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO vet.CLIENTE (IDPERSONA, IDEMPRESA, USUCRE, PCCRE, FECCRE, ESTADO)
    SELECT NULL, IDEMPRESA, ISNULL(USUCRE, 'LCASTILLON'), ISNULL(PCCRE, LEFT(@@SERVERNAME, 30)), consolidado.FN_AHORA(), '1'
    FROM inserted;
END;
GO

/* ------------------------------ Triggers ETL en tiempo real ------------------------------ */
CREATE OR ALTER TRIGGER vet.TRG_ETL_PERSONA ON vet.PERSONA AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ids consolidado.LISTA_IDS;
    INSERT @ids SELECT CAST(IDPERSONA AS nvarchar(50)) FROM inserted UNION SELECT CAST(IDPERSONA AS nvarchar(50)) FROM deleted;
    IF @@ROWCOUNT > 0 EXEC consolidado.SP_SYNC_CLIENTES @ORIGEN_BD = 'BD_CASTILLON_VETERINARIA', @IDS = @ids;
END;
GO
CREATE OR ALTER TRIGGER vet.TRG_ETL_PRODUCTO ON vet.PRODUCTO AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ids consolidado.LISTA_IDS;
    INSERT @ids SELECT CAST(IDPRODUCTO AS nvarchar(50)) FROM inserted UNION SELECT CAST(IDPRODUCTO AS nvarchar(50)) FROM deleted;
    IF @@ROWCOUNT > 0 EXEC consolidado.SP_SYNC_PRODUCTOS @ORIGEN_BD = 'BD_CASTILLON_VETERINARIA', @IDS = @ids;
END;
GO
CREATE OR ALTER TRIGGER castillon.TRG_ETL_PERSONA ON castillon.PERSONA AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ids consolidado.LISTA_IDS;
    INSERT @ids SELECT CAST(IDPERSONA AS nvarchar(50)) FROM inserted UNION SELECT CAST(IDPERSONA AS nvarchar(50)) FROM deleted;
    IF @@ROWCOUNT > 0 EXEC consolidado.SP_SYNC_CLIENTES @ORIGEN_BD = 'CASTILLONV2', @IDS = @ids;
END;
GO
CREATE OR ALTER TRIGGER castillon.TRG_ETL_PRODUCTO ON castillon.PRODUCTO AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ids consolidado.LISTA_IDS;
    INSERT @ids SELECT CAST(IDPRODUCTO AS nvarchar(50)) FROM inserted UNION SELECT CAST(IDPRODUCTO AS nvarchar(50)) FROM deleted;
    IF @@ROWCOUNT > 0 EXEC consolidado.SP_SYNC_PRODUCTOS @ORIGEN_BD = 'CASTILLONV2', @IDS = @ids;
END;
GO
CREATE OR ALTER TRIGGER samar.TRG_ETL_CLIENTES ON samar.CLIENTES AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ids consolidado.LISTA_IDS;
    INSERT @ids SELECT ID_CLIENTE FROM inserted UNION SELECT ID_CLIENTE FROM deleted;
    IF @@ROWCOUNT > 0 EXEC consolidado.SP_SYNC_CLIENTES @ORIGEN_BD = 'SAMARIMPORTADORA', @IDS = @ids;
END;
GO
CREATE OR ALTER TRIGGER samar.TRG_ETL_ARTICULOS ON samar.ARTICULOS AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ids consolidado.LISTA_IDS;
    INSERT @ids SELECT CODIGO_PRODUCTO FROM inserted UNION SELECT CODIGO_PRODUCTO FROM deleted;
    IF @@ROWCOUNT > 0 EXEC consolidado.SP_SYNC_PRODUCTOS @ORIGEN_BD = 'SAMARIMPORTADORA', @IDS = @ids;
END;
GO
CREATE OR ALTER TRIGGER dw.TRG_ETL_DIM_CLIENTE ON dw.DIM_CLIENTE AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ids consolidado.LISTA_IDS;
    INSERT @ids SELECT ID_CLIENTE FROM inserted UNION SELECT ID_CLIENTE FROM deleted;
    IF @@ROWCOUNT > 0 EXEC consolidado.SP_SYNC_CLIENTES @ORIGEN_BD = 'DW_SAMARIMPORTADORA', @IDS = @ids;
END;
GO

/* ------------------------------ Vistas para Power BI ------------------------------ */
CREATE OR ALTER VIEW consolidado.V_PBI_CLIENTES AS
SELECT ID_CONSOLIDADO, ORIGEN_BD, SISTEMA, ID_ORIGEN, DOCUMENTO, NOMBRE_COMPLETO, GENERO, ESTADO_CIVIL,
       EDAD, RANGO_EDAD, UBICACION, ESTADO, FECHA_CARGA, FECHA_ACTUALIZACION,
       CAST(FECHA_CARGA AS date) AS FECHA_REGISTRO
FROM consolidado.CLIENTE_CONSOLIDADO;
GO
CREATE OR ALTER VIEW consolidado.V_PBI_PRODUCTOS AS
SELECT ID_CONSOLIDADO, ORIGEN_BD, SISTEMA, ID_ORIGEN, NOMBRE, CATEGORIA, UNIDAD_MEDIDA, MARCA, MONEDA,
       PRECIO, COSTO, MARGEN, STOCK, CAST(PRECIO * ISNULL(STOCK, 0) AS decimal(14,2)) AS VALOR_INVENTARIO,
       ESTADO, FECHA_CARGA, FECHA_ACTUALIZACION
FROM consolidado.PRODUCTO_CONSOLIDADO;
GO
PRINT '02_etl_consolidado.sql OK';
