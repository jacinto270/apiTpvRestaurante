#!/usr/bin/env node
/* =====================================================================
   Generador de los iconos originales de la carta de Olea.
   Uso:  node herramientas/generar-iconos-platos.js
   Crea un SVG por plato en img/iconos/platos/ (mismo nombre que la imagen
   anterior, con extensión .svg). Todo el dibujo está en este archivo:
   para cambiar un icono, edita su entrada en PLATOS y vuelve a ejecutarlo.

   Estilo: lienzo 200×200, fondo suave por sección, trazo azul marino,
   colores mediterráneos. Platos vistos desde arriba; bebidas de lado.
   El contenido queda dentro de un radio de ~72 px para que se vea entero
   en los discos redondos de la carta y del TPV.
   ===================================================================== */
const fs = require('fs');
const path = require('path');

const SALIDA = path.join(__dirname, '..', 'img', 'iconos', 'platos');

/* --- Paleta ----------------------------------------------------------- */
const C = {
  tinta: '#0b2e47', blanco: '#ffffff', loza: '#f7fbfd', borde: '#d6e6ef',
  tomate: '#e2483b', tomateClaro: '#f07a5a', naranja: '#f39a2b', azafran: '#f2b632', limon: '#f7d83c',
  oliva: '#6f8f3a', verde: '#8fbf4d', verdeOscuro: '#4e7a2c', albahaca: '#3f8f3a',
  crema: '#fbf1d9', beige: '#ead7b0', pan: '#e8b973', corteza: '#b5763a', dorado: '#e0a54a',
  marron: '#8a5a3b', chocolate: '#5b3423', carne: '#9c3d2c', carneClara: '#c8664f', rosaJamon: '#d2525f',
  salmon: '#f08a6b', rosa: '#f2a7b5', frambuesa: '#c72d4b', negro: '#2b2f36', gris: '#a9b4bb',
  barro: '#c8673e', barroOscuro: '#9a4a2b', acero: '#55646d', madera: '#c9925b', maderaOscura: '#9b6a3c',
  agua: '#bfe6f7', mar: '#2aaae8', cola: '#4a2418', vinoTinto: '#7b1e3a', vinoBlanco: '#f3e6a2', rosado: '#f2a0a8',
  cerveza: '#f2a91c', cervezaTostada: '#b35a1f', espuma: '#fffaf0', cafe: '#4b2a1a', cafeLeche: '#c8956a',
};
const FONDOS = {
  Entrantes: '#fdf0e1', Raciones: '#fbe9df', Primeros: '#fff4d4', Segundos: '#f9e6df',
  Postres: '#fde9ef', Bebidas: '#e3f4fc', Vinos: '#f6e6ec', Cervezas: '#fff1d2',
};

/* --- Utilidades -------------------------------------------------------- */
const T = (w = 4) => `stroke="${C.tinta}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const g = (contenido, x = 0, y = 0, rot = 0, esc = 1) =>
  `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${esc})">${contenido}</g>`;
// Pseudoaleatorio estable para que cada icono salga siempre igual
const semilla = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) / 4294967296); };

/* --- Vajilla (vista cenital) ------------------------------------------- */
const plato = (r = 70) => `<circle cx="100" cy="100" r="${r}" fill="${C.blanco}" ${T()}/>
  <circle cx="100" cy="100" r="${r - 15}" fill="none" stroke="${C.borde}" stroke-width="3"/>`;
const cuenco = (relleno, r = 64) => `<circle cx="100" cy="100" r="${r}" fill="${C.blanco}" ${T()}/>
  <circle cx="100" cy="100" r="${r - 13}" fill="${relleno}" ${T(3)}/>
  <path d="M${100 - (r - 22)} ${100 - 14} a ${r - 22} ${r - 22} 0 0 1 ${(r - 22) * 0.9} -${(r - 22) * 0.55}" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="5"/>`;
const cazuela = (relleno, r = 66) => `<circle cx="100" cy="100" r="${r}" fill="${C.barro}" ${T()}/>
  <circle cx="100" cy="100" r="${r - 12}" fill="${relleno}" ${T(3)}/>`;
const paellera = (relleno) => `
  <rect x="16" y="91" width="22" height="18" rx="9" fill="${C.acero}" ${T(3)}/>
  <rect x="162" y="91" width="22" height="18" rx="9" fill="${C.acero}" ${T(3)}/>
  <circle cx="100" cy="100" r="66" fill="${C.acero}" ${T()}/>
  <circle cx="100" cy="100" r="58" fill="${relleno}" ${T(3)}/>`;
const tabla = () => g(`<rect x="-66" y="-46" width="132" height="92" rx="16" fill="${C.madera}" ${T()}/>
  <rect x="58" y="-10" width="22" height="20" rx="8" fill="${C.madera}" ${T(3)}/>
  <circle cx="72" cy="0" r="3.5" fill="${C.tinta}"/>
  <path d="M-52 -24 h80 M-48 0 h60 M-52 24 h86" stroke="${C.maderaOscura}" stroke-width="2.5" stroke-linecap="round" opacity=".45"/>`, 96, 100, -14);
const fuente = () => `<ellipse cx="100" cy="100" rx="74" ry="56" fill="${C.blanco}" ${T()}/>
  <ellipse cx="100" cy="100" rx="60" ry="43" fill="none" stroke="${C.borde}" stroke-width="3"/>`;

/* --- Ingredientes (vista cenital) --------------------------------------- */
const rodajaTomate = (x, y, r = 14) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${C.tomate}" ${T(3)}/>
  <circle cx="${x}" cy="${y}" r="${r * 0.62}" fill="${C.tomateClaro}"/>
  ${[0, 120, 240].map((a) => `<ellipse cx="${x + Math.cos((a * Math.PI) / 180) * r * 0.38}" cy="${y + Math.sin((a * Math.PI) / 180) * r * 0.38}" rx="${r * 0.16}" ry="${r * 0.1}" fill="#fbd3b4" transform="rotate(${a} ${x + Math.cos((a * Math.PI) / 180) * r * 0.38} ${y + Math.sin((a * Math.PI) / 180) * r * 0.38})"/>`).join('')}`;
const hoja = (x, y, rot = 0, l = 16, color = C.albahaca) => g(`<path d="M0 0 Q ${l / 2} -${l / 2.6} ${l} 0 Q ${l / 2} ${l / 2.6} 0 0Z" fill="${color}" ${T(2.5)}/>
  <path d="M2 0 H${l - 3}" stroke="${C.tinta}" stroke-width="1.5" opacity=".5"/>`, x, y, rot);
const aceituna = (x, y, color = C.oliva, rot = 0) => g(`<ellipse rx="7.5" ry="5.5" fill="${color}" ${T(2.5)}/><ellipse cx="-2" cy="-1.5" rx="2" ry="1.3" fill="#fff" opacity=".5"/>`, x, y, rot);
const gamba = (x, y, rot = 0, s = 1) => g(`<path d="M-14 -4 C -14 -18, 10 -20, 14 -4 C 16 6, 8 14, 0 12 L 2 4 C 6 4, 8 0, 6 -4 C 2 -11, -6 -9, -6 -2 Z" fill="${C.salmon}" ${T(2.5)}/>
  <path d="M-6 -12 L-2 -4 M2 -14 L3 -5 M9 -10 L5 -2" stroke="${C.tinta}" stroke-width="1.6" opacity=".55"/>
  <path d="M0 12 l-6 6 m6 -6 l2 8" stroke="${C.tinta}" stroke-width="2.5" stroke-linecap="round"/>`, x, y, rot, s);
const mejillon = (x, y, rot = 0) => g(`<path d="M0 -20 C 14 -16, 14 14, 0 20 C -14 14, -14 -16, 0 -20Z" fill="${C.negro}" ${T(2.5)}/>
  <path d="M0 -13 C 8 -10, 8 10, 0 14 C -8 10, -8 -10, 0 -13Z" fill="${C.naranja}"/>`, x, y, rot);
const almeja = (x, y, rot = 0) => g(`<path d="M-11 4 C -11 -10, 11 -10, 11 4 Z" fill="${C.crema}" ${T(2.5)}/>
  <path d="M-6 3 L-3 -6 M0 3 L0 -7 M6 3 L3 -6" stroke="${C.tinta}" stroke-width="1.5" opacity=".5"/>`, x, y, rot);
const anillo = (x, y, r = 12) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${C.dorado}" ${T(3)}/>
  <circle cx="${x}" cy="${y}" r="${r * 0.48}" fill="${C.blanco}" ${T(2.5)}/>
  <circle cx="${x - r * 0.55}" cy="${y - r * 0.5}" r="1.4" fill="${C.corteza}"/><circle cx="${x + r * 0.6}" cy="${y + r * 0.3}" r="1.4" fill="${C.corteza}"/>`;
