const state = {
  token: localStorage.getItem('samar_token') || null,
  user: null,
  clientes: [],
  articulos: [],
  currentCliente: null,
  currentArticulo: null,
  searchTimer: null
};

const API_BASE = '/api';

function getHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (state.token) h['Authorization'] = `Bearer ${state.token}`;
  return h;
}

document.addEventListener('DOMContentLoaded', () => {
  if (state.token) {
    verificarSesion();
  } else {
    mostrarLogin();
  }

  const formLogin = document.getElementById('form-login');
  if (formLogin) {
    formLogin.addEventListener('submit', handleLogin);
  }
});

function fillLogin(u, p) {
  document.getElementById('login-user').value = u;
  document.getElementById('login-pass').value = p;
}

// ==================== AUTH ====================
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

    if (!res.ok || !data.ok) throw new Error(data.error || 'Credenciales inválidas');

    state.token = data.token;
    state.user = data.usuario;
    localStorage.setItem('samar_token', data.token);

    mostrarApp();
    cargarClientes();
    cargarArticulos();
    cargarMetricas();
    showToast('Bienvenido al sistema Samar Importadora');
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
      cargarClientes();
      cargarArticulos();
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
  localStorage.removeItem('samar_token');
  mostrarLogin();
}

function mostrarLogin() {
  document.getElementById('login-container').classList.remove('hidden');
  document.getElementById('app-container').classList.add('hidden');
}

function mostrarApp() {
  document.getElementById('login-container').classList.add('hidden');
  document.getElementById('app-container').classList.remove('hidden');
  document.getElementById('display-user-name').textContent = state.user?.nombre || state.user?.usuario || 'Administrador Samar';
}

function switchTab(tab) {
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));

  document.getElementById(`tab-btn-${tab}`).classList.add('active');
  document.getElementById(`section-${tab}`).classList.add('active');

  if (tab === 'clientes') cargarClientes();
  if (tab === 'articulos') cargarArticulos();
  if (tab === 'etl') cargarMetricas();
}

// ==================== MÉTRICAS ====================
async function cargarMetricas() {
  try {
    const res = await fetch(`${API_BASE}/stats`, { headers: getHeaders() });
    const json = await res.json();
    if (json.ok && json.data) {
      const d = json.data;
      document.getElementById('stat-clientes').textContent = d.totalClientes || 0;
      document.getElementById('stat-articulos').textContent = d.totalArticulos || 0;
      document.getElementById('stat-dw').textContent = d.totalDwClientes || 0;
      document.getElementById('stat-consolidado').textContent = d.totalConsolidadoClientes || 0;
    }
  } catch (e) {
    console.error('Error cargando métricas:', e);
  }
}

// ==================== CRUD 1: CLIENTES ====================
async function cargarClientes(query = '') {
  const tbody = document.getElementById('tbody-clientes');
  tbody.innerHTML = `<tr><td colspan="8" class="text-center">Consultando SamarImportadora...</td></tr>`;

  try {
    const url = query ? `${API_BASE}/clientes?q=${encodeURIComponent(query)}` : `${API_BASE}/clientes`;
    const res = await fetch(url, { headers: getHeaders() });
    const json = await res.json();

    if (!res.ok || !json.ok) throw new Error(json.error || 'Error al cargar clientes');

    state.clientes = json.data || [];
    renderTablaClientes(state.clientes);
    document.getElementById('clientes-count').textContent = `${state.clientes.length} registros cargados`;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center" style="color:var(--danger)">Error: ${err.message}</td></tr>`;
  }
}

function debounceSearchClientes() {
  clearTimeout(state.searchTimer);
  state.searchTimer = setTimeout(() => {
    const q = document.getElementById('search-clientes').value;
    cargarClientes(q);
  }, 300);
}

