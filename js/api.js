/* =====================================================================
   Cliente de la API + utilidades compartidas
   ===================================================================== */
const API_BASE = 'api/index.php';
const URL_XAMPP = 'http://localhost/apiTpvRestaurante/';
const MENSAJE_SIN_PHP = 'La API no responde: abre la web desde XAMPP (Apache), no con Live Server.';

/** Banda superior que explica cómo abrir la web correctamente. */
function avisoServidor() {
  if (document.getElementById('aviso-servidor')) return;
  const destino = URL_XAMPP + location.pathname.split('/').pop();
  const div = document.createElement('div');
  div.id = 'aviso-servidor';
  div.setAttribute('role', 'alert');
  div.style.cssText = 'position:fixed;inset:0 0 auto 0;z-index:200;padding:14px 20px;background:#b5563a;color:#fff;'
    + 'font:600 14px/1.5 Manrope,system-ui,sans-serif;text-align:center;box-shadow:0 6px 20px rgba(0,0,0,.25)';
  div.innerHTML = 'Esta página necesita PHP. Arranca Apache y MySQL en XAMPP y ábrela en '
    + `<a href="${destino}" style="color:#fff;text-decoration:underline">${destino}</a>`;
  document.body.prepend(div);
}

if (location.protocol === 'file:') {
  document.addEventListener('DOMContentLoaded', avisoServidor);
}

class ErrorApi extends Error {
  constructor(mensaje, estado) {
    super(mensaje);
    this.estado = estado;
  }
}

async function api(ruta, { metodo = 'GET', datos } = {}) {
  const opciones = { method: metodo, credentials: 'same-origin', headers: {} };
  if (datos !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(datos);
  }
  let resp;
  try {
    resp = await fetch(`${API_BASE}/${ruta.replace(/^\//, '')}`, opciones);
  } catch {
    throw new ErrorApi('No hay conexión con el servidor', 0);
  }
  if (resp.status === 204) return null;

  // Si no llega JSON, el PHP no se está ejecutando (Live Server, archivo abierto con doble clic…)
  if (!(resp.headers.get('Content-Type') || '').includes('application/json')) {
    avisoServidor();
    throw new ErrorApi(MENSAJE_SIN_PHP, resp.status);
  }

  let cuerpo = null;
  try { cuerpo = await resp.json(); } catch { /* respuesta vacía */ }

  if (!resp.ok) {
    throw new ErrorApi(cuerpo?.error || `Error ${resp.status}`, resp.status);
  }
  return cuerpo;
}

api.get    = (ruta)        => api(ruta);
api.post   = (ruta, datos) => api(ruta, { metodo: 'POST', datos });
api.patch  = (ruta, datos) => api(ruta, { metodo: 'PATCH', datos });
api.put    = (ruta, datos) => api(ruta, { metodo: 'PUT', datos });
api.borrar = (ruta)        => api(ruta, { metodo: 'DELETE' });

/* --- Formato ---------------------------------------------------------- */
const fmtEuro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const euros = (n) => fmtEuro.format(Number(n) || 0);

const precioCarta = (n) => {
  const v = Number(n);
  return Number.isInteger(v) ? `${v}` : v.toFixed(2).replace('.', ',');
};

function horaDe(fecha) {
  const d = new Date(String(fecha).replace(' ', 'T'));
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function minutosDesde(fecha) {
  const d = new Date(String(fecha).replace(' ', 'T'));
  return Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
}

/** Escapa texto para insertarlo en HTML. */
function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** Icono SVG de un alérgeno (decorativo: el nombre siempre va al lado o en el title). */
function iconoAlergeno(a) {
  return a.icono ? `<img class="icono-alergeno" src="${esc(a.icono)}" alt="" width="16" height="16" loading="lazy">` : '';
}

/** Iniciales para placeholders: "Pan con tomate" → "Pt" */
function iniciales(nombre) {
  const palabras = String(nombre).split(/\s+/).filter((p) => p.length > 2);
  return ((palabras[0]?.[0] || nombre[0] || '') + (palabras[1]?.[0] || '')).toUpperCase();
}

/* --- Avisos ----------------------------------------------------------- */
function avisar(mensaje, tipo = 'ok') {
  let cont = document.querySelector('.avisos');
  if (!cont) {
    cont = document.createElement('div');
    cont.className = 'avisos';
    cont.setAttribute('role', 'status');
    cont.setAttribute('aria-live', 'polite');
    document.body.append(cont);
  }
  const el = document.createElement('div');
  el.className = `aviso${tipo === 'error' ? ' aviso--error' : ''}`;
  el.textContent = mensaje;
  cont.append(el);
  setTimeout(() => {
    el.classList.add('saliendo');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, tipo === 'error' ? 4200 : 2400);
}

/* Logotipo: rama de olivo */
const LOGO_SVG = `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
  <path d="M6 27C12 21 18 13 26 5"/>
  <path d="M12 20.5c-3.2.3-5.6-1-6.6-3.6 3-.6 5.4.4 6.6 3.6Z" fill="currentColor" fill-opacity=".18"/>
  <path d="M16.5 15.2c.2-3.2 2-5.3 4.8-5.8.2 3-1.6 5-4.8 5.8Z" fill="currentColor" fill-opacity=".18"/>
  <path d="M19.4 11.7c-3-.9-4.6-3-4.4-5.9 2.9.6 4.4 2.7 4.4 5.9Z" fill="currentColor" fill-opacity=".18"/>
  <path d="M14.3 17.8c2.9 1.2 4 3.6 3.3 6.4-2.8-1.2-3.9-3.5-3.3-6.4Z" fill="currentColor" fill-opacity=".18"/>
</svg>`;
