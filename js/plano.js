/* =====================================================================
   Plano del salón — dibujo SVG a escala (lienzo 1000 × 620)
   Tres ambientes: comedor (mesas rectangulares con mantel),
   barra (mostrador + mesas altas redondas con taburetes) y
   terraza (tarima, sombrillas, sillas de rayas y el mar al fondo).
   ===================================================================== */
const Plano = (() => {
  const ANCHO = 1000;
  const ALTO = 620;

  /* Zona útil donde pueden ir las mesas en cada ambiente */
  const ZONAS = {
    comedor: { x1: 70, y1: 84, x2: 920, y2: 560 },
    barra:   { x1: 100, y1: 200, x2: 905, y2: 560 },
    terraza: { x1: 82, y1: 64, x2: 918, y2: 500 },
  };

  const normal = (t) => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  function tipoDe(salon) {
    const s = normal(salon);
    if (s.includes('barra') || s.includes('bar')) return 'barra';
    if (s.includes('terraza') || s.includes('patio') || s.includes('jardin')) return 'terraza';
    return 'comedor';
  }

  /* ------------------------------------------------------------------
     Geometría de cada mesa
     ------------------------------------------------------------------ */
  function geometria(m, tipo) {
    const n = Math.max(1, m.comensales);

    if (tipo === 'barra') {
      const r = n <= 2 ? 27 : 27 + (n - 2) * 4;
      const dist = r + 17;
      const inicio = n === 2 ? 0 : -Math.PI / 2;
      const asientos = Array.from({ length: n }, (_, i) => {
        const a = inicio + (i * 2 * Math.PI) / n;
        return { x: Math.cos(a) * dist, y: Math.sin(a) * dist, rot: (a * 180) / Math.PI + 90 };
      });
      return { forma: 'redonda', r, w: r * 2, h: r * 2, asientos, fw: (dist + 13) * 2, fh: (dist + 13) * 2 };
    }

    // Rectangular (comedor y terraza)
    let arriba, abajo, extremos;
    if (tipo === 'terraza' && n === 4) {
      arriba = 1; abajo = 1; extremos = 2;
    } else {
      extremos = n >= 7 ? 2 : 0;
      const resto = n - extremos;
      arriba = Math.ceil(resto / 2);
      abajo = Math.floor(resto / 2);
    }
    const porLado = Math.max(arriba, abajo, 1);
    const paso = tipo === 'terraza' ? 40 : 38;
    const w = n <= 2 ? 54 : porLado * paso + 18;
    const h = n <= 2 ? 54 : tipo === 'terraza' && n === 4 ? 58 : 62;
    const sep = 14;
    const asientos = [];
    const lado = (cuantos, y, rot) => {
      for (let i = 0; i < cuantos; i++) asientos.push({ x: -w / 2 + (w * (i + 0.5)) / cuantos, y, rot });
    };
    lado(arriba, -h / 2 - sep, 180);
    lado(abajo, h / 2 + sep, 0);
    if (extremos) {
      asientos.push({ x: -w / 2 - sep, y: 0, rot: 90 });
      asientos.push({ x: w / 2 + sep, y: 0, rot: -90 });
    }
    return { forma: 'rect', w, h, asientos, fw: w + (extremos ? 2 * (sep + 12) : 8), fh: h + 2 * (sep + 12) };
  }

  /* ------------------------------------------------------------------
     Colocación automática de las mesas que aún no tienen posición
     ------------------------------------------------------------------ */
  function autoColocar(mesas, tipo) {
    const sin = mesas.filter((m) => m.pos_x == null || m.pos_y == null);
    if (!sin.length) return;
    const z = ZONAS[tipo];
    const anchoZona = z.x2 - z.x1;
    const altoZona = z.y2 - z.y1;

    const items = sin.map((m) => ({ m, g: geometria(m, tipo) }));
    const colocar = (hueco) => {
      const filas = [];
      let fila = { items: [], ancho: 0, alto: 0 };
      for (const it of items) {
        const w = it.g.fw + (tipo === 'terraza' ? 24 : 0);
        if (fila.items.length && fila.ancho + hueco + w > anchoZona) {
          filas.push(fila);
          fila = { items: [], ancho: 0, alto: 0 };
        }
        fila.ancho += (fila.items.length ? hueco : 0) + w;
        fila.alto = Math.max(fila.alto, it.g.fh);
        fila.items.push({ ...it, w });
      }
      filas.push(fila);
      return filas;
    };

    let hueco = 64;
    let filas = colocar(hueco);
    let altoTotal = () => filas.reduce((s, f) => s + f.alto, 0);
    while (filas.length > 1 && altoTotal() + (filas.length - 1) * 16 > altoZona && hueco > 20) {
      hueco -= 8;
      filas = colocar(hueco);
    }
    const huecoV = filas.length > 1 ? Math.max(12, (altoZona - altoTotal()) / (filas.length + 1)) : 0;
    let y = z.y1 + (filas.length > 1 ? huecoV : (altoZona - altoTotal()) / 2);
    for (const f of filas) {
      const libre = anchoZona - f.ancho;
      const extra = f.items.length > 1 ? Math.min(libre / (f.items.length - 1), 90) : 0;
      let x = z.x1 + (libre - extra * (f.items.length - 1)) / 2;
      for (const it of f.items) {
        it.m.pos_x = Math.round(x + it.w / 2);
        it.m.pos_y = Math.round(y + f.alto / 2);
        x += it.w + hueco + extra;
      }
      y += f.alto + huecoV;
    }
  }

  /** Mantiene la mesa dentro de la zona útil. */
  function limitar(m, tipo, x, y) {
    const z = ZONAS[tipo];
    const g = geometria(m, tipo);
    return {
      x: Math.round(Math.min(z.x2 - g.fw / 2, Math.max(z.x1 + g.fw / 2, x))),
      y: Math.round(Math.min(z.y2 - g.fh / 2, Math.max(z.y1 + g.fh / 2, y))),
    };
  }

  /** Primer sitio libre de la zona donde cabe la mesa sin pisar a otras. */
  function buscarHueco(mesas, nueva, tipo) {
    const z = ZONAS[tipo];
    const g = geometria(nueva, tipo);
    const cajas = mesas.map((m) => {
      const gm = geometria(m, tipo);
      return { x1: m.pos_x - gm.fw / 2, x2: m.pos_x + gm.fw / 2, y1: m.pos_y - gm.fh / 2, y2: m.pos_y + gm.fh / 2 };
    });
    const margen = 12;
    for (let y = z.y1 + g.fh / 2; y <= z.y2 - g.fh / 2; y += 10) {
      for (let x = z.x1 + g.fw / 2; x <= z.x2 - g.fw / 2; x += 10) {
        const libre = cajas.every((c) =>
          x + g.fw / 2 + margen < c.x1 || x - g.fw / 2 - margen > c.x2 ||
          y + g.fh / 2 + margen < c.y1 || y - g.fh / 2 - margen > c.y2);
        if (libre) return { x: Math.round(x), y: Math.round(y) };
      }
    }
    return limitar(nueva, tipo, (z.x1 + z.x2) / 2, (z.y1 + z.y2) / 2);
  }

  /* ------------------------------------------------------------------
     Elementos decorativos reutilizables
     ------------------------------------------------------------------ */
  const olivo = (x, y, s = 1) => `
    <g transform="translate(${x} ${y}) scale(${s})" class="deco">
      <circle r="30" class="f-maceta"/><circle r="25" class="f-tierra"/>
      <!-- copa del olivo vista desde arriba: grupos de ramas con hojas plateadas -->
      ${[[-10, -8, 15], [11, -10, 14], [13, 9, 15], [-9, 12, 14], [0, 0, 13], [-17, 3, 10], [4, -18, 10]].map(([cx, cy, r], i) =>
        `<circle cx="${cx}" cy="${cy}" r="${r}" class="${i % 2 ? 'f-hoja' : 'f-hoja-2'}" opacity=".92"/>`).join('')}
      ${Array.from({ length: 22 }, (_, i) => {
        const a = i * 137.5, d = 4 + (i * 7) % 22;
        const x = (Math.cos((a * Math.PI) / 180) * d).toFixed(1), y = (Math.sin((a * Math.PI) / 180) * d).toFixed(1);
        return `<ellipse cx="${x}" cy="${y}" rx="4.2" ry="1.5" transform="rotate(${(a + 40) % 180} ${x} ${y})" class="f-hoja-3"/>`;
      }).join('')}
    </g>`;

  const maceta = (x, y, flor = 'lavanda', s = 1) => `
    <g transform="translate(${x} ${y}) scale(${s})" class="deco">
      <circle r="17" class="f-maceta"/><circle r="13.5" class="f-tierra"/>
      ${Array.from({ length: 8 }, (_, i) => `<ellipse cx="7" cy="0" rx="7" ry="2.6" transform="rotate(${i * 45})" class="f-hoja"/>`).join('')}
      ${flor ? Array.from({ length: 7 }, (_, i) => {
        const a = (i * 2 * Math.PI) / 7;
        return `<circle cx="${(Math.cos(a) * 8).toFixed(1)}" cy="${(Math.sin(a) * 8).toFixed(1)}" r="2.4" class="f-${flor}"/>`;
      }).join('') : ''}
    </g>`;

  const jarron = (x, y, s = 1) => `
    <g transform="translate(${x} ${y}) scale(${s})" class="deco">
      <circle r="15" class="f-ceramica s-azul" stroke-width="2"/>
      <circle r="10.5" class="f-none s-azul" stroke-width="1.6" stroke-dasharray="3 3"/>
      <circle r="6" class="f-azul"/>
      <circle r="3.5" class="f-hueco"/>
    </g>`;

  const anfora = (x, y, s = 1) => `
    <g transform="translate(${x} ${y}) scale(${s})" class="deco">
      <ellipse rx="13" ry="13" class="f-barro"/>
      <ellipse rx="9" ry="9" class="f-barro-2"/>
      <circle r="4.5" class="f-hueco"/>
      <path d="M-13 -2 q-7 0 -7 -8 M13 -2 q7 0 7 -8" class="f-none s-barro" stroke-width="2.4" stroke-linecap="round"/>
    </g>`;

  const palmera = (x, y, s = 1) => `
    <g transform="translate(${x} ${y}) scale(${s})" class="deco">
      <circle r="10" class="f-arena-2"/>
      ${Array.from({ length: 9 }, (_, i) => `
        <g transform="rotate(${i * 40 + 8})">
          <path d="M0 0 Q 22 -9 46 2 Q 22 4 0 0Z" class="${i % 2 ? 'f-palma' : 'f-palma-2'}"/>
          <path d="M2 0 Q 22 -5 44 1.5" class="f-none s-palma" stroke-width=".8"/>
        </g>`).join('')}
      <circle r="5" class="f-tronco"/>
    </g>`;

  const buganvilla = (x, y, n = 9) => `
    <g class="deco">${Array.from({ length: n }, (_, i) => {
      const dx = (i * 13) % 38 - 19, dy = ((i * 7) % 14) - 4;
      return `<circle cx="${x + dx}" cy="${y + dy}" r="${4 + (i % 3)}" class="${i % 3 === 0 ? 'f-hoja' : i % 2 ? 'f-buganvilla' : 'f-buganvilla-2'}"/>`;
    }).join('')}</g>`;

  const sombrilla = (x, y, r) => `
    <g transform="translate(${x} ${y})" class="sombrilla">
      ${Array.from({ length: 8 }, (_, i) => {
        const a1 = (i * Math.PI) / 4, a2 = ((i + 1) * Math.PI) / 4;
        return `<path d="M0 0 L${(Math.cos(a1) * r).toFixed(1)} ${(Math.sin(a1) * r).toFixed(1)} L${(Math.cos(a2) * r).toFixed(1)} ${(Math.sin(a2) * r).toFixed(1)}Z" class="${i % 2 ? 'f-lona' : 'f-lona-2'}"/>`;
      }).join('')}
    </g>`;

  const puerta = (x, y, ancho, haciaArriba, etiqueta) => {
    const dir = haciaArriba ? -1 : 1;
    return `
      <g class="deco">
        <rect x="${x}" y="${y - 8}" width="${ancho}" height="16" class="f-suelo-hueco"/>
        <path d="M${x} ${y} L${x} ${y + dir * ancho} A${ancho} ${ancho} 0 0 ${haciaArriba ? 1 : 0} ${x + ancho} ${y}" class="f-none s-puerta" stroke-width="1.4" stroke-dasharray="4 3"/>
        <line x1="${x}" y1="${y}" x2="${x}" y2="${y + dir * ancho}" class="s-pared-borde" stroke-width="3"/>
        ${etiqueta ? `<text x="${x + ancho / 2}" y="${y + dir * -14}" class="rotulo" text-anchor="middle">${etiqueta}</text>` : ''}
      </g>`;
  };

  /* ------------------------------------------------------------------
     Escenarios
     ------------------------------------------------------------------ */
  const DEFS = `
    <defs>
      <pattern id="p-baldosa" width="44" height="44" patternUnits="userSpaceOnUse">
        <rect width="44" height="44" class="f-suelo-1"/>
        <path d="M22 5 L39 22 L22 39 L5 22Z" class="f-suelo-2"/>
        <path d="M22 12 L32 22 L22 32 L12 22Z" class="f-suelo-1"/>
        <circle cx="22" cy="22" r="3.2" class="f-suelo-3"/>
        <circle cx="0" cy="0" r="5" class="f-suelo-3"/><circle cx="44" cy="0" r="5" class="f-suelo-3"/>
        <circle cx="0" cy="44" r="5" class="f-suelo-3"/><circle cx="44" cy="44" r="5" class="f-suelo-3"/>
        <path d="M0 0H44M0 0V44" class="s-junta" stroke-width="1"/>
      </pattern>
      <pattern id="p-madera" width="160" height="26" patternUnits="userSpaceOnUse">
        <rect width="160" height="26" class="f-madera-1"/>
        <rect y="13" width="160" height="13" class="f-madera-2"/>
        <path d="M0 0H160M0 13H160M60 0V13M130 13V26" class="s-junta-madera" stroke-width="1"/>
      </pattern>
      <pattern id="p-tarima" width="200" height="22" patternUnits="userSpaceOnUse">
        <rect width="200" height="22" class="f-tarima-1"/>
        <rect y="11" width="200" height="11" class="f-tarima-2"/>
        <path d="M0 0H200M0 11H200M90 0V11M30 11V22M170 11V22" class="s-junta-madera" stroke-width="1"/>
      </pattern>
      <pattern id="p-arena" width="18" height="18" patternUnits="userSpaceOnUse">
        <rect width="18" height="18" class="f-arena"/>
        <circle cx="4" cy="5" r=".9" class="f-arena-2"/><circle cx="13" cy="12" r=".8" class="f-arena-2"/>
      </pattern>
      <pattern id="p-rayas" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(90)">
        <rect width="6" height="6" class="f-raya-1"/><rect width="3" height="6" class="f-raya-2"/>
      </pattern>
      <linearGradient id="g-mar" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" class="stop-mar-1"/><stop offset="1" class="stop-mar-2"/>
      </linearGradient>
      <filter id="sombra" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="2" stdDeviation="2.4" flood-opacity=".16"/>
      </filter>
    </defs>`;

  function escenaComedor() {
    const ventanasArriba = [150, 330, 510, 690].map((x) =>
      `<rect x="${x}" y="15" width="120" height="10" rx="2" class="f-ventana"/><line x1="${x + 60}" y1="15" x2="${x + 60}" y2="25" class="s-marco" stroke-width="2"/>`).join('');
    const ventanasIzq = [170, 360].map((y) =>
      `<rect x="15" y="${y}" width="10" height="100" rx="2" class="f-ventana"/><line x1="15" y1="${y + 50}" x2="25" y2="${y + 50}" class="s-marco" stroke-width="2"/>`).join('');
    return `
      <rect width="${ANCHO}" height="${ALTO}" class="f-exterior"/>
      <rect x="20" y="20" width="960" height="580" fill="url(#p-baldosa)"/>
      <rect x="20" y="20" width="960" height="580" rx="4" class="f-none s-pared" stroke-width="14"/>
      <rect x="13" y="13" width="974" height="594" rx="8" class="f-none s-pared-borde" stroke-width="1.2"/>
      ${ventanasArriba}${ventanasIzq}
      ${puerta(96, 600, 74, true, '')}
      <text x="133" y="616" class="rotulo rotulo--exterior" text-anchor="middle">Entrada</text>
      ${puerta(836, 20, 66, false, '')}
      <text x="869" y="104" class="rotulo" text-anchor="middle">Cocina</text>

      <!-- Aparador con jarrones -->
      <rect x="944" y="190" width="28" height="240" rx="4" class="f-mueble" filter="url(#sombra)"/>
      <rect x="948" y="194" width="20" height="232" rx="3" class="f-mueble-2"/>
      ${jarron(958, 230, .78)}${anfora(958, 300, .85)}${jarron(958, 370, .78)}

      ${olivo(70, 72)}
      ${olivo(924, 546, 1.05)}
      ${maceta(60, 300, 'lavanda')}
      ${maceta(60, 490, 'geranio')}
      ${anfora(238, 566, 1.05)}${anfora(270, 574, .8)}
      ${maceta(780, 562, 'limon', 1.05)}`;
  }

  function escenaBarra() {
    const botellas = Array.from({ length: 34 }, (_, i) =>
      `<circle cx="${172 + i * 20}" cy="${36 + (i % 2) * 5}" r="5" class="${['f-botella-1', 'f-botella-2', 'f-botella-3', 'f-botella-4'][i % 4]}"/>`).join('');
    const taburetesBarra = Array.from({ length: 10 }, (_, i) => `
      <g transform="translate(${205 + i * 66} 140)" class="deco">
        <circle r="12" class="f-taburete-pata"/><circle r="9" class="f-taburete"/>
      </g>`).join('');
    return `
      <rect width="${ANCHO}" height="${ALTO}" class="f-exterior"/>
      <rect x="20" y="20" width="960" height="580" fill="url(#p-madera)"/>
      <rect x="20" y="20" width="960" height="580" rx="4" class="f-none s-pared" stroke-width="14"/>
      <rect x="13" y="13" width="974" height="594" rx="8" class="f-none s-pared-borde" stroke-width="1.2"/>

      <!-- Botellero -->
      <rect x="150" y="27" width="700" height="20" rx="3" class="f-mueble"/>
      ${botellas}
      <!-- Mostrador -->
      <rect x="120" y="66" width="760" height="58" rx="29" class="f-mueble" filter="url(#sombra)"/>
      <rect x="128" y="72" width="744" height="46" rx="23" class="f-marmol"/>
      <rect x="128" y="72" width="744" height="46" rx="23" class="f-none s-marmol" stroke-width="1"/>
      <g class="deco">
        <rect x="300" y="80" width="64" height="12" rx="6" class="f-metal"/>
        <circle cx="312" cy="86" r="3.5" class="f-hueco"/><circle cx="332" cy="86" r="3.5" class="f-hueco"/><circle cx="352" cy="86" r="3.5" class="f-hueco"/>
        <rect x="720" y="80" width="40" height="28" rx="4" class="f-caja"/>
        <rect x="726" y="84" width="28" height="10" rx="2" class="f-pantalla"/>
        <circle cx="200" cy="96" r="13" class="f-ceramica s-azul" stroke-width="1.5"/>
        <circle cx="196" cy="93" r="4.5" class="f-limon"/><circle cx="204" cy="94" r="4.5" class="f-limon"/><circle cx="200" cy="100" r="4.5" class="f-limon"/>
      </g>
      ${jarron(560, 95, .9)}
      <text x="500" y="160" class="rotulo" text-anchor="middle" dy="22">Barra</text>
      ${taburetesBarra}

      ${puerta(96, 600, 74, true, '')}
      <text x="133" y="616" class="rotulo rotulo--exterior" text-anchor="middle">Entrada</text>

      <!-- Barrica y plantas -->
      <g transform="translate(58 300)" class="deco">
        <circle r="28" class="f-barrica"/><circle r="28" class="f-none s-aro" stroke-width="3"/>
        <circle r="19" class="f-none s-aro" stroke-width="2"/><circle r="8" class="f-barrica-2"/>
      </g>
      ${maceta(58, 380, null, 1.3)}
      ${olivo(70, 72, .9)}
      ${olivo(930, 72, .9)}
      ${maceta(942, 330, 'geranio')}
      ${anfora(935, 560)}${maceta(895, 572, 'lavanda', .9)}`;
  }

  function escenaTerraza() {
    const ventanas = [150, 300, 660, 810].map((x) =>
      `<rect x="${x}" y="8" width="44" height="22" rx="2" class="f-ventana"/><path d="M${x + 22} 8V30" class="s-marco" stroke-width="2"/>`).join('');
    const postes = Array.from({ length: 20 }, (_, i) => 30 + i * 49).filter((x) => x < 455 || x > 545)
      .map((x) => `<rect x="${x - 3}" y="509" width="6" height="10" rx="1" class="f-mueble"/>`).join('');
    const olas = [574, 592, 608].map((y, i) =>
      `<path d="M0 ${y} ${Array.from({ length: 21 }, (_, k) => `q 25 ${i % 2 ? 5 : -5} 50 0`).join(' ')}" class="f-none s-espuma" stroke-width="${1.6 - i * .3}"/>`).join('');
    return `
      <rect width="${ANCHO}" height="${ALTO}" fill="url(#p-arena)"/>
      <rect y="556" width="${ANCHO}" height="64" fill="url(#g-mar)"/>
      ${olas}
      <path d="M0 556 ${Array.from({ length: 25 }, () => 'q 20 6 40 0').join(' ')}" class="f-none s-espuma" stroke-width="2.4"/>
      <!-- Barca -->
      <g transform="translate(840 594)" class="deco">
        <path d="M-34 -6 Q0 -16 34 -6 Q26 9 0 10 Q-26 9 -34 -6Z" class="f-barca"/>
        <path d="M-30 -4 Q0 -12 30 -4" class="f-none s-azul" stroke-width="2.6"/>
        <line x1="0" y1="-12" x2="0" y2="6" class="s-mastil" stroke-width="2"/>
      </g>
      <!-- Tarima -->
      <rect x="20" y="38" width="960" height="476" fill="url(#p-tarima)"/>
      <rect x="20" y="38" width="960" height="476" class="f-none s-junta-madera" stroke-width="1"/>
      <!-- Fachada encalada -->
      <rect x="0" y="0" width="${ANCHO}" height="38" class="f-cal"/>
      <rect x="0" y="36" width="${ANCHO}" height="4" class="f-zocalo"/>
      ${ventanas}
      <rect x="455" y="2" width="90" height="34" rx="3" class="f-puerta-azul"/>
      <path d="M500 2V36" class="s-marco" stroke-width="2"/>
      <text x="500" y="60" class="rotulo" text-anchor="middle">Comedor</text>
      ${buganvilla(90, 40, 12)}${buganvilla(250, 40, 9)}${buganvilla(410, 42, 10)}
      ${buganvilla(600, 40, 10)}${buganvilla(760, 42, 9)}${buganvilla(910, 40, 12)}
      <!-- Barandilla con salida a la playa -->
      <path d="M20 514H455M545 514H980" class="s-barandilla" stroke-width="6" stroke-linecap="round"/>
      ${postes}
      <rect x="465" y="516" width="70" height="40" class="f-tarima-1"/>
      <path d="M465 526H535M465 536H535M465 546H535" class="s-junta-madera" stroke-width="1"/>
      <text x="500" y="572" class="rotulo rotulo--mar" text-anchor="middle">Playa</text>
      <g transform="translate(300 514)" class="deco">
        <circle r="11" class="f-none s-salvavidas" stroke-width="6"/>
        <circle r="11" class="f-none s-salvavidas-2" stroke-width="6" stroke-dasharray="8.6 8.6"/>
      </g>
      ${palmera(44, 486, 1)}
      ${palmera(956, 486, 1)}
      ${maceta(44, 400, 'lavanda')}${maceta(956, 400, 'lavanda')}
      ${maceta(44, 120, 'geranio')}${maceta(956, 120, 'geranio')}
      ${anfora(700, 530, .9)}`;
  }

  const ESCENAS = { comedor: escenaComedor, barra: escenaBarra, terraza: escenaTerraza };

  /* ------------------------------------------------------------------
     Mesas
     ------------------------------------------------------------------ */
  function asiento(a, tipo) {
    const t = `translate(${a.x.toFixed(1)} ${a.y.toFixed(1)}) rotate(${a.rot.toFixed(1)})`;
    if (tipo === 'barra') {
      return `<g transform="${t}"><circle r="11.5" class="f-taburete-pata"/><circle r="8.5" class="f-taburete"/></g>`;
    }
    if (tipo === 'terraza') {
      return `<g transform="${t}">
        <rect x="-12" y="-10" width="24" height="19" rx="3" fill="url(#p-rayas)" class="s-silla-terraza" stroke-width="1"/>
        <rect x="-13" y="7" width="26" height="5" rx="2.5" class="f-silla-terraza-respaldo"/></g>`;
    }
    return `<g transform="${t}">
      <rect x="-12" y="-10" width="24" height="19" rx="4" class="f-silla"/>
      <rect x="-13" y="7" width="26" height="6" rx="3" class="f-silla-respaldo"/></g>`;
  }

  function mesaSVG(m, tipo, { editando, seleccion }) {
    const g = geometria(m, tipo);
    const p = m.pedido;
    const r = !p && !editando ? m.reserva : null;   // reserva confirmada de hoy (si la mesa no está ya ocupada)
    const estado = p ? p.estado : r ? 'reservada' : 'libre';
    const numero = m.nombre.replace(new RegExp(`^${m.salon}\\s*`, 'i'), '') || m.nombre;
    const etiqueta = `${m.nombre}, ${m.comensales} plazas, ${p ? (p.estado === 'cerrado' ? 'cuenta pedida' : 'ocupada')
      : r ? `reservada a las ${r.hora} para ${r.nombre} (${r.comensales})` : 'libre'}`;

    let tablero;
    if (g.forma === 'redonda') {
      tablero = `<circle r="${g.r + 3}" class="f-borde-mesa"/><circle r="${g.r}" class="tablero"/>`;
    } else if (tipo === 'terraza') {
      const tablas = Array.from({ length: Math.floor(g.h / 9) - 1 }, (_, i) =>
        `<line x1="${-g.w / 2 + 3}" x2="${g.w / 2 - 3}" y1="${-g.h / 2 + (i + 1) * 9}" y2="${-g.h / 2 + (i + 1) * 9}" class="s-tablas" stroke-width="1"/>`).join('');
      tablero = `<rect x="${-g.w / 2}" y="${-g.h / 2}" width="${g.w}" height="${g.h}" rx="5" class="tablero tablero--teca"/>${p ? '' : tablas}`;
    } else {
      tablero = `<rect x="${-g.w / 2 - 3}" y="${-g.h / 2 - 3}" width="${g.w + 6}" height="${g.h + 6}" rx="6" class="f-borde-mesa"/>
        <rect x="${-g.w / 2}" y="${-g.h / 2}" width="${g.w}" height="${g.h}" rx="4" class="tablero"/>
        <rect x="${-g.w / 2 + 5}" y="${-g.h / 2 + 5}" width="${g.w - 10}" height="${g.h - 10}" rx="2" class="f-none s-mantel" stroke-width="1" stroke-dasharray="2 3"/>`;
    }

    const pequena = (g.forma === 'redonda' ? g.r * 2 : Math.min(g.w, g.h)) < 58;
    const linea2 = p ? euros(p.total) : r ? r.hora : null;
    const textos = linea2
      ? `<text y="${pequena ? -3 : -5}" class="mesa-num" text-anchor="middle" font-size="${pequena ? 17 : 20}">${esc(numero)}</text>
         <text y="${pequena ? 12 : 13}" class="mesa-total" text-anchor="middle" font-size="${pequena ? 10.5 : 12}">${esc(linea2)}</text>`
      : `<text y="${pequena ? 6 : 7}" class="mesa-num" text-anchor="middle" font-size="${pequena ? 19 : 22}">${esc(numero)}</text>`;

    const minutos = p ? minutosDesde(p.fecha) : 0;
    const listos = p?.listos || 0;
    const textoGlobo = listos ? `🔔 ${listos}` : p ? `${minutos}′` : r ? `R · ${r.comensales}` : '';
    const globo = textoGlobo ? `
      <g transform="translate(${(g.forma === 'redonda' ? g.r * .72 : g.w / 2) + 2} ${(g.forma === 'redonda' ? -g.r * .72 : -g.h / 2) - 2})" class="mesa-globo ${listos ? 'mesa-globo--listo' : ''}">
        <rect x="-17" y="-9" width="34" height="18" rx="9"/>
        <text y="4" text-anchor="middle">${esc(textoGlobo)}</text>
      </g>` : '';

    const sombra = tipo === 'terraza' ? sombrilla(0, 0, Math.max(g.w, g.h) / 2 + 34) : '';
    const sel = seleccion === m.uid
      ? `<rect x="${-g.fw / 2 - 6}" y="${-g.fh / 2 - 6}" width="${g.fw + 12}" height="${g.fh + 12}" rx="14" class="mesa-seleccion"/>` : '';

    return `
      <g class="mesa-plano mesa-plano--${estado} ${editando ? 'editable' : ''}" data-uid="${m.uid}"
         transform="translate(${m.pos_x} ${m.pos_y})" tabindex="0" role="button" aria-label="${esc(etiqueta)}">
        <title>${esc(etiqueta)}${p ? ` · ${euros(p.total)} · ${p.personal}` : ''}</title>
        ${sombra}
        <rect x="${-g.fw / 2}" y="${-g.fh / 2}" width="${g.fw}" height="${g.fh}" class="mesa-zona"/>
        ${sel}
        <g class="mesa-asientos">${g.asientos.map((a) => asiento(a, tipo)).join('')}</g>
        <g filter="url(#sombra)">${tablero}</g>
        ${textos}${globo}
      </g>`;
  }

  /* ------------------------------------------------------------------
     API pública
     ------------------------------------------------------------------ */
  function pintar(svg, { salon, mesas, editando = false, seleccion = null }) {
    const tipo = tipoDe(salon);
    autoColocar(mesas, tipo);
    svg.setAttribute('viewBox', `0 0 ${ANCHO} ${ALTO}`);
    svg.dataset.tipo = tipo;
    svg.classList.toggle('editando', editando);
    svg.innerHTML = DEFS
      + `<g class="escena">${ESCENAS[tipo]()}</g>`
      + (editando ? `<rect x="${ZONAS[tipo].x1}" y="${ZONAS[tipo].y1}" width="${ZONAS[tipo].x2 - ZONAS[tipo].x1}" height="${ZONAS[tipo].y2 - ZONAS[tipo].y1}" rx="10" class="zona-util"/>` : '')
      + `<g class="mesas-plano">${mesas.map((m) => mesaSVG(m, tipo, { editando, seleccion })).join('')}</g>`;
  }

  /** Convierte coordenadas de pantalla a coordenadas del plano. */
  function aPlano(svg, clientX, clientY) {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  return { pintar, tipoDe, limitar, buscarHueco, aPlano, geometria, ZONAS };
})();
