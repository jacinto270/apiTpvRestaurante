/* =====================================================================
   Formulario de reserva — GET /reservas/reto y POST /reservas
   ===================================================================== */
(() => {
  const form = document.querySelector('#form-reserva');
  if (!form) return;
  const $ = (s) => document.querySelector(s);
  const campo = (n) => form.elements[n];

  let reto = null;
  let maxComensales = 12;
  let horas = [];

  const fechaLarga = (iso) => new Date(`${iso}T12:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  /* --- Pregunta de verificación y horarios ---------------------------- */
  async function pedirReto() {
    $('#pregunta').textContent = '…';
    campo('reto_respuesta').value = '';
    try {
      reto = await api.get('reservas/reto');
    } catch (e) {
      $('#pregunta').textContent = 'no disponible';
      mostrarError('No se puede reservar ahora mismo. Inténtalo más tarde o llámanos.');
      return;
    }
    $('#pregunta').textContent = reto.pregunta;
    horas = reto.horas;
    maxComensales = reto.max_comensales;
    $('#max-comensales').textContent = maxComensales;
    $('#dias-max').textContent = Math.round((new Date(reto.fecha_max) - new Date(reto.fecha_min)) / 86400000);
    campo('fecha').min = reto.fecha_min;
    campo('fecha').max = reto.fecha_max;
    pintarHoras();
    pintarComensales();
    if (!diasCompletosCargados) { diasCompletosCargados = true; consultarDiasCompletos(); }
  }

  /** Horas del turno; si la fecha es hoy, solo las que quedan con 1 h de margen. */
  function pintarHoras() {
    const fecha = campo('fecha').value;
    const elegida = campo('hora').value;
    const ahora = new Date();
    const esHoy = fecha && fecha === reto?.fecha_min;
    const libres = horas.filter((h) => !esHoy || new Date(`${fecha}T${h}`) - ahora >= 3600000);
    // Turno completo según la disponibilidad del día elegido
    const turnoDe = (h) => disponibilidad?.fecha === fecha && disponibilidad.turnos.find((t) => h >= t.desde && h <= t.hasta);
    const completa = (h) => !!turnoDe(h)?.completo;
    const opcion = (h) => (completa(h)
      ? `<option disabled>${h} · aforo completo</option>`
      : `<option${h === elegida ? ' selected' : ''}>${h}</option>`);
    const grupo = (t, lista) => {
      if (!lista.length) return '';
      const llena = lista.every(completa);
      return `<optgroup label="${t}${llena ? ' · aforo completo' : ''}">${lista.map(opcion).join('')}</optgroup>`;
    };
    const comida = libres.filter((h) => h < '17:00');
    const cena = libres.filter((h) => h >= '17:00');
    const hayHueco = libres.some((h) => !completa(h));
    campo('hora').innerHTML = `<option value="">${!libres.length ? 'Sin horas hoy' : hayHueco ? 'Elige hora' : 'Sin plazas libres'}</option>`
      + grupo('Comida', comida) + grupo('Cena', cena);
  }

  /* --- Aforo: disponibilidad del día y días completos ----------------- */
  let disponibilidad = null;
  let diasCompletosCargados = false;

  async function consultarDisponibilidad() {
    const fecha = campo('fecha').value;
    const aviso = $('#aviso-aforo');
    const enviar = $('#enviar-reserva');
    if (!fecha) {
      disponibilidad = null;
      aviso.classList.add('oculto');
      enviar.disabled = false;
      pintarHoras();
      return;
    }
    try {
      disponibilidad = await api.get(`reservas/disponibilidad?fecha=${fecha}&comensales=${campo('comensales').value}`);
    } catch {
      disponibilidad = null;   // si falla, el servidor lo volverá a comprobar al enviar
    }
    if (disponibilidad?.fecha !== campo('fecha').value) return;   // el usuario ya cambió de fecha
    pintarHoras();

    const completos = disponibilidad?.turnos.filter((t) => t.completo) || [];
    aviso.classList.toggle('aviso-aforo--lleno', !!disponibilidad?.completa);
    if (disponibilidad?.completa) {
      aviso.textContent = `Fecha no disponible por aforo completo. Elige otro día${Number(campo('comensales').value) > 1 ? ' o prueba con menos comensales' : ''}.`;
    } else if (completos.length) {
      aviso.textContent = `La ${completos.map((t) => t.turno).join(' y la ')} de ese día tiene el aforo completo. Quedan horas en el otro turno.`;
    }
    aviso.classList.toggle('oculto', !completos.length);
    enviar.disabled = !!disponibilidad?.completa;
    campo('fecha').setAttribute('aria-invalid', String(!!disponibilidad?.completa));
  }

  async function consultarDiasCompletos() {
    const caja = $('#dias-completos');
    try {
      const { completas } = await api.get(`reservas/disponibilidad?comensales=${campo('comensales').value}`);
      const corta = (iso) => new Date(`${iso}T12:00`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
      caja.textContent = completas.length
        ? `Sin plazas (aforo completo): ${completas.slice(0, 8).map(corta).join(' · ')}${completas.length > 8 ? '…' : ''}`
        : '';
      caja.classList.toggle('oculto', !completas.length);
    } catch { caja.classList.add('oculto'); }
  }

  let esperaAforo;
  const revisarAforo = () => {
    clearTimeout(esperaAforo);
    esperaAforo = setTimeout(() => { consultarDisponibilidad(); consultarDiasCompletos(); }, 250);
  };

  function pintarComensales() {
    const n = Number(campo('comensales').value);
    campo('comensales_vista').value = n;
    form.querySelector('[data-paso="-1"]').disabled = n <= 1;
    form.querySelector('[data-paso="1"]').disabled = n >= maxComensales;
  }

  /* --- Validación en el navegador (el servidor vuelve a comprobarlo todo) */
  function validar() {
    const errores = [];
    const marca = (n, mal) => campo(n).setAttribute('aria-invalid', String(!!mal));
    const v = (n) => campo(n).value.trim();

    marca('fecha', !v('fecha'));
    marca('hora', !v('hora'));
    marca('nombre', v('nombre').length < 2);
    marca('telefono', v('telefono').replace(/\D/g, '').length < 9);
    marca('email', !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v('email')));
    marca('reto_respuesta', !/^\d+$/.test(v('reto_respuesta')));

    if (!v('fecha') || !v('hora')) errores.push('elige fecha y hora');
    if (v('nombre').length < 2) errores.push('escribe tu nombre');
    if (v('telefono').replace(/\D/g, '').length < 9) errores.push('revisa el teléfono');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v('email'))) errores.push('revisa el correo');
    if (!/^\d+$/.test(v('reto_respuesta'))) errores.push('responde a la pregunta de verificación');
    if (!campo('acepta_privacidad').checked) errores.push('acepta el uso de tus datos');

    if (errores.length) {
      mostrarError(`Para continuar, ${errores.join(', ')}.`);
      form.querySelector('[aria-invalid="true"]')?.focus();
      return false;
    }
    return true;
  }

  function mostrarError(texto) { $('#error-reserva').textContent = texto; }

  /* --- Envío ---------------------------------------------------------- */
  async function enviar(e) {
    e.preventDefault();
    mostrarError('');
    if (!reto || !validar()) return;

    const datos = {
      nombre: campo('nombre').value.trim(),
      email: campo('email').value.trim(),
      telefono: campo('telefono').value.trim(),
      fecha: campo('fecha').value,
      hora: campo('hora').value,
      comensales: Number(campo('comensales').value),
      zona: form.querySelector('[name="zona"]:checked')?.value || null,
      comentarios: campo('comentarios').value.trim() || null,
      acepta_privacidad: campo('acepta_privacidad').checked,
      reto_token: reto.token,
      reto_respuesta: campo('reto_respuesta').value.trim(),
      web: campo('web').value,
    };

    const boton = $('#enviar-reserva');
    boton.disabled = true;
    boton.textContent = 'Enviando…';
    try {
      const r = await api.post('reservas', datos);
      confirmar(datos, r);
    } catch (err) {
      mostrarError(err.message);
      if (/verificación|pregunta/i.test(err.message)) campo('reto_respuesta').setAttribute('aria-invalid', 'true');
    } finally {
      boton.disabled = false;
      boton.textContent = 'Solicitar reserva';
      pedirReto();   // cada pregunta vale para un solo intento
    }
  }

  function confirmar(d, r = {}) {
    const resumen = `${d.comensales} ${d.comensales === 1 ? 'persona' : 'personas'} el ${fechaLarga(d.fecha)} a las ${d.hora}`;
    if (r.verificar) {
      mostrarPanel('Revisa tu correo', `Casi está, ${d.nombre.split(' ')[0]}`,
        `Te hemos enviado un correo a ${d.email} con un código de 6 cifras. Escríbelo aquí o pulsa el botón del correo ` +
        `para confirmar tu solicitud para ${resumen}. Caduca en 24 horas; si no lo ves, mira en la carpeta de spam.`, '✉');
      pedirCodigo(r.id);
    } else {
      mostrarPanel('Solicitud recibida', `Gracias, ${d.nombre.split(' ')[0]}`,
        `Hemos recibido tu solicitud para ${resumen}. Te llamaremos al ${d.telefono} o escribiremos a ${d.email} ` +
        'para confirmarla. Hasta entonces la reserva no es firme.');
    }
  }

  /* --- Verificación con el código de 6 cifras del correo -------------- */
  const formCodigo = $('#form-codigo');
  let idPorVerificar = null;

  function pedirCodigo(id) {
    idPorVerificar = id;
    formCodigo.reset();
    $('#error-codigo').textContent = '';
    formCodigo.classList.remove('oculto');
    formCodigo.elements.codigo.focus();
  }

  formCodigo.addEventListener('submit', async (e) => {
    e.preventDefault();
    const codigo = formCodigo.elements.codigo.value.replace(/\D/g, '');
    if (codigo.length !== 6) {
      $('#error-codigo').textContent = 'El código tiene 6 cifras.';
      return;
    }
    const boton = formCodigo.querySelector('button');
    boton.disabled = true;
    try {
      const r = await api.post('reservas/verificar', { id: idPorVerificar, codigo });
      verificada(r);
    } catch (err) {
      $('#error-codigo').textContent = err.message;
      if (err.estado === 410) formCodigo.querySelector('input').disabled = true;
    } finally {
      boton.disabled = false;
    }
  });

  function verificada(r) {
    mostrarPanel('Correo verificado', `¡Gracias, ${r.nombre}!`,
      `Tu solicitud para ${r.comensales} ${r.comensales === 1 ? 'persona' : 'personas'} el ${fechaLarga(r.fecha)} a las ${r.hora} ` +
      'ya está en manos de nuestro equipo. Te contactaremos para confirmarla: hasta entonces la reserva no es firme.');
  }

  /* --- Anulación desde el enlace del correo de confirmación: ?anular=token
     Dos pasos: abrir el enlace sólo muestra la reserva; anular exige pulsar el botón. */
  let tokenAnular = null;

  async function anularDesdeEnlace() {
    tokenAnular = new URLSearchParams(location.search).get('anular');
    if (!tokenAnular) return;
    history.replaceState(null, '', location.pathname + '#reservar');
    document.querySelector('#reservar').scrollIntoView();
    try {
      const r = await api.post('reservas/anulacion', { token: tokenAnular });
      mostrarPanel('Anular reserva', `¿Anulamos tu reserva, ${r.nombre}?`,
        `Reserva para ${r.comensales} ${r.comensales === 1 ? 'persona' : 'personas'} el ${fechaLarga(r.fecha)} a las ${r.hora}. ` +
        'Si la anulas, liberaremos la mesa para otras personas.', '?');
      $('#anular-acciones').classList.remove('oculto');
      $('#otra-reserva').classList.add('oculto');
    } catch (e) {
      mostrarPanel('Enlace no válido', 'No se puede anular', e.message, '!');
    }
  }

  $('#anular-si').addEventListener('click', async (e) => {
    const boton = e.currentTarget;
    boton.disabled = true;
    try {
      const r = await api.post('reservas/anular', { token: tokenAnular });
      mostrarPanel('Reserva anulada', `Hecho, ${r.nombre}`,
        `Hemos anulado tu reserva del ${fechaLarga(r.fecha)} a las ${r.hora}. Gracias por avisarnos: esperamos verte pronto.`);
    } catch (err) {
      mostrarPanel('No se ha podido anular', 'Algo ha fallado', err.message, '!');
    } finally {
      boton.disabled = false;
      tokenAnular = null;
    }
  });
  $('#anular-no').addEventListener('click', () => {
    tokenAnular = null;
    mostrarPanel('Reserva mantenida', '¡Perfecto!', 'Tu reserva sigue en pie. Te esperamos.');
  });

  function mostrarPanel(antetitulo, titulo, texto, sello = '✓') {
    $('#anular-acciones').classList.add('oculto');
    $('#otra-reserva').classList.remove('oculto');
    formCodigo.classList.add('oculto');
    formCodigo.elements.codigo.disabled = false;
    $('#reserva-ok .versalitas').textContent = antetitulo;
    $('#reserva-ok-titulo').textContent = titulo;
    $('#reserva-ok-texto').textContent = texto;
    $('.reserva-ok__sello').textContent = sello;
    form.classList.add('oculto');
    const ok = $('#reserva-ok');
    ok.classList.remove('oculto');
    ok.focus();
  }

  /* --- Vuelta desde el enlace del correo: ?verificar=token ------------ */
  async function verificarDesdeEnlace() {
    const params = new URLSearchParams(location.search);
    const token = params.get('verificar');
    if (!token) return false;
    history.replaceState(null, '', location.pathname + '#reservar');   // el token no se queda en la barra ni en el historial
    document.querySelector('#reservar').scrollIntoView();
    try {
      verificada(await api.post('reservas/verificar', { token }));
    } catch (e) {
      mostrarPanel('Enlace no válido', 'No hemos podido verificarla', e.message, '!');
    }
    return true;
  }

  /* --- Eventos -------------------------------------------------------- */
  form.addEventListener('submit', enviar);
  form.addEventListener('input', (e) => {
    if (e.target.getAttribute('aria-invalid') === 'true') e.target.removeAttribute('aria-invalid');
  });
  campo('fecha').addEventListener('change', consultarDisponibilidad);
  form.querySelectorAll('.comensales__btn').forEach((b) => b.addEventListener('click', () => {
    const n = Math.min(maxComensales, Math.max(1, Number(campo('comensales').value) + Number(b.dataset.paso)));
    campo('comensales').value = n;
    pintarComensales();
    revisarAforo();
  }));
  $('#otra-pregunta').addEventListener('click', pedirReto);
  $('#otra-reserva').addEventListener('click', () => {
    form.reset();
    campo('comensales').value = 2;
    pintarComensales();
    consultarDisponibilidad();
    $('#reserva-ok').classList.add('oculto');
    form.classList.remove('oculto');
    campo('fecha').focus();
  });

  verificarDesdeEnlace();
  anularDesdeEnlace();

  // La pregunta se pide cuando el formulario está cerca de verse
  if ('IntersectionObserver' in window) {
    const obs = new IntersectionObserver((e) => {
      if (e.some((x) => x.isIntersecting)) { obs.disconnect(); pedirReto(); }
    }, { rootMargin: '400px' });
    obs.observe(form);
  } else {
    pedirReto();
  }
})();
