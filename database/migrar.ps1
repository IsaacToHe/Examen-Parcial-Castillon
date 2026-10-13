<#
.SYNOPSIS
  Migra las 4 bases de datos del examen (SQL Server local) a UNA base destino
  (Azure SQL Database o una BD local de prueba) y deja el ETL funcionando.

.EJEMPLOS
  # Azure SQL Database (pedira la clave del administrador del servidor)
  .\migrar.ps1 -Servidor miservidor.database.windows.net -BaseDatos BD_ETL_SSTDD -Usuario adminsql -CrearUsuarioApp

  # Prueba local con autenticacion de Windows (crea la BD si no existe)
  .\migrar.ps1 -Servidor localhost -BaseDatos BD_ETL_PRUEBA -WindowsAuth

.NOTAS
  - Es seguro ejecutarlo varias veces: no duplica datos (salta tablas con filas).
  - La clave se toma de: -Password, variable SQL_PASSWORD, archivo database\.env, o se pide.
#>
param(
    [Parameter(Mandatory = $true)][string]$Servidor,
    [Parameter(Mandatory = $true)][string]$BaseDatos,
    [string]$Usuario,
    [string]$Password,
    [switch]$WindowsAuth,
    [string]$ServidorOrigen = 'localhost',
    [switch]$CrearUsuarioApp
)
$ErrorActionPreference = 'Stop'
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
$raiz = Split-Path -Parent $aqui

function Get-RandomSecret([int]$len = 32, [switch]$Complejo) {
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'.ToCharArray()
    $bytes = New-Object byte[] $len
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $s = -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })
    if ($Complejo) { $s = $s.Substring(0, $len - 4) + 'Aa9!' }   # garantiza mayus/minus/numero/simbolo
    return $s
}

# ---------------- Credenciales destino ----------------
if (-not $WindowsAuth) {
    if (-not $Usuario) { throw 'Falta -Usuario (administrador del servidor Azure SQL).' }
    if (-not $Password -and $env:SQL_PASSWORD) { $Password = $env:SQL_PASSWORD }
    $envFile = Join-Path $aqui '.env'
    if (-not $Password -and (Test-Path $envFile)) {
        $line = Get-Content $envFile | Where-Object { $_ -match '^\s*SQL_PASSWORD\s*=' } | Select-Object -First 1
        if ($line) { $Password = ($line -split '=', 2)[1].Trim() }
    }
    if (-not $Password) {
        $sec = Read-Host -AsSecureString "Clave de $Usuario en $Servidor"
        $Password = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
    }
    $env:SQLCMDPASSWORD = $Password
    $dst = @('-S', "tcp:$Servidor,1433", '-d', $BaseDatos, '-U', $Usuario, '-N')
    $bcpDst = @('-S', "tcp:$Servidor,1433", '-d', $BaseDatos, '-U', $Usuario, '-P', $Password)
} else {
    $dst = @('-S', $Servidor, '-d', $BaseDatos, '-E')
    $bcpDst = @('-S', $Servidor, '-d', $BaseDatos, '-T')
    Write-Host "Creando BD local $BaseDatos si no existe..." -ForegroundColor Cyan
    & sqlcmd -S $Servidor -E -b -Q "IF DB_ID('$BaseDatos') IS NULL CREATE DATABASE [$BaseDatos];"
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear la BD local.' }
}

function Invoke-SqlFile($archivo) {
    Write-Host ">> $archivo" -ForegroundColor Cyan
    & sqlcmd @dst -b -I -i (Join-Path $aqui $archivo)
    if ($LASTEXITCODE -ne 0) { throw "Error ejecutando $archivo" }
}
function Invoke-SqlScalar($q) {
    $r = & sqlcmd @dst -b -h -1 -W -Q "SET NOCOUNT ON; $q"
    if ($LASTEXITCODE -ne 0) { throw "Error: $q" }
    return ($r | Where-Object { $_ -ne '' } | Select-Object -First 1)
}

