/* =====================================================================
   01_esquema.sql  -  Estructura OLTP en Azure SQL Database
   ---------------------------------------------------------------------
   Azure SQL Database NO permite consultas ni triggers entre bases de
   datos (BD1.dbo.TABLA). Por eso cada base de datos original se
   representa como un ESQUEMA dentro de una sola base:

     vet        <- BD_CASTILLON_VETERINARIA   (OLTP sistema Veterinaria)
     castillon  <- CASTILLONV2                (OLTP)
     samar      <- SamarImportadora           (OLTP sistema Samar)
     dw         <- DW_SamarImportadora        (OLAP)
     consolidado-> BASE DE DATOS CONSOLIDADA  (destino del ETL)
     seguridad  -> usuarios del login web

   Los tipos de datos se generaron desde las bases originales para que
   la migracion con bcp (formato nativo) sea exacta.
   El script es idempotente: no borra nada si se ejecuta dos veces.
   ===================================================================== */
SET NOCOUNT ON;
GO
IF SCHEMA_ID('vet')         IS NULL EXEC('CREATE SCHEMA vet');
IF SCHEMA_ID('castillon')   IS NULL EXEC('CREATE SCHEMA castillon');
IF SCHEMA_ID('samar')       IS NULL EXEC('CREATE SCHEMA samar');
IF SCHEMA_ID('dw')          IS NULL EXEC('CREATE SCHEMA dw');
IF SCHEMA_ID('consolidado') IS NULL EXEC('CREATE SCHEMA consolidado');
IF SCHEMA_ID('seguridad')   IS NULL EXEC('CREATE SCHEMA seguridad');
GO

/* ---------------------------------------------------------------
   vet  (BD_CASTILLON_VETERINARIA)
   --------------------------------------------------------------- */
