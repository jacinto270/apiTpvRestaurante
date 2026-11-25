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
  const GENEROS_BEBIDA = ['bebidas', 'vinos', 'cervezas'];
  const NOTAS_RAPIDAS = ['Sin sal', 'Sin gluten', 'Sin cebolla', 'Poco hecho', 'Al punto', 'Muy hecho', 'Para compartir', 'Sacar después'];
  const REFRESCO_MS = 12000;

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
    for (const v of ['sala', 'pedido', 'cocina', 'caja']) {
      $(`#vista-${v}`).classList.toggle('oculto', v !== vista);
    }
    if (vista === 'sala') cargarMesas();
    if (vista === 'cocina') cargarCocina();
    if (vista === 'caja') cargarCaja();
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
    $('#n-libres').textContent = mesas.filter((m) => !m.pedido).length;
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
  }


  async function abrirMesa(idMesa) {
    const m = E.mesas.find((x) => x.id === idMesa);
    if (!m) return;
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
    $('#lineas').innerHTML = p.lineas.length ? p.lineas.map((l) => `
      <li class="linea ${l.id === E.lineaSel ? 'seleccionada' : ''}" data-id="${l.id}">
        <span class="linea__cant num">${l.cantidad}×</span>
        <span class="linea__nombre">${esc(l.plato)}</span>
        <span class="linea__importe num">${euros(l.subtotal)}</span>
        ${l.notas ? `<span class="linea__nota">${esc(l.notas)}</span>` : ''}
        <span class="linea__estado linea__estado--${l.estado.replace(' ', '-')}">${esc(l.estado)}</span>
        <div class="linea__controles">
          <button class="mini" data-acc="menos" ${!editable || l.cantidad < 2 ? 'disabled' : ''} aria-label="Uno menos">−</button>
          <button class="mini" data-acc="mas" ${!editable ? 'disabled' : ''} aria-label="Uno más">+</button>
          <button class="mini" data-acc="nota" ${!editable ? 'disabled' : ''}>Nota</button>
          ${l.estado !== 'servido' ? '<button class="mini" data-acc="servido">Servido</button>' : ''}
          <button class="mini mini--peligro" data-acc="quitar" ${!editable ? 'disabled' : ''}>Quitar</button>
        </div>
      </li>`).join('')
      : `<li class="ticket__vacio"><div><p>Mesa sin consumiciones</p>Toca un plato para empezar el pedido</div></li>`;

    $('#ticket-total').textContent = euros(p.total);

    const vacio = !p.lineas.length;
    const acc = $('#ticket-acciones');
    if (p.estado === 'nuevo') {
      acc.innerHTML = '<button class="btn btn--acento ancho" disabled>Cobrar</button>';
    } else {
      acc.innerHTML = `
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

    if (acc === 'cuenta' || acc === 'reabrir') {
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
  function idsBebida() {
    return E.generos.filter((g) => GENEROS_BEBIDA.includes(normal(g.nombre))).map((g) => g.id);
  }

  async function pedirCocina() {
    const excluir = $('#ver-bebidas').checked ? '' : `?excluir_generos=${idsBebida().join(',')}`;
    return api.get(`cocina${excluir}`);
  }

  async function cargarCocina() {
    const lineas = await intentar(pedirCocina);
    if (!lineas) return;
    actualizarGlobo(lineas);
    if (E.vista !== 'cocina') return;

    const comandas = new Map();
    for (const l of lineas) {
      if (!comandas.has(l.id_pedido)) comandas.set(l.id_pedido, { mesa: l.mesa, fecha: l.fecha, lineas: [] });
      comandas.get(l.id_pedido).lineas.push(l);
    }
    $('#cocina').innerHTML = [...comandas.entries()].map(([id, c], i) => {
      const min = minutosDesde(c.fecha);
      return `
        <article class="comanda-cocina" style="animation-delay:${Math.min(i, 10) * 30}ms">
          <header class="comanda-cocina__cabecera">
            <strong>${esc(c.mesa)}</strong>
            <span class="comanda-cocina__tiempo num ${min >= 25 ? 'tarde' : min >= 12 ? 'medio' : ''}">${min} min · nº ${id}</span>
          </header>
          <ul>${c.lineas.map((l) => `
            <li><button class="item-cocina item-cocina--${l.estado.replace(' ', '-')}" data-id="${l.id}" data-estado="${l.estado}">
              <b class="num">${l.cantidad}</b>
              <span class="item-cocina__plato">${esc(l.plato)}</span>
              <span class="item-cocina__accion">${l.estado === 'pendiente' ? 'Empezar' : 'Listo ✓'}</span>
              ${l.notas ? `<span class="item-cocina__nota">${esc(l.notas)}</span>` : ''}
            </button></li>`).join('')}
          </ul>
        </article>`;
    }).join('') || '<p class="vacio-tpv">No hay comandas pendientes</p>';
  }

  function actualizarGlobo(lineas) {
    const n = lineas.filter((l) => l.estado === 'pendiente').length;
    $('#globo-cocina').textContent = n;
    $('#globo-cocina').classList.toggle('oculto', !n);
  }

  async function avanzarCocina(boton) {
    const siguiente = boton.dataset.estado === 'pendiente' ? 'en cocina' : 'servido';
    boton.disabled = true;
    const r = await intentar(() => api.patch(`lineas/${boton.dataset.id}`, { estado: siguiente }));
    if (r) cargarCocina(); else boton.disabled = false;
  }

  /* ==================================================================
     Caja
     ================================================================== */
  const hoyISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  async function cargarCaja() {
    const fecha = $('#caja-fecha').value || hoyISO();
    $('#caja-fecha').value = fecha;
    const [r, pedidos] = await Promise.all([
      intentar(() => api.get(`resumen?fecha=${fecha}`)),
      intentar(() => api.get(`pedidos?desde=${fecha}&hasta=${fecha}&limite=200`)),
    ]);
    if (!r || !pedidos) return;

    $('#kpis').innerHTML = [
      ['Ventas cobradas', euros(r.ventas), true],
      ['Pedidos cobrados', r.pedidos],
      ['Ticket medio', euros(r.ticket_medio)],
      ['En curso ahora', `${euros(r.en_curso)}`],
    ].map(([t, v, d]) => `<div class="kpi ${d ? 'kpi--destacado' : ''}"><span>${t}</span><strong class="num">${v}</strong></div>`).join('');

    $('#ranking').innerHTML = r.mas_vendidos.map((p) =>
      `<li><span>${esc(p.nombre)}<small class="num">${p.unidades_vendidas} uds.</small></span><span class="num">${euros(p.importe)}</span></li>`
    ).join('') || '<li class="sin-datos">Todavía no hay ventas</li>';

    const max = Math.max(...r.por_tipo_pago.map((t) => t.importe), 1);
    $('#formas-pago').innerHTML = r.por_tipo_pago.map((t) => `
      <div class="barra-pago">
        <div class="barra-pago__fila"><span>${esc(t.tipo_pago)} <small class="sin-datos">· ${t.pedidos}</small></span><strong class="num">${euros(t.importe)}</strong></div>
        <div class="barra-pago__pista"><i style="width:${(t.importe / max) * 100}%"></i></div>
      </div>`).join('') || '<p class="sin-datos">Todavía no hay cobros</p>';

    $('#tabla-pedidos').innerHTML = pedidos.length ? `
      <thead><tr><th>Nº</th><th>Hora</th><th>Mesa</th><th>Atendido por</th><th>Estado</th><th>Pago</th><th class="der">Total</th></tr></thead>
      <tbody>${pedidos.map((p) => `
        <tr>
          <td class="num">${p.id}</td>
          <td class="num">${horaDe(p.fecha)}</td>
          <td>${esc(p.mesa)}</td>
          <td>${esc(p.personal)}</td>
          <td><span class="etiqueta-estado etiqueta-estado--${p.estado}">${esc(p.estado)}</span></td>
          <td style="text-transform:capitalize">${esc(p.tipo_pago || '—')}</td>
          <td class="der num">${euros(p.total)}</td>
        </tr>`).join('')}</tbody>`
      : '<tbody><tr><td class="sin-datos">No hay pedidos este día</td></tr></tbody>';
  }

  async function actualizarVentas() {
    try {
      const r = await api.get('resumen');
      $('#ventas-hoy').textContent = euros(r.ventas);
    } catch { /* silencioso */ }
  }

  /* ==================================================================
     Refresco periódico
     ================================================================== */
  let temporizador;
  function refrescoGeneral() {
    clearInterval(temporizador);
    actualizarVentas();
    if (E.vista !== 'cocina') intentar(pedirCocina).then((l) => l && actualizarGlobo(l));
    temporizador = setInterval(async () => {
      if (!E.usuario || document.hidden) return;
      if (E.vista === 'sala') cargarMesas();
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

  $('#ver-bebidas').addEventListener('change', cargarCocina);
  $('#cocina').addEventListener('click', (e) => {
    const b = e.target.closest('.item-cocina');
    if (b && !b.disabled) avanzarCocina(b);
  });
  $('#caja-fecha').addEventListener('change', cargarCaja);

  /* ==================================================================
     Arranque
     ================================================================== */
  for (const el of $$('.marca-tpv')) el.insertAdjacentHTML('afterbegin', LOGO_SVG);
  localStorage.removeItem('tpv-tema');   // preferencia del antiguo modo oscuro, ya no se usa
  reloj();
  setInterval(reloj, 15000);

  api.get('auth/yo').then(entrar).catch(mostrarAcceso);
})();
