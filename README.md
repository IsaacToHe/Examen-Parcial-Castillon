# Sistemas Web OLTP con ETL y Power BI en Tiempo Real
### Examen Parcial 2026-I - Sistemas de Soporte para la Toma de Decisiones (SSTDD)
**Docente:** Ing. Luis Alfredo Castillon Siguas  
**Universidad Privada San Juan Bautista (UPSJB) - Filial Ica**

---

## 📋 Arquitectura de la Solución

El proyecto resuelve el **Ejercicio 3** implementando un flujo integral OLTP ➔ ETL ➔ OLAP ➔ Power BI:

```
[ Sistema Web Veterinaria ] ──(REST API)──> [ Esquema vet (BD_CASTILLON_VETERINARIA) ]
                                                       │
                                              (Trigger en Tiempo Real)
                                                       ▼
[ Sistema Web Samar ]       ──(REST API)──> [ Esquema samar (SamarImportadora) ] ──> [ BD_CONSOLIDADO ] ──(DirectQuery)──> [ Power BI Service (Nube) ]
                                                       ▲
                                              (Trigger en Tiempo Real)
                                                       │
[ Histórico CastillonV2 & DW Samar ] ──────────────────┘
```

1. **Dos Sistemas Web Independientes con Dominio Gratuito (Vercel):**
   * **Veterinaria:** Login + CRUD 1 (Personas/Clientes con modal gráfico idéntico al examen) + CRUD 2 (Productos).
   * **Samar Importadora:** Login + CRUD 1 (Cartera de Clientes) + CRUD 2 (Artículos).
2. **Base de Datos Consolidada (`BD_CONSOLIDADO`):**
   * Tablas `CLIENTE_CONSOLIDADO` y `PRODUCTO_CONSOLIDADO` con discriminador de origen.
3. **Flujo Automático ETL vía Triggers en SQL Server:**
   * Cada inserción, actualización o eliminación en las tablas transaccionales activa un Trigger que normaliza y propaga los datos hacia `BD_CONSOLIDADO` en la misma transacción.
4. **Dashboards en Power BI en Tiempo Real:**
   * Conexión en modo **DirectQuery** para visualizar los registros ingresados desde la web inmediatamente.

---

## 📁 Estructura del Repositorio

```
sistemas-web/
├── database/
│   ├── 01_esquema.sql          # DDL de los esquemas vet, samar, castillon, dw, consolidado, seguridad
│   ├── 02_etl_consolidado.sql  # Vistas de transformación, procedimientos MERGE y Triggers en tiempo real
│   └── migrar.ps1              # Script PowerShell de migración con bcp nativo
├── scripts/
│   ├── auth-util.js            # Criptografía nativa Node.js (scrypt + HMAC-SHA256)
│   └── seed-users.js           # Creación de usuarios admin en seguridad.USUARIO_WEB
├── veterinaria/                # Proyecto Web Veterinaria (Deployable en Vercel)
│   ├── api/                    # Serverless Functions (auth.js, personas.js, productos.js, stats.js)
│   ├── public/                 # Frontend estático (index.html, css/style.css, js/app.js)
│   ├── package.json
│   ├── server.js               # Servidor de pruebas local (Puerto 3001)
│   └── vercel.json
├── samar/                      # Proyecto Web Samar Importadora (Deployable en Vercel)
│   ├── api/                    # Serverless Functions (auth.js, clientes.js, articulos.js, stats.js)
│   ├── public/                 # Frontend estático (index.html, css/style.css, js/app.js)
│   ├── package.json
│   ├── server.js               # Servidor de pruebas local (Puerto 3002)
│   └── vercel.json
├── index.html                  # Portal de bienvenida central
└── package.json
```

---

## 🚀 Paso a Paso: Subir el Código a GitHub