IF OBJECT_ID('vet.DISTRITO') IS NULL
CREATE TABLE vet.DISTRITO (
    [IDDISTRITO] int IDENTITY(1,1) NOT NULL,
    [IDPROVINCIA] int NULL,
    [NOMDISTRITO] varchar(250) NULL,
    [USUCRE] varchar(30) NULL,
    [PCCRE] varchar(30) NULL,
    [FECCRE] datetime NULL,
    [USUMOD] varchar(30) NULL,
    [PCMOD] varchar(30) NULL,
    [FECMOD] datetime NULL,
    [ESTADO] char(1) NULL,
    CONSTRAINT PK_vet_DISTRITO PRIMARY KEY ([IDDISTRITO])
);
GO
IF OBJECT_ID('vet.PERSONA') IS NULL
CREATE TABLE vet.PERSONA (
    [IDPERSONA] int IDENTITY(1,1) NOT NULL,
    [IDDISTRITO] int NULL,
    [NOMBRE] varchar(30) NULL,
    [APE_PATERNO] varchar(30) NULL,
    [APE_MATERNO] varchar(30) NULL,
    [FECHNAC] date NULL,
    [DIRECCION] varchar(120) NULL,
    [DNI] char(8) NULL,
    [GENERO] char(1) NULL,
    [CELULAR] varchar(10) NULL,
    [CORREO] varchar(30) NULL,
    [EST_CIVIL] char(2) NULL,
    [USUCRE] varchar(30) NULL,
    [PCCRE] varchar(30) NULL,
    [FECCRE] datetime NULL,
    [USUMOD] varchar(30) NULL,
    [PCMOD] varchar(30) NULL,
    [FECMOD] datetime NULL,
    [ESTADO] char(1) NULL,
    CONSTRAINT PK_vet_PERSONA PRIMARY KEY ([IDPERSONA]),
    CONSTRAINT FK_vet_PERSONA_DISTRITO FOREIGN KEY ([IDDISTRITO]) REFERENCES vet.DISTRITO([IDDISTRITO])
);
GO
IF OBJECT_ID('vet.EMPRESA') IS NULL
CREATE TABLE vet.EMPRESA (
    [IDEMPRESA] int IDENTITY(1,1) NOT NULL,
    [RUC] varchar(11) NULL,
    [RAZON_SOCIAL] varchar(50) NULL,
    [DIRECCION] nvarchar(120) NULL,
    [TELEFONO] varchar(10) NULL,
    [USUCRE] varchar(30) NULL,
    [PCCRE] varchar(30) NULL,
    [FECCRE] datetime NULL,
    [USUMOD] varchar(30) NULL,
    [PCMOD] varchar(30) NULL,
    [FECMOD] datetime NULL,
    [ESTADO] char(1) NULL,
    CONSTRAINT PK_vet_EMPRESA PRIMARY KEY ([IDEMPRESA])
);
GO
IF OBJECT_ID('vet.CLIENTE') IS NULL
CREATE TABLE vet.CLIENTE (
    [IDCLIENTE] int IDENTITY(1,1) NOT NULL,
    [IDPERSONA] int NULL,
    [IDEMPRESA] int NULL,
    [USUCRE] varchar(30) NULL,
    [PCCRE] varchar(30) NULL,
    [FECCRE] datetime NULL,
    [USUMOD] varchar(30) NULL,
    [PCMOD] varchar(30) NULL,
    [FECMOD] datetime NULL,
    [ESTADO] char(1) NULL,
    CONSTRAINT PK_vet_CLIENTE PRIMARY KEY ([IDCLIENTE]),
    CONSTRAINT FK_vet_CLIENTE_PERSONA FOREIGN KEY ([IDPERSONA]) REFERENCES vet.PERSONA([IDPERSONA]),
    CONSTRAINT FK_vet_CLIENTE_EMPRESA FOREIGN KEY ([IDEMPRESA]) REFERENCES vet.EMPRESA([IDEMPRESA])
);
GO
IF OBJECT_ID('vet.CATEGORIA') IS NULL
CREATE TABLE vet.CATEGORIA (
    [IDCATEGORIA] int IDENTITY(1,1) NOT NULL,
    [NOMCATEGORIA] varchar(50) NULL,
    [USUCRE] varchar(30) NULL,
    [PCCRE] varchar(30) NULL,
    [FECCRE] datetime NULL,
    [USUMOD] varchar(30) NULL,
    [PCMOD] varchar(30) NULL,
    [FECMOD] datetime NULL,
    [ESTADO] char(1) NULL,
    CONSTRAINT PK_vet_CATEGORIA PRIMARY KEY ([IDCATEGORIA])
);
GO
IF OBJECT_ID('vet.UNIDAD_MEDIDA') IS NULL
CREATE TABLE vet.UNIDAD_MEDIDA (
    [IDUNIDAD_MEDIDA] int IDENTITY(1,1) NOT NULL,
    [NOMUNIDAD_MEDIDA] varchar(30) NULL,
    [DECRIPCION] varchar(120) NULL,
    [USUCRE] varchar(30) NULL,
    [PCCRE] varchar(30) NULL,
    [FECCRE] datetime NULL,
    [USUMOD] varchar(30) NULL,
    [PCMOD] varchar(30) NULL,
    [FECMOD] datetime NULL,
    [ESTADO] char(1) NULL,
    CONSTRAINT PK_vet_UNIDAD_MEDIDA PRIMARY KEY ([IDUNIDAD_MEDIDA])
);
GO
IF OBJECT_ID('vet.PRODUCTO') IS NULL
CREATE TABLE vet.PRODUCTO (
    [IDPRODUCTO] int IDENTITY(1,1) NOT NULL,
    [IDUNIDAD_MEDIDA] int NULL,
    [IDCATEGORIA] int NULL,
    [NOMPRODUCTO] varchar(100) NOT NULL,
    [DESCRIPCION] nvarchar(250) NULL,
    [PRECIO_UNITARIO] decimal(6,2) NOT NULL,
    [STOCK_ACTUAL] int NULL,
    [USUCRE] varchar(30) NULL,
    [PCCRE] varchar(30) NULL,
    [FECCRE] datetime NULL,
    [USUMOD] varchar(30) NULL,
    [PCMOD] varchar(30) NULL,
    [FECMOD] datetime NULL,
    [ESTADO] char(1) NULL,
    CONSTRAINT PK_vet_PRODUCTO PRIMARY KEY ([IDPRODUCTO]),
    CONSTRAINT FK_vet_PRODUCTO_CATEGORIA FOREIGN KEY ([IDCATEGORIA]) REFERENCES vet.CATEGORIA([IDCATEGORIA]),
    CONSTRAINT FK_vet_PRODUCTO_UNIDAD FOREIGN KEY ([IDUNIDAD_MEDIDA]) REFERENCES vet.UNIDAD_MEDIDA([IDUNIDAD_MEDIDA])
);
GO