const croqueta = (x, y, rot = 0) => g(`<rect x="-17" y="-9.5" width="34" height="19" rx="9.5" fill="${C.dorado}" ${T(3)}/>
  <circle cx="-8" cy="-2" r="1.5" fill="${C.corteza}"/><circle cx="2" cy="3" r="1.5" fill="${C.corteza}"/><circle cx="9" cy="-3" r="1.5" fill="${C.corteza}"/>`, x, y, rot);
const limonRodaja = (x, y, r = 12, color = C.limon) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" ${T(2.5)}/>
  <circle cx="${x}" cy="${y}" r="${r - 3}" fill="#fff6b8"/>
  ${[0, 60, 120].map((a) => `<path d="M${x + Math.cos((a * Math.PI) / 180) * (r - 4)} ${y + Math.sin((a * Math.PI) / 180) * (r - 4)} L${x - Math.cos((a * Math.PI) / 180) * (r - 4)} ${y - Math.sin((a * Math.PI) / 180) * (r - 4)}" stroke="${color}" stroke-width="2"/>`).join('')}`;
const romero = (x, y, rot = 0, l = 40) => g(`<path d="M0 0 L${l} 0" stroke="${C.verdeOscuro}" stroke-width="3" stroke-linecap="round"/>
  ${Array.from({ length: 7 }, (_, i) => `<path d="M${5 + i * (l / 8)} 0 l4 ${i % 2 ? 7 : -7}" stroke="${C.verdeOscuro}" stroke-width="2.6" stroke-linecap="round"/>`).join('')}`, x, y, rot);
const ajo = (x, y, rot = 0) => g(`<path d="M-6 0 C -6 -8, 6 -8, 6 0 C 6 6, -6 6, -6 0Z" fill="#fff7e6" ${T(2.5)}/>`, x, y, rot);
const guindilla = (x, y, rot = 0) => g(`<path d="M-12 0 C -6 -5, 6 -5, 12 2 C 4 4, -6 4, -12 0Z" fill="${C.tomate}" ${T(2.2)}/><path d="M12 2 l5 -3" stroke="${C.verdeOscuro}" stroke-width="3" stroke-linecap="round"/>`, x, y, rot);
const pescado = (x, y, rot = 0, l = 96, cuerpo = '#c9d6dd', vientre = '#eef3f5') => g(`
  <path d="M${-l / 2} 0 C ${-l / 3} ${-l / 4.2}, ${l / 4} ${-l / 4.6}, ${l / 2.8} -2 L ${l / 2} ${-l / 6} L ${l / 2.2} 0 L ${l / 2} ${l / 6} L ${l / 2.8} 2 C ${l / 4} ${l / 4.6}, ${-l / 3} ${l / 4.2}, ${-l / 2} 0Z" fill="${cuerpo}" ${T(3)}/>
  <path d="M${-l / 2.6} 4 C ${-l / 6} ${l / 7}, ${l / 6} ${l / 7.5}, ${l / 3.2} 3" fill="none" stroke="${vientre}" stroke-width="5" stroke-linecap="round"/>
  <circle cx="${-l / 2.9}" cy="-4" r="3.5" fill="${C.blanco}" ${T(2)}/><circle cx="${-l / 2.9}" cy="-4" r="1.3" fill="${C.tinta}"/>
  <path d="M${-l / 4.2} -10 C ${-l / 4.8} -2, ${-l / 4.8} 6, ${-l / 4.2} 12" fill="none" stroke="${C.tinta}" stroke-width="2"/>`, x, y, rot);
const filete = (x, y, rot = 0, color = C.carne, s = 1) => g(`<path d="M-38 -10 C -40 -28, 6 -34, 26 -24 C 44 -14, 42 18, 22 26 C 0 34, -36 26, -38 8 Z" fill="${color}" ${T(3)}/>
  <path d="M-24 -18 L 16 18 M-30 -2 L 2 26 M-8 -26 L 30 8" stroke="#5a2318" stroke-width="4" stroke-linecap="round" opacity=".55"/>
  <path d="M-30 14 C -20 22, 0 26, 14 22" fill="none" stroke="#f3d9b8" stroke-width="4" stroke-linecap="round" opacity=".8"/>`, x, y, rot, s);
const patatasFritas = (x, y, n = 6, rot = 0) => g(Array.from({ length: n }, (_, i) =>
  `<rect x="${-n * 4 + i * 8}" y="${-16 + (i % 2) * 6}" width="7" height="30" rx="2" fill="${C.azafran}" ${T(2.2)} transform="rotate(${(i - n / 2) * 6} ${-n * 4 + i * 8} 0)"/>`).join(''), x, y, rot);
const nuez = (x, y, rot = 0) => g(`<path d="M-8 -6 C -2 -12, 6 -10, 8 -4 C 12 4, 4 10, -2 8 C -10 8, -12 0, -8 -6Z" fill="${C.marron}" ${T(2.2)}/><path d="M-4 -4 C 0 -2, 2 2, 0 6" fill="none" stroke="${C.tinta}" stroke-width="1.5" opacity=".6"/>`, x, y, rot);
const almendra = (x, y, rot = 0) => g(`<path d="M0 -8 C 6 -4, 6 4, 0 9 C -6 4, -6 -4, 0 -8Z" fill="${C.dorado}" ${T(2)}/>`, x, y, rot);
const fresa = (x, y, r = 9, color = C.frambuesa) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" ${T(2.2)}/><circle cx="${x - 3}" cy="${y - 3}" r="1.6" fill="#fff" opacity=".6"/>`;
const sesamo = (rnd, n, cx, cy, rx, ry) => Array.from({ length: n }, () =>
  `<ellipse cx="${cx + (rnd() - 0.5) * rx * 2}" cy="${cy + (rnd() - 0.5) * ry * 2}" rx="2" ry="1.1" fill="#fff8e1" transform="rotate(${rnd() * 180})"/>`).join('');
const granos = (rnd, n, r, color, tam = 2.6) => Array.from({ length: n }, () => {
  const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r;
  return `<ellipse cx="${100 + Math.cos(a) * d}" cy="${100 + Math.sin(a) * d}" rx="${tam}" ry="${tam * 0.55}" fill="${color}" transform="rotate(${rnd() * 180} ${100 + Math.cos(a) * d} ${100 + Math.sin(a) * d})"/>`;
}).join('');
const gotas = (rnd, n, r, color, tam = 3) => Array.from({ length: n }, () => {
  const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r;
  return `<circle cx="${100 + Math.cos(a) * d}" cy="${100 + Math.sin(a) * d}" r="${tam * (0.6 + rnd() * 0.6)}" fill="${color}"/>`;
}).join('');