1. **Crear el repositorio en GitHub:**
   * Ingresa a [https://github.com/new](https://github.com/new).
   * Nombre del repositorio: `sistemas-web-sstdd` (o el nombre que prefieras).
   * Tipo: **Público** (o Privado).
   * **No** marques las opciones de agregar README, .gitignore o licencia (ya existen localmente).
   * Haz clic en **Create repository**.

2. **Configurar tu usuario de Git (si aún no lo hiciste):**
   ```bash
   git config --global user.name "Tu Nombre o Usuario"
   git config --global user.email "tu_correo@upsjb.edu.pe"
   ```

3. **Hacer el primer commit y subir:**
   ```bash
   cd "c:\Users\UPSJB\Downloads\Examen Parcial\sistemas-web"
   git branch -m main
   git add .
   git commit -m "feat: sistemas web veterinaria y samar con ETL en tiempo real y configuracion Vercel"
   git remote add origin https://github.com/TU_USUARIO/sistemas-web-sstdd.git
   git push -u origin main
   ```

---

## ☁️ Paso a Paso: Desplegar en Vercel (Gratis)

Puedes desplegar **ambos sistemas** en dominios gratuitos independientes (ej. `veterinaria-upsjb.vercel.app` y `samar-upsjb.vercel.app`):

### Despliegue de Sistema 1 (Veterinaria):
1. Ingresa a [https://vercel.com](https://vercel.com) e inicia sesión con tu cuenta de GitHub.
2. Clic en **Add New...** ➔ **Project**.
3. Selecciona el repositorio `sistemas-web-sstdd` y haz clic en **Import**.
4. En la configuración del proyecto:
   * **Project Name:** `veterinaria-sstdd` (o a tu gusto).
   * **Root Directory:** Haz clic en *Edit* y selecciona la carpeta **`veterinaria`**.
   * **Framework Preset:** Other.
5. Despliega la sección **Environment Variables** y agrega:
   * `DB_SERVER` = Tu servidor SQL (ej. `tuserver.database.windows.net` o host del túnel).
   * `DB_NAME` = `BD_CONSOLIDADO`
   * `DB_USER` = Tu usuario SQL (ej. `adminsql` o `app_web`).
   * `DB_PASSWORD` = Tu contraseña de SQL.
   * `JWT_SECRET` = Una clave secreta alfanumérica larga.
6. Haz clic en **Deploy**. ¡En menos de un minuto tendrás tu URL HTTPS gratuita!

### Despliegue de Sistema 2 (Samar Importadora):
1. En Vercel, haz clic nuevamente en **Add New...** ➔ **Project**.
2. Vuelve a importar el mismo repositorio `sistemas-web-sstdd`.
3. En **Root Directory**, selecciona la carpeta **`samar`**.
4. **Project Name:** `samar-sstdd`.
5. Agrega las mismas Variables de Entorno (`DB_SERVER`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`).
6. Clic en **Deploy**.

---

## 🔑 Credenciales de Acceso a los Sistemas Web

| Sistema | Usuario | Contraseña | Rol |
| :--- | :--- | :--- | :--- |
| **Veterinaria** | `admin` | `admin` | Administrador General |
| **Veterinaria** | `castillon` | `admin` | Docente Evaluador |
| **Samar Importadora** | `admin` | `admin` | Administrador Comercial |
| **Samar Importadora** | `castillon` | `admin` | Docente Evaluador |

---

## 📊 Configuración de Power BI en Tiempo Real

1. Abrir **Power BI Desktop**.
2. **Obtener datos** ➔ **SQL Server Database**.
   * Servidor: Tu servidor Azure SQL o `localhost`.
   * Base de datos: `BD_CONSOLIDADO`.
   * **Modo de conectividad de datos:** Seleccionar **DirectQuery** *(imprescindible)*.
3. Cargar las vistas:
   * `consolidado.V_PBI_CLIENTES`
   * `consolidado.V_PBI_PRODUCTOS`
4. En las opciones de formato del reporte, activar:
   * **Actualización de página automática (Automatic Page Refresh)** cada `5` o `10` segundos.
5. Diseñar los 2 Dashboards:
   * **Dashboard 1 (Clientes Consolidados):** Total Clientes, Distribución por Género, Clientes por Origen (`VETERINARIA` vs `SAMAR`), Grilla de últimas altas.
   * **Dashboard 2 (Productos & Inventario):** Total Productos, Valor de Inventario, Precios por Categoría y Origen.
6. Publicar en **Power BI Service** en la nube.
