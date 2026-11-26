/* =====================================================================
   TPV — acceso, sala, pedido, cobro, cocina y caja
   ===================================================================== */
(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  const GRUPOS = {
    sala:      ['jefe de sala', 'camarero'],
    cocina:    ['jefe de cocina', 'cocinero', 'fregantin'],
    direccion: ['gerente', 'admin'],
  };
  const COLOR_RANGO = {
    'gerente': '#b48d42', 'admin': '#b48d42', 'jefe de sala': '#b5563a', 'camarero': '#20506d',
    'jefe de cocina': '#55623f', 'cocinero': '#6f7f4f', 'fregantin': '#5b6466',
  };
  const TONOS = ['#8f9b68', '#c47a52', '#c09a4c', '#5b8fae', '#b0706a', '#7a8a62', '#8e7397', '#a8875a'];
  const NOMBRE_PASE = ['Bebidas', '1er pase', '2º pase', '3er pase', 'Postres'];
  const ESTADO_LINEA_TXT = { pendiente: 'En espera', marchado: 'Marchado a cocina', 'en cocina': 'En cocina', listo: '¡Listo para servir!', servido: 'Servido' };
  const NOTAS_RAPIDAS = ['Sin sal', 'Sin gluten', 'Sin cebolla', 'Poco hecho', 'Al punto', 'Muy hecho', 'Para compartir', 'Sacar después'];
  const REFRESCO_MS = 8000;   // cocina y sala se avisan entre sí: refresco ágil

  const E = {
    usuario: null,
    personal: [],
    grupo: 'sala',
    elegido: null,
    vista: 'sala',
    salon: null,
    mesas: [],
    generos: [],
    platos: [],
    genero: null,
    pedido: null,
    lineaSel: null,
    editando: false,   // editando la distribución del salón
    borrador: null,    // copia de las mesas del salón mientras se edita
    borrar: [],        // ids de mesas a eliminar al guardar
    seleccion: null,   // uid de la mesa seleccionada en el editor
  };

  const rangoTexto = (r) => r.charAt(0).toUpperCase() + r.slice(1);
  const normal = (t) => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const avatarDe = (p) => `<span class="avatar" style="--av:${COLOR_RANGO[p.rango] || '#283a3f'}">${esc((p.nombre[0] || '') + (p.apellidos?.[0] || ''))}</span>`;
  const colorGenero = (id) => TONOS[Math.max(0, E.generos.findIndex((g) => g.id === id)) % TONOS.length];

  /** Ejecuta una llamada mostrando el error; si la sesión caducó, vuelve al acceso. */
  async function intentar(fn) {
    try {
      return await fn();
    } catch (e) {
      if (e.estado === 401 && E.usuario) {
        avisar('La sesión ha caducado', 'error');
        salirSinPreguntar();
        return undefined;
      }
      avisar(e.message, 'error');
      return undefined;
    }
  }

  // Cola: las pulsaciones rápidas se envían de una en una y en orden
  let cola = Promise.resolve();
  const enCola = (fn) => (cola = cola.then(fn, fn));

  /* ==================================================================
     Reloj
     ================================================================== */
  function reloj() {
    const ahora = new Date();
    $('#reloj').textContent = ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    $('#reloj-acceso').textContent = ahora.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
      + ' · ' + ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }

  /* ==================================================================
     Acceso
     ================================================================== */
  async function mostrarAcceso() {
    $('#app').classList.add('oculto');
    $('#acceso').classList.remove('oculto');
    volverAEmpleados();
    try {
      E.personal = await api.get('personal/acceso');
    } catch (e) {
      $('#empleados').innerHTML = `<p class="vacio-tpv">${esc(e.message)}</p>`;
      return;
    }
    pintarEmpleados();
  }

  function pintarEmpleados() {
    const lista = E.personal.filter((p) => GRUPOS[E.grupo].includes(p.rango));
    $('#empleados').innerHTML = lista.map((p, i) => `
      <button class="empleado" data-id="${p.id}" style="animation-delay:${Math.min(i, 14) * 18}ms">
        ${avatarDe(p)}
        <span><strong>${esc(p.nombre)} ${esc(p.apellidos.split(' ')[0])}</strong><small>${esc(rangoTexto(p.rango))}</small></span>
      </button>`).join('') || '<p class="vacio-tpv">No hay empleados en este grupo</p>';
  }

  function elegirEmpleado(id) {
    E.elegido = E.personal.find((p) => p.id === id);
    if (!E.elegido) return;
    $('#paso-empleado').classList.add('oculto');
    $('#paso-pin').classList.remove('oculto');
    $('#pin-quien').innerHTML = `${avatarDe(E.elegido)}
      <h2>Hola, ${esc(E.elegido.nombre)}</h2><small>${esc(rangoTexto(E.elegido.rango))}</small>`;
    $('#pin-input').value = '';
    $('#pin-error').textContent = '';
    pintarPuntos();
    $('#pin-input').focus();
  }

  function volverAEmpleados() {
    $('#paso-pin').classList.add('oculto');
    $('#paso-empleado').classList.remove('oculto');
  }

  function pintarPuntos() {
    const n = $('#pin-input').value.length;
    $('#pin-puntos').innerHTML = Array.from({ length: Math.max(4, n) }, (_, i) => `<i class="${i < n ? 'lleno' : ''}"></i>`).join('');
  }

  async function login(ev) {
    ev.preventDefault();
    const contrasena = $('#pin-input').value;
    if (!contrasena) return;
    try {
      const u = await api.post('auth/login', { id_personal: E.elegido.id, contrasena });
      entrar(u);
    } catch (e) {
      const puntos = $('#pin-puntos');
      puntos.classList.remove('error');
      void puntos.offsetWidth;
      puntos.classList.add('error');
      $('#pin-error').textContent = e.message;
      setTimeout(() => { $('#pin-input').value = ''; pintarPuntos(); puntos.classList.remove('error'); }, 500);
    }
  }

  /* ==================================================================
     Entrada a la aplicación
     ================================================================== */
  async function entrar(u) {
    E.usuario = u;
    $('#acceso').classList.add('oculto');
    $('#app').classList.remove('oculto');
    $('#usuario-avatar').outerHTML = avatarDe(u).replace('class="avatar"', 'class="avatar" id="usuario-avatar"');
    $('#usuario-nombre').textContent = `${u.nombre} ${u.apellidos.split(' ')[0]}`;
    $('#usuario-rango').textContent = rangoTexto(u.rango);
    salirEdicion();
    $('#tab-reservas').classList.toggle('oculto', !puedeVerReservas());

    const [generos, platos] = await Promise.all([intentar(() => api.get('generos')), intentar(() => api.get('platos'))]);
    E.generos = generos || [];
    E.platos = platos || [];
    E.genero = E.generos[0]?.id ?? null;

    irA(GRUPOS.cocina.includes(u.rango) ? 'cocina' : 'sala');
    refrescoGeneral();
  }

  async function salirSinPreguntar() {
    try { await api.post('auth/logout'); } catch { /* da igual */ }
    E.usuario = null;
    E.pedido = null;
    mostrarAcceso();
  }

  /* ==================================================================
     Navegación
     ================================================================== */
  function irA(vista) {
    if (E.editando && vista !== 'sala') salirEdicion();   // se descarta la edición sin guardar
    E.vista = vista;
    if (vista !== 'pedido') E.pedido = null;
    $$('#pestanas [data-vista]').forEach((b) =>
      b.setAttribute('aria-selected', String(b.dataset.vista === vista || (vista === 'pedido' && b.dataset.vista === 'sala'))));
    for (const v of ['sala', 'pedido', 'cocina', 'caja', 'reservas']) {
      $(`#vista-${v}`).classList.toggle('oculto', v !== vista);
    }
    if (vista === 'sala') cargarMesas();
    if (vista === 'cocina') cargarCocina();
    if (vista === 'caja') cargarCaja();
    if (vista === 'reservas') cargarReservas();
  }

  /* ==================================================================
     Sala
     ================================================================== */
  async function cargarMesas() {
    if (E.editando) return;            // no pisar una distribución a medio editar
    const mesas = await intentar(() => api.get('mesas'));
    if (!mesas || E.editando) return;
    mesas.forEach((m) => { m.uid = `m${m.id}`; });
    E.mesas = mesas;
    // Salones en el orden en que se dieron de alta sus mesas (comedor, terraza, barra…)
    const salones = [...new Set([...mesas].sort((a, b) => a.id - b.id).map((m) => m.salon))];
    if (!salones.includes(E.salon)) E.salon = salones[0];
    $('#salones').innerHTML = salones.map((s) => {
      const ocupadas = mesas.filter((m) => m.salon === s && m.pedido).length;
      return `<button role="tab" data-salon="${esc(s)}" aria-selected="${s === E.salon}">${esc(s)}${ocupadas ? ` · ${ocupadas}` : ''}</button>`;
    }).join('');
    pintarMesas();
  }

  /** Mesas que se dibujan: las del salón, o el borrador si se está editando. */
  const mesasVisibles = () => (E.editando ? E.borrador : E.mesas.filter((m) => m.salon === E.salon));

  function pintarMesas() {
    const mesas = mesasVisibles();
    $('#n-libres').textContent = mesas.filter((m) => !m.pedido && !m.reserva).length;
    $('#n-reservadas').textContent = mesas.filter((m) => !m.pedido && m.reserva).length;
    $('#n-ocupadas').textContent = mesas.filter((m) => m.pedido?.estado === 'abierto').length;
    $('#n-cuenta').textContent = mesas.filter((m) => m.pedido?.estado === 'cerrado').length;
    const plazas = mesas.reduce((s, m) => s + m.comensales, 0);
    $('#aforo').innerHTML = `Aforo <b class="num">${plazas}</b> plazas · <b class="num">${mesas.length}</b> mesas`;

    Plano.pintar($('#plano'), { salon: E.salon, mesas, editando: E.editando, seleccion: E.seleccion });
    pintarEditor();
  }

  /* ==================================================================
     Edición de la distribución (admin, gerente y jefes de sala)
     ================================================================== */
  const puedeEditarPlano = () => ['admin', 'gerente', 'jefe de sala'].includes(E.usuario?.rango);
  const tipoSalon = () => Plano.tipoDe(E.salon);
  const mesaSel = () => E.borrador?.find((m) => m.uid === E.seleccion);
  let contadorNuevas = 0;

  function entrarEdicion() {
    E.editando = true;
    E.borrador = E.mesas.filter((m) => m.salon === E.salon).map((m) => ({ ...m }));
    E.borrar = [];
    E.seleccion = null;
    $('#editor-plano').classList.remove('oculto');
    $('#btn-editar-plano').classList.add('oculto');
    pintarMesas();
  }

  function salirEdicion() {
    E.editando = false;
    E.borrador = null;
    E.seleccion = null;
    $('#editor-plano').classList.add('oculto');
    $('#btn-editar-plano').classList.toggle('oculto', !puedeEditarPlano());
  }

  function pintarEditor() {
    if (!E.editando) return;
    const m = mesaSel();
    $('#editor-seleccion').classList.toggle('oculto', !m);
    $('#editor-ayuda').classList.toggle('oculto', !!m);
    if (!m) return;
    $('#sel-nombre').textContent = m.nombre;
    $('#sel-plazas').textContent = `${m.comensales} ${m.comensales === 1 ? 'silla' : 'sillas'}`;
    $('[data-ed="menos"]').disabled = m.comensales <= 1;
    $('[data-ed="mas"]').disabled = m.comensales >= (tipoSalon() === 'barra' ? 8 : 12);
    $('[data-ed="borrar"]').disabled = !!m.pedido;
  }

  function nombreNuevaMesa() {
    const base = E.salon.charAt(0).toUpperCase() + E.salon.slice(1);
    const usados = new Set([...E.mesas.map((m) => m.nombre.toLowerCase()), ...E.borrador.map((m) => m.nombre.toLowerCase())]);
    const numeros = E.borrador.map((m) => parseInt(m.nombre.replace(/\D+/g, ''), 10)).filter((n) => !Number.isNaN(n));
    let n = Math.max(0, ...numeros) + 1;
    while (usados.has(`${base} ${n}`.toLowerCase())) n++;
    return `${base} ${n}`;
  }

  async function accionEditor(acc) {
    const m = mesaSel();
    const tipo = tipoSalon();
    if (acc === 'mas' || acc === 'menos') {
      if (!m) return;
      m.comensales = Math.max(1, m.comensales + (acc === 'mas' ? 1 : -1));
      Object.assign(m, (({ x, y }) => ({ pos_x: x, pos_y: y }))(Plano.limitar(m, tipo, m.pos_x, m.pos_y)));
      pintarMesas();
    } else if (acc === 'borrar') {
      if (!m) return;
      if (m.pedido) { avisar('No se puede eliminar una mesa con un pedido en curso', 'error'); return; }
      if (m.id) E.borrar.push(m.id);
      E.borrador = E.borrador.filter((x) => x !== m);
      E.seleccion = null;
      pintarMesas();
    } else if (acc === 'anadir') {
      const nueva = { uid: `n${++contadorNuevas}`, id: null, nombre: nombreNuevaMesa(), salon: E.salon,
                      comensales: tipo === 'barra' ? 2 : 4, pedido: null };
      Object.assign(nueva, (({ x, y }) => ({ pos_x: x, pos_y: y }))(Plano.buscarHueco(E.borrador, nueva, tipo)));
      E.borrador.push(nueva);
      E.seleccion = nueva.uid;
      pintarMesas();
      avisar(`${nueva.nombre} añadida: arrástrala a su sitio`);
    } else if (acc === 'cancelar') {
      salirEdicion();
      cargarMesas();
    } else if (acc === 'guardar') {
      const datos = {
        salon: E.salon,
        mesas: E.borrador.map((x) => (x.id
          ? { id: x.id, comensales: x.comensales, pos_x: x.pos_x, pos_y: x.pos_y }
          : { nombre: x.nombre, comensales: x.comensales, pos_x: x.pos_x, pos_y: x.pos_y })),
        borrar: E.borrar,
      };
      const r = await intentar(() => api.put('mesas/plano', datos));
      if (!r) return;
      salirEdicion();
      avisar('Distribución guardada');
      cargarMesas();
    }
  }

  /* --- Arrastrar mesas ---------------------------------------------- */
  let arrastre = null;
  let ignorarClick = false;   // el clic que sigue a un arrastre no deselecciona

  function empezarArrastre(e) {
    const g = e.target.closest('.mesa-plano');
    if (!E.editando || !g) return;
    e.preventDefault();
    ignorarClick = true;
    const m = E.borrador.find((x) => x.uid === g.dataset.uid);
    if (!m) return;
    if (E.seleccion !== m.uid) {
      E.seleccion = m.uid;
      pintarMesas();
    }
    const svg = $('#plano');
    const p = Plano.aPlano(svg, e.clientX, e.clientY);
    arrastre = { m, dx: p.x - m.pos_x, dy: p.y - m.pos_y, id: e.pointerId };
    svg.setPointerCapture(e.pointerId);
    svg.querySelector(`[data-uid="${m.uid}"]`)?.classList.add('arrastrando');
  }

  function moverArrastre(e) {
    if (!arrastre || e.pointerId !== arrastre.id) return;
    // Si se perdió el «soltar» (ningún botón pulsado), el arrastre termina aquí
    if (e.pointerType === 'mouse' && e.buttons === 0) { terminarArrastre(e); return; }
    const svg = $('#plano');
    const p = Plano.aPlano(svg, e.clientX, e.clientY);
    const snap = (v) => Math.round(v / 5) * 5;
    const { x, y } = Plano.limitar(arrastre.m, tipoSalon(), snap(p.x - arrastre.dx), snap(p.y - arrastre.dy));
    arrastre.m.pos_x = x;
    arrastre.m.pos_y = y;
    svg.querySelector(`[data-uid="${arrastre.m.uid}"]`)?.setAttribute('transform', `translate(${x} ${y})`);
  }

  function terminarArrastre(e) {
    if (!arrastre || e.pointerId !== arrastre.id) return;
    arrastre = null;
    pintarMesas();
    // El «click» del mismo gesto llega justo después del «pointerup»: pasado ese
    // instante la marca se borra, para no ignorar el siguiente toque del usuario
    setTimeout(() => { ignorarClick = false; }, 0);
  }


  async function abrirMesa(idMesa) {
    const m = E.mesas.find((x) => x.id === idMesa);
    if (!m) return;
    // Mesa libre pero reservada hoy: se avisa (se puede abrir: es lo que se hace cuando llega el cliente)
    if (!m.pedido && m.reserva) {
      const r = m.reserva;
      const ok = await confirmar(`${m.nombre} está reservada`,
        `Reserva a las ${r.hora} para ${r.nombre} (${r.comensales} ${r.comensales === 1 ? 'persona' : 'personas'}). ` +
        'Ábrela solo si son ellos o si la mesa quedará libre antes de esa hora.', 'Abrir la mesa');
      if (!ok) return;
    }
    if (m.pedido) {
      const pedido = await intentar(() => api.get(`pedidos/${m.pedido.id}`));
      if (!pedido) return;
      E.pedido = pedido;
    } else {
      // Pedido sin crear: se crea en el servidor al añadir el primer plato
      E.pedido = { id: null, id_mesa: m.id, mesa: m.nombre, salon: m.salon, comensales: m.comensales,
                   estado: 'nuevo', total: 0, lineas: [], personal: `${E.usuario.nombre} ${E.usuario.apellidos}` };
    }
    E.lineaSel = null;
    irA('pedido');
    pintarGeneros();
    pintarBotonera();
    pintarTicket();
  }

  /* ==================================================================
     Pedido — botonera de platos
     ================================================================== */
  function pintarGeneros() {
    $('#generos').innerHTML = E.generos.map((g) =>
      `<button role="tab" data-id="${g.id}" style="--g:${colorGenero(g.id)}" aria-selected="${g.id === E.genero && !$('#buscar-plato').value}">${esc(g.nombre)}</button>`
    ).join('');
  }

  function pintarBotonera() {
    const q = normal($('#buscar-plato').value.trim());
    const lista = q
      ? E.platos.filter((p) => normal(p.nombre).includes(q))
      : E.platos.filter((p) => p.id_genero === E.genero);
    $('#botonera').innerHTML = lista.map((p) => `
      <button class="boton-plato" data-id="${p.id}" style="--g:${colorGenero(p.id_genero)}" ${p.disponible ? '' : 'disabled title="No disponible"'}
              ${p.alergenos?.length ? `aria-description="Alérgenos: ${esc(p.alergenos.map((a) => a.nombre).join(', '))}"` : ''}>
        ${p.imagen ? `<img class="boton-plato__img" src="${esc(p.imagen)}" alt="" loading="lazy">` : ''}
        <strong>${esc(p.nombre)}</strong>
        <span class="boton-plato__pie">
          <span class="num">${euros(p.precio)}</span>
          ${p.alergenos?.length ? `<span class="boton-plato__alergenos" title="${esc(p.alergenos.map((a) => a.nombre).join(', '))}">${p.alergenos.map(iconoAlergeno).join('')}</span>` : ''}
        </span>
      </button>`).join('') || '<p class="vacio-tpv">Sin resultados</p>';
    $$('#botonera img').forEach((img) => img.addEventListener('error', () => img.remove(), { once: true }));
  }

  function anadirPlato(idPlato, boton) {
    const pedido = E.pedido;
    if (!pedido) return;
    if (pedido.estado === 'cerrado') {
      avisar('La cuenta está pedida: reabre la mesa para añadir platos', 'error');
      return;
    }
    boton?.classList.remove('pulsado');
    void boton?.offsetWidth;
    boton?.classList.add('pulsado');

    enCola(() => intentar(async () => {
      if (E.pedido !== pedido) return;
      if (!pedido.id) {
        const nuevo = await api.post('pedidos', { id_mesa: pedido.id_mesa });
        Object.assign(pedido, nuevo);
      }
      const act = await api.post(`pedidos/${pedido.id}/lineas`, { id_platos: idPlato });
      if (E.pedido !== pedido) return;
      const antes = new Set(pedido.lineas.map((l) => l.id));
      Object.assign(pedido, act);
      const nueva = act.lineas.find((l) => !antes.has(l.id)) || act.lineas.find((l) => l.id_platos === idPlato && l.estado === 'pendiente');
      E.lineaSel = nueva?.id ?? E.lineaSel;
      pintarTicket();
    }));
  }

  /* ==================================================================
     Pedido — ticket
     ================================================================== */
  function pintarTicket() {
    const p = E.pedido;
    if (!p) return;
    $('#ticket-salon').textContent = `${p.salon} · ${p.comensales} plazas`;
    $('#ticket-mesa').textContent = p.mesa;
    const etiquetaEstado = { nuevo: 'Nueva', abierto: 'Abierta', cerrado: 'Cuenta pedida' }[p.estado] || p.estado;
    $('#ticket-meta').innerHTML = `
      <span class="estado-pedido estado-pedido--${p.estado}">${etiquetaEstado}</span><br>
      ${p.id ? `Nº ${p.id} · ${horaDe(p.fecha)}<br>` : ''}${esc(p.personal.split(' ')[0])}`;

    const editable = p.estado === 'abierto' || p.estado === 'nuevo';
    const activo = p.estado === 'abierto' || p.estado === 'cerrado';

    // Platos agrupados por pase: bebidas, 1er pase, 2º, 3º y postres
    const pases = [...new Set(p.lineas.map((l) => l.pase))].sort((a, b) => a - b);
    const linea = (l) => {
      const estado = l.pase === 0 && l.estado === 'pendiente' ? 'Por servir' : ESTADO_LINEA_TXT[l.estado];
      return `
      <li class="linea linea--${l.estado.replace(' ', '-')} ${l.id === E.lineaSel ? 'seleccionada' : ''}" data-id="${l.id}">
        <span class="linea__cant num">${l.cantidad}×</span>
        <span class="linea__nombre">${esc(l.plato)}</span>
        <span class="linea__importe num">${euros(l.subtotal)}</span>
        ${l.notas ? `<span class="linea__nota">${esc(l.notas)}</span>` : ''}
        <span class="linea__estado linea__estado--${l.estado.replace(' ', '-')}">${esc(estado)}
          ${l.estado === 'listo' && activo ? '<button class="mini mini--listo" data-acc="servido">Servir ✓</button>' : ''}</span>
        <div class="linea__controles">
          <button class="mini" data-acc="menos" ${!editable || l.cantidad < 2 ? 'disabled' : ''} aria-label="Uno menos">−</button>
          <button class="mini" data-acc="mas" ${!editable ? 'disabled' : ''} aria-label="Uno más">+</button>
          <button class="mini" data-acc="nota" ${!editable ? 'disabled' : ''}>Nota</button>
          ${l.pase > 0 && l.estado === 'pendiente' && editable ? `<button class="mini" data-acc="pase" title="Cambiar de pase">Pase ${l.pase} ⟳</button>` : ''}
          ${l.estado !== 'servido' ? '<button class="mini" data-acc="servido">Servido</button>' : ''}
          <button class="mini mini--peligro" data-acc="quitar" ${!editable ? 'disabled' : ''}>Quitar</button>
        </div>
      </li>`;
    };
    $('#lineas').innerHTML = p.lineas.length ? pases.map((n) => {
      const ls = p.lineas.filter((l) => l.pase === n);
      const enEspera = ls.filter((l) => l.estado === 'pendiente').length;
      const listos = ls.filter((l) => l.estado === 'listo').length;
      const resumen = n === 0 ? '' : enEspera ? `${enEspera} en espera` : listos ? `${listos} listo${listos > 1 ? 's' : ''}`
        : ls.every((l) => l.estado === 'servido') ? 'servido' : 'en marcha';
      return `
        <li class="pase-cabecera ${enEspera && n > 0 ? 'pase-cabecera--espera' : ''}">
          <span>${NOMBRE_PASE[n] || `Pase ${n}`}${resumen ? ` · <small>${resumen}</small>` : ''}</span>
          ${n > 0 && enEspera && activo && p.id ? `<button class="mini mini--marchar" data-marchar="${n}">Marchar ▶</button>` : ''}
        </li>${ls.map(linea).join('')}`;
    }).join('')
      : `<li class="ticket__vacio"><div><p>Mesa sin consumiciones</p>Toca un plato para empezar el pedido</div></li>`;

    $('#ticket-total').textContent = euros(p.total);

    const vacio = !p.lineas.length;
    const siguiente = Math.min(...p.lineas.filter((l) => l.pase > 0 && l.estado === 'pendiente').map((l) => l.pase));
    const acc = $('#ticket-acciones');
    if (p.estado === 'nuevo') {
      acc.innerHTML = '<button class="btn btn--acento ancho" disabled>Cobrar</button>';
    } else {
      acc.innerHTML = `
        ${Number.isFinite(siguiente) && activo
          ? `<button class="btn btn--olivo ancho" data-acc="marchar">Marchar ${NOMBRE_PASE[siguiente].toLowerCase()} a cocina ▶</button>` : ''}
        ${p.estado === 'abierto'
          ? `<button class="btn btn--fantasma" data-acc="cuenta" ${vacio ? 'disabled' : ''}>Pedir cuenta</button>`
          : '<button class="btn btn--fantasma" data-acc="reabrir">Reabrir</button>'}
        <button class="btn btn--acento" data-acc="cobrar" ${vacio ? 'disabled' : ''}>Cobrar</button>
        <div class="ticket__secundarias">
          <button class="enlace" data-acc="mover">Cambiar mesa</button>
          <button class="enlace" data-acc="imprimir" ${vacio ? 'disabled' : ''}>Imprimir</button>
          <button class="enlace enlace--peligro" data-acc="anular">${vacio ? 'Liberar mesa' : 'Anular'}</button>
        </div>`;
    }
  }

  /** Marcha a cocina un pase (o el siguiente con platos en espera). */
  function marcharPase(pase) {
    const p = E.pedido;
    if (!p?.id) return;
    enCola(() => intentar(() => api.post(`pedidos/${p.id}/marchar`, pase ? { pase } : {})).then((r) => {
      if (!r || E.pedido !== p) return;
      Object.assign(p, r);
      pintarTicket();
      avisar(`${r.marchado.nombre} marchado a cocina · ${r.marchado.platos} ${r.marchado.platos === 1 ? 'plato' : 'platos'}`);
    }));
  }

  async function accionLinea(acc, idLinea) {
    const p = E.pedido;
    const l = p.lineas.find((x) => x.id === idLinea);
    if (!l) return;
    const actualizar = (r) => { if (r && E.pedido === p) { Object.assign(p, r); pintarTicket(); } };

    if (acc === 'mas' || acc === 'menos') {
      const cantidad = l.cantidad + (acc === 'mas' ? 1 : -1);
      enCola(() => intentar(() => api.patch(`lineas/${l.id}`, { cantidad })).then(actualizar));
    } else if (acc === 'servido') {
      enCola(() => intentar(() => api.patch(`lineas/${l.id}`, { estado: 'servido' })).then(actualizar));
    } else if (acc === 'pase') {
      enCola(() => intentar(() => api.patch(`lineas/${l.id}`, { pase: (l.pase % 4) + 1 })).then(actualizar));
    } else if (acc === 'quitar') {
      enCola(() => intentar(() => api.borrar(`lineas/${l.id}`)).then((r) => { E.lineaSel = null; actualizar(r); }));
    } else if (acc === 'nota') {
      const nota = await pedirNota(l);
      if (nota === null) return;
      enCola(() => intentar(() => api.patch(`lineas/${l.id}`, { notas: nota })).then(actualizar));
    }
  }

  async function accionPedido(acc) {
    const p = E.pedido;
    if (!p?.id) return;
    const cambiar = (datos) => intentar(() => api.patch(`pedidos/${p.id}`, datos));

    if (acc === 'marchar') {
      marcharPase();
    } else if (acc === 'cuenta' || acc === 'reabrir') {
      const r = await cambiar({ estado: acc === 'cuenta' ? 'cerrado' : 'abierto' });
      if (r) { Object.assign(p, r); pintarTicket(); avisar(acc === 'cuenta' ? 'Cuenta pedida' : 'Mesa reabierta'); }
    } else if (acc === 'cobrar') {
      abrirCobro();
    } else if (acc === 'imprimir') {
      window.print();
    } else if (acc === 'anular') {
      const vacio = !p.lineas.length;
      const ok = await confirmar(
        vacio ? `¿Liberar ${p.mesa}?` : `¿Anular el pedido de ${p.mesa}?`,
        vacio ? 'La mesa quedará libre.' : `Se anulará un pedido de ${euros(p.total)}. No se puede deshacer.`,
        vacio ? 'Liberar' : 'Anular pedido');
      if (!ok) return;
      if (await cambiar({ estado: 'anulado' })) { avisar(vacio ? 'Mesa liberada' : 'Pedido anulado'); irA('sala'); }
    } else if (acc === 'mover') {
      await cargarMesas();
      const libres = E.mesas.filter((m) => !m.pedido);
      $('#mesas-libres').innerHTML = libres.map((m) => `<button value="${m.id}">${esc(m.nombre)}</button>`).join('')
        || '<p class="sin-datos">No hay mesas libres</p>';
      const dlg = $('#dlg-mesa');
      dlg.showModal();
      dlg.addEventListener('close', async () => {
        const id = Number(dlg.returnValue);
        if (!id) return;
        const r = await cambiar({ id_mesa: id });
        if (r) { Object.assign(p, r); pintarTicket(); avisar(`Pedido movido a ${r.mesa}`); }
      }, { once: true });
    }
  }

  /* ==================================================================
     Cobro
     ================================================================== */
  function abrirCobro() {
    const p = E.pedido;
    const total = Number(p.total);
    $('#cobro-mesa').textContent = p.mesa;
    $('#cobro-total').textContent = euros(total);
    $('#entregado').value = '';
    $('#form-cobro').elements.pago.value = 'efectivo';

    const sugeridos = [...new Set([total, ...[5, 10, 20, 50, 100].map((b) => Math.ceil(total / b) * b)])]
      .filter((v) => v >= total).sort((a, b) => a - b).slice(0, 5);
    $('#rapidos').innerHTML = sugeridos.map((v) =>
      `<button type="button" class="mini" data-valor="${v}">${v === total ? 'Exacto' : euros(v)}</button>`).join('');
    actualizarCobro();

    const dlg = $('#dlg-cobro');
    dlg.returnValue = '';
    dlg.showModal();
  }

  function actualizarCobro() {
    const efectivo = $('#form-cobro').elements.pago.value === 'efectivo';
    $('#bloque-efectivo').classList.toggle('oculto', !efectivo);
    const total = Number(E.pedido?.total || 0);
    const entregado = parseFloat($('#entregado').value.replace(',', '.'));
    const cambio = $('#cambio');
    if (!efectivo || Number.isNaN(entregado)) {
      cambio.textContent = '—';
      cambio.classList.remove('falta');
      $('#confirmar-cobro').disabled = false;
      return;
    }
    const dif = Math.round((entregado - total) * 100) / 100;
    cambio.textContent = dif >= 0 ? euros(dif) : `Faltan ${euros(-dif)}`;
    cambio.classList.toggle('falta', dif < 0);
    $('#confirmar-cobro').disabled = dif < 0;
  }

  async function confirmarCobro() {
    const p = E.pedido;
    const tipo = $('#form-cobro').elements.pago.value;
    const r = await intentar(() => api.patch(`pedidos/${p.id}`, { estado: 'pagado', tipo_pago: tipo }));
    if (!r) return;
    avisar(`${p.mesa} cobrada · ${euros(r.total)} (${tipo})`);
    irA('sala');
    actualizarVentas();
    intentar(pedirCocina).then((l) => l && actualizarGlobo(l));
  }

  /* ==================================================================
     Diálogos auxiliares
     ================================================================== */
  function confirmar(titulo, texto, boton = 'Aceptar') {
    const dlg = $('#dlg-confirmar');
    $('#confirmar-titulo').textContent = titulo;
    $('#confirmar-texto').textContent = texto;
    $('#confirmar-si').textContent = boton;
    dlg.returnValue = '';
    dlg.showModal();
    return new Promise((ok) => dlg.addEventListener('close', () => ok(dlg.returnValue === 'si'), { once: true }));
  }

  function pedirNota(linea) {
    const dlg = $('#dlg-nota');
    $('#nota-plato').textContent = linea.plato;
    $('#nota-texto').value = linea.notas || '';
    $('#notas-rapidas').innerHTML = NOTAS_RAPIDAS.map((n) => `<button type="button" class="mini">${n}</button>`).join('');
    dlg.returnValue = '';
    dlg.showModal();
    $('#nota-texto').focus();
    return new Promise((ok) => dlg.addEventListener('close',
      () => ok(dlg.returnValue === 'si' ? $('#nota-texto').value.trim() : null), { once: true }));
  }

  /* ==================================================================
     Cocina
     ================================================================== */
  async function pedirCocina() {
    return api.get('cocina');   // las bebidas (pase 0) no llegan a cocina
  }

  async function cargarCocina() {
    const lineas = await intentar(pedirCocina);
    if (!lineas) return;
    actualizarGlobo(lineas);
    if (E.vista !== 'cocina') return;
    const verEspera = $('#ver-espera').checked;

    // Una comanda por pedido; primero las que llevan más tiempo marchadas
    const comandas = new Map();
    for (const l of lineas) {
      if (!comandas.has(l.id_pedido)) comandas.set(l.id_pedido, { id: l.id_pedido, mesa: l.mesa, camarero: l.camarero, lineas: [] });
      comandas.get(l.id_pedido).lineas.push(l);
    }
    const marcha = (c) => c.lineas.filter((l) => !['pendiente', 'listo'].includes(l.estado)).map((l) => l.marchada || l.fecha).sort()[0];
    const lista = [...comandas.values()]
      .filter((c) => verEspera || c.lineas.some((l) => l.estado !== 'pendiente'))
      .sort((a, b) => (marcha(a) || '9') < (marcha(b) || '9') ? -1 : 1);

    const item = (l) => {
      const accion = { marchado: 'Empezar', 'en cocina': 'Listo ✓', listo: 'En el pase' }[l.estado];
      const min = minutosDesde(l.marchada || l.fecha);
      return `
        <li><button class="item-cocina item-cocina--${l.estado.replace(' ', '-')}" data-id="${l.id}" data-estado="${l.estado}"
                    ${l.estado === 'listo' ? 'disabled' : ''}>
          <b class="num">${l.cantidad}</b>
          <span class="item-cocina__plato">${esc(l.plato)}</span>
          <span class="item-cocina__accion">${accion}</span>
          ${l.notas ? `<span class="item-cocina__nota">${esc(l.notas)}</span>` : ''}
          ${l.estado !== 'listo' ? `<span class="item-cocina__tiempo num ${min >= 20 ? 'tarde' : min >= 10 ? 'medio' : ''}">${min} min</span>` : ''}
        </button></li>`;
    };

    $('#cocina').innerHTML = lista.map((c, i) => {
      const activas = c.lineas.filter((l) => l.estado !== 'pendiente');
      const espera = c.lineas.filter((l) => l.estado === 'pendiente');
      const pases = [...new Set(activas.map((l) => l.pase))].sort();
      const min = marcha(c) ? minutosDesde(marcha(c)) : null;
      return `
        <article class="comanda-cocina ${activas.length ? '' : 'comanda-cocina--espera'}" style="animation-delay:${Math.min(i, 10) * 30}ms">
          <header class="comanda-cocina__cabecera">
            <strong>${esc(c.mesa)}</strong>
            <span class="comanda-cocina__tiempo num ${min >= 25 ? 'tarde' : min >= 12 ? 'medio' : ''}">
              ${min !== null ? `${min} min · ` : 'Sin marchar · '}${esc(c.camarero.split(' ')[0])}</span>
          </header>
          ${pases.map((n) => `
            <p class="comanda-cocina__pase">${NOMBRE_PASE[n]}</p>
            <ul>${activas.filter((l) => l.pase === n).map(item).join('')}</ul>`).join('')}
          ${espera.length && verEspera ? `
            <div class="comanda-cocina__espera">
              <p>En espera (aún no marchado)</p>
              ${[...new Set(espera.map((l) => l.pase))].sort().map((n) => `
                <span><em>${NOMBRE_PASE[n]}:</em> ${espera.filter((l) => l.pase === n).map((l) => `${l.cantidad}× ${esc(l.plato)}`).join(', ')}</span>`).join('')}
            </div>` : ''}
        </article>`;
    }).join('') || '<p class="vacio-tpv">No hay comandas en marcha</p>';
  }

  function actualizarGlobo(lineas) {
    // Platos marchados que la cocina aún no ha empezado
    const n = lineas.filter((l) => l.estado === 'marchado').length;
    $('#globo-cocina').textContent = n;
    $('#globo-cocina').classList.toggle('oculto', !n);
  }

  async function avanzarCocina(boton) {
    const siguiente = { marchado: 'en cocina', 'en cocina': 'listo' }[boton.dataset.estado];
    if (!siguiente) return;
    boton.disabled = true;
    const r = await intentar(() => api.patch(`lineas/${boton.dataset.id}`, { estado: siguiente }));
    if (r) cargarCocina(); else boton.disabled = false;
  }

  /* --- Avisos a sala: platos listos para servir ----------------------- */
  let listosVistos = null;

  async function revisarListos() {
    if (!E.usuario || GRUPOS.cocina.includes(E.usuario.rango)) return;
    let listos;
    try { listos = await api.get('cocina/listos'); } catch { return; }
    const total = listos.reduce((s, l) => s + l.cantidad, 0);
    $('#globo-sala').textContent = total;
    $('#globo-sala').classList.toggle('oculto', !total);

    if (listosVistos) {
      const nuevos = listos.filter((l) => !listosVistos.has(l.id));
      const porMesa = new Map();
      for (const l of nuevos) {
        if (!porMesa.has(l.mesa)) porMesa.set(l.mesa, []);
        porMesa.get(l.mesa).push(`${l.cantidad}× ${l.plato}`);
      }
      for (const [mesa, platos] of porMesa) avisar(`🔔 ${mesa}: listo para servir · ${platos.join(', ')}`);
      if (nuevos.length && E.vista === 'sala') cargarMesas();
      if (nuevos.length && E.vista === 'pedido' && E.pedido?.id && nuevos.some((l) => l.id_pedido === E.pedido.id)) {
        const p = E.pedido;
        enCola(() => api.get(`pedidos/${p.id}`).then((r) => { if (E.pedido === p) { Object.assign(p, r); pintarTicket(); } }).catch(() => {}));
      }
    }
    listosVistos = new Set(listos.map((l) => l.id));
  }

  /* ==================================================================
     Caja
     ================================================================== */
  /* --- Cierre de caja: informe X (comprobar) y Z (cerrar el día) ------- */
  const DENOMINACIONES = [500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01];
  const puedeCerrarCaja = () => ['admin', 'gerente', 'jefe de sala'].includes(E.usuario?.rango);
  let informeX = null;
  let conteo = {};   // denominación → unidades contadas (se conserva al refrescar)

  const fechaHora = (f) => (f ? new Date(String(f).replace(' ', 'T')).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
  const formaPago = (t) => t.charAt(0).toUpperCase() + t.slice(1);

  async function cargarCaja() {
    const x = await intentar(() => api.get('caja/x'));
    if (!x) return;
    informeX = x;

    $('#caja-periodo').textContent = x.ultimo_cierre
      ? `Ventas desde el cierre Z nº ${x.ultimo_cierre.numero} (${fechaHora(x.ultimo_cierre.hasta)})`
      : 'Ventas desde el inicio (aún no se ha hecho ningún cierre Z)';
    $('#btn-cierre-z').classList.toggle('oculto', !puedeCerrarCaja());
    $('#tarjeta-cierres').classList.toggle('oculto', !puedeCerrarCaja());

    const abiertas = x.mesas_abiertas;
    $('#aviso-mesas').classList.toggle('oculto', !abiertas.length);
    $('#aviso-mesas').innerHTML = abiertas.length
      ? `<strong>${abiertas.length} ${abiertas.length === 1 ? 'mesa abierta' : 'mesas abiertas'}</strong> (${abiertas.map((m) => `${esc(m.mesa)} ${euros(m.total)}`).join(' · ')}). `
        + 'Se pueden consultar en la X, pero hay que cobrarlas o anularlas antes de la Z.'
      : '';

    $('#kpis').innerHTML = [
      ['Ventas del periodo', euros(x.total), true],
      ['Tickets cobrados', x.tickets],
      ['Ticket medio', euros(x.ticket_medio)],
      ['Productos vendidos', `${x.unidades} uds.`],
    ].map(([t, v, d]) => `<div class="kpi ${d ? 'kpi--destacado' : ''}"><span>${t}</span><strong class="num">${v}</strong></div>`).join('');

    const max = Math.max(...x.formas_pago.map((t) => t.importe), 1);
    $('#formas-pago').innerHTML = x.formas_pago.map((t) => `
      <div class="barra-pago">
        <div class="barra-pago__fila"><span>${esc(formaPago(t.tipo_pago))} <small class="sin-datos">· ${t.tickets} tickets</small></span><strong class="num">${euros(t.importe)}</strong></div>
        <div class="barra-pago__pista"><i style="width:${(t.importe / max) * 100}%"></i></div>
      </div>`).join('') || '<p class="sin-datos">Todavía no hay cobros</p>';

    $('#caja-anulados').innerHTML = x.anulados.length
      ? `<p class="num"><strong>${x.anulados.length}</strong> ${x.anulados.length === 1 ? 'pedido anulado' : 'pedidos anulados'} con consumiciones · <strong>${euros(x.anulados_importe)}</strong></p>
         <p class="sin-datos">${x.anulados.map((a) => `${esc(a.mesa)} (${esc(a.camarero.split(' ')[0])}) ${euros(a.total)}`).join(' · ')}</p>`
      : '<p class="sin-datos">Ninguna</p>';

    $('#tabla-camareros').innerHTML = x.camareros.length ? `
      <thead><tr><th>Camarero</th><th class="der">Tickets</th><th class="der">Efectivo</th><th class="der">Total</th><th class="der">% ventas</th></tr></thead>
      <tbody>${x.camareros.map((c) => `
        <tr><td>${esc(c.camarero)}</td><td class="der num">${c.tickets}</td><td class="der num">${euros(c.efectivo)}</td>
            <td class="der num"><strong>${euros(c.total)}</strong></td><td class="der num">${x.total ? Math.round((c.total / x.total) * 100) : 0} %</td></tr>`).join('')}
      </tbody>` : '<tbody><tr><td class="sin-datos">Sin ventas en este periodo</td></tr></tbody>';

    let seccion = null;
    $('#tabla-productos').innerHTML = x.productos.length ? `
      <thead><tr><th>Producto</th><th class="der">Uds.</th><th class="der">Importe</th></tr></thead>
      <tbody>${x.productos.map((p) => {
        const cab = p.seccion !== seccion ? `<tr class="fila-seccion"><td colspan="3">${esc(p.seccion)}</td></tr>` : '';
        seccion = p.seccion;
        return `${cab}<tr><td>${esc(p.producto)}</td><td class="der num">${p.unidades}</td><td class="der num">${euros(p.importe)}</td></tr>`;
      }).join('')}</tbody>` : '<tbody><tr><td class="sin-datos">Sin productos vendidos</td></tr></tbody>';

    pintarArqueo();
    if (puedeCerrarCaja()) cargarCierres();
  }

  function pintarArqueo() {
    const x = informeX;
    if (!x) return;
    $('#arqueo-cuentas').innerHTML = `
      <div><dt>Fondo de caja</dt><dd class="num">${euros(x.fondo)}</dd></div>
      <div><dt>+ Cobros en efectivo</dt><dd class="num">${euros(x.efectivo)}</dd></div>
      <div class="arqueo__esperado"><dt>= Debe haber en el cajón</dt><dd class="num">${euros(x.efectivo_esperado)}</dd></div>`;
    if (!$('#arqueo-monedas').children.length) {
      $('#arqueo-monedas').innerHTML = DENOMINACIONES.map((v) => `
        <label class="moneda ${v >= 5 ? 'moneda--billete' : ''}">
          <span class="num">${v >= 1 ? `${v} €` : `${Math.round(v * 100)} c`}</span>
          <input type="number" min="0" step="1" inputmode="numeric" data-valor="${v}" value="${conteo[v] || ''}" placeholder="0">
        </label>`).join('');
    }
    actualizarArqueo();
  }

  const contadoActual = () => {
    const v = parseFloat(String($('#arqueo-contado').value).replace(',', '.'));
    return Number.isNaN(v) ? null : Math.round(v * 100) / 100;
  };

  function actualizarArqueo() {
    const x = informeX;
    const contado = contadoActual();
    const r = $('#arqueo-resultado');
    if (contado === null) {
      r.innerHTML = '<div><dt>Descuadre</dt><dd class="sin-datos">Cuenta el efectivo para comprobarlo</dd></div>';
      return;
    }
    const dif = Math.round((contado - x.efectivo_esperado) * 100) / 100;
    const estado = Math.abs(dif) < 0.005 ? 'cuadra' : dif > 0 ? 'sobra' : 'falta';
    r.innerHTML = `
      <div class="arqueo__dif arqueo__dif--${estado}"><dt>${{ cuadra: 'La caja cuadra', sobra: 'Sobra', falta: 'Falta' }[estado]}</dt>
        <dd class="num">${estado === 'cuadra' ? '✓' : euros(Math.abs(dif))}</dd></div>
      <div><dt>Retirar del cajón (deja ${euros(x.fondo)} de cambio)</dt><dd class="num">${euros(Math.max(0, contado - x.fondo))}</dd></div>`;
  }

  async function cargarCierres() {
    const lista = await intentar(() => api.get('caja/cierres'));
    if (!lista) return;
    $('#tabla-cierres').innerHTML = lista.length ? `
      <thead><tr><th>Z</th><th>Cerrada</th><th>Por</th><th class="der">Tickets</th><th class="der">Total</th><th class="der">Descuadre</th><th></th></tr></thead>
      <tbody>${lista.map((c) => `
        <tr><td class="num"><strong>nº ${c.numero}</strong></td><td>${fechaHora(c.hasta)}</td><td>${esc(c.personal.split(' ')[0])}</td>
            <td class="der num">${c.tickets}</td><td class="der num">${euros(c.total)}</td>
            <td class="der num ${c.descuadre ? (c.descuadre < 0 ? 'texto-falta' : 'texto-sobra') : ''}">${c.descuadre === null ? 'sin arqueo' : euros(c.descuadre)}</td>
            <td class="der"><button class="mini" data-cierre="${c.id}">Reimprimir</button></td></tr>`).join('')}
      </tbody>` : '<tbody><tr><td class="sin-datos">Aún no hay cierres Z</td></tr></tbody>';
  }

  async function cierreZ() {
    const x = informeX;
    if (!x) return;
    if (x.mesas_abiertas.length) {
      avisar(`Hay ${x.mesas_abiertas.length} mesas abiertas: cóbralas o anúlalas antes de la Z`, 'error');
      return;
    }
    const contado = contadoActual();
    const dif = contado === null ? null : Math.round((contado - x.efectivo_esperado) * 100) / 100;
    const texto = `Ventas ${euros(x.total)} en ${x.tickets} tickets · efectivo esperado ${euros(x.efectivo_esperado)}. `
      + (contado === null ? 'No has contado el efectivo: la Z quedará sin arqueo. '
        : `Contado ${euros(contado)}${dif ? ` (${dif < 0 ? 'falta' : 'sobra'} ${euros(Math.abs(dif))})` : ' (cuadra)'}. `)
      + 'Las ventas quedarán cerradas y la caja volverá a 0 para el siguiente servicio. No se puede deshacer.';
    if (!(await confirmar('¿Hacer el cierre Z?', texto, 'Cerrar caja'))) return;

    const z = await intentar(() => api.post('caja/z', contado === null ? {} : { efectivo_contado: contado }));
    if (!z) return;
    avisar(`Cierre Z nº ${z.numero} hecho · ${euros(z.total)}${z.retirar !== null ? ` · retira ${euros(z.retirar)}` : ''}`);
    conteo = {};
    $('#arqueo-contado').value = '';
    $('#arqueo-monedas').innerHTML = '';
    imprimirInforme(z);
    cargarCaja();
  }

  /* --- Informe en formato ticket para imprimir ----------------------- */
  function imprimirInforme(inf) {
    const fila = (a, b, fuerte) => `<div class="inf-fila ${fuerte ? 'inf-fila--fuerte' : ''}"><span>${a}</span><span>${b}</span></div>`;
    const contado = inf.tipo === 'Z' ? inf.efectivo_contado : contadoActual();
    const dif = contado === null || contado === undefined ? null : Math.round((contado - inf.efectivo_esperado) * 100) / 100;
    $('#informe-imprimir').innerHTML = `
      <h1>Olea</h1>
      <h2>${inf.tipo === 'Z' ? `CIERRE Z nº ${inf.numero}` : 'INFORME X (sin cierre)'}</h2>
      <p>${fechaHora(inf.generado)} · ${esc(inf.personal)}</p>
      <p>Periodo: ${inf.desde ? fechaHora(inf.desde) : '—'} → ${fechaHora(inf.generado)}</p>
      <hr>
      ${fila('Tickets', inf.tickets)}${fila('Ticket medio', euros(inf.ticket_medio))}
      ${fila('TOTAL VENTAS', euros(inf.total), true)}
      <h3>Formas de pago</h3>
      ${inf.formas_pago.map((t) => fila(`${esc(formaPago(t.tipo_pago))} (${t.tickets})`, euros(t.importe))).join('') || '<p>Sin cobros</p>'}
      <h3>Efectivo</h3>
      ${fila('Fondo de caja', euros(inf.fondo))}${fila('Cobros en efectivo', euros(inf.efectivo))}
      ${fila('Esperado en cajón', euros(inf.efectivo_esperado), true)}
      ${contado !== null && contado !== undefined ? fila('Contado', euros(contado)) + fila(dif === 0 ? 'Cuadra' : dif < 0 ? 'Falta' : 'Sobra', euros(Math.abs(dif)), true)
        + fila(`Retirar (deja ${euros(inf.fondo)})`, euros(Math.max(0, contado - inf.fondo))) : '<p>Sin arqueo</p>'}
      <h3>Camareros</h3>
      ${inf.camareros.map((c) => fila(`${esc(c.camarero)} (${c.tickets})`, euros(c.total))).join('') || '<p>—</p>'}
      <h3>Productos (${inf.unidades} uds.)</h3>
      ${inf.productos.map((p) => fila(`${p.unidades} × ${esc(p.producto)}`, euros(p.importe))).join('') || '<p>—</p>'}
      <h3>Anulaciones</h3>
      ${inf.anulados.length ? inf.anulados.map((a) => fila(`${esc(a.mesa)} · ${esc(a.camarero.split(' ')[0])}`, euros(a.total))).join('') : '<p>Ninguna</p>'}
      <hr>
      ${inf.tipo === 'Z' ? '<p>Caja cerrada. El siguiente periodo empieza a 0.</p><p class="inf-firma">Firma:</p>' : '<p>Informe de comprobación: la caja sigue abierta.</p>'}`;
    document.body.classList.add('imprimiendo-informe');
    window.print();
    document.body.classList.remove('imprimiendo-informe');
  }

  async function actualizarVentas() {
    try {
      const r = await api.get('resumen');
      $('#ventas-hoy').textContent = euros(r.ventas);
    } catch { /* silencioso */ }
  }

  /* ==================================================================
     Reservas desde la web (admin, gerente y jefes de sala)
     ================================================================== */
  const puedeVerReservas = () => ['admin', 'gerente', 'jefe de sala'].includes(E.usuario?.rango);
  let filtroReservas = 'pendiente';
  let reservas = [];

  const fechaReserva = (iso) => {
    const d = new Date(`${iso}T12:00`);
    const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
    const dias = Math.round((d - hoy) / 86400000);
    const texto = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    return dias === 0 ? `Hoy · ${texto}` : dias === 1 ? `Mañana · ${texto}` : texto.charAt(0).toUpperCase() + texto.slice(1);
  };
  const haceCuanto = (fecha) => {
    const min = minutosDesde(fecha);
    if (min < 60) return `hace ${min} min`;
    if (min < 1440) return `hace ${Math.floor(min / 60)} h`;
    return `hace ${Math.floor(min / 1440)} d`;
  };

  async function actualizarGloboReservas() {
    if (!puedeVerReservas()) return;
    try {
      const { pendientes } = await api.get('reservas/pendientes');
      $('#globo-reservas').textContent = pendientes;
      $('#globo-reservas').classList.toggle('oculto', !pendientes);
    } catch { /* silencioso */ }
  }

  async function cargarReservas() {
    if (filtroReservas === 'lista') { cargarListaNegra(); return; }
    // Las confirmadas incluyen las de ayer, para poder marcar a quien no se presentó
    const ayer = new Date(Date.now() - 86400000);
    const desde = `${ayer.getFullYear()}-${String(ayer.getMonth() + 1).padStart(2, '0')}-${String(ayer.getDate()).padStart(2, '0')}`;
    const filtro = filtroReservas === 'todas' ? '' : filtroReservas === 'confirmada' ? `?estado=confirmada&desde=${desde}` : `?estado=${filtroReservas}`;
    const lista = await intentar(() => api.get(`reservas${filtro}`));
    if (!lista) return;
    reservas = lista;
    actualizarGloboReservas();

    const dias = new Map();
    for (const r of lista) {
      if (!dias.has(r.fecha)) dias.set(r.fecha, []);
      dias.get(r.fecha).push(r);
    }
    const vacio = { pendiente: 'No hay solicitudes por confirmar', confirmada: 'No hay reservas confirmadas', todas: 'No hay reservas desde hoy' }[filtroReservas];

    $('#lista-reservas').innerHTML = [...dias.entries()].map(([fecha, rs]) => {
      const personas = rs.filter((r) => !['rechazada', 'cancelada', 'no_presentado'].includes(r.estado)).reduce((s, r) => s + r.comensales, 0);
      return `
        <section class="dia-reservas">
          <h3>${esc(fechaReserva(fecha))} <small>${rs.length} ${rs.length === 1 ? 'reserva' : 'reservas'} · ${personas} personas</small></h3>
          ${rs.map(tarjetaReserva).join('')}
        </section>`;
    }).join('') || `<p class="vacio-tpv">${vacio}</p>`;
  }

  function tarjetaReserva(r) {
    const tel = r.telefono.replace(/[^\d+]/g, '');
    const yaPaso = new Date(`${r.fecha}T${r.hora}`) <= new Date();
    const acciones = {
      pendiente: `<button class="btn btn--peligro" data-res="rechazada">Rechazar</button>
                  <button class="btn btn--acento" data-res="confirmada">Confirmar</button>`,
      confirmada: yaPaso
        ? '<button class="btn btn--peligro" data-res="no_presentado">No se presentó</button>'
        : '<button class="btn btn--peligro" data-res="cancelada">Cancelar</button>',
    }[r.estado] || '';
    const gestion = r.anulada_por_cliente
      ? `Cancelada por el cliente desde el correo ${haceCuanto(r.gestionada)}`
      : r.gestionada_por
        ? `${{ confirmada: 'Confirmada', rechazada: 'Rechazada', cancelada: 'Cancelada', no_presentado: 'Marcada «no se presentó»' }[r.estado]} por ${esc(r.gestionada_por.split(' ')[0])} ${haceCuanto(r.gestionada)}`
        : `Solicitada ${haceCuanto(r.creada)} desde la web`;
    return `
      <article class="reserva reserva--${r.estado}" data-id="${r.id}">
        <div class="reserva__hora num">${esc(r.hora)}</div>
        <div class="reserva__datos">
          <div class="reserva__titulo">
            <strong>${esc(r.nombre)}</strong>
            <span class="chip-r num">${r.comensales} ${r.comensales === 1 ? 'persona' : 'personas'}</span>
            ${r.zona ? `<span class="chip-r chip-r--zona">${esc(r.zona)}</span>` : ''}
            ${r.mesa ? `<span class="chip-r chip-r--mesa">${esc(r.mesa)}</span>` : ''}
            <span class="etiqueta-reserva etiqueta-reserva--${r.estado}">${esc(r.estado === 'no_presentado' ? 'no se presentó' : r.estado)}</span>
          </div>
          <div class="reserva__contacto">
            <a href="tel:${esc(tel)}">☎ ${esc(r.telefono)}</a>
            <a href="mailto:${esc(r.email)}">✉ ${esc(r.email)}</a>
          </div>
          ${r.comentarios ? `<p class="reserva__comentario">«${esc(r.comentarios)}»</p>` : ''}
          <small class="reserva__meta">${gestion} · nº ${r.id}</small>
        </div>
        <div class="reserva__acciones">${acciones}</div>
      </article>`;
  }

  async function accionReserva(id, estado) {
    const r = reservas.find((x) => x.id === id);
    if (!r) return;
    let datos = { estado };

    if (estado === 'confirmada') {
      const [mesas, ocupadas] = await Promise.all([
        E.mesas.length ? E.mesas : intentar(() => api.get('mesas')),
        intentar(() => api.get(`reservas/mesas-ocupadas?fecha=${r.fecha}&hora=${r.hora}`)),
      ]);
      if (!mesas || !ocupadas) return;
      E.mesas = mesas;
      // Mesas que ya tienen reserva confirmada en este turno: no se pueden volver a reservar
      const reservada = new Map(ocupadas.filter((o) => o.id !== r.id).map((o) => [o.id_mesa, o]));
      // Primero las libres de la zona pedida con sitio suficiente
      const encaja = (m) => m.comensales >= r.comensales;
      const orden = [...mesas].sort((a, b) =>
        reservada.has(a.id) - reservada.has(b.id) || (b.salon === r.zona) - (a.salon === r.zona)
        || encaja(b) - encaja(a) || a.comensales - b.comensales || a.id - b.id);
      $('#reserva-resumen').textContent =
        `${r.nombre} · ${r.comensales} personas · ${fechaReserva(r.fecha).toLowerCase()} a las ${r.hora}${r.zona ? ` · prefiere ${r.zona}` : ''}. ` +
        '¿Has hablado con el cliente para comprobarla?';
      $('#reserva-mesa').innerHTML = '<option value="">Sin asignar todavía</option>' + orden.map((m) => {
        const o = reservada.get(m.id);
        return o
          ? `<option value="${m.id}" disabled>${esc(m.nombre)} · reservada ${esc(o.hora)} (${esc(o.nombre.split(' ')[0])})</option>`
          : `<option value="${m.id}">${esc(m.nombre)} · ${m.comensales} plazas${encaja(m) ? '' : ' (pequeña)'}</option>`;
      }).join('');
      const dlg = $('#dlg-reserva');
      dlg.returnValue = '';
      dlg.showModal();
      const ok = await new Promise((res) => dlg.addEventListener('close', () => res(dlg.returnValue === 'si'), { once: true }));
      if (!ok) return;
      if ($('#reserva-mesa').value) datos.id_mesa = Number($('#reserva-mesa').value);
    } else {
      const textos = {
        rechazada: [`¿Rechazar la solicitud de ${r.nombre}?`,
          `Se enviará un correo a ${r.email} indicando que no ha sido posible realizar la reserva por aforo completo.`, 'Rechazar'],
        cancelada: [`¿Cancelar la reserva de ${r.nombre}?`, 'La mesa quedará libre para ese horario.', 'Cancelar reserva'],
        no_presentado: [`¿${r.nombre} no se ha presentado?`,
          'Pasará a la lista negra: no podrá reservar por la web y recibirá un SMS pidiéndole que llame al restaurante.', 'Marcar no presentado'],
      }[estado];
      if (!(await confirmar(...textos))) return;
    }

    const res = await intentar(() => api.patch(`reservas/${id}`, datos));
    if (!res) return;
    if (estado === 'no_presentado') {
      avisar(textoSms(res.lista_negra?.sms_estado, r.telefono), res.lista_negra?.sms_estado === 'error' ? 'error' : 'ok');
    } else {
      avisar({ confirmada: 'Reserva confirmada', rechazada: 'Solicitud rechazada y cliente avisado', cancelada: 'Reserva cancelada' }[estado]);
    }
    cargarReservas();
  }

  /* --- Lista negra ----------------------------------------------------- */
  const MOTIVOS = { no_presentado: 'No se presentó', anulacion_tardia: 'Anuló a última hora' };
  const textoSms = (estado, tel) => ({
    enviado: 'Añadido a la lista negra · SMS enviado',
    sin_configurar: `Añadido a la lista negra · SMS no configurado: llama al ${tel}`,
    error: `Añadido a la lista negra · el SMS falló: llama al ${tel}`,
  }[estado] || 'Añadido a la lista negra');

  async function cargarListaNegra() {
    const lista = await intentar(() => api.get('lista-negra'));
    if (!lista) return;
    const sms = (e) => ({
      enviado: `<span class="chip-r chip-r--mesa">SMS enviado ${haceCuanto(e.sms_fecha)}</span>`,
      sin_configurar: '<span class="chip-r chip-r--aviso">SMS pendiente: llamar</span>',
      error: '<span class="chip-r chip-r--error">SMS fallido: llamar</span>',
      pendiente: '<span class="chip-r chip-r--aviso">SMS pendiente</span>',
    }[e.sms_estado]);
    $('#lista-reservas').innerHTML = lista.length ? `
      <section class="dia-reservas">
        <h3>Lista negra <small>${lista.length} ${lista.length === 1 ? 'cliente' : 'clientes'} · no pueden reservar por la web</small></h3>
        ${lista.map((e) => `
          <article class="reserva reserva--negra" data-ln="${e.id}">
            <div class="reserva__hora">⛔</div>
            <div class="reserva__datos">
              <div class="reserva__titulo">
                <strong>${esc(e.nombre)}</strong>
                <span class="chip-r chip-r--error">${MOTIVOS[e.motivo]}</span>
                ${sms(e)}
              </div>
              <div class="reserva__contacto">
                ${e.telefono ? `<a href="tel:${esc(e.telefono.replace(/[^\d+]/g, ''))}">☎ ${esc(e.telefono)}</a>` : ''}
                ${e.email ? `<a href="mailto:${esc(e.email)}">✉ ${esc(e.email)}</a>` : ''}
              </div>
              <small class="reserva__meta">
                ${e.reserva_fecha ? `Reserva del ${esc(new Date(`${e.reserva_fecha}T12:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }))} a las ${esc(e.reserva_hora)} · ` : ''}
                Añadido ${haceCuanto(e.creada)}${e.marcado_por ? ` por ${esc(e.marcado_por.split(' ')[0])}` : ' automáticamente'}
              </small>
            </div>
            <div class="reserva__acciones">
              ${e.sms_estado !== 'enviado' ? '<button class="btn btn--fantasma" data-ln-acc="sms">Reintentar SMS</button>' : ''}
              <button class="btn btn--fantasma" data-ln-acc="quitar">Quitar de la lista</button>
            </div>
          </article>`).join('')}
      </section>` : '<p class="vacio-tpv">La lista negra está vacía</p>';
  }

  async function accionListaNegra(id, acc) {
    const nombre = $(`[data-ln="${id}"] strong`)?.textContent || 'el cliente';
    if (acc === 'quitar') {
      if (!(await confirmar(`¿Quitar a ${nombre} de la lista negra?`, 'Podrá volver a reservar por la web.', 'Quitar de la lista'))) return;
      if ((await intentar(() => api.borrar(`lista-negra/${id}`))) === undefined) return;
      avisar(`${nombre} ya puede reservar por la web`);
    } else if (acc === 'sms') {
      const r = await intentar(() => api.post(`lista-negra/${id}/sms`));
      if (!r) return;
      avisar({ enviado: 'SMS enviado', sin_configurar: 'No hay proveedor de SMS configurado: llama al cliente', error: 'El SMS ha fallado: llama al cliente' }[r.sms_estado],
        r.sms_estado === 'enviado' ? 'ok' : 'error');
    }
    cargarListaNegra();
  }

  /* ==================================================================
     Refresco periódico
     ================================================================== */
  let temporizador;
  function refrescoGeneral() {
    clearInterval(temporizador);
    actualizarVentas();
    actualizarGloboReservas();
    listosVistos = null;   // el primer repaso no avisa de lo que ya estaba listo
    revisarListos();
    if (E.vista !== 'cocina') intentar(pedirCocina).then((l) => l && actualizarGlobo(l));
    temporizador = setInterval(async () => {
      if (!E.usuario || document.hidden) return;
      if (E.vista === 'sala') cargarMesas();
      if (E.vista === 'reservas') cargarReservas(); else actualizarGloboReservas();
      revisarListos();
      if (E.vista === 'cocina') cargarCocina();
      else intentar(pedirCocina).then((l) => l && actualizarGlobo(l));
      if (E.vista === 'pedido' && E.pedido?.id) {
        const p = E.pedido;
        enCola(async () => {
          try {
            const r = await api.get(`pedidos/${p.id}`);
            if (E.pedido === p) { Object.assign(p, r); pintarTicket(); }
          } catch { /* se reintenta en el siguiente ciclo */ }
        });
      }
      actualizarVentas();
    }, REFRESCO_MS);
  }

  /* ==================================================================
     Eventos
     ================================================================== */
  $('#filtro-rango').addEventListener('click', (e) => {
    const b = e.target.closest('[data-grupo]');
    if (!b) return;
    E.grupo = b.dataset.grupo;
    $$('#filtro-rango button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    pintarEmpleados();
  });
  $('#empleados').addEventListener('click', (e) => {
    const b = e.target.closest('.empleado');
    if (b) elegirEmpleado(Number(b.dataset.id));
  });
  $('#volver-empleado').addEventListener('click', volverAEmpleados);
  $('#teclado').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.type === 'submit') return;
    const input = $('#pin-input');
    input.value = b.dataset.accion === 'borrar' ? input.value.slice(0, -1) : input.value + b.textContent;
    $('#pin-error').textContent = '';
    pintarPuntos();
    input.focus();
  });
  $('#pin-input').addEventListener('input', () => { $('#pin-error').textContent = ''; pintarPuntos(); });
  $('#paso-pin').addEventListener('click', (e) => { if (!e.target.closest('button')) $('#pin-input').focus(); });
  $('#form-pin').addEventListener('submit', login);

  $('#pestanas').addEventListener('click', (e) => {
    const b = e.target.closest('[data-vista]');
    if (b) irA(b.dataset.vista);
  });
  $('#btn-salir').addEventListener('click', async () => {
    if (await confirmar('¿Cerrar sesión?', `Saldrás como ${E.usuario.nombre}.`, 'Cerrar sesión')) salirSinPreguntar();
  });

  $('#salones').addEventListener('click', (e) => {
    const b = e.target.closest('[data-salon]');
    if (!b || b.dataset.salon === E.salon) return;
    if (E.editando) {
      avisar('Guarda o cancela la distribución antes de cambiar de salón', 'error');
      return;
    }
    E.salon = b.dataset.salon;
    $$('#salones button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    pintarMesas();
  });

  // Plano: tocar una mesa la abre; en modo edición se selecciona y se arrastra
  const plano = $('#plano');
  const idDeUid = (uid) => Number(String(uid).replace(/^m/, ''));
  plano.addEventListener('click', (e) => {
    if (ignorarClick) { ignorarClick = false; return; }
    const g = e.target.closest('.mesa-plano');
    if (!E.editando && g) abrirMesa(idDeUid(g.dataset.uid));
    if (E.editando && !g && E.seleccion) { E.seleccion = null; pintarMesas(); }
  });
  plano.addEventListener('pointerdown', empezarArrastre);
  plano.addEventListener('pointermove', moverArrastre);
  plano.addEventListener('pointerup', terminarArrastre);
  plano.addEventListener('pointercancel', terminarArrastre);
  plano.addEventListener('lostpointercapture', terminarArrastre);
  plano.addEventListener('keydown', (e) => {
    const g = e.target.closest('.mesa-plano');
    if (!g) return;
    if (!E.editando && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      abrirMesa(idDeUid(g.dataset.uid));
      return;
    }
    // En edición: las flechas mueven la mesa enfocada
    const delta = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[e.key];
    if (!E.editando || !delta) return;
    e.preventDefault();
    const m = E.borrador.find((x) => x.uid === g.dataset.uid);
    const { x, y } = Plano.limitar(m, tipoSalon(), m.pos_x + delta[0], m.pos_y + delta[1]);
    Object.assign(m, { pos_x: x, pos_y: y });
    E.seleccion = m.uid;
    pintarMesas();
    plano.querySelector(`[data-uid="${m.uid}"]`)?.focus();
  });

  $('#btn-editar-plano').addEventListener('click', entrarEdicion);
  $('#editor-plano').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ed]');
    if (b && !b.disabled) accionEditor(b.dataset.ed);
  });

  $('#volver-sala').addEventListener('click', () => irA('sala'));
  $('#generos').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    E.genero = Number(b.dataset.id);
    $('#buscar-plato').value = '';
    pintarGeneros();
    pintarBotonera();
  });
  $('#buscar-plato').addEventListener('input', () => { pintarGeneros(); pintarBotonera(); });
  $('#botonera').addEventListener('click', (e) => {
    const b = e.target.closest('.boton-plato');
    if (b && !b.disabled) anadirPlato(Number(b.dataset.id), b);
  });
  $('#lineas').addEventListener('click', (e) => {
    const m = e.target.closest('[data-marchar]');
    if (m) { marcharPase(Number(m.dataset.marchar)); return; }
    const li = e.target.closest('.linea');
    if (!li) return;
    const id = Number(li.dataset.id);
    const acc = e.target.closest('[data-acc]')?.dataset.acc;
    if (acc) { accionLinea(acc, id); return; }
    E.lineaSel = E.lineaSel === id ? null : id;
    pintarTicket();
  });
  $('#ticket-acciones').addEventListener('click', (e) => {
    const b = e.target.closest('[data-acc]');
    if (b && !b.disabled) accionPedido(b.dataset.acc);
  });

  $('#formas').addEventListener('change', actualizarCobro);
  $('#entregado').addEventListener('input', actualizarCobro);
  $('#rapidos').addEventListener('click', (e) => {
    const b = e.target.closest('[data-valor]');
    if (!b) return;
    $('#entregado').value = Number(b.dataset.valor).toFixed(2);
    actualizarCobro();
  });
  $('#dlg-cobro').addEventListener('close', () => {
    if ($('#dlg-cobro').returnValue === 'cobrar') confirmarCobro();
  });
  $('#notas-rapidas').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const campo = $('#nota-texto');
    campo.value = campo.value ? `${campo.value}, ${b.textContent.toLowerCase()}` : b.textContent;
    campo.focus();
  });

  // Enter dentro de un diálogo = botón principal (no el primero, que es «Cancelar»)
  for (const dlg of $$('dialog')) {
    dlg.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
      e.preventDefault();
      const principal = dlg.querySelector('.btn--acento');
      if (principal && !principal.disabled) principal.click();
    });
  }

  $('#ver-espera').addEventListener('change', cargarCocina);
  $('#cocina').addEventListener('click', (e) => {
    const b = e.target.closest('.item-cocina');
    if (b && !b.disabled) avanzarCocina(b);
  });
  $('#btn-informe-x').addEventListener('click', async () => { await cargarCaja(); if (informeX) imprimirInforme(informeX); });
  $('#btn-cierre-z').addEventListener('click', cierreZ);
  // Total escrito a mano: se olvida el desglose por monedas
  $('#arqueo-contado').addEventListener('input', () => {
    conteo = {};
    $$('#arqueo-monedas input').forEach((i) => { i.value = ''; });
    actualizarArqueo();
  });
  // Recuento por billetes y monedas
  $('#arqueo-monedas').addEventListener('input', (e) => {
    const inp = e.target.closest('input[data-valor]');
    if (!inp) return;
    conteo[inp.dataset.valor] = Math.max(0, parseInt(inp.value, 10) || 0);
    const total = Object.entries(conteo).reduce((s, [v, n]) => s + Number(v) * n, 0);
    $('#arqueo-contado').value = total ? total.toFixed(2) : '';
    actualizarArqueo();
  });
  $('#tabla-cierres').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-cierre]');
    if (!b) return;
    const z = await intentar(() => api.get(`caja/cierres/${b.dataset.cierre}`));
    if (z) imprimirInforme(z);
  });

  $('#filtro-reservas').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filtro]');
    if (!b) return;
    filtroReservas = b.dataset.filtro;
    $$('#filtro-reservas button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    cargarReservas();
  });
  $('#lista-reservas').addEventListener('click', (e) => {
    const b = e.target.closest('[data-res]');
    if (b) accionReserva(Number(b.closest('.reserva').dataset.id), b.dataset.res);
    const l = e.target.closest('[data-ln-acc]');
    if (l) accionListaNegra(Number(l.closest('[data-ln]').dataset.ln), l.dataset.lnAcc);
  });

  /* ==================================================================
     Arranque
     ================================================================== */
  for (const el of $$('.marca-tpv')) el.insertAdjacentHTML('afterbegin', LOGO_SVG);
  localStorage.removeItem('tpv-tema');   // preferencia del antiguo modo oscuro, ya no se usa
  reloj();
  setInterval(reloj, 15000);

  api.get('auth/yo').then(entrar).catch(mostrarAcceso);
})();
