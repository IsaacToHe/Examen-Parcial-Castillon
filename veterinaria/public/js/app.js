// Estado de la aplicación
const state = {
  token: localStorage.getItem('vet_token') || null,
  user: null,
  personas: [],
  productos: [],
  categorias: [],
  unidades: [],
  currentPersona: null,
  currentProducto: null,
  searchTimer: null
};

// API base
const API_BASE = '/api';

// Headers con autenticación
function getHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (state.token) h['Authorization'] = `Bearer ${state.token}`;
  return h;
}

// ==================== INICIALIZACIÓN ====================
document.addEventListener('DOMContentLoaded', () => {
  if (state.token) {
    verificarSesion();
  } else {
    mostrarLogin();
  }

  // Listener del formulario de login
  const formLogin = document.getElementById('form-login');
  if (formLogin) {
    formLogin.addEventListener('submit', handleLogin);
  }
});

// Helper de login rápido
function fillLogin(u, p) {
  document.getElementById('login-user').value = u;
  document.getElementById('login-pass').value = p;
}

// ==================== AUTENTICACIÓN ====================
async function handleLogin(e) {
  e.preventDefault();
  const usuario = document.getElementById('login-user').value.trim();
  const clave = document.getElementById('login-pass').value;
  const alertBox = document.getElementById('login-alert');

  alertBox.className = 'alert hidden';

  try {
    const res = await fetch(`${API_BASE}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, clave })
    });
    const data = await res.json();

    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Credenciales inválidas');
    }

    state.token = data.token;
    state.user = data.usuario;
    localStorage.setItem('vet_token', data.token);

    mostrarApp();
    cargarCatalogos();
    cargarPersonas();
    cargarProductos();
    cargarMetricas();
    showToast('Bienvenido al sistema Veterinaria Castillon');
  } catch (err) {
    alertBox.textContent = err.message;
    alertBox.className = 'alert alert-danger';
  }
}

async function verificarSesion() {
  try {
    const res = await fetch(`${API_BASE}/auth`, { headers: getHeaders() });
    const data = await res.json();
    if (res.ok && data.ok) {
      state.user = data.user;
      mostrarApp();
      cargarCatalogos();
      cargarPersonas();
      cargarProductos();
      cargarMetricas();
    } else {
      logout();
    }
  } catch (e) {
    logout();
  }
}

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('vet_token');
  mostrarLogin();
}

function mostrarLogin() {
  document.getElementById('login-container').classList.remove('hidden');
  document.getElementById('app-container').classList.add('hidden');
}

function mostrarApp() {
  document.getElementById('login-container').classList.add('hidden');
  document.getElementById('app-container').classList.remove('hidden');
  document.getElementById('display-user-name').textContent = state.user?.nombre || state.user?.usuario || 'Administrador';
}

// ==================== NAVEGACIÓN POR PESTAÑAS ====================
function switchTab(tab) {
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));

  document.getElementById(`tab-btn-${tab}`).classList.add('active');
  document.getElementById(`section-${tab}`).classList.add('active');

  if (tab === 'personas') cargarPersonas();
  if (tab === 'productos') cargarProductos();
  if (tab === 'etl') cargarMetricas();
}

// ==================== MÉTRICAS Y MONITOR ====================
async function cargarMetricas() {
  try {
    const res = await fetch(`${API_BASE}/stats`, { headers: getHeaders() });
    const json = await res.json();
    if (json.ok && json.data) {
      const d = json.data;
      document.getElementById('stat-personas').textContent = d.totalPersonas || 0;
      document.getElementById('stat-clientes').textContent = d.totalClientes || 0;
      document.getElementById('stat-productos').textContent = d.totalProductos || 0;
      document.getElementById('stat-consolidado').textContent = d.totalConsolidadoClientes || 0;
    }
  } catch (e) {
    console.error('Error cargando métricas:', e);
  }
}

// ==================== CATÁLOGOS ====================
async function cargarCatalogos() {
  try {
    const res = await fetch(`${API_BASE}/productos?catalogos=1`, { headers: getHeaders() });
    const json = await res.json();
    if (json.ok) {
      state.categorias = json.categorias || [];
      state.unidades = json.unidades || [];

      // Llenar select categorías
      const selCat = document.getElementById('prod-categoria');
      if (selCat) {
        selCat.innerHTML = state.categorias.map(c => `<option value="${c.IDCATEGORIA}">${c.NOMCATEGORIA}</option>`).join('');
      }
      // Llenar select unidades
      const selUm = document.getElementById('prod-unidad');
      if (selUm) {
        selUm.innerHTML = state.unidades.map(u => `<option value="${u.IDUNIDAD_MEDIDA}">${u.NOMUNIDAD_MEDIDA}</option>`).join('');
      }
    }
  } catch (e) {
    console.error('Error cargando catálogos:', e);
  }
}

// ==================== CRUD 1: PERSONAS ====================
async function cargarPersonas(query = '') {
  const tbody = document.getElementById('tbody-personas');
  tbody.innerHTML = `<tr><td colspan="11" class="text-center">Consultando SQL Server...</td></tr>`;

  try {
    const url = query ? `${API_BASE}/personas?q=${encodeURIComponent(query)}` : `${API_BASE}/personas`;
    const res = await fetch(url, { headers: getHeaders() });
    const json = await res.json();

    if (!res.ok || !json.ok) throw new Error(json.error || 'Error al consultar personas');

    state.personas = json.data || [];
    renderTablaPersonas(state.personas);
    document.getElementById('personas-count').textContent = `${state.personas.length} registros cargados`;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="11" class="text-center" style="color:var(--danger)">Error: ${err.message}</td></tr>`;
  }
}

function debounceSearchPersonas() {
  clearTimeout(state.searchTimer);
  state.searchTimer = setTimeout(() => {
    const q = document.getElementById('search-personas').value;
    cargarPersonas(q);
  }, 300);
}

function renderTablaPersonas(lista) {
  const tbody = document.getElementById('tbody-personas');
  if (lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="text-center">No se encontraron personas registradas.</td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map(p => `
    <tr>
      <td><strong>${p.IDPERSONA}</strong></td>
      <td><code>${p.DNI || '-'}</code></td>
      <td>${p.NOMBRE || ''}</td>
      <td>${p.APE_PATERNO || ''}</td>
      <td>${p.APE_MATERNO || ''}</td>
      <td>${p.GENERO === 'M' ? 'MASCULINO' : (p.GENERO === 'F' ? 'FEMENINO' : '-')}</td>
      <td>${p.CELULAR || '-'}</td>
      <td title="${p.DIRECCION || ''}">${(p.DIRECCION || '-').slice(0, 25)}</td>
      <td>${p.EST_CIVIL || '-'}</td>
      <td>
        <span class="status-badge ${p.ESTADO === '1' ? 'active' : 'inactive'}">
          ${p.ESTADO === '1' ? 'ACTIVO' : 'INACTIVO'}
        </span>
      </td>
      <td>
        <button class="table-btn" onclick="editarPersonaPorId(${p.IDPERSONA})">✏️ Editar</button>
        <button class="table-btn btn-del" onclick="eliminarPersonaConfirm(${p.IDPERSONA})">🗑️</button>
      </td>
    </tr>
  `).join('');
}

// Modal Persona
function abrirModalPersona(modo = 'nuevo') {
  const modal = document.getElementById('modal-persona');
  modal.classList.remove('hidden');

  if (modo === 'nuevo') {
    limpiarFormPersona();
    document.getElementById('modal-persona-title').textContent = 'REGISTRO DE PERSONA (NUEVO)';
    document.getElementById('btn-p-guardar').disabled = false;
    document.getElementById('btn-p-editar').disabled = true;
    document.getElementById('btn-p-eliminar').disabled = true;
  }
}

function cerrarModalPersona() {
  document.getElementById('modal-persona').classList.add('hidden');
}

function limpiarFormPersona() {
  document.getElementById('form-persona').reset();
  document.getElementById('p-id').value = '';
  document.getElementById('btn-p-guardar').disabled = false;
  document.getElementById('btn-p-editar').disabled = true;
  document.getElementById('btn-p-eliminar').disabled = true;
  document.getElementById('modal-persona-title').textContent = 'REGISTRO DE PERSONA (NUEVO)';
}

function editarPersonaPorId(id) {
  const p = state.personas.find(x => x.IDPERSONA === id);
  if (!p) return;

  state.currentPersona = p;
  abrirModalPersona('editar');

  document.getElementById('modal-persona-title').textContent = `REGISTRO DE PERSONA (ID: ${p.IDPERSONA})`;
  document.getElementById('p-id').value = p.IDPERSONA;
  document.getElementById('p-dni').value = (p.DNI || '').trim();
  document.getElementById('p-nombre').value = p.NOMBRE || '';
  document.getElementById('p-apepat').value = p.APE_PATERNO || '';
  document.getElementById('p-apemat').value = p.APE_MATERNO || '';
  document.getElementById('p-fechnac').value = p.FECHNAC ? p.FECHNAC.slice(0, 10) : '';
  document.getElementById('p-genero').value = (p.GENERO || 'M').trim();
  document.getElementById('p-celular').value = (p.CELULAR || '').trim();
  document.getElementById('p-correo').value = p.CORREO || '';
  document.getElementById('p-direccion').value = p.DIRECCION || '';
  document.getElementById('p-estcivil').value = (p.EST_CIVIL || 'SO').trim();

  document.getElementById('btn-p-guardar').disabled = false;
  document.getElementById('btn-p-editar').disabled = false;
  document.getElementById('btn-p-eliminar').disabled = false;
}

function activarEdicionPersona() {
  showToast('Modifique los campos y presione GUARDAR para confirmar');
  document.getElementById('p-nombre').focus();
}

async function guardarPersona(e) {
  e.preventDefault();
  const id = document.getElementById('p-id').value;

  const payload = {
    dni: document.getElementById('p-dni').value.trim(),
    nombre: document.getElementById('p-nombre').value.trim(),
    ape_paterno: document.getElementById('p-apepat').value.trim(),
    ape_materno: document.getElementById('p-apemat').value.trim(),
    fechnac: document.getElementById('p-fechnac').value || null,
    genero: document.getElementById('p-genero').value,
    celular: document.getElementById('p-celular').value.trim(),
    correo: document.getElementById('p-correo').value.trim(),
    direccion: document.getElementById('p-direccion').value.trim(),
    est_civil: document.getElementById('p-estcivil').value,
    iddistrito: 1
  };

  try {
    let res;
    if (id) {
      // Modificar (PUT)
      payload.idpersona = id;
      res = await fetch(`${API_BASE}/personas?id=${id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
    } else {
      // Crear (POST)
      res = await fetch(`${API_BASE}/personas`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
    }

    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Error al guardar');

    showToast(data.message || 'Persona guardada correctamente. Trigger ETL ejecutado.');
    cerrarModalPersona();
    cargarPersonas();
    cargarMetricas();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function eliminarPersonaConfirm(id) {
  if (!confirm(`¿Está seguro de desactivar la persona con ID ${id}?`)) return;
  try {
    const res = await fetch(`${API_BASE}/personas?id=${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error);
    showToast('Persona desactivada');
    cargarPersonas();
    cargarMetricas();
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

function eliminarPersonaActual() {
  const id = document.getElementById('p-id').value;
  if (id) {
    eliminarPersonaConfirm(id);
    cerrarModalPersona();
  }
}

// ==================== CRUD 2: PRODUCTOS ====================
async function cargarProductos(query = '') {
  const tbody = document.getElementById('tbody-productos');
  tbody.innerHTML = `<tr><td colspan="8" class="text-center">Consultando productos...</td></tr>`;

  try {
    const url = query ? `${API_BASE}/productos?q=${encodeURIComponent(query)}` : `${API_BASE}/productos`;
    const res = await fetch(url, { headers: getHeaders() });
    const json = await res.json();

    if (!res.ok || !json.ok) throw new Error(json.error || 'Error al consultar productos');

    state.productos = json.data || [];
    renderTablaProductos(state.productos);
    document.getElementById('productos-count').textContent = `${state.productos.length} productos cargados`;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center" style="color:var(--danger)">Error: ${err.message}</td></tr>`;
  }
}

function debounceSearchProductos() {
  clearTimeout(state.searchTimer);
  state.searchTimer = setTimeout(() => {
    const q = document.getElementById('search-productos').value;
    cargarProductos(q);
  }, 300);
}

function renderTablaProductos(lista) {
  const tbody = document.getElementById('tbody-productos');
  if (lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center">No hay productos registrados.</td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map(p => `
    <tr>
      <td><strong>${p.IDPRODUCTO}</strong></td>
      <td><strong>${p.NOMPRODUCTO}</strong></td>
      <td><span class="table-badge">${p.NOMCATEGORIA || 'Sin Categoría'}</span></td>
      <td>${p.NOMUNIDAD_MEDIDA || 'Unidad'}</td>
      <td>S/ ${parseFloat(p.PRECIO_UNITARIO || 0).toFixed(2)}</td>
      <td>${p.STOCK_ACTUAL ?? 0}</td>
      <td>
        <span class="status-badge ${p.ESTADO === '1' ? 'active' : 'inactive'}">
          ${p.ESTADO === '1' ? 'ACTIVO' : 'INACTIVO'}
        </span>
      </td>
      <td>
        <button class="table-btn" onclick="editarProductoPorId(${p.IDPRODUCTO})">✏️ Editar</button>
        <button class="table-btn btn-del" onclick="eliminarProductoConfirm(${p.IDPRODUCTO})">🗑️</button>
      </td>
    </tr>
  `).join('');
}

function abrirModalProducto(modo = 'nuevo') {
  const modal = document.getElementById('modal-producto');
  modal.classList.remove('hidden');

  if (modo === 'nuevo') {
    limpiarFormProducto();
    document.getElementById('modal-producto-title').textContent = 'REGISTRO DE PRODUCTO (NUEVO)';
  }
}

function cerrarModalProducto() {
  document.getElementById('modal-producto').classList.add('hidden');
}

function limpiarFormProducto() {
  document.getElementById('form-producto').reset();
  document.getElementById('prod-id').value = '';
}

function editarProductoPorId(id) {
  const p = state.productos.find(x => x.IDPRODUCTO === id);
  if (!p) return;

  state.currentProducto = p;
  abrirModalProducto('editar');

  document.getElementById('modal-producto-title').textContent = `REGISTRO DE PRODUCTO (ID: ${p.IDPRODUCTO})`;
  document.getElementById('prod-id').value = p.IDPRODUCTO;
  document.getElementById('prod-nombre').value = p.NOMPRODUCTO;
  document.getElementById('prod-desc').value = p.DESCRIPCION || '';
  document.getElementById('prod-precio').value = p.PRECIO_UNITARIO || '';
  document.getElementById('prod-stock').value = p.STOCK_ACTUAL ?? 0;
  if (p.IDCATEGORIA) document.getElementById('prod-categoria').value = p.IDCATEGORIA;
  if (p.IDUNIDAD_MEDIDA) document.getElementById('prod-unidad').value = p.IDUNIDAD_MEDIDA;
}

async function guardarProducto(e) {
  e.preventDefault();
  const id = document.getElementById('prod-id').value;

  const payload = {
    nomproducto: document.getElementById('prod-nombre').value.trim(),
    descripcion: document.getElementById('prod-desc').value.trim(),
    precio_unitario: document.getElementById('prod-precio').value,
    stock_actual: document.getElementById('prod-stock').value,
    idcategoria: document.getElementById('prod-categoria').value,
    idunidad_medida: document.getElementById('prod-unidad').value
  };

  try {
    let res;
    if (id) {
      payload.idproducto = id;
      res = await fetch(`${API_BASE}/productos?id=${id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch(`${API_BASE}/productos`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
    }

    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Error al guardar');

    showToast(data.message || 'Producto guardado. Trigger ETL ejecutado.');
    cerrarModalProducto();
    cargarProductos();
    cargarMetricas();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function eliminarProductoConfirm(id) {
  if (!confirm(`¿Desea desactivar el producto con ID ${id}?`)) return;
  try {
    const res = await fetch(`${API_BASE}/productos?id=${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error);
    showToast('Producto desactivado');
    cargarProductos();
    cargarMetricas();
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

function eliminarProductoActual() {
  const id = document.getElementById('prod-id').value;
  if (id) {
    eliminarProductoConfirm(id);
    cerrarModalProducto();
  }
}

// ==================== NOTIFICACIONES TOAST ====================
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3500);
}
