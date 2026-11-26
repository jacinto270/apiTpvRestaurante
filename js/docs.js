/* =====================================================================
   Documentación: lista de rutas y botón «Probar» para los GET públicos
   ===================================================================== */
(() => {
  const RUTAS = [
    { grupo: 'Autenticación', items: [
      ['POST', '/auth/login', 'publico', 'Inicia sesión y devuelve el empleado.', { id_personal: 13, contrasena: '1234' }],
      ['GET', '/auth/yo', 'sesion', 'Empleado con la sesión actual.'],
      ['POST', '/auth/logout', 'sesion', 'Cierra la sesión. Responde 204.'],
    ]},
    { grupo: 'Carta', items: [
      ['GET', '/carta', 'publico', 'Carta completa: secciones con sus platos disponibles, ingredientes y alérgenos, más la lista de alérgenos.'],
      ['GET', '/generos', 'publico', 'Secciones de la carta ordenadas.'],
      ['POST', '/generos', 'carta', 'Crea una sección. Si no indicas orden, se coloca la última.', { nombre: 'Arroces', orden: 3 }],
      ['PATCH', '/generos/{id}', 'carta', 'Modifica una sección.', { orden: 2 }],
      ['DELETE', '/generos/{id}', 'carta', 'Borra una sección sin platos.'],
      ['GET', '/alergenos', 'publico', 'Los 14 alérgenos de declaración obligatoria.'],
      ['POST', '/alergenos', 'carta', 'Crea un alérgeno.', { nombre: 'Kiwi', icono: 'img/alergenos/kiwi.svg' }],
    ]},
    { grupo: 'Platos', items: [
      ['GET', '/platos', 'publico', 'Todos los platos con su sección y alérgenos. Filtros: ?genero=4&disponible=1&buscar=arroz'],
      ['GET', '/platos/{id}', 'publico', 'Plato con ingredientes y alérgenos. Con rango de carta incluye el escandallo: cantidades, coste y margen.'],
      ['POST', '/platos', 'carta', 'Crea un plato.', { nombre: 'Arroz negro', precio: 17.5, id_genero: 3, imagen: 'img/platos/arroz_negro.jpg', orden: 8, disponible: true }],
      ['PATCH', '/platos/{id}', 'carta', 'Modifica cualquier campo. Útil para retirar un plato agotado.', { disponible: false }],
      ['PUT', '/platos/{id}/ingredientes', 'carta', 'Sustituye la receta completa (cantidad por ración, en la unidad del ingrediente).', [{ id_ingredientes: 41, cantidad: 0.1 }, { id_ingredientes: 1, cantidad: 0.02 }]],
      ['DELETE', '/platos/{id}', 'carta', 'Borra el plato y su receta. Si ya aparece en pedidos devuelve 409: márcalo como no disponible.'],
    ]},
    { grupo: 'Ingredientes', items: [
      ['GET', '/ingredientes', 'sesion', 'Ingredientes con unidad de compra y coste.'],
      ['GET', '/ingredientes/{id}', 'sesion', 'Ingrediente con sus alérgenos y los platos que lo usan.'],
      ['POST', '/ingredientes', 'carta', 'Crea un ingrediente.', { nombre: 'Sepia', unidades: 'kg', precio: 9.5 }],
      ['PATCH', '/ingredientes/{id}', 'carta', 'Modifica un ingrediente (p. ej. nuevo precio de compra).', { precio: 10.2 }],
      ['PUT', '/ingredientes/{id}/alergenos', 'carta', 'Sustituye sus alérgenos por esta lista de ids.', [4, 14]],
      ['DELETE', '/ingredientes/{id}', 'carta', 'Borra un ingrediente que no esté en ninguna receta.'],
    ]},
    { grupo: 'Mesas', items: [
      ['GET', '/mesas', 'sesion', 'Mesas con su posición en el plano (pos_x, pos_y en un lienzo de 1000 × 620; null = sin colocar) y su pedido activo (o null). Filtro: ?salon=terraza'],
      ['PUT', '/mesas/plano', 'sala', 'Guarda de una vez la distribución de un salón: posiciones y sillas de las mesas existentes, mesas nuevas (sin id, con nombre) y mesas a eliminar (sólo si nunca han tenido pedidos).',
        { salon: 'comedor', mesas: [{ id: 3, comensales: 4, pos_x: 220, pos_y: 180 }, { nombre: 'Comedor 11', comensales: 6, pos_x: 520, pos_y: 300 }], borrar: [7] }],
      ['POST', '/mesas', 'sala', 'Crea una mesa.', { nombre: 'Terraza 16', comensales: 4, salon: 'terraza', pos_x: 500, pos_y: 300 }],
      ['PATCH', '/mesas/{id}', 'sala', 'Modifica una mesa.', { comensales: 6 }],
      ['DELETE', '/mesas/{id}', 'sala', 'Borra una mesa sin pedidos.'],
    ]},
    { grupo: 'Pedidos', items: [
      ['GET', '/pedidos', 'sesion', 'Listado. Filtros: ?estado=abierto,cerrado&mesa=3&personal=13&desde=2026-11-01&hasta=2026-11-30&limite=50'],
      ['POST', '/pedidos', 'sesion', 'Abre un pedido en una mesa libre a nombre del empleado de la sesión.', { id_mesa: 4 }],
      ['GET', '/pedidos/{id}', 'sesion', 'Pedido con sus líneas.'],
      ['PATCH', '/pedidos/{id}', 'sesion', 'Cambia estado (abierto ⇄ cerrado → pagado | anulado), forma de pago o mesa. Para cobrar hace falta tipo_pago. Anular un pedido con consumiciones exige rango de sala.', { estado: 'pagado', tipo_pago: 'tarjeta' }],
      ['POST', '/pedidos/{id}/lineas', 'sesion', 'Añade un plato al precio actual, en el pase de su sección (bebidas = 0, no van a cocina); se puede indicar otro pase. Queda «pendiente» (en espera) hasta que se marche. Si ya hay una línea igual en espera, sin nota y del mismo pase, suma la cantidad.', { id_platos: 12, cantidad: 2, notas: 'sin cebolla' }],
      ['POST', '/pedidos/{id}/marchar', 'sesion', 'Marcha a cocina los platos en espera de un pase (1er pase, 2º, 3º o postres). Sin pase: el siguiente pase con platos en espera. Devuelve el pedido y un resumen de lo marchado.', { pase: 2 }],
      ['PATCH', '/lineas/{id}', 'sesion', 'Cambia cantidad, notas, pase (sólo en espera) o estado: pendiente → marchado → en cocina → listo → servido. Notas vacías la borran.', { estado: 'en cocina' }],
      ['DELETE', '/lineas/{id}', 'sesion', 'Quita una línea pendiente. Si ya está en cocina exige rango de sala.'],
    ]},
    { grupo: 'Cocina y caja', items: [
      ['GET', '/cocina', 'sesion', 'Platos de los pedidos activos que pasan por cocina (pase > 0): marchados, en cocina, listos y los que esperan a ser marchados, por orden de marcha.'],
      ['GET', '/cocina/listos', 'sesion', 'Platos listos en el pase esperando a que sala los sirva (para los avisos a camareros).'],
      ['GET', '/resumen', 'sesion', 'Caja del día: ventas, pedidos, ticket medio, formas de pago y platos más vendidos. Filtro: ?fecha=2026-11-25'],
    ]},
    { grupo: 'Cierre de caja', items: [
      ['GET', '/caja/x', 'sesion', 'Informe X: ventas desde el último cierre Z (no cambia nada). Totales, formas de pago, ventas por camarero, productos vendidos, anulaciones, mesas abiertas y efectivo esperado (fondo FONDO_CAJA + cobros en efectivo).'],
      ['POST', '/caja/z', 'sala', 'Cierre Z: congela y numera el informe, guarda el arqueo y sella los pedidos del periodo para que la caja vuelva a 0. No se permite con mesas abiertas ni sin ventas.', { efectivo_contado: 446.5, notas: 'Turno de noche' }],
      ['GET', '/caja/cierres', 'sala', 'Histórico de cierres Z (los 60 últimos).'],
      ['GET', '/caja/cierres/{id}', 'sala', 'Informe completo de un cierre Z, tal como quedó al cerrarlo (para reimprimirlo).'],
    ]},
    { grupo: 'Reservas', items: [
      ['GET', '/reservas/reto', 'publico', 'Pregunta de verificación anti-bots (un solo uso, caduca a los 30 min), horas de los turnos y fechas admitidas. Usa la cookie de sesión.'],
      ['POST', '/reservas', 'publico', 'Solicitud de reserva desde la web. Queda «pendiente» hasta que la confirme una persona. Exige la respuesta al reto, un mínimo de 4 s desde que se pidió, el campo trampa «web» vacío y no superar 3 solicitudes por hora desde la misma conexión.',
        { nombre: 'Ana López', email: 'ana@ejemplo.com', telefono: '600 123 456', fecha: '2026-12-05', hora: '21:00', comensales: 4, zona: 'terraza', comentarios: 'Cumpleaños', acepta_privacidad: true, reto_token: '…', reto_respuesta: '9', web: '' }],
      ['POST', '/reservas/verificar', 'publico', 'El cliente confirma su correo con el enlace que recibe ({URL_WEB}?verificar=TOKEN). La solicitud pasa de «sin_verificar» a «pendiente» y se avisa por correo al equipo. Los enlaces caducan a las 24 h y sirven una sola vez. Solo se aplica si hay SMTP configurado.', { token: '64 caracteres hexadecimales' }],
      ['GET', '/reservas/disponibilidad', 'publico', 'Aforo por turno. Con ?fecha=2026-12-05&comensales=4 devuelve las plazas libres de la comida y la cena y si el día está completo. Sin fecha devuelve los días completos de los próximos 60 días. Aforo = suma de plazas de las mesas × RESERVA_PORCENTAJE_AFORO; cuentan las solicitudes pendientes y confirmadas.'],
      ['GET', '/reservas', 'sala', 'Reservas desde hoy con sus datos de contacto. Filtros: ?estado=pendiente,confirmada&desde=2026-11-26&hasta=2026-12-31'],
      ['GET', '/reservas/pendientes', 'sala', 'Número de solicitudes por confirmar (para el aviso del TPV).'],
      ['GET', '/reservas/mesas-ocupadas', 'sala', 'Mesas con reserva confirmada en el mismo turno que una fecha y hora (no se pueden volver a asignar). Filtros: ?fecha=2026-12-05&hora=21:00'],
      ['PATCH', '/reservas/{id}', 'sala', 'Confirmar (con mesa opcional), rechazar (se avisa al cliente por correo: aforo completo), cancelar o marcar «no_presentado» (sólo tras la hora; añade al cliente a la lista negra y le envía un SMS). pendiente → confirmada | rechazada; confirmada → cancelada | no_presentado. Avisa si la mesa ya tiene otra reserva confirmada a menos de 2 horas.', { estado: 'confirmada', id_mesa: 12 }],
    ]},
    { grupo: 'Lista negra', items: [
      ['GET', '/lista-negra', 'sala', 'Clientes que no se presentaron o anularon con menos de RESERVA_HORAS_ANULACION_TARDIA horas. Mientras estén en la lista, POST /reservas les responde 403 pidiendo que llamen (se les reconoce por correo o teléfono).'],
      ['POST', '/lista-negra/{id}/sms', 'sala', 'Reintenta el SMS que pide al cliente que llame al restaurante. Devuelve sms_estado: enviado, error o sin_configurar.'],
      ['DELETE', '/lista-negra/{id}', 'sala', 'Saca al cliente de la lista: vuelve a poder reservar por la web.'],
    ]},
    { grupo: 'Personal', items: [
      ['GET', '/personal/acceso', 'publico', 'Empleados activos (nombre y rango) para la pantalla de acceso.'],
      ['GET', '/personal', 'sesion', 'Plantilla completa, sin contraseñas.'],
      ['POST', '/personal', 'direccion', 'Da de alta un empleado. La contraseña se cifra.', { nombre: 'Ana', apellidos: 'López Ruiz', rango: 'camarero', contrasena: '5678' }],
      ['PATCH', '/personal/{id}', 'direccion', 'Modifica datos, rango o contraseña.', { rango: 'jefe de sala' }],
      ['DELETE', '/personal/{id}', 'direccion', 'Baja lógica (activo = 0): sus pedidos se conservan.'],
    ]},
  ];

  const NIVEL = { publico: 'Público', sesion: 'Sesión', carta: 'Carta', sala: 'Sala', direccion: 'Dirección' };
  const slug = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\W+/g, '-');
  const base = new URL('api/index.php', location.href).href;

  document.querySelector('#marca').insertAdjacentHTML('afterbegin', LOGO_SVG);
  document.querySelector('#url-base').textContent = base;

  document.querySelector('#grupos').innerHTML = RUTAS.map(({ grupo, items }) => `
    <section class="docs__bloque" id="${slug(grupo)}">
      <h2>${esc(grupo)}</h2>
      ${items.map(([metodo, ruta, nivel, texto, ejemplo]) => {
        const probable = metodo === 'GET' && nivel === 'publico';
        return `
        <details class="endpoint">
          <summary>
            <span class="metodo metodo--${metodo}">${metodo}</span>
            <span class="endpoint__ruta">${esc(ruta)}</span>
            <span class="nivel nivel--${nivel}">${NIVEL[nivel]}</span>
          </summary>
          <div class="endpoint__detalle">
            <p>${esc(texto)}</p>
            ${ejemplo !== undefined ? `<span class="endpoint__etiqueta">Cuerpo de ejemplo</span>
              <pre><code>${esc(JSON.stringify(ejemplo, null, 2))}</code></pre>` : ''}
            ${probable ? `<button class="btn btn--olivo probar" data-ruta="${esc(ruta.replace('{id}', '1'))}">Probar ${esc(ruta.replace('{id}', '1'))}</button>
              <pre class="respuesta oculto"><code></code></pre>` : ''}
          </div>
        </details>`;
      }).join('')}
    </section>`).join('');

  document.querySelector('#indice').innerHTML =
    '<p class="versalitas">Guía</p><a href="#autenticacion">Autenticación</a><a href="#errores">Errores</a>' +
    '<p class="versalitas">Recursos</p>' + RUTAS.map(({ grupo }) => `<a href="#${slug(grupo)}">${esc(grupo)}</a>`).join('');

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('.probar');
    if (!b) return;
    const salida = b.nextElementSibling;
    salida.classList.remove('oculto');
    salida.firstElementChild.textContent = 'Cargando…';
    try {
      const datos = await api.get(b.dataset.ruta);
      const texto = JSON.stringify(datos, null, 2);
      salida.firstElementChild.textContent = texto.length > 6000 ? texto.slice(0, 6000) + '\n…' : texto;
    } catch (err) {
      salida.firstElementChild.textContent = `Error ${err.estado}: ${err.message}`;
    }
  });
})();