function renderTablaClientes(lista) {
  const tbody = document.getElementById('tbody-clientes');
  if (lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center">No se encontraron clientes.</td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map(c => `
    <tr>
      <td><code>${c.ID_CLIENTE}</code></td>
      <td><strong>${c.NOMBRE || ''}</strong></td>
      <td>${c.APELLIDO || ''}</td>
      <td>${c.EDAD ?? '-'}</td>
      <td><span class="table-badge">${c.ESTADO_CIVIL || 'Sin dato'}</span></td>
      <td>${(c.RESIDENCIA || '').replace(/[«»]/g, '')}</td>
      <td>${(c.ORIGEN || '').replace(/[«»]/g, '')}</td>
      <td>
        <button class="table-btn" onclick="editarClientePorId('${c.ID_CLIENTE}')">✏️ Editar</button>
        <button class="table-btn btn-del" onclick="eliminarClienteConfirm('${c.ID_CLIENTE}')">🗑️</button>
      </td>
    </tr>
  `).join('');
}

function abrirModalCliente(modo = 'nuevo') {
  const modal = document.getElementById('modal-cliente');
  modal.classList.remove('hidden');

  if (modo === 'nuevo') {
    limpiarFormCliente();
    document.getElementById('modal-cliente-title').textContent = 'REGISTRO DE CLIENTE (NUEVO)';
    document.getElementById('c-id').disabled = false;
    document.getElementById('btn-c-eliminar').disabled = true;
  }
}

function cerrarModalCliente() {
  document.getElementById('modal-cliente').classList.add('hidden');
}

function limpiarFormCliente() {
  document.getElementById('form-cliente').reset();
  document.getElementById('c-id').value = '';
  document.getElementById('c-id').disabled = false;
  document.getElementById('btn-c-eliminar').disabled = true;
}

function editarClientePorId(id) {
  const c = state.clientes.find(x => x.ID_CLIENTE === id);
  if (!c) return;

  state.currentCliente = c;
  abrirModalCliente('editar');

  document.getElementById('modal-cliente-title').textContent = `EDITAR CLIENTE (${c.ID_CLIENTE})`;
  document.getElementById('c-id').value = c.ID_CLIENTE;
  document.getElementById('c-id').disabled = true; // no cambiar PK al editar
  document.getElementById('c-nombre').value = (c.NOMBRE || '').trim();
  document.getElementById('c-apellido').value = (c.APELLIDO || '').trim();
  document.getElementById('c-edad').value = c.EDAD ?? '';
  document.getElementById('c-estcivil').value = c.ESTADO_CIVIL || 'Soltero';
  document.getElementById('c-residencia').value = (c.RESIDENCIA || '').replace(/[«»]/g, '').trim();
  document.getElementById('c-origen').value = (c.ORIGEN || '').replace(/[«»]/g, '').trim();
  document.getElementById('btn-c-eliminar').disabled = false;
}

async function guardarCliente(e) {
  e.preventDefault();
  const idInput = document.getElementById('c-id');
  const esEdicion = idInput.disabled && idInput.value;

  const payload = {
    id_cliente: idInput.value.trim() || null,
    nombre: document.getElementById('c-nombre').value.trim(),
    apellido: document.getElementById('c-apellido').value.trim(),
    edad: document.getElementById('c-edad').value,
    estado_civil: document.getElementById('c-estcivil').value,
    residencia: document.getElementById('c-residencia').value.trim(),
    origen: document.getElementById('c-origen').value.trim()
  };

  try {
    let res;
    if (esEdicion) {
      res = await fetch(`${API_BASE}/clientes?id=${idInput.value}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch(`${API_BASE}/clientes`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
    }

    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Error al guardar');

    showToast(data.message || 'Cliente guardado correctamente. Trigger ETL ejecutado.');
    cerrarModalCliente();
    cargarClientes();
    cargarMetricas();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function eliminarClienteConfirm(id) {
  if (!confirm(`¿Eliminar al cliente ${id}?`)) return;
  try {
    const res = await fetch(`${API_BASE}/clientes?id=${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error);
    showToast('Cliente eliminado');
    cargarClientes();
    cargarMetricas();
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

function eliminarClienteActual() {
  const id = document.getElementById('c-id').value;
  if (id) {
    eliminarClienteConfirm(id);
    cerrarModalCliente();
  }
}

// ==================== CRUD 2: ARTÍCULOS ====================
async function cargarArticulos(query = '') {
  const tbody = document.getElementById('tbody-articulos');
  tbody.innerHTML = `<tr><td colspan="7" class="text-center">Consultando artículos...</td></tr>`;

  try {
    const url = query ? `${API_BASE}/articulos?q=${encodeURIComponent(query)}` : `${API_BASE}/articulos`;
    const res = await fetch(url, { headers: getHeaders() });
    const json = await res.json();

    if (!res.ok || !json.ok) throw new Error(json.error || 'Error al cargar artículos');

    state.articulos = json.data || [];
    renderTablaArticulos(state.articulos);
    document.getElementById('articulos-count').textContent = `${state.articulos.length} artículos cargados`;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="color:var(--danger)">Error: ${err.message}</td></tr>`;
  }
}

function debounceSearchArticulos() {
  clearTimeout(state.searchTimer);
  state.searchTimer = setTimeout(() => {
    const q = document.getElementById('search-articulos').value;
    cargarArticulos(q);
  }, 300);
}

function renderTablaArticulos(lista) {
  const tbody = document.getElementById('tbody-articulos');
  if (lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center">No hay artículos registrados.</td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map(a => {
    const precio = a.PRECIO_UNITARIO || 0;
    const costo = a.COSTO_UNITARIO || 0;
    const margen = precio - costo;
    return `
      <tr>
        <td><code>${a.CODIGO_PRODUCTO}</code></td>
        <td><strong>${a.NOMBRE || ''}</strong></td>
        <td><span class="table-badge">${a.CATEGORIA || 'General'}</span></td>
        <td>$ ${precio.toLocaleString()}</td>
        <td>$ ${costo.toLocaleString()}</td>
        <td style="color:${margen >= 0 ? 'var(--success)' : 'var(--danger)'}">
          $ ${margen.toLocaleString()}
        </td>
        <td>
          <button class="table-btn" onclick="editarArticuloPorId('${a.CODIGO_PRODUCTO}')">✏️ Editar</button>
          <button class="table-btn btn-del" onclick="eliminarArticuloConfirm('${a.CODIGO_PRODUCTO}')">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
}

function abrirModalArticulo(modo = 'nuevo') {
  const modal = document.getElementById('modal-articulo');
  modal.classList.remove('hidden');

  if (modo === 'nuevo') {
    limpiarFormArticulo();
    document.getElementById('modal-articulo-title').textContent = 'REGISTRO DE ARTÍCULO (NUEVO)';
    document.getElementById('a-cod').disabled = false;
    document.getElementById('btn-a-eliminar').disabled = true;
  }
}

function cerrarModalArticulo() {
  document.getElementById('modal-articulo').classList.add('hidden');
}

function limpiarFormArticulo() {
  document.getElementById('form-articulo').reset();
  document.getElementById('a-cod').value = '';
  document.getElementById('a-cod').disabled = false;
  document.getElementById('btn-a-eliminar').disabled = true;
}

function editarArticuloPorId(cod) {
  const a = state.articulos.find(x => x.CODIGO_PRODUCTO === cod);
  if (!a) return;

  state.currentArticulo = a;
  abrirModalArticulo('editar');

  document.getElementById('modal-articulo-title').textContent = `EDITAR ARTÍCULO (${a.CODIGO_PRODUCTO})`;
  document.getElementById('a-cod').value = a.CODIGO_PRODUCTO;
  document.getElementById('a-cod').disabled = true;
  document.getElementById('a-nombre').value = a.NOMBRE || '';
  document.getElementById('a-categoria').value = a.CATEGORIA || 'Bebidas';
  document.getElementById('a-precio').value = a.PRECIO_UNITARIO || 0;
  document.getElementById('a-costo').value = a.COSTO_UNITARIO || 0;
  document.getElementById('btn-a-eliminar').disabled = false;
}

async function guardarArticulo(e) {
  e.preventDefault();
  const codInput = document.getElementById('a-cod');
  const esEdicion = codInput.disabled && codInput.value;

  const payload = {
    codigo_producto: codInput.value.trim() || null,
    nombre: document.getElementById('a-nombre').value.trim(),
    categoria: document.getElementById('a-categoria').value,
    precio_unitario: document.getElementById('a-precio').value,
    costo_unitario: document.getElementById('a-costo').value
  };

  try {
    let res;
    if (esEdicion) {
      res = await fetch(`${API_BASE}/articulos?id=${codInput.value}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch(`${API_BASE}/articulos`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
    }

    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Error al guardar');

    showToast(data.message || 'Artículo guardado. Trigger ETL ejecutado.');
    cerrarModalArticulo();
    cargarArticulos();
    cargarMetricas();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function eliminarArticuloConfirm(cod) {
  if (!confirm(`¿Eliminar el artículo ${cod}?`)) return;
  try {
    const res = await fetch(`${API_BASE}/articulos?id=${cod}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error);
    showToast('Artículo eliminado');
    cargarArticulos();
    cargarMetricas();
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

function eliminarArticuloActual() {
  const cod = document.getElementById('a-cod').value;
  if (cod) {
    eliminarArticuloConfirm(cod);
    cerrarModalArticulo();
  }
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3500);
}