/* ---------------------------------------------------------------
   castillon  (CASTILLONV2)
   --------------------------------------------------------------- */
IF OBJECT_ID('castillon.PERSONA') IS NULL
CREATE TABLE castillon.PERSONA (
    [IDPERSONA] int IDENTITY(1,1) NOT NULL,
    [IDDISTRITO] int NULL,
    [NOMBRES] varchar(80) NULL,
    [APEPATERNO] varchar(70) NULL,
    [APEMATERNO] varchar(70) NULL,
    [EST_CIVIL] char(2) NULL,
    [DNI] char(8) NULL,
    [DIRECCION] nvarchar(90) NULL,
    [CELULAR] char(9) NULL,
    [FECNAC] date NULL,
    [CORREO] varchar(80) NULL,
    [ESTADO] char(1) NULL,
    CONSTRAINT PK_castillon_PERSONA PRIMARY KEY ([IDPERSONA])
);
GO
IF OBJECT_ID('castillon.EMPRESA') IS NULL
CREATE TABLE castillon.EMPRESA (
    [IDEMPRESA] int IDENTITY(1,1) NOT NULL,
    [RUC] char(11) NULL,
    [RAZON_SOCIAL] nvarchar(90) NULL,
    [DIRECCION] nvarchar(90) NULL,
    [TELEFONO] char(10) NULL,
    [ESTADO] char(1) NULL,
    CONSTRAINT PK_castillon_EMPRESA PRIMARY KEY ([IDEMPRESA])
);
GO
IF OBJECT_ID('castillon.CLIENTE') IS NULL
CREATE TABLE castillon.CLIENTE (
    [IDCLIENTE] int IDENTITY(1,1) NOT NULL,
    [IDPERSONA] int NULL,
    [IDEMPRESA] int NULL,
    [ESTADO] char(1) NULL,
    CONSTRAINT PK_castillon_CLIENTE PRIMARY KEY ([IDCLIENTE]),
    CONSTRAINT FK_castillon_CLIENTE_PERSONA FOREIGN KEY ([IDPERSONA]) REFERENCES castillon.PERSONA([IDPERSONA]),
    CONSTRAINT FK_castillon_CLIENTE_EMPRESA FOREIGN KEY ([IDEMPRESA]) REFERENCES castillon.EMPRESA([IDEMPRESA])
);
GO
IF OBJECT_ID('castillon.CATEGORIA') IS NULL
CREATE TABLE castillon.CATEGORIA (
    [IDCATEGORIA] int IDENTITY(1,1) NOT NULL,
    [NOMCATEGORIA] varchar(80) NULL,
    [ESTADO] char(1) NULL,
    CONSTRAINT PK_castillon_CATEGORIA PRIMARY KEY ([IDCATEGORIA])
);
GO
IF OBJECT_ID('castillon.PRODUCTO') IS NULL
CREATE TABLE castillon.PRODUCTO (
    [IDPRODUCTO] int IDENTITY(1,1) NOT NULL,
    [IDCATEGORIA] int NULL,
    [NOMPRODUCTO] nvarchar(100) NULL,
    [DESCRIPCION] nvarchar(100) NULL,
    [PRECIO] decimal(6,2) NULL,
    [MARCA] nvarchar(50) NULL,
    [ESTADO] char(1) NULL,
    CONSTRAINT PK_castillon_PRODUCTO PRIMARY KEY ([IDPRODUCTO]),
    CONSTRAINT FK_castillon_PRODUCTO_CATEGORIA FOREIGN KEY ([IDCATEGORIA]) REFERENCES castillon.CATEGORIA([IDCATEGORIA])
);
GO