# ---------------- 1. Esquema ----------------
Invoke-SqlFile '01_esquema.sql'

# ---------------- 2. Datos (bcp nativo: exacto, respeta identity y caracteres especiales) ----------------
$tablas = @(
    @('BD_CASTILLON_VETERINARIA.dbo.DISTRITO',      'vet.DISTRITO'),
    @('BD_CASTILLON_VETERINARIA.dbo.PERSONA',       'vet.PERSONA'),
    @('BD_CASTILLON_VETERINARIA.dbo.EMPRESA',       'vet.EMPRESA'),
    @('BD_CASTILLON_VETERINARIA.dbo.CLIENTE',       'vet.CLIENTE'),
    @('BD_CASTILLON_VETERINARIA.dbo.CATEGORIA',     'vet.CATEGORIA'),
    @('BD_CASTILLON_VETERINARIA.dbo.UNIDAD_MEDIDA', 'vet.UNIDAD_MEDIDA'),
    @('BD_CASTILLON_VETERINARIA.dbo.PRODUCTO',      'vet.PRODUCTO'),
    @('CASTILLONV2.dbo.PERSONA',                    'castillon.PERSONA'),
    @('CASTILLONV2.dbo.EMPRESA',                    'castillon.EMPRESA'),
    @('CASTILLONV2.dbo.CLIENTE',                    'castillon.CLIENTE'),
    @('CASTILLONV2.dbo.CATEGORIA',                  'castillon.CATEGORIA'),
    @('CASTILLONV2.dbo.PRODUCTO',                   'castillon.PRODUCTO'),
    @('SamarImportadora.dbo.CLIENTES',              'samar.CLIENTES'),
    @('SamarImportadora.dbo.ARTICULOS',             'samar.ARTICULOS'),
    @('DW_SamarImportadora.dbo.DIM_CLIENTE',        'dw.DIM_CLIENTE')
)
$tmp = Join-Path $env:TEMP "etl_bcp_$(Get-Random)"
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
    foreach ($t in $tablas) {
        $origen, $destino = $t
        $n = [int](Invoke-SqlScalar "SELECT COUNT(*) FROM $destino")
        if ($n -gt 0) { Write-Host "   $destino ya tiene $n filas -> se omite" -ForegroundColor DarkGray; continue }
        $file = Join-Path $tmp ($destino + '.dat')
        & bcp $origen out $file -n -T -S $ServidorOrigen | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "bcp out fallo: $origen" }
        $out = & bcp $destino in $file -n -E @bcpDst
        if ($LASTEXITCODE -ne 0) { $out | Write-Host; throw "bcp in fallo: $destino" }
        $copiadas = ($out | Select-String 'rows copied|filas copiadas') -replace '\D+(\d+).*', '$1'
        Write-Host ("   {0,-22} <- {1,-45} {2} filas" -f $destino, $origen, $copiadas) -ForegroundColor Green
    }
} finally {
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}

# bcp no valida FKs al cargar: se validan ahora para dejarlas como "trusted"
Write-Host '>> Validando llaves foraneas' -ForegroundColor Cyan
foreach ($tbl in 'vet.PERSONA', 'vet.CLIENTE', 'vet.PRODUCTO', 'castillon.CLIENTE', 'castillon.PRODUCTO') {
    & sqlcmd @dst -b -Q "ALTER TABLE $tbl WITH CHECK CHECK CONSTRAINT ALL;" | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Warning "Algunas FK de $tbl no pudieron validarse (datos huerfanos en el origen)." }
}

