/* =====================================================================
   Carta pública «Noche en el Mediterráneo» — consume GET /carta
   ===================================================================== */
(() => {
  const SECCIONES_LISTA = ['bebidas', 'vinos', 'cervezas'];   // carta compacta, sin descripción
  const INGREDIENTES_OCULTOS = ['sal', 'sal gruesa'];
  const ROMANOS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  const SIN_MOVIMIENTO = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const $ = (s) => document.querySelector(s);
  const estado = { carta: null, buscar: '', sin: new Set(), platos: new Map() };

  const normal = (t) => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const minuscula = (t) => (t[1] && t[1] === t[1].toLowerCase() ? t[0].toLowerCase() + t.slice(1) : t);
  const ingredientesVisibles = (p) => p.ingredientes.filter((n) => !INGREDIENTES_OCULTOS.includes(normal(n)));

  /* ==================================================================
     Portada: estrellas, reflejo de la luna, olas y titular
     ================================================================== */
  function montarPortada() {
    // Estrellas con posiciones pseudoaleatorias estables
    let semilla = 7;
    const azar = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);
    $('.estrellas').innerHTML = Array.from({ length: 90 }, () => {
      const x = (azar() * 1600).toFixed(0), y = (azar() * 520).toFixed(0);
      const r = (azar() * 1.3 + .3).toFixed(2), d = (azar() * 4).toFixed(2);
      return `<circle cx="${x}" cy="${y}" r="${r}" style="animation-delay:-${d}s;opacity:${(azar() * .6 + .2).toFixed(2)}"/>`;
    }).join('');

    // Reflejo de la luna: trazos que brillan sobre el agua
    $('.reflejo').innerHTML = Array.from({ length: 26 }, (_, i) => {
      const y = 572 + i * 12;
      const ancho = 120 - i * 3.6 + azar() * 34;
      const x = 1180 - ancho / 2 + (azar() - .5) * 30;
      return `<rect x="${x.toFixed(0)}" y="${y}" width="${ancho.toFixed(0)}" height="2.2" rx="1.1" style="animation-delay:-${(azar() * 3).toFixed(2)}s"/>`;
    }).join('');

    // Olas: trazos sinusoidales largos que se desplazan
    const ola = (y, amp, largo) => {
      let d = `M-400 ${y}`;
      for (let x = -400; x < 2400; x += largo) d += ` q ${largo / 4} ${-amp} ${largo / 2} 0 t ${largo / 2} 0`;
      return d;
    };
    const olas = document.querySelectorAll('.ola');
    [[640, 6, 200], [720, 9, 200], [810, 12, 200]].forEach(([y, a, l], i) => olas[i].setAttribute('d', ola(y, a, l)));

    // Titular letra a letra
    let retraso = 300;
    document.querySelectorAll('.linea-titulo').forEach((linea) => {
      linea.innerHTML = [...linea.dataset.texto].map((c) => {
        retraso += 38;
        return c === ' ' ? ' ' : `<span class="letra" style="animation-delay:${retraso}ms" aria-hidden="true">${esc(c)}</span>`;
      }).join('');
      retraso += 120;
    });
  }

  /* ==================================================================
     Movimiento ligado al scroll: cabecera y giro de los platos
     ================================================================== */
  function montarScroll() {
    const cabecera = $('#cabecera');
    let pendiente = false;
    const actualizar = () => {
      pendiente = false;
      cabecera.classList.toggle('solida', scrollY > 40);
      if (!SIN_MOVIMIENTO) document.documentElement.style.setProperty('--giro', `${(scrollY * 0.09).toFixed(2)}deg`);
    };
    addEventListener('scroll', () => {
      if (!pendiente) { pendiente = true; requestAnimationFrame(actualizar); }
    }, { passive: true });
    actualizar();
  }

  /* ==================================================================
     Carga de datos
     ================================================================== */
  async function cargar() {
    try {
      estado.carta = await api.get('carta');
    } catch (e) {
      $('#contenido-carta').innerHTML = `<p class="vacio">No se ha podido cargar la carta.<br><small>${esc(e.message)}</small></p>`;
      return;
    }
    estado.carta.generos.forEach((g) => g.platos.forEach((p) => estado.platos.set(p.id, { ...p, seccion: g.nombre })));
    pintarBanda();
    pintarFiltroAlergenos();
    pintarCapitulos();
    pintarCarta();
    $('#leyenda-alergenos').innerHTML = estado.carta.alergenos
      .map((a) => `<span>${iconoAlergeno(a)}${esc(a.nombre)}</span>`).join('');
  }

  /** Banda con los ingredientes más usados en la cocina. */
  function pintarBanda() {
    const cuenta = new Map();
    for (const p of estado.platos.values()) {
      for (const n of ingredientesVisibles(p)) cuenta.set(n, (cuenta.get(n) || 0) + 1);
    }
    const top = [...cuenta.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([n]) => n);
    const tramo = top.map((n) => `<span>${esc(n)}</span>`).join('');
    $('#banda').innerHTML = tramo + tramo;   // duplicado para que el bucle no tenga costura
  }

  function pintarCapitulos() {
    $('#capitulos').innerHTML = estado.carta.generos.map((g, i) =>
      `<a href="#genero-${g.id}" data-id="${g.id}"><i>${ROMANOS[i] || i + 1}</i>${esc(g.nombre)}</a>`).join('');
  }

  function pintarFiltroAlergenos() {
    $('#lista-alergenos').innerHTML = estado.carta.alergenos.map((a) =>
      `<button type="button" class="alergeno-toggle" data-id="${a.id}" aria-pressed="false">${iconoAlergeno(a)}${esc(a.nombre)}</button>`
    ).join('');
  }

  /* ==================================================================
     Carta
     ================================================================== */
  function visible(plato) {
    if (plato.alergenos.some((a) => estado.sin.has(a.id))) return false;
    if (!estado.buscar) return true;
    const texto = normal(plato.nombre + ' ' + plato.ingredientes.join(' '));
    return estado.buscar.split(/\s+/).every((p) => texto.includes(p));
  }

  function pintarCarta() {
    let ocultos = 0;
    let indice = 0;

    const html = estado.carta.generos.map((g, i) => {
      const platos = g.platos.filter((p) => {
        const ok = visible(p);
        if (!ok && p.alergenos.some((a) => estado.sin.has(a.id))) ocultos++;
        return ok;
      });
      if (!platos.length) return '';
      const lista = SECCIONES_LISTA.includes(normal(g.nombre));
      const fondo = g.platos.find((p) => p.imagen)?.imagen;

      return `
        <section class="capitulo ${lista ? 'capitulo--lista' : ''}" id="genero-${g.id}" data-id="${g.id}">
          <header class="capitulo__cabecera">
            ${fondo && !lista ? `<div class="capitulo__fondo" aria-hidden="true"><img src="${esc(fondo)}" alt="" loading="lazy"></div>` : ''}
            <span class="capitulo__numero" aria-hidden="true">${ROMANOS[i] || i + 1}</span>
            <div class="capitulo__titulo">
              <span class="versalitas">${platos.length} ${platos.length === 1 ? 'propuesta' : 'propuestas'}</span>
              <h3>${esc(g.nombre)}</h3>
            </div>
          </header>
          <div class="platos">${platos.map((p) => plato(p, indice++)).join('')}</div>
        </section>`;
    }).join('');

    $('#contenido-carta').innerHTML = html || '<p class="vacio">Ningún plato coincide con tu búsqueda.</p>';

    const aviso = $('#aviso-filtro');
    aviso.classList.toggle('oculto', !ocultos);
    aviso.textContent = `${ocultos} ${ocultos === 1 ? 'plato retirado' : 'platos retirados'} de la carta por contener los alérgenos que has marcado.`;

    $('#contenido-carta').querySelectorAll('img').forEach((img) =>
      img.addEventListener('error', () => img.remove(), { once: true }));
    revelar();
    observarCapitulos();
  }

  function plato(p, i) {
    const ingredientes = ingredientesVisibles(p).slice(0, 6).map(minuscula);
    const texto = ingredientes.length ? ingredientes[0][0].toUpperCase() + ingredientes.join(', ').slice(1) : '';
    const alergenos = p.alergenos.map((a) => a.nombre).join(', ');
    return `
      <button type="button" class="plato" data-id="${p.id}" style="--sentido:${i % 2 ? -1 : 1}"
              aria-label="${esc(p.nombre)}, ${esc(precioCarta(p.precio))} euros. Ver ficha">
        <span class="plato__disco" aria-hidden="true">
          <span class="plato__inicial">${esc(iniciales(p.nombre))}</span>
          ${p.imagen ? `<img src="${esc(p.imagen)}" alt="" loading="lazy">` : ''}
        </span>
        <span class="plato__texto">
          <span class="plato__fila">
            <span class="plato__nombre">${esc(p.nombre)}</span>
            <span class="plato__puntos" aria-hidden="true"></span>
            <span class="plato__precio num">${precioCarta(p.precio)} €</span>
          </span>
          ${texto ? `<span class="plato__ingredientes" style="display:block">${esc(texto)}</span>` : ''}
          ${p.alergenos.length ? `<span class="plato__alergenos" title="Alérgenos: ${esc(alergenos)}">${p.alergenos.map(iconoAlergeno).join('')}</span>` : ''}
        </span>
      </button>`;
  }

  /* --- Aparición escalonada al entrar en pantalla --------------------- */
  let observadorPlatos;
  function revelar() {
    observadorPlatos?.disconnect();
    const platos = document.querySelectorAll('.plato');
    if (SIN_MOVIMIENTO || !('IntersectionObserver' in window)) {
      platos.forEach((p) => p.classList.add('visible'));
      return;
    }
    observadorPlatos = new IntersectionObserver((entradas) => {
      let n = 0;
      for (const e of entradas) {
        if (!e.isIntersecting) continue;
        e.target.style.setProperty('--retraso', `${Math.min(n++, 6) * 70}ms`);
        e.target.classList.add('visible');
        observadorPlatos.unobserve(e.target);
      }
    }, { rootMargin: '0px 0px -8% 0px' });
    platos.forEach((p) => observadorPlatos.observe(p));
  }

  /* --- Capítulo activo en la barra ----------------------------------- */
  let observadorCapitulos;
  function observarCapitulos() {
    observadorCapitulos?.disconnect();
    const enlaces = [...document.querySelectorAll('#capitulos a')];
    observadorCapitulos = new IntersectionObserver((entradas) => {
      for (const e of entradas) {
        if (!e.isIntersecting) continue;
        enlaces.forEach((a) => {
          const activa = a.dataset.id === e.target.dataset.id;
          a.classList.toggle('activa', activa);
          if (activa) a.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        });
      }
    }, { rootMargin: '-35% 0px -55% 0px' });
    document.querySelectorAll('.capitulo').forEach((s) => observadorCapitulos.observe(s));
  }

  /* ==================================================================
     Ficha del plato
     ================================================================== */
  function abrirFicha(id) {
    const p = estado.platos.get(id);
    if (!p) return;
    const img = $('#ficha-img');
    img.src = p.imagen || '';
    img.hidden = !p.imagen;
    $('#ficha-seccion').textContent = p.seccion;
    $('#ficha-nombre').textContent = p.nombre;
    $('#ficha-precio').textContent = `${precioCarta(p.precio)} €`;
    $('#ficha-ingredientes').innerHTML = ingredientesVisibles(p).map((n) => `<li>${esc(n)}</li>`).join('')
      || '<li>Consulta al personal de sala</li>';
    $('#ficha-alergenos').innerHTML = p.alergenos.length
      ? p.alergenos.map((a) => `<span>${iconoAlergeno(a)}${esc(a.nombre)}</span>`).join('')
      : '<p class="ficha__sin">Sin alérgenos de declaración obligatoria</p>';
    $('#ficha').showModal();
  }

  /* ==================================================================
     Eventos
     ================================================================== */
  let espera;
  $('#buscar').addEventListener('input', (e) => {
    clearTimeout(espera);
    espera = setTimeout(() => {
      estado.buscar = normal(e.target.value.trim());
      pintarCarta();
    }, 160);
  });

  $('#btn-filtro').addEventListener('click', (e) => {
    const abierto = e.currentTarget.getAttribute('aria-expanded') === 'true';
    e.currentTarget.setAttribute('aria-expanded', String(!abierto));
    $('#panel-alergenos').classList.toggle('oculto', abierto);
  });

  $('#lista-alergenos').addEventListener('click', (e) => {
    const b = e.target.closest('.alergeno-toggle');
    if (!b) return;
    const id = Number(b.dataset.id);
    const activo = !estado.sin.has(id);
    activo ? estado.sin.add(id) : estado.sin.delete(id);
    b.setAttribute('aria-pressed', String(activo));
    $('#filtro-n').textContent = estado.sin.size;
    $('#filtro-n').classList.toggle('oculto', !estado.sin.size);
    pintarCarta();
  });

  $('#contenido-carta').addEventListener('click', (e) => {
    const b = e.target.closest('.plato');
    if (b) abrirFicha(Number(b.dataset.id));
  });

  const ficha = $('#ficha');
  $('#ficha-cerrar').addEventListener('click', () => ficha.close());
  ficha.addEventListener('click', (e) => { if (e.target === ficha) ficha.close(); });   // clic fuera

  /* ==================================================================
     Arranque
     ================================================================== */
  for (const el of [$('#marca'), $('#marca-pie')]) el.insertAdjacentHTML('afterbegin', LOGO_SVG);
  montarPortada();
  montarScroll();
  cargar();
})();