/* ---------------------------------------------------------------
   samar  (SamarImportadora)
   --------------------------------------------------------------- */
IF OBJECT_ID('samar.CLIENTES') IS NULL
CREATE TABLE samar.CLIENTES (
    [ID_CLIENTE] nvarchar(255) NOT NULL,
    [NOMBRE] nvarchar(255) NULL,
    [APELLIDO] nvarchar(255) NULL,
    [EDAD] smallint NULL,
    [ESTADO_CIVIL] nvarchar(255) NULL,
    [RESIDENCIA] nvarchar(255) NULL,
    [ORIGEN] nvarchar(255) NULL,
    CONSTRAINT PK_samar_CLIENTES PRIMARY KEY ([ID_CLIENTE])
);
GO
IF OBJECT_ID('samar.ARTICULOS') IS NULL
CREATE TABLE samar.ARTICULOS (
    [CODIGO_PRODUCTO] nvarchar(255) NOT NULL,
    [NOMBRE] nvarchar(255) NULL,
    [CATEGORIA] nvarchar(255) NULL,
    [PRECIO_UNITARIO] int NULL,
    [COSTO_UNITARIO] int NULL,
    CONSTRAINT PK_samar_ARTICULOS PRIMARY KEY ([CODIGO_PRODUCTO])
);
GO

/* ---------------------------------------------------------------
   dw  (DW_SamarImportadora)
   --------------------------------------------------------------- */
IF OBJECT_ID('dw.DIM_CLIENTE') IS NULL
CREATE TABLE dw.DIM_CLIENTE (
    [ID_CLIENTE] nvarchar(255) NOT NULL,
    [NOMBRE_COMPLETO] nvarchar(255) NULL,
    [ESTADO_CIVIL] nvarchar(255) NULL,
    [ANO_NACIMEINTO] int NULL,
    [EDAD] smallint NULL,
    [ORIGEN] nvarchar(255) NULL,
    CONSTRAINT PK_dw_DIM_CLIENTE PRIMARY KEY ([ID_CLIENTE])
);
GO

/* ---------------------------------------------------------------
   seguridad  (usuarios del login de los sistemas web)
   Las claves se guardan con hash scrypt (nunca en texto plano).
   Los usuarios se crean con:  npm run crear-usuario
   --------------------------------------------------------------- */
IF OBJECT_ID('seguridad.USUARIO_WEB') IS NULL
CREATE TABLE seguridad.USUARIO_WEB (
    IDUSUARIO      int IDENTITY(1,1) NOT NULL CONSTRAINT PK_USUARIO_WEB PRIMARY KEY,
    SISTEMA        varchar(20)   NOT NULL,          -- 'VETERINARIA' | 'SAMAR'
    USUARIO        varchar(50)   NOT NULL,
    CLAVE_HASH     varchar(255)  NOT NULL,
    NOMBRE         nvarchar(100) NULL,
    ESTADO         char(1)       NOT NULL CONSTRAINT DF_USUARIO_WEB_ESTADO DEFAULT ('1'),
    FECCRE         datetime2(0)  NOT NULL CONSTRAINT DF_USUARIO_WEB_FECCRE DEFAULT (SYSDATETIME()),
    ULTIMO_ACCESO  datetime2(0)  NULL,
    CONSTRAINT UQ_USUARIO_WEB UNIQUE (SISTEMA, USUARIO),
    CONSTRAINT CK_USUARIO_WEB_SISTEMA CHECK (SISTEMA IN ('VETERINARIA','SAMAR'))
);
GO
PRINT '01_esquema.sql OK';