# ---------------- 3. ETL: vistas, SP, triggers + carga completa ----------------
Invoke-SqlFile '02_etl_consolidado.sql'
Write-Host '>> Carga completa al consolidado' -ForegroundColor Cyan
& sqlcmd @dst -b -Q "EXEC consolidado.SP_CARGA_COMPLETA;"
if ($LASTEXITCODE -ne 0) { throw 'Fallo SP_CARGA_COMPLETA' }
& sqlcmd @dst -W -s ' | ' -Q "SET NOCOUNT ON; SELECT 'CLIENTES' AS ENTIDAD, ORIGEN_BD, COUNT(*) AS FILAS FROM consolidado.CLIENTE_CONSOLIDADO GROUP BY ORIGEN_BD UNION ALL SELECT 'PRODUCTOS', ORIGEN_BD, COUNT(*) FROM consolidado.PRODUCTO_CONSOLIDADO GROUP BY ORIGEN_BD ORDER BY 1,2;"

# ---------------- 4. Usuario de minimo privilegio para los sistemas web (solo Azure) ----------------
$appUser = $Usuario; $appPass = $Password
if ($CrearUsuarioApp -and -not $WindowsAuth) {
    $appUser = 'app_web'
    $appPass = Get-RandomSecret 24 -Complejo
    Write-Host ">> Creando usuario contenido $appUser" -ForegroundColor Cyan
    $q = @"
IF USER_ID('$appUser') IS NULL CREATE USER [$appUser] WITH PASSWORD = '$appPass';
ELSE ALTER USER [$appUser] WITH PASSWORD = '$appPass';
GRANT SELECT, INSERT, UPDATE         ON SCHEMA::vet         TO [$appUser];
GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::samar       TO [$appUser];
GRANT SELECT                         ON SCHEMA::consolidado TO [$appUser];
GRANT EXECUTE, REFERENCES            ON TYPE::consolidado.LISTA_IDS TO [$appUser];
GRANT SELECT, UPDATE                 ON seguridad.USUARIO_WEB TO [$appUser];
"@
    & sqlcmd @dst -b -Q $q
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el usuario app_web' }
}

# ---------------- 5. Archivos .env para desarrollo local ----------------
foreach ($app in 'veterinaria', 'samar') {
    $dirApp = Join-Path $raiz $app
    if (-not (Test-Path $dirApp)) { New-Item -ItemType Directory -Path $dirApp -Force | Out-Null }
    $envPath = Join-Path $dirApp ".env"
    $jwt = Get-RandomSecret 48
    if (Test-Path $envPath) {
        $old = Get-Content $envPath | Where-Object { $_ -match '^JWT_SECRET=' } | Select-Object -First 1
        if ($old) { $jwt = ($old -split '=', 2)[1] }
    }
    if ($WindowsAuth) {
        $content = @(
            "# Desarrollo local con autenticacion de Windows (requiere: npm i --no-save msnodesqlv8)",
            "DB_ODBC_CONNECTION=Driver={ODBC Driver 17 for SQL Server};Server=$Servidor;Database=$BaseDatos;Trusted_Connection=yes;",
            "JWT_SECRET=$jwt"
        )
    } else {
        $content = @(
            "DB_SERVER=$Servidor",
            "DB_NAME=$BaseDatos",
            "DB_USER=$appUser",
            "DB_PASSWORD=$appPass",
            "JWT_SECRET=$jwt"
        )
    }
    Set-Content -Path $envPath -Value $content -Encoding UTF8
    Write-Host "   .env escrito: $envPath" -ForegroundColor Green
}

Write-Host ''
Write-Host 'MIGRACION COMPLETA.' -ForegroundColor Green
if (-not $WindowsAuth) {
    Write-Host 'Variables de entorno para Vercel (las mismas en ambos proyectos, excepto JWT_SECRET que puede variar):' -ForegroundColor Yellow
    Write-Host "  DB_SERVER   = $Servidor"
    Write-Host "  DB_NAME     = $BaseDatos"
    Write-Host "  DB_USER     = $appUser"
    Write-Host '  DB_PASSWORD = (ver archivo veterinaria\.env)'
    Write-Host '  JWT_SECRET  = (ver archivo .env de cada sistema)'
}