/* --- Bebidas (vista lateral) -------------------------------------------- */
// Vaso recto: x central 100, base en y=162
const vaso = ({ liquido, nivel = 0.75, ancho = 56, alto = 92, hielo = false, pajita = null, rodaja = null, burbujas = false, espuma = null }) => {
  const top = 162 - alto, b = ancho / 2, t = b + 6;
  const ly = 162 - alto * nivel;
  const tl = b + (t - b) * nivel;
  let s = `<path d="M${100 - tl} ${ly} L${100 + tl} ${ly} L${100 + b - 1.5} 160 L${100 - b + 1.5} 160Z" fill="${liquido}"/>`;
  if (espuma) s += `<path d="M${100 - t} ${top + 2} L${100 + t} ${top + 2} L${100 + tl} ${ly + 2} L${100 - tl} ${ly + 2}Z" fill="${espuma}"/>`;
  if (hielo) s += [[-10, ly + 14, -12], [9, ly + 22, 14], [-4, ly + 36, 5]].map(([dx, yy, r]) => `<rect x="${100 + dx - 9}" y="${yy - 9}" width="18" height="18" rx="4" fill="#fff" fill-opacity=".55" ${T(2)} transform="rotate(${r} ${100 + dx} ${yy})"/>`).join('');
  if (burbujas) s += [[-12, 140, 2.5], [6, 128, 2], [14, 148, 2.8], [-4, 116, 1.8], [10, 104, 2.2], [-14, 100, 1.8]].filter(([, yy]) => yy > ly + 4).map(([dx, yy, r]) => `<circle cx="${100 + dx}" cy="${yy}" r="${r}" fill="none" stroke="#fff" stroke-width="1.6"/>`).join('');
  if (pajita) s += `<path d="M${100 + 6} 150 L${100 + 18} ${top - 18} L${100 + 30} ${top - 22}" fill="none" stroke="${pajita}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`;
  s += `<path d="M${100 - t} ${top} L${100 + t} ${top} L${100 + b} 162 L${100 - b} 162Z" fill="#ffffff" fill-opacity=".18" ${T()}/>`;
  s += `<path d="M${100 - t + 8} ${top + 8} L${100 - b + 7} 150" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7"/>`;
  if (rodaja) s += `<g transform="translate(${100 + t - 4} ${top + 4})">${limonRodaja(0, 0, 13, rodaja).replace(/cx="0"/g, 'cx="0"')}</g>`;
  return s;
};
const copa = ({ vino, nivel = 0.5, burbujas = false, flauta = false }) => {
  const bowl = flauta
    ? 'M86 36 L114 36 C 116 70, 112 100, 100 108 C 88 100, 84 70, 86 36Z'
    : 'M72 40 L128 40 C 132 72, 122 100, 100 104 C 78 100, 68 72, 72 40Z';
  const corte = flauta ? 36 + (1 - nivel) * 60 : 40 + (1 - nivel) * 50;
  return `<defs><clipPath id="cp"><path d="${bowl}"/></clipPath></defs>
    <rect x="60" y="${corte}" width="80" height="80" fill="${vino}" clip-path="url(#cp)"/>
    ${burbujas ? [[95, 92], [104, 80], [98, 66], [106, 58]].map(([bx, by]) => `<circle cx="${bx}" cy="${by}" r="2" fill="none" stroke="#fff" stroke-width="1.5"/>`).join('') : ''}
    <path d="${bowl}" fill="#ffffff" fill-opacity=".2" ${T()}/>
    <path d="M100 ${flauta ? 108 : 104} L100 150" ${T()}/>
    <path d="M78 158 C 86 150, 114 150, 122 158 Z" fill="${C.blanco}" ${T()}/>
    <path d="${flauta ? 'M91 44 C 90 60, 90 76, 93 88' : 'M80 50 C 79 64, 82 78, 88 88'}" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7"/>`;
};
const botella = ({ cristal, etiqueta, texto = '', tipo = 'vino', capsula = null, etiquetaTexto = C.tinta }) => {
  const formas = {
    vino: 'M90 30 L110 30 L110 62 C 124 70, 126 82, 126 96 L126 166 C 126 170, 122 172, 118 172 L82 172 C 78 172, 74 170, 74 166 L74 96 C 74 82, 76 70, 90 62Z',
    cava: 'M91 30 L109 30 L110 60 C 126 72, 128 86, 128 100 L128 166 C 128 170, 124 172, 120 172 L80 172 C 76 172, 72 170, 72 166 L72 100 C 72 86, 74 72, 90 60Z',
    agua: 'M92 28 L108 28 L108 44 C 120 50, 124 60, 124 72 L124 166 C 124 170, 120 172, 116 172 L84 172 C 80 172, 76 170, 76 166 L76 72 C 76 60, 80 50, 92 44Z',
    cerveza: 'M93 32 L107 32 L107 64 C 116 72, 120 84, 120 96 L120 166 C 120 170, 116 172, 112 172 L88 172 C 84 172, 80 170, 80 166 L80 96 C 80 84, 84 72, 93 64Z',
  };
  const ancho = { vino: 52, cava: 56, agua: 48, cerveza: 40 }[tipo];
  return `<path d="${formas[tipo]}" fill="${cristal}" ${T()}/>
    ${capsula ? `<path d="M${tipo === 'cava' ? 89 : 90} 26 L${tipo === 'cava' ? 111 : 110} 26 L${tipo === 'cava' ? 112 : 110} ${tipo === 'cava' ? 66 : 52} L${tipo === 'cava' ? 88 : 90} ${tipo === 'cava' ? 66 : 52}Z" fill="${capsula}" ${T(3)}/>` : `<rect x="${tipo === 'agua' ? 90 : 91}" y="${tipo === 'agua' ? 20 : 24}" width="${tipo === 'agua' ? 20 : 18}" height="10" rx="3" fill="${tipo === 'agua' ? C.mar : C.dorado}" ${T(3)}/>`}
    <rect x="${100 - ancho / 2}" y="112" width="${ancho}" height="38" rx="4" fill="${etiqueta}" ${T(3)}/>
    ${texto ? `<text x="100" y="135" text-anchor="middle" dominant-baseline="middle" font-family="Georgia, serif" font-size="${Math.min(14, (ancho - 8) / (texto.length * 0.68)).toFixed(1)}" font-weight="700" fill="${etiquetaTexto}">${texto}</text>` : ''}
    <path d="M${100 - ancho / 2 + 8} 100 L${100 - ancho / 2 + 8} 160" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".45"/>`;
};
const tazaCenital = (cafe, conLeche = false) => `
  <circle cx="100" cy="104" r="62" fill="${C.blanco}" ${T()}/>
  <circle cx="100" cy="104" r="50" fill="none" stroke="${C.borde}" stroke-width="3"/>
  <rect x="140" y="92" width="30" height="20" rx="10" fill="${C.blanco}" ${T()}/>
  <circle cx="100" cy="104" r="40" fill="${C.blanco}" ${T()}/>
  <circle cx="100" cy="104" r="31" fill="${cafe}" ${T(3)}/>
  ${conLeche
    ? '<path d="M100 92 C 92 84, 80 92, 88 102 L100 114 L112 102 C 120 92, 108 84, 100 92Z" fill="#fff4e0"/>'
    : '<ellipse cx="92" cy="96" rx="9" ry="5" fill="#a6643b" opacity=".7"/>'}
  <path d="M66 156 C 76 150, 80 160, 92 154" fill="none" stroke="${C.marron}" stroke-width="3" stroke-linecap="round" opacity=".0"/>`;
const jarra = (liquido, espuma = C.espuma) => `
  <path d="M138 70 C 162 70, 162 128, 138 128" fill="none" ${T(10)}/>
  <path d="M138 70 C 162 70, 162 128, 138 128" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="4"/>
  <rect x="58" y="44" width="84" height="120" rx="10" fill="${liquido}" ${T()}/>
  <path d="M54 50 C 58 30, 76 34, 82 40 C 90 28, 110 30, 116 40 C 124 32, 146 36, 146 52 C 148 62, 52 64, 54 50Z" fill="${espuma}" ${T(3)}/>
  <path d="M74 74 V150 M100 74 V150 M126 74 V150" stroke="#fff" stroke-opacity=".35" stroke-width="5" stroke-linecap="round"/>`;

/* --- Fondo -------------------------------------------------------------- */
const lienzo = (seccion, contenido) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
<rect width="200" height="200" fill="${FONDOS[seccion]}"/>
<circle cx="64" cy="54" r="70" fill="#fff" opacity=".35"/>
${contenido}
</svg>
`;

/* =====================================================================
   Platos
   ===================================================================== */
const PLATOS = {
  /* ---------------- Entrantes ---------------- */
  pan_con_tomate_y_aceite: ['Entrantes', () => tabla()
    + g(`<rect x="-30" y="-22" width="60" height="44" rx="12" fill="${C.corteza}" ${T(3)}/>
         <rect x="-24" y="-16" width="48" height="32" rx="8" fill="${C.pan}"/>
         <path d="M-20 -8 C -10 -16, 6 -4, 18 -12 C 22 0, 10 8, 20 12 C 4 16, -10 6, -20 12 Z" fill="${C.tomate}" opacity=".85"/>
         <circle cx="-8" cy="2" r="3" fill="${C.azafran}" opacity=".9"/><circle cx="10" cy="-4" r="2.4" fill="${C.azafran}" opacity=".9"/>`, 82, 96, -14)
    + g(`<rect x="-24" y="-18" width="48" height="36" rx="10" fill="${C.corteza}" ${T(3)}/>
         <rect x="-19" y="-13" width="38" height="26" rx="7" fill="${C.pan}"/>
         <path d="M-15 -6 C -4 -12, 8 0, 15 -8 C 16 4, 6 8, 14 10 C 0 12, -8 4, -15 9Z" fill="${C.tomate}" opacity=".85"/>`, 128, 114, 8)
    + rodajaTomate(126, 70, 12)],

  hummus_con_crudites: ['Entrantes', () => {
    const r = semilla('hummus');
    return cuenco(C.beige, 50).replace(/cx="100" cy="100"/g, 'cx="88" cy="96"')
      + `<path d="M88 76 C 112 78, 110 112, 88 114 C 70 112, 70 88, 86 92 C 98 94, 96 106, 88 104" fill="none" stroke="#d9bd8c" stroke-width="4" stroke-linecap="round"/>
         <circle cx="88" cy="96" r="5" fill="${C.oliva}" opacity=".9"/>${gotas(r, 7, 10, C.tomate, 1.6).replace(/cx="(\d+\.?\d*)"/g, (m, v) => `cx="${+v - 12}"`)}`
      + g(`<rect x="-4" y="-30" width="9" height="56" rx="4" fill="${C.naranja}" ${T(2.5)}/>`, 150, 104, 24)
      + g(`<rect x="-4" y="-28" width="9" height="52" rx="4" fill="${C.verde}" ${T(2.5)}/>`, 140, 128, 52)
      + g(`<rect x="-4" y="-26" width="9" height="48" rx="4" fill="${C.naranja}" ${T(2.5)}/>`, 132, 60, -30);
  }],

  ensaladilla_rusa: ['Entrantes', () => {
    const r = semilla('ensaladilla');
    return plato() + `<path d="M58 104 C 54 76, 84 62, 104 64 C 132 64, 148 84, 142 106 C 138 128, 108 138, 94 136 C 70 136, 60 124, 58 104Z" fill="${C.crema}" ${T(3)}/>`
      + gotas(r, 14, 30, C.verde, 2.6) + gotas(r, 10, 30, C.naranja, 2.4)
      + `<g>${[[86, 90], [112, 108]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="11" ry="8" fill="#fff" ${T(2.5)}/><circle cx="${x}" cy="${y}" r="4.5" fill="${C.azafran}"/>`).join('')}</g>`
      + aceituna(118, 82, C.negro, 20) + aceituna(84, 116, C.negro, -30);
  }],

  salmorejo_cordobes: ['Entrantes', () => cuenco('#ef7d4f')
    + `<path d="M70 88 C 90 80, 112 96, 130 86" fill="none" stroke="${C.azafran}" stroke-width="4" stroke-linecap="round" opacity=".9"/>`
    + `<g>${[[86, 106], [104, 114], [112, 98]].map(([x, y]) => `<rect x="${x - 6}" y="${y - 6}" width="12" height="12" rx="3" fill="${C.rosaJamon}" ${T(2)}/>`).join('')}</g>`
    + `<ellipse cx="94" cy="122" rx="9" ry="6.5" fill="#fff" ${T(2)}/><circle cx="94" cy="122" r="3.5" fill="${C.azafran}"/>`],

  burrata_con_tomate_y_pesto: ['Entrantes', () => plato()
    + [[100, 60], [138, 86], [134, 128], [96, 142], [62, 116], [64, 76]].map(([x, y]) => rodajaTomate(x, y, 15)).join('')
    + `<circle cx="100" cy="100" r="27" fill="#fffdf7" ${T(3)}/><path d="M88 92 C 96 84, 110 86, 114 96" fill="none" stroke="#e8e0cf" stroke-width="3" stroke-linecap="round"/>
       <path d="M86 104 C 92 112, 104 114, 114 106" fill="none" stroke="${C.albahaca}" stroke-width="5" stroke-linecap="round"/>`
    + hoja(106, 84, -30, 18) + hoja(84, 98, 200, 14)],

  croquetas_caseras_de_jamon_6_uds: ['Entrantes', () => fuente()
    + [[76, 84, -10], [110, 80, 14], [142, 92, -6], [70, 114, 10], [104, 114, -16], [134, 120, 8]].map(([x, y, a]) => croqueta(x, y, a)).join('')
    + hoja(92, 98, -40, 12, C.verde) + hoja(122, 100, 30, 12, C.verde)],

  /* ---------------- Raciones ---------------- */
  jamon_iberico_de_bellota: ['Raciones', () => tabla()
    + [[70, 82, -14], [108, 74, 4], [76, 118, 10], [116, 112, -8]].map(([x, y, a]) => g(`
        <path d="M-26 -10 C -16 -20, 12 -18, 26 -10 C 30 0, 22 12, 10 12 C -2 18, -24 14, -28 4 Z" fill="${C.rosaJamon}" ${T(2.8)}/>
        <path d="M-18 -4 C -6 -10, 8 -2, 20 -6 M-16 6 C -4 0, 8 8, 18 4" fill="none" stroke="#fbe3e6" stroke-width="3" stroke-linecap="round"/>`, x, y, a)).join('')
    + g(`<path d="M-8 -18 L6 -18 L6 14 L-8 14Z" fill="${C.pan}" ${T(2.5)}/><path d="M-8 -10 H6 M-8 -2 H6 M-8 6 H6" stroke="${C.corteza}" stroke-width="1.6"/>`, 140, 94, 20)],

  queso_manchego_curado: ['Raciones', () => fuente()
    + [[68, 92, -20], [94, 86, -6], [120, 84, 8], [146, 90, 22], [82, 120, -10], [116, 120, 8]].map(([x, y, a], i) => g(`
        <path d="M-14 16 L0 -18 L14 16 Z" fill="#f6d987" ${T(2.8)}/>
        <path d="M-14 16 L14 16 L11 10 L-11 10 Z" fill="#a8742f"/>
        <path d="M-10 6 L10 6 M-6 -2 L6 -2" stroke="#e5be62" stroke-width="2"/>`, x, y, a + (i > 3 ? 180 : 0))).join('')],

  calamares_a_la_andaluza: ['Raciones', () => plato()
    + [[80, 76, 13], [110, 70, 12], [136, 90, 13], [74, 106, 12], [104, 100, 14], [132, 122, 12], [92, 130, 13], [62, 132, 10]].map(([x, y, rr]) => anillo(x, y, rr)).join('')
    + g(limonRodaja(0, 0, 14), 140, 62).replace('', '')
    + hoja(118, 146, -20, 13, C.verde)],

  gambas_al_ajillo: ['Raciones', () => {
    const r = semilla('ajillo');
    return cazuela('#f4c457')
      + [[80, 84, 20], [116, 80, -30], [130, 112, 60], [96, 124, 150], [70, 112, 100]].map(([x, y, a]) => gamba(x, y, a, 1.05)).join('')
      + [[100, 98, 0], [118, 128, 40], [84, 102, -40]].map(([x, y, a]) => ajo(x, y, a)).join('')
      + guindilla(104, 60, -20) + guindilla(66, 130, 50) + gotas(r, 8, 44, C.verde, 1.8);
  }],

  pulpo_a_la_gallega: ['Raciones', () => {
    const r = semilla('pulpo');
    return g(`<circle r="66" fill="${C.madera}" ${T()}/><circle r="54" fill="none" stroke="${C.maderaOscura}" stroke-width="2.5" opacity=".5"/>`, 100, 100)
      + `<g>${Array.from({ length: 11 }, (_, i) => {
          const a = (i / 11) * Math.PI * 2, x = 100 + Math.cos(a) * 30 + (r() - 0.5) * 10, y = 100 + Math.sin(a) * 30 + (r() - 0.5) * 10;
          return `<circle cx="${x}" cy="${y}" r="10" fill="#f0e6e9" ${T(2.5)}/><circle cx="${x}" cy="${y}" r="5" fill="#b8456a"/><circle cx="${x + 5}" cy="${y - 3}" r="1.6" fill="#b8456a"/>`;
        }).join('')}</g>`
      + gotas(r, 30, 46, '#d1452e', 1.5) + gotas(r, 6, 40, C.azafran, 2.4)
      + `<circle cx="100" cy="100" r="12" fill="#f0e6e9" ${T(2.5)}/><circle cx="100" cy="100" r="6" fill="#b8456a"/>`;
  }],

  mejillones_a_la_marinera: ['Raciones', () => cazuela('#e46a3f')
    + [[78, 78, -30], [104, 70, 10], [130, 84, 40], [70, 108, -70], [100, 100, 0], [130, 114, 70], [86, 132, -20], [116, 134, 20]].map(([x, y, a]) => mejillon(x, y, a)).join('')
    + hoja(90, 92, 30, 10, C.verde) + hoja(118, 102, -40, 10, C.verde)],

  boquerones_en_vinagre: ['Raciones', () => {
    const r = semilla('boquerones');
    return fuente()
      + [[-30, 0], [-15, 4], [0, 0], [15, 4], [30, 0]].map(([dx, rot], i) => g(`
          <path d="M-36 0 C -28 -8, 28 -8, 38 -2 C 30 6, -28 8, -36 0Z" fill="#eef1ee" ${T(2.5)}/>
          <path d="M-30 -2 C -10 -5, 16 -5, 34 -2" stroke="#9fb2bb" stroke-width="2.5" stroke-linecap="round"/>`, 100, 100 + dx * 0.9, rot - 6 + i * 3)).join('')
      + gotas(r, 10, 40, C.verdeOscuro, 2) + ajo(64, 76, 20) + ajo(136, 124, -20);
  }],

  patatas_bravas: ['Raciones', () => {
    const r = semilla('bravas');
    return plato() + Array.from({ length: 11 }, (_, i) => {
      const a = (i / 11) * Math.PI * 2 + 0.3, d = i % 3 === 0 ? 8 : 30, x = 100 + Math.cos(a) * d, y = 100 + Math.sin(a) * d;
      return `<rect x="${x - 11}" y="${y - 11}" width="22" height="22" rx="6" fill="${C.azafran}" ${T(2.8)} transform="rotate(${r() * 90} ${x} ${y})"/>`;
    }).join('')
      + `<path d="M74 92 C 84 80, 98 96, 110 84 C 122 74, 132 92, 124 100 C 112 110, 96 102, 86 110 C 76 114, 68 102, 74 92Z" fill="${C.tomate}" opacity=".92"/>`
      + `<path d="M84 116 C 94 110, 104 122, 116 114" fill="none" stroke="#fffaf0" stroke-width="6" stroke-linecap="round"/>`;
  }],

  /* ---------------- Primeros ---------------- */
  paella_valenciana: ['Primeros', () => {
    const r = semilla('paella');
    return paellera('#f2c14e') + granos(r, 120, 54, '#fbe3a0', 2.6)
      + [[74, 78], [124, 120]].map(([x, y]) => g(`<path d="M-14 -10 C -2 -18, 14 -8, 12 6 C 10 16, -10 18, -14 6 Z" fill="${C.dorado}" ${T(2.5)}/>`, x, y)).join('')
      + [[118, 72], [74, 122]].map(([x, y]) => `<path d="M${x - 14} ${y + 6} C ${x - 4} ${y - 8}, ${x + 6} ${y - 8}, ${x + 14} ${y + 2}" fill="none" stroke="${C.verde}" stroke-width="7" stroke-linecap="round"/>`).join('')
      + gotas(r, 8, 44, '#d9d1b8', 3.4)
      + g(limonRodaja(0, 0, 13), 100, 100) + gotas(r, 6, 46, C.tomate, 2);
  }],

  arroz_negro_con_alioli: ['Primeros', () => {
    const r = semilla('negro');
    return paellera('#2b2f36') + granos(r, 110, 54, '#4a505a', 2.6)
      + [[76, 84], [124, 82], [108, 126]].map(([x, y]) => `<rect x="${x - 12}" y="${y - 6}" width="24" height="12" rx="6" fill="#efe6dc" ${T(2.5)}/>`).join('')
      + `<path d="M84 104 C 84 94, 100 92, 102 100 C 106 108, 92 116, 84 104Z" fill="#fffaf0" ${T(2.5)}/>`
      + g(limonRodaja(0, 0, 12), 130, 110);
  }],

  fideua_de_marisco: ['Primeros', () => {
    const r = semilla('fideua');
    return paellera('#e9a64a') + Array.from({ length: 60 }, () => {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 52, x = 100 + Math.cos(a) * d, y = 100 + Math.sin(a) * d;
      return `<path d="M${x - 5} ${y} q 5 -4 10 0" fill="none" stroke="#f9d98d" stroke-width="2.6" stroke-linecap="round" transform="rotate(${r() * 180} ${x} ${y})"/>`;
    }).join('')
      + gamba(80, 82, 30, 1) + gamba(124, 118, 210, 1) + mejillon(122, 78, 30) + mejillon(78, 120, -20)
      + `<path d="M92 100 C 92 92, 106 92, 108 98 C 110 106, 96 110, 92 100Z" fill="#fffaf0" ${T(2.5)}/>`;
  }],

  gazpacho_andaluz: ['Primeros', () => cuenco('#e85a3c')
    + `<g>${[[84, 84, C.verde], [104, 80, '#fff2c6'], [120, 96, C.verde], [80, 108, C.tomateClaro], [100, 118, '#fff2c6'], [116, 116, C.verde]].map(([x, y, c]) => `<rect x="${x - 5}" y="${y - 5}" width="10" height="10" rx="2.5" fill="${c}" ${T(1.8)}/>`).join('')}</g>`
    + `<path d="M74 96 C 86 102, 96 92, 106 100" fill="none" stroke="${C.azafran}" stroke-width="3.5" stroke-linecap="round"/>`
    + hoja(96, 96, -40, 14)],

  ensalada_griega: ['Primeros', () => cuenco('#cfe7a4')
    + [[80, 84], [118, 120]].map(([x, y]) => rodajaTomate(x, y, 12)).join('')
    + [[118, 82], [78, 118]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="11" fill="#e8f3cf" ${T(2.5)}/><circle cx="${x}" cy="${y}" r="7" fill="#f6faea"/>`).join('')
    + `<g>${[[96, 96], [104, 104], [98, 108]].map(([x, y], i) => `<rect x="${x - 8}" y="${y - 8}" width="16" height="16" rx="2" fill="#fbfbf3" ${T(2.5)} transform="rotate(${i * 20} ${x} ${y})"/>`).join('')}</g>`
    + aceituna(100, 72, '#4a2b3c', 10) + aceituna(134, 102, '#4a2b3c', -40) + aceituna(66, 100, '#4a2b3c', 60)
    + `<path d="M88 130 C 94 124, 104 132, 112 126" fill="none" stroke="#b05b9a" stroke-width="3" stroke-linecap="round"/>`],

  crema_de_calabaza: ['Primeros', () => cuenco(C.naranja)
    + `<path d="M100 82 C 120 82, 122 106, 104 108 C 90 110, 88 96, 98 94 C 106 92, 108 100, 102 102" fill="none" stroke="#fff3df" stroke-width="5" stroke-linecap="round"/>`
    + `<g>${[[80, 112], [86, 118], [118, 116], [74, 92]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="3.6" ry="2.4" fill="#6b8a3a"/>`).join('')}</g>`
    + hoja(110, 118, -20, 12, C.verde)],

  risotto_de_setas_y_parmesano: ['Primeros', () => {
    const r = semilla('risotto');
    return plato() + `<circle cx="100" cy="100" r="44" fill="#f4e8c8" ${T(3)}/>` + granos(r, 90, 40, '#fffaf0', 2.8)
      + [[82, 88, -20], [116, 86, 30], [100, 116, 0]].map(([x, y, a]) => g(`<path d="M-12 0 C -12 -12, 12 -12, 12 0 Z" fill="${C.marron}" ${T(2.5)}/><rect x="-4" y="0" width="8" height="12" rx="3" fill="#efe1c4" ${T(2.5)}/>`, x, y, a)).join('')
      + [[74, 108], [126, 104], [96, 80]].map(([x, y]) => `<path d="M${x - 8} ${y} l16 -4" stroke="#fff6c2" stroke-width="4" stroke-linecap="round"/>`).join('')
      + hoja(110, 100, -60, 10, C.verde);
  }],

  /* ---------------- Segundos ---------------- */
  entrecot_de_vaca_a_la_brasa: ['Segundos', () => plato() + filete(92, 96, -10)
    + patatasFritas(140, 118, 4, 30) + romero(56, 128, -20, 36)
    + `<circle cx="132" cy="74" r="8" fill="${C.verde}" ${T(2.5)}/><circle cx="144" cy="84" r="6" fill="${C.verde}" ${T(2.5)}/>`],

  cordero_asado_al_romero: ['Segundos', () => plato()
    + [[84, 92, -30], [116, 100, 20]].map(([x, y, a]) => g(`
        <path d="M-6 -14 C 10 -24, 30 -10, 26 8 C 22 22, 0 26, -8 14 C -14 6, -16 -6, -6 -14Z" fill="${C.carneClara}" ${T(3)}/>
        <path d="M-6 -12 C -18 -18, -30 -22, -38 -20" stroke="${C.tinta}" stroke-width="9" stroke-linecap="round"/>
        <path d="M-6 -12 C -18 -18, -30 -22, -38 -20" stroke="#fffaf0" stroke-width="4" stroke-linecap="round"/>
        <path d="M2 -2 L18 10 M6 -10 L22 0" stroke="#8a3424" stroke-width="3" stroke-linecap="round" opacity=".6"/>`, x, y, a)).join('')
    + romero(70, 134, -10, 44) + ajo(132, 70, 30) + ajo(140, 80, -20)],

  secreto_iberico_con_patatas: ['Segundos', () => plato()
    + [[74, 84, -20], [98, 80, -10], [122, 84, 4]].map(([x, y, a]) => g(`<rect x="-10" y="-22" width="20" height="44" rx="8" fill="#b84c3f" ${T(2.8)}/><path d="M-6 -16 L6 -10 M-6 -2 L6 4" stroke="#f3d1c2" stroke-width="3" stroke-linecap="round"/>`, x, y, a)).join('')
    + patatasFritas(100, 126, 7, 0) + `<circle cx="140" cy="118" r="5" fill="${C.verde}"/><circle cx="62" cy="118" r="5" fill="${C.verde}"/>`],

  pollo_de_corral_al_ajillo: ['Segundos', () => cazuela('#f0c45f')
    + [[84, 88, -30], [118, 96, 30], [98, 122, 100]].map(([x, y, a]) => g(`
        <path d="M-18 -8 C -20 -22, 8 -24, 12 -10 C 14 0, 6 8, -4 8 C -14 8, -18 2, -18 -8Z" fill="#e3a052" ${T(2.8)}/>
        <path d="M8 2 L22 14" stroke="${C.tinta}" stroke-width="8" stroke-linecap="round"/><path d="M8 2 L22 14" stroke="#fffaf0" stroke-width="3.6" stroke-linecap="round"/>`, x, y, a)).join('')
    + [[70, 116, 20], [126, 72, -30], [128, 124, 60], [102, 76, 0]].map(([x, y, a]) => ajo(x, y, a)).join('')
    + hoja(106, 104, 20, 10, C.verde) + hoja(84, 110, -50, 10, C.verde)],

  albondigas_caseras_en_salsa: ['Segundos', () => cazuela('#c9512f')
    + [[82, 84], [116, 82], [100, 106], [74, 114], [126, 112], [100, 132]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="15" fill="#8a4b2c" ${T(2.8)}/><path d="M${x - 8} ${y - 6} a 9 9 0 0 1 10 -4" fill="none" stroke="#c98d6a" stroke-width="3" stroke-linecap="round"/>`).join('')
    + gotas(semilla('alb'), 8, 50, C.verde, 2.4)],

  lubina_a_la_sal: ['Segundos', () => {
    const r = semilla('sal');
    return fuente() + `<ellipse cx="100" cy="100" rx="64" ry="34" fill="#fbfbf7" ${T(3)}/>` + gotas(r, 40, 30, '#e3e7ea', 1.6)
      + pescado(100, 100, 0, 104, '#dfe6ea', '#fbfbf7').replace(/fill="#dfe6ea"/, 'fill="#e8edf0" fill-opacity=".9"')
      + g(limonRodaja(0, 0, 11), 64, 70) + g(limonRodaja(0, 0, 11), 140, 132);
  }],

  dorada_a_la_espalda: ['Segundos', () => fuente()
    + g(`<path d="M-50 0 C -34 -30, 30 -32, 40 -4 L 54 -16 L 50 0 L 54 16 L 40 4 C 30 32, -34 30, -50 0Z" fill="#d7dfe3" ${T(3)}/>
         <path d="M-40 0 C -20 -12, 20 -12, 38 0 C 20 12, -20 12, -40 0Z" fill="#f6f0e4" ${T(2.5)}/>
         <path d="M-34 0 H34" stroke="#d9c9a8" stroke-width="2"/>`, 100, 98)
    + [[84, 98], [104, 98]].map(([x, y]) => ajo(x, y, 0)).join('') + guindilla(118, 92, 20)
    + `<g>${[[70, 84], [126, 112], [92, 112]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="${C.verde}"/>`).join('')}</g>`],

  bacalao_al_pil_pil: ['Segundos', () => cazuela('#f7dc7d')
    + g(`<path d="M-36 -22 C -10 -30, 24 -28, 36 -18 C 40 0, 36 20, 30 26 C 0 30, -26 28, -36 22 C -40 4, -40 -12, -36 -22Z" fill="#fbf7ee" ${T(3)}/>
         <path d="M-26 -14 C -4 -6, 10 -12, 26 -4 M-28 4 C -6 10, 12 4, 28 12" fill="none" stroke="#e6dccb" stroke-width="3" stroke-linecap="round"/>
         <path d="M-36 -22 C -10 -30, 24 -28, 36 -18" fill="none" stroke="#8e9aa1" stroke-width="5" stroke-linecap="round"/>`, 100, 100, -6)
    + [[68, 74, 20], [134, 128, -20]].map(([x, y, a]) => ajo(x, y, a)).join('') + guindilla(132, 74, 40) + guindilla(70, 128, -10)],

  salmon_a_la_plancha_con_verduras: ['Segundos', () => plato()
    + g(`<rect x="-34" y="-20" width="68" height="40" rx="10" fill="${C.salmon}" ${T(3)}/>
         <path d="M-24 -20 C -14 -6, -14 6, -24 20 M-6 -20 C 4 -6, 4 6, -6 20 M12 -20 C 22 -6, 22 6, 12 20" fill="none" stroke="#fbd0bd" stroke-width="3.5"/>
         <path d="M-30 -14 L30 14 M-30 2 L14 22" stroke="#9a3e2a" stroke-width="3" stroke-linecap="round" opacity=".5"/>`, 94, 90, -12)
    + `<g>${[[70, 128, C.verde], [92, 136, '#f2c14e'], [116, 132, C.tomate], [138, 120, C.verde]].map(([x, y, c]) => `<rect x="${x - 11}" y="${y - 6}" width="22" height="12" rx="6" fill="${c}" ${T(2.5)}/>`).join('')}</g>`
    + g(limonRodaja(0, 0, 11), 138, 74)],

  merluza_en_salsa_verde_con_almejas: ['Segundos', () => cazuela('#a9c86b')
    + g(`<path d="M-30 -18 C -6 -26, 20 -22, 32 -12 C 36 4, 30 18, 22 22 C -2 26, -24 24, -32 14 C -36 0, -36 -10, -30 -18Z" fill="#fbf8f0" ${T(3)}/>
         <path d="M-20 -10 C -4 -4, 8 -10, 22 -2 M-22 6 C -4 12, 10 6, 24 12" fill="none" stroke="#e8e0d0" stroke-width="3" stroke-linecap="round"/>`, 100, 96, 4)
    + [[70, 76, -20], [130, 74, 20], [70, 126, 200], [128, 128, 160], [100, 136, 180]].map(([x, y, a]) => almeja(x, y, a)).join('')
    + gotas(semilla('verde'), 10, 50, C.verdeOscuro, 2)],

  tataki_de_atun_rojo_con_sesamo: ['Segundos', () => {
    const r = semilla('tataki');
    return plato() + [-30, -10, 10, 30].map((dx, i) => g(`
        <rect x="-9" y="-30" width="18" height="60" rx="3" fill="#7a1f2f" ${T(2.8)}/>
        <rect x="-5" y="-26" width="10" height="52" rx="2" fill="#c8324a"/>`, 100 + dx, 96 + (i % 2) * 4, -8)).join('')
      + sesamo(r, 26, 100, 96, 40, 30)
      + `<path d="M64 132 C 84 124, 116 140, 136 130" fill="none" stroke="#4b2a1a" stroke-width="5" stroke-linecap="round" opacity=".8"/>`
      + hoja(130, 64, 40, 14, C.verde);
  }],

  /* ---------------- Postres ---------------- */
  crema_catalana: ['Postres', () => g(`<circle r="66" fill="${C.barro}" ${T()}/><circle r="54" fill="#f2b74a" ${T(3)}/>`, 100, 100)
    + `<path d="M62 92 L84 100 L94 84 L112 96 L134 88 M84 100 L90 122 M112 96 L118 118 L136 112 M90 122 L70 116" fill="none" stroke="#a3591e" stroke-width="3" stroke-linecap="round" opacity=".8"/>`
    + `<circle cx="80" cy="80" r="9" fill="#fff" opacity=".3"/>`
    + g(`<path d="M0 0 L22 -4" stroke="${C.marron}" stroke-width="6" stroke-linecap="round"/>`, 120, 130)],

  tarta_de_queso_al_horno: ['Postres', () => plato()
    + g(`<path d="M-30 30 L0 -40 L30 30 Z" fill="#fbe9b0" ${T(3)}/>
         <path d="M-30 30 L0 -40 L8 -22 L-14 30 Z" fill="#7a3d17"/>
         <path d="M-30 30 L-14 30 L8 -22 L0 -40 Z" fill="none" ${T(3)}/>
         <path d="M0 -40 L30 30" fill="none" stroke="#c78b3a" stroke-width="5" stroke-linecap="round"/>`, 100, 98, 12)
    + fresa(140, 72, 8) + fresa(130, 60, 6) + hoja(146, 60, -30, 10, C.verde)
    + `<path d="M62 132 C 76 124, 86 136, 98 128" fill="none" stroke="${C.frambuesa}" stroke-width="4" stroke-linecap="round"/>`],

  tiramisu: ['Postres', () => plato()
    + `<rect x="62" y="64" width="76" height="72" rx="10" fill="#8a5636" ${T(3)}/>`
    + `<rect x="68" y="70" width="64" height="60" rx="6" fill="#a8704a"/>`
    + gotas(semilla('tira'), 60, 28, '#5b3423', 1.5)
    + `<path d="M76 80 C 90 74, 110 86, 124 78" fill="none" stroke="#c99470" stroke-width="3" stroke-linecap="round"/>`
    + g(`<path d="M-10 0 C -10 -8, 10 -8, 10 0 L 6 10 L -6 10Z" fill="#3b2216" ${T(2)}/>`, 118, 116, 20)
    + hoja(80, 120, -30, 10, C.verde)],

  yogur_griego_con_miel_y_nueces: ['Postres', () => cuenco('#fffdf8')
    + `<path d="M74 90 C 90 76, 112 98, 128 84" fill="none" stroke="${C.azafran}" stroke-width="6" stroke-linecap="round"/>`
    + `<path d="M76 112 C 92 100, 110 120, 126 108" fill="none" stroke="${C.azafran}" stroke-width="4.5" stroke-linecap="round" opacity=".85"/>`
    + [[92, 100, 0], [112, 96, 40], [104, 120, -30], [82, 124, 60]].map(([x, y, a]) => nuez(x, y, a)).join('')
    + g(`<rect x="-6" y="-26" width="12" height="30" rx="5" fill="${C.maderaOscura}" ${T(2.5)}/><path d="M-10 4 h20 M-10 10 h20 M-10 16 h20" stroke="${C.tinta}" stroke-width="3" stroke-linecap="round"/>`, 150, 72, 30)],

  arroz_con_leche: ['Postres', () => {
    const r = semilla('arrozleche');
    return cuenco('#fbf3df') + granos(r, 80, 40, '#ffffff', 2.8)
      + `<path d="M82 92 L118 112 M84 112 L120 92" stroke="${C.corteza}" stroke-width="4" stroke-linecap="round" opacity=".7"/>`
      + gotas(r, 30, 36, '#c4874a', 1.4)
      + g(`<rect x="-24" y="-5" width="48" height="10" rx="5" fill="#a0602f" ${T(2.5)}/><path d="M-18 -5 C -16 0, -16 4, -18 5 M-4 -5 C -2 0, -2 4, -4 5" stroke="#6b3b17" stroke-width="1.5"/>`, 108, 74, -30)
      + `<path d="M66 116 a 8 8 0 0 0 16 0" fill="#fbe39a" ${T(2.2)}/>`;
  }],

  panna_cotta_con_frutos_rojos: ['Postres', () => plato()
    + `<circle cx="100" cy="100" r="36" fill="#fffaf0" ${T(3)}/>`
    + `<path d="M76 92 C 82 72, 118 72, 124 92 C 128 104, 118 112, 112 106 C 106 100, 98 116, 90 108 C 82 102, 72 106, 76 92Z" fill="${C.frambuesa}" ${T(2.5)}/>`
    + [[96, 88, 7], [110, 84, 6], [88, 98, 6], [104, 98, 6], [118, 96, 5]].map(([x, y, rr], i) => fresa(x, y, rr, i % 2 ? '#7b2d6b' : '#d63650')).join('')
    + hoja(112, 74, -30, 12, C.verde) + hoja(98, 72, 210, 10, C.verde)],

  turron_de_almendra_casero: ['Postres', () => plato()
    + [[-18, 0], [18, 8]].map(([dx, a]) => g(`<rect x="-20" y="-34" width="40" height="68" rx="6" fill="#f2dfb0" ${T(3)}/>
        <rect x="-20" y="-34" width="40" height="6" rx="3" fill="#fffaf0" ${T(2)}/>`, 100 + dx, 100, a)).join('')
    + [[80, 82, 20], [86, 106, -30], [78, 122, 60], [120, 94, -10], [114, 116, 40], [124, 130, 0]].map(([x, y, a]) => almendra(x, y, a)).join('')],

  fruta_de_temporada: ['Postres', () => plato()
    + g(`<path d="M-30 0 C -30 -20, 30 -20, 30 0 Z" fill="#7fbf4d" ${T(3)}/><path d="M-24 -2 C -24 -14, 24 -14, 24 -2 Z" fill="#e8433b"/>
        ${[-14, -4, 6, 16].map((x) => `<ellipse cx="${x}" cy="-8" rx="1.6" ry="2.6" fill="${C.negro}"/>`).join('')}`, 98, 82, -10)
    + g(`<circle r="16" fill="${C.naranja}" ${T(3)}/><circle r="12" fill="#ffc66b"/>${[0, 45, 90, 135].map((a) => `<path d="M0 0 L${Math.cos((a * Math.PI) / 180) * 12} ${Math.sin((a * Math.PI) / 180) * 12} M0 0 L${-Math.cos((a * Math.PI) / 180) * 12} ${-Math.sin((a * Math.PI) / 180) * 12}" stroke="${C.naranja}" stroke-width="1.8"/>`).join('')}`, 74, 118)
    + g(`<path d="M-14 -16 C 6 -20, 18 -4, 14 12 C 10 22, -10 20, -14 8 Z" fill="#9ccf5a" ${T(3)}/><circle cx="2" cy="2" r="5" fill="#f6e7a1"/>`, 124, 120, 20)
    + `<path d="M58 88 C 56 70, 76 64, 80 74" fill="none" stroke="${C.verdeOscuro}" stroke-width="3"/>` + fresa(132, 82, 8, '#e0394a')],

  /* ---------------- Bebidas ---------------- */
  agua_mineral_50_cl: ['Bebidas', () => botella({ cristal: '#cdeefb', etiqueta: C.mar, tipo: 'agua', texto: '50cl', etiquetaTexto: '#fff' })
    + `<path d="M84 80 C 96 76, 104 84, 116 80" fill="none" stroke="#fff" stroke-width="3" opacity=".8"/>`],

  agua_con_gas_50_cl: ['Bebidas', () => botella({ cristal: '#cdeefb', etiqueta: '#0b6fb8', tipo: 'agua', texto: 'GAS', etiquetaTexto: '#fff' })
    + [[90, 160, 3], [104, 156, 2.5], [96, 100, 2.5], [108, 92, 2], [88, 84, 1.8], [112, 70, 2.2], [98, 64, 1.8]].map(([x, y, rr]) => `<circle cx="${x}" cy="${y}" r="${rr}" fill="none" stroke="#fff" stroke-width="1.8"/>`).join('')],

  refresco_de_cola: ['Bebidas', () => vaso({ liquido: C.cola, nivel: 0.82, hielo: true, pajita: C.tomate, burbujas: true, rodaja: C.limon })],
  refresco_de_naranja: ['Bebidas', () => vaso({ liquido: C.naranja, nivel: 0.82, hielo: true, pajita: '#0b6fb8', burbujas: true, rodaja: C.naranja })],
  refresco_de_limon: ['Bebidas', () => vaso({ liquido: '#f5e46a', nivel: 0.82, hielo: true, pajita: C.verde, burbujas: true, rodaja: C.limon })],
  tonica: ['Bebidas', () => copa({ vino: '#e7f6fb', nivel: 0.75, burbujas: true }).replace('M72 40 L128 40', 'M66 44 L134 44').replace('C 132 72, 122 100, 100 104 C 78 100, 68 72, 72 40Z', 'C 138 80, 124 104, 100 106 C 76 104, 62 80, 66 44Z')
    + g(limonRodaja(0, 0, 12, C.verde), 84, 74) + romero(100, 58, -60, 30)],
  zumo_de_naranja_natural: ['Bebidas', () => vaso({ liquido: '#f7a531', nivel: 0.85, ancho: 52, alto: 96, rodaja: C.naranja })
    + `<g transform="translate(150 150)"><path d="M-16 0 A 16 16 0 0 1 16 0 Z" fill="${C.naranja}" ${T(2.5)}/><path d="M-12 -1 A 12 12 0 0 1 12 -1 Z" fill="#ffc66b"/></g>`],
  cafe_solo: ['Bebidas', () => tazaCenital(C.cafe, false)],
  cafe_con_leche: ['Bebidas', () => tazaCenital(C.cafeLeche, true)],

  /* ---------------- Vinos ---------------- */
  copa_de_vino_tinto_de_la_casa: ['Vinos', () => copa({ vino: C.vinoTinto, nivel: 0.5 })],
  copa_de_vino_blanco_de_la_casa: ['Vinos', () => copa({ vino: C.vinoBlanco, nivel: 0.5 })],
  rioja_crianza_botella: ['Vinos', () => botella({ cristal: '#3a1420', etiqueta: '#f3e7cf', texto: 'RIOJA', capsula: C.vinoTinto })],
  ribera_del_duero_roble_botella: ['Vinos', () => botella({ cristal: '#2f1a1a', etiqueta: '#e9d3a8', texto: 'RIBERA', capsula: '#1f1f1f' })],
  priorat_tinto_botella: ['Vinos', () => botella({ cristal: '#2a1018', etiqueta: '#1f1f1f', texto: 'PRIORAT', capsula: C.dorado, etiquetaTexto: C.dorado })],
  rueda_verdejo_botella: ['Vinos', () => botella({ cristal: '#cde3a1', etiqueta: '#fffaf0', texto: 'RUEDA', capsula: C.verde })],
  rias_baixas_albarino_botella: ['Vinos', () => botella({ cristal: '#bfe0d6', etiqueta: '#e3f4fc', texto: 'ALBARIÑO', capsula: '#0b6fb8' })],
  rosado_de_navarra_botella: ['Vinos', () => botella({ cristal: C.rosado, etiqueta: '#fffaf0', texto: 'ROSADO', capsula: C.frambuesa })],
  cava_brut_nature_botella: ['Vinos', () => botella({ cristal: '#2f4a2a', etiqueta: '#fffaf0', texto: 'CAVA', tipo: 'cava', capsula: C.dorado })
    + [[146, 54, 2.5], [154, 70, 2], [140, 76, 1.6]].map(([x, y, rr]) => `<circle cx="${x}" cy="${y}" r="${rr}" fill="none" stroke="${C.dorado}" stroke-width="1.8"/>`).join('')],

  /* ---------------- Cervezas ---------------- */
  cana_de_cerveza: ['Cervezas', () => vaso({ liquido: C.cerveza, nivel: 0.78, ancho: 46, alto: 86, espuma: C.espuma, burbujas: true })],
  jarra_de_cerveza: ['Cervezas', () => jarra(C.cerveza)],
  clara_con_limon: ['Cervezas', () => vaso({ liquido: '#f7cf4f', nivel: 0.8, ancho: 50, alto: 92, espuma: C.espuma, burbujas: true, rodaja: C.limon })],
  tercio_de_cerveza: ['Cervezas', () => botella({ cristal: '#7a3f12', etiqueta: '#fffaf0', texto: '33cl', tipo: 'cerveza', capsula: null })],
  cerveza_sin_alcohol: ['Cervezas', () => botella({ cristal: '#2f6a3a', etiqueta: '#e3f4fc', texto: '0,0', tipo: 'cerveza' })],
  cerveza_sin_gluten: ['Cervezas', () => botella({ cristal: '#7a3f12', etiqueta: '#fff1d2', texto: '', tipo: 'cerveza' })
    + g(`<path d="M0 12 V-10" stroke="${C.dorado}" stroke-width="2.5" stroke-linecap="round"/>${[-6, 0, 6].map((y) => `<ellipse cx="-3" cy="${y - 4}" rx="2.4" ry="4" fill="${C.dorado}" transform="rotate(-30 -3 ${y - 4})"/><ellipse cx="3" cy="${y - 4}" rx="2.4" ry="4" fill="${C.dorado}" transform="rotate(30 3 ${y - 4})"/>`).join('')}
        <path d="M-12 12 L12 -14" stroke="${C.tomate}" stroke-width="3.5" stroke-linecap="round"/>`, 100, 132)],
  cerveza_tostada: ['Cervezas', () => vaso({ liquido: C.cervezaTostada, nivel: 0.8, ancho: 50, alto: 96, espuma: '#f6e8cf', burbujas: true })],
  cerveza_artesana_ipa: ['Cervezas', () => `<path d="M76 46 C 72 74, 78 92, 86 104 C 92 114, 90 130, 88 146 L112 146 C 110 130, 108 114, 114 104 C 122 92, 128 74, 124 46Z" fill="#e88a1a" ${T()}/>
    <path d="M74 50 C 78 34, 92 38, 96 42 C 104 32, 122 36, 126 50 C 126 58, 74 60, 74 50Z" fill="${C.espuma}" ${T(3)}/>
    <path d="M84 146 L116 146 L120 160 L80 160Z" fill="#ffffff" fill-opacity=".3" ${T()}/>
    <path d="M84 64 C 82 80, 86 92, 92 100" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".6"/>
    ${g(`<path d="M0 -14 C 10 -12, 12 4, 0 14 C -12 4, -10 -12, 0 -14Z" fill="${C.verde}" ${T(2.5)}/><path d="M-6 -4 L6 -4 M-7 4 L7 4" stroke="${C.verdeOscuro}" stroke-width="2"/>`, 148, 104, 20)}`],
};

/* --- Generación ---------------------------------------------------------- */
fs.mkdirSync(SALIDA, { recursive: true });
let n = 0;
for (const [nombre, [seccion, dibujo]] of Object.entries(PLATOS)) {
  fs.writeFileSync(path.join(SALIDA, `${nombre}.svg`), lienzo(seccion, dibujo()));
  n++;
}
console.log(`${n} iconos generados en ${path.relative(process.cwd(), SALIDA) || SALIDA}`);
