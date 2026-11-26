<?php
declare(strict_types=1);

/**
 * Reservas desde la web
 *
 * Público
 *   GET   /reservas/reto        pregunta de verificación + horas disponibles
 *   POST  /reservas             solicitud de reserva (queda «pendiente»)
 *
 * Sala (admin, gerente, jefe de sala)
 *   GET   /reservas?estado=pendiente,confirmada&desde=2026-11-26&hasta=2026-12-31
 *   GET   /reservas/pendientes  número de solicitudes por revisar
 *   PATCH /reservas/{id}        {estado: confirmada|rechazada|cancelada, id_mesa?}
 *
 * Protección contra bots y abusos:
 *   1. Pregunta aritmética generada en el servidor, de un solo uso y con caducidad.
 *   2. Campo trampa «web» invisible para personas: si llega relleno, se descarta.
 *   3. Tiempo mínimo entre pedir la pregunta y enviar el formulario.
 *   4. Límite de solicitudes por conexión y hora (la IP se guarda cifrada).
 *   5. Ninguna reserva es firme hasta que la confirma una persona del equipo.
 */

const ESTADOS_RESERVA = ['pendiente', 'confirmada', 'rechazada', 'cancelada', 'no_presentado'];
const TRANSICIONES_RESERVA = [
    'sin_verificar' => [],   // sólo el cliente la verifica, desde el enlace del correo
    'pendiente'  => ['confirmada', 'rechazada'],
    'confirmada' => ['cancelada', 'no_presentado'],
    'rechazada'  => [],
    'cancelada'  => [],
    'no_presentado' => [],
];
const RETO_CADUCIDAD = 1800;   // 30 minutos
const VERIFICACION_HORAS = 24;

/** Se pide verificación por correo sólo si está activada y hay SMTP configurado. */
function verificacion_activa(): bool
{
    return defined('RESERVA_VERIFICAR_EMAIL') && RESERVA_VERIFICAR_EMAIL && correo_configurado();
}

function ruta_reservas(string $metodo, ?string $id): never
{
    if ($id === 'reto' && $metodo === 'GET') {
        responder(nuevo_reto());
    }
    if ($id === 'verificar' && $metodo === 'POST') {
        responder(verificar_reserva(cuerpo()));
    }
    if ($id === 'anulacion' && $metodo === 'POST') {
        responder(resumen_publico(reserva_por_anular(cuerpo())));   // sólo consulta, no anula
    }
    if ($id === 'anular' && $metodo === 'POST') {
        responder(anular_por_cliente(cuerpo()));
    }
    if ($id === 'disponibilidad' && $metodo === 'GET') {
        responder(disponibilidad($_GET['fecha'] ?? null, (int) ($_GET['comensales'] ?? 1)));
    }
    if ($id === null && $metodo === 'POST') {
        responder(solicitar_reserva(cuerpo()), 201);
    }

    $u = requiere_rango(RANGOS_SALA);

    if ($id === 'mesas-ocupadas' && $metodo === 'GET') {
        responder(mesas_reservadas((string) ($_GET['fecha'] ?? ''), (string) ($_GET['hora'] ?? '')));
    }
    if ($id === 'pendientes' && $metodo === 'GET') {
        responder(uno("SELECT COUNT(*) AS pendientes FROM reservas WHERE estado = 'pendiente' AND fecha >= CURDATE()"));
    }
    if ($id === null && $metodo === 'GET') {
        responder(listar_reservas());
    }
    if ($id !== null && in_array($metodo, ['PUT', 'PATCH'], true)) {
        responder(gestionar_reserva($u, id_valido($id), cuerpo()));
    }
    fallo(405, 'Método no permitido');
}

/* ------------------------------------------------------------------
 *  Horarios
 * ------------------------------------------------------------------ */
function horas_reserva(): array
{
    $horas = [];
    foreach (RESERVA_TURNOS as [$desde, $hasta]) {
        for ($t = strtotime("2000-01-01 $desde"); $t <= strtotime("2000-01-01 $hasta"); $t += 1800) {
            $horas[] = date('H:i', $t);
        }
    }
    return $horas;
}

/* ------------------------------------------------------------------
 *  Aforo por turno
 *  Cada turno (comida, cena) admite tantas plazas como suman las mesas
 *  del restaurante (× RESERVA_PORCENTAJE_AFORO). Cuentan las solicitudes
 *  pendientes y las confirmadas; las que nadie ha verificado aún, no.
 * ------------------------------------------------------------------ */
const ESTADOS_QUE_OCUPAN = "('pendiente', 'confirmada')";

/** Índice del turno al que pertenece una hora «HH:MM», o null si no está en ninguno. */
function turno_de(string $hora): ?int
{
    $hora = substr($hora, 0, 5);
    foreach (RESERVA_TURNOS as $i => [$desde, $hasta]) {
        if ($hora >= $desde && $hora <= $hasta) {
            return $i;
        }
    }
    return null;
}

function nombre_turno(int $i): string
{
    return RESERVA_TURNOS[$i][0] < '17:00' ? 'comida' : 'cena';
}

function aforo_turno(): int
{
    $plazas = (int) (uno('SELECT COALESCE(SUM(comensales), 0) AS p FROM mesas')['p'] ?? 0);
    return (int) floor($plazas * RESERVA_PORCENTAJE_AFORO / 100);
}

/** Plazas ya ocupadas por reservas en un turno de un día. */
function ocupacion_turno(string $fecha, int $turno, int $excluirId = 0): int
{
    [$desde, $hasta] = RESERVA_TURNOS[$turno];
    return (int) uno('SELECT COALESCE(SUM(comensales), 0) AS n FROM reservas
                       WHERE fecha = ? AND hora BETWEEN ? AND ? AND id <> ? AND estado IN ' . ESTADOS_QUE_OCUPAN,
        [$fecha, "$desde:00", "$hasta:00", $excluirId])['n'];
}

/** Ejecuta $fn con un bloqueo de MariaDB para que dos solicitudes no ocupen las mismas plazas a la vez. */
function con_bloqueo_reservas(callable $fn): mixed
{
    if (!(int) (uno("SELECT GET_LOCK('olea_reservas', 5) AS ok")['ok'] ?? 0)) {
        fallo(503, 'Hay mucha actividad en este momento. Inténtalo de nuevo en unos segundos.');
    }
    try {
        return $fn();
    } finally {
        consulta("SELECT RELEASE_LOCK('olea_reservas')");
    }
}

function comprobar_aforo(string $fecha, string $hora, int $comensales, int $excluirId = 0): void
{
    $turno = turno_de($hora) ?? fallo(422, 'Elige una hora dentro de nuestros turnos de servicio.');
    $libres = aforo_turno() - ocupacion_turno($fecha, $turno, $excluirId);
    if ($libres < $comensales) {
        $t = nombre_turno($turno);
        fallo(409, $libres <= 0
            ? "Fecha no disponible para la $t: aforo completo. Prueba otro día u otro turno."
            : "Para la $t de ese día solo nos quedan $libres plazas. Prueba otro día u otro turno.");
    }
}

/**
 * GET /reservas/disponibilidad?fecha=2026-12-05&comensales=4
 *   Con fecha: plazas libres de cada turno de ese día.
 *   Sin fecha: días completos (sin sitio en ningún turno) de los próximos RESERVA_DIAS_MAX días.
 */
function disponibilidad(?string $fecha, int $comensales): array
{
    $comensales = max(1, min(RESERVA_MAX_COMENSALES, $comensales));
    $aforo = aforo_turno();

    if ($fecha !== null) {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) {
            fallo(422, 'Fecha no válida');
        }
        $turnos = [];
        foreach (RESERVA_TURNOS as $i => [$desde, $hasta]) {
            $libres = max(0, $aforo - ocupacion_turno($fecha, $i));
            $turnos[] = ['turno' => nombre_turno($i), 'desde' => $desde, 'hasta' => $hasta,
                         'libres' => $libres, 'completo' => $libres < $comensales];
        }
        return ['fecha' => $fecha, 'turnos' => $turnos, 'completa' => !in_array(false, array_column($turnos, 'completo'), true)];
    }

    // Ocupación de todos los días futuros de una vez
    $ocupado = [];
    foreach (todos('SELECT fecha, TIME_FORMAT(hora, \'%H:%i\') AS hora, comensales FROM reservas
                     WHERE fecha BETWEEN CURDATE() AND CURDATE() + INTERVAL ' . RESERVA_DIAS_MAX . ' DAY
                       AND estado IN ' . ESTADOS_QUE_OCUPAN) as $r) {
        $t = turno_de($r['hora']);
        if ($t !== null) {
            $ocupado[$r['fecha']][$t] = ($ocupado[$r['fecha']][$t] ?? 0) + $r['comensales'];
        }
    }
    $completas = [];
    foreach ($ocupado as $dia => $porTurno) {
        $lleno = true;
        foreach (array_keys(RESERVA_TURNOS) as $t) {
            if ($aforo - ($porTurno[$t] ?? 0) >= $comensales) {
                $lleno = false;
                break;
            }
        }
        if ($lleno) {
            $completas[] = $dia;
        }
    }
    sort($completas);
    return ['completas' => $completas];
}

/**
 * GET /reservas/mesas-ocupadas?fecha=…&hora=…
 * Mesas con reserva confirmada en el mismo turno (no se pueden volver a reservar).
 */
function mesas_reservadas(string $fecha, string $hora): array
{
    $turno = turno_de($hora);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha) || $turno === null) {
        fallo(422, 'Indica fecha y hora de un turno');
    }
    [$desde, $hasta] = RESERVA_TURNOS[$turno];
    return todos("SELECT id, id_mesa, TIME_FORMAT(hora, '%H:%i') AS hora, nombre, comensales FROM reservas
                   WHERE fecha = ? AND hora BETWEEN ? AND ? AND estado = 'confirmada' AND id_mesa IS NOT NULL",
        [$fecha, "$desde:00", "$hasta:00"]);
}

/* ------------------------------------------------------------------
 *  Verificación anti-bots
 * ------------------------------------------------------------------ */
function nuevo_reto(): array
{
    $a = random_int(2, 9);
    $b = random_int(2, 9);
    $token = bin2hex(random_bytes(16));

    // Se guardan como mucho 5 retos por sesión (varias pestañas abiertas)
    $retos = array_slice($_SESSION['retos'] ?? [], -4, null, true);
    $retos[$token] = ['respuesta' => $a + $b, 'creado' => time()];
    $_SESSION['retos'] = $retos;

    $hoy = new DateTimeImmutable('today');
    return [
        'token'          => $token,
        'pregunta'       => "¿Cuánto es {$a} + {$b}?",
        'horas'          => horas_reserva(),
        'fecha_min'      => $hoy->format('Y-m-d'),
        'fecha_max'      => $hoy->modify('+' . RESERVA_DIAS_MAX . ' days')->format('Y-m-d'),
        'max_comensales' => RESERVA_MAX_COMENSALES,
    ];
}

function comprobar_reto(array $d): void
{
    $token = (string) ($d['reto_token'] ?? '');
    $reto = $_SESSION['retos'][$token] ?? null;
    unset($_SESSION['retos'][$token]);   // un solo uso, acierte o falle

    if (!$reto || time() - $reto['creado'] > RETO_CADUCIDAD) {
        fallo(422, 'La verificación ha caducado. Responde a la nueva pregunta.');
    }
    if (time() - $reto['creado'] < RESERVA_SEGUNDOS_MIN) {
        fallo(429, 'Has enviado el formulario demasiado rápido. Inténtalo de nuevo.');
    }
    if ((string) ($d['reto_respuesta'] ?? '') !== (string) $reto['respuesta']) {
        fallo(422, 'La respuesta a la pregunta de verificación no es correcta.');
    }
}

function ip_cifrada(): string
{
    return hash_hmac('sha256', $_SERVER['REMOTE_ADDR'] ?? 'desconocida', RESERVA_SAL);
}

/* ------------------------------------------------------------------
 *  Solicitud pública
 * ------------------------------------------------------------------ */
function solicitar_reserva(array $datos): array
{
    $respuesta = [
        'estado'  => 'pendiente',
        'mensaje' => 'Hemos recibido tu solicitud. Te llamaremos o escribiremos para confirmarla.',
    ];

    // Campo trampa: las personas no lo ven; los bots lo rellenan.
    // Se responde como si todo fuera bien para no darles pistas.
    if (trim((string) ($datos['web'] ?? '')) !== '') {
        unset($_SESSION['retos'][(string) ($datos['reto_token'] ?? '')]);
        return $respuesta;
    }

    comprobar_reto($datos);

    $ip = ip_cifrada();
    $recientes = uno('SELECT COUNT(*) AS n FROM reservas WHERE ip_hash = ? AND creada > NOW() - INTERVAL 1 HOUR', [$ip]);
    if ($recientes['n'] >= RESERVA_MAX_POR_HORA) {
        fallo(429, 'Has enviado varias solicitudes en poco tiempo. Inténtalo más tarde o llámanos.');
    }

    $d = validar($datos, [
        'nombre' => 'texto', 'email' => 'texto', 'telefono' => 'texto',
        'fecha' => 'texto', 'hora' => 'texto', 'comensales' => 'entero',
        'zona' => 'texto?', 'comentarios' => 'texto?',
    ]);
    if (empty($datos['acepta_privacidad'])) {
        fallo(422, 'Debes aceptar la política de privacidad para enviar la solicitud.');
    }

    $nombre = mb_substr($d['nombre'], 0, 80);
    if (mb_strlen($nombre) < 2) {
        fallo(422, 'Escribe tu nombre.');
    }
    $email = mb_strtolower($d['email']);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email) > 120) {
        fallo(422, 'El correo electrónico no es válido.');
    }
    $telefono = preg_replace('/\s+/', ' ', $d['telefono']);
    if (!preg_match('/^\+?[0-9 ()-]{9,20}$/', $telefono) || strlen(preg_replace('/\D/', '', $telefono)) < 9) {
        fallo(422, 'El teléfono no es válido.');
    }
    if ($d['comensales'] < 1 || $d['comensales'] > RESERVA_MAX_COMENSALES) {
        fallo(422, 'Para grupos de más de ' . RESERVA_MAX_COMENSALES . ' personas, llámanos por teléfono.');
    }

    $fecha = DateTimeImmutable::createFromFormat('!Y-m-d', $d['fecha']);
    $hoy = new DateTimeImmutable('today');
    if (!$fecha || $fecha->format('Y-m-d') !== $d['fecha']) {
        fallo(422, 'La fecha no es válida.');
    }
    if ($fecha < $hoy || $fecha > $hoy->modify('+' . RESERVA_DIAS_MAX . ' days')) {
        fallo(422, 'Solo aceptamos reservas desde hoy hasta dentro de ' . RESERVA_DIAS_MAX . ' días.');
    }
    if (!in_array($d['hora'], horas_reserva(), true)) {
        fallo(422, 'Elige una hora dentro de nuestros turnos de servicio.');
    }
    $momento = new DateTimeImmutable("{$d['fecha']} {$d['hora']}");
    if ($momento < new DateTimeImmutable('+1 hour')) {
        fallo(422, 'Las reservas para hoy necesitan al menos una hora de antelación. Llámanos si es urgente.');
    }

    $zona = isset($d['zona']) ? mb_strtolower($d['zona']) : null;
    if ($zona !== null) {
        $salones = array_column(todos('SELECT DISTINCT salon FROM mesas'), 'salon');
        if (!in_array($zona, $salones, true)) {
            $zona = null;   // «sin preferencia» o un valor manipulado
        }
    }
    $comentarios = isset($d['comentarios']) ? mb_substr($d['comentarios'], 0, 500) : null;

    // Las solicitudes que nadie verificó en 24 h se borran
    consulta("DELETE FROM reservas WHERE estado = 'sin_verificar' AND creada < NOW() - INTERVAL " . VERIFICACION_HORAS . ' HOUR');

    // Clientes en la lista negra (no presentados o anulaciones de última hora): sólo por teléfono
    if (en_lista_negra($email, $telefono)) {
        fallo(403, 'No podemos tramitar esta reserva por la web. Por favor, llámanos'
            . (TELEFONO_RESTAURANTE !== '' ? ' al ' . TELEFONO_RESTAURANTE : '') . ' y te atenderemos encantados.');
    }

    $duplicada = uno("SELECT id FROM reservas WHERE email = ? AND fecha = ? AND estado IN ('sin_verificar', 'pendiente', 'confirmada')",
        [$email, $d['fecha']]);
    if ($duplicada) {
        fallo(409, 'Ya tenemos una solicitud tuya para ese día. Revisa tu correo o, si quieres cambiarla, contáctanos.');
    }

    $verificar = verificacion_activa();
    $token = $verificar ? bin2hex(random_bytes(32)) : null;

    // Comprobar el aforo e insertar sin que otra solicitud se cuele entre medias
    $id = con_bloqueo_reservas(function () use ($d, $nombre, $email, $telefono, $zona, $comentarios, $ip, $verificar, $token) {
        comprobar_aforo($d['fecha'], $d['hora'], $d['comensales']);
        consulta('INSERT INTO reservas (nombre, email, telefono, fecha, hora, comensales, zona, comentarios, ip_hash, estado, token_hash)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$nombre, $email, $telefono, $d['fecha'], $d['hora'], $d['comensales'], $zona, $comentarios, $ip,
             $verificar ? 'sin_verificar' : 'pendiente', $token ? hash('sha256', $token) : null]);
        return (int) db()->lastInsertId();
    });
    $reserva = uno('SELECT * FROM reservas WHERE id = ?', [$id]);

    if ($verificar) {
        // Código de 6 cifras como alternativa al enlace (por si el correo se lee en otro dispositivo)
        $codigo = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        consulta('UPDATE reservas SET codigo_hash = ? WHERE id = ?', [huella_codigo($id, $codigo), $id]);

        if (!correo_verificacion($reserva, $token, $codigo)) {
            consulta('DELETE FROM reservas WHERE id = ?', [$id]);
            fallo(503, 'No hemos podido enviarte el correo de verificación. Revisa la dirección o inténtalo más tarde.');
        }
        return [
            'id'        => $id,
            'estado'    => 'sin_verificar',
            'verificar' => true,
            'mensaje'   => 'Te hemos enviado un correo. Abre el enlace en las próximas 24 horas para confirmar tu solicitud.',
        ];
    }

    if (correo_configurado()) {
        correo_aviso_equipo($reserva);
    }
    return ['id' => $id, 'verificar' => false] + $respuesta;
}

/* ------------------------------------------------------------------
 *  Anulación por el cliente (enlace del correo de confirmación)
 *    POST /reservas/anulacion {token}  → datos de la reserva, sin tocarla
 *    POST /reservas/anular    {token}  → la anula
 *  Son dos pasos a propósito: los correos y antivirus abren los enlaces
 *  para revisarlos, y eso no debe anular nada.
 * ------------------------------------------------------------------ */
function reserva_por_anular(array $datos): array
{
    $token = (string) ($datos['token'] ?? '');
    if (!preg_match('/^[0-9a-f]{64}$/', $token)) {
        fallo(400, 'El enlace de anulación no es válido.');
    }
    $r = uno("SELECT * FROM reservas WHERE anular_hash = ? AND estado = 'confirmada'", [hash('sha256', $token)])
        ?? fallo(410, 'Este enlace ya no sirve: la reserva ya está anulada o ha cambiado. Si necesitas algo, responde al correo.');
    if (new DateTimeImmutable("{$r['fecha']} {$r['hora']}") < new DateTimeImmutable()) {
        fallo(410, 'Esta reserva ya ha pasado y no se puede anular.');
    }
    return $r;
}

function resumen_publico(array $r): array
{
    return [
        'id'         => $r['id'],
        'estado'     => $r['estado'],
        'nombre'     => explode(' ', $r['nombre'])[0],
        'fecha'      => $r['fecha'],
        'hora'       => substr($r['hora'], 0, 5),
        'comensales' => $r['comensales'],
    ];
}

function anular_por_cliente(array $datos): array
{
    $r = reserva_por_anular($datos);
    consulta("UPDATE reservas SET estado = 'cancelada', anulada_por_cliente = 1, anular_hash = NULL,
                     id_personal = NULL, gestionada = NOW() WHERE id = ? AND estado = 'confirmada'", [$r['id']]);
    $r['estado'] = 'cancelada';
    correo_aviso_anulacion($r);                      // al equipo
    correo_estado_reserva($r + ['por_cliente' => true]);   // justificante al cliente

    // Anular con muy poca antelación lleva a la lista negra (y al SMS para que llame)
    $horasQueFaltan = (strtotime("{$r['fecha']} {$r['hora']}") - time()) / 3600;
    if ($horasQueFaltan < RESERVA_HORAS_ANULACION_TARDIA) {
        anadir_lista_negra($r, 'anulacion_tardia', null);
    }
    return resumen_publico($r);
}

const MAX_INTENTOS_CODIGO = 5;

/** Huella del código, ligada a la reserva: el mismo código no sirve para otra. */
function huella_codigo(int $id, string $codigo): string
{
    return hash_hmac('sha256', "$id:$codigo", RESERVA_SAL);
}

/**
 * POST /reservas/verificar
 *   {token}        — el cliente abre el enlace del correo
 *   {id, codigo}   — o escribe en la web el código de 6 cifras del correo
 */
function verificar_reserva(array $datos): array
{
    $vigente = "estado = 'sin_verificar' AND creada > NOW() - INTERVAL " . VERIFICACION_HORAS . ' HOUR';

    if (isset($datos['codigo'])) {
        $id = filter_var($datos['id'] ?? null, FILTER_VALIDATE_INT);
        $codigo = preg_replace('/\D/', '', (string) $datos['codigo']);
        if (!$id || strlen($codigo) !== 6) {
            fallo(422, 'Escribe el código de 6 cifras que te hemos enviado.');
        }
        $r = uno("SELECT * FROM reservas WHERE id = ? AND $vigente", [$id])
            ?? fallo(410, 'La solicitud ha caducado o ya está verificada. Si no completaste la reserva, vuelve a solicitarla.');

        if (!hash_equals((string) $r['codigo_hash'], huella_codigo($id, $codigo))) {
            $intentos = $r['intentos'] + 1;
            if ($intentos >= MAX_INTENTOS_CODIGO) {
                consulta('DELETE FROM reservas WHERE id = ?', [$id]);
                fallo(410, 'Demasiados intentos con un código incorrecto. Hemos anulado la solicitud: vuelve a hacerla.');
            }
            consulta('UPDATE reservas SET intentos = ? WHERE id = ?', [$intentos, $id]);
            $quedan = MAX_INTENTOS_CODIGO - $intentos;
            fallo(422, "El código no es correcto. Te " . ($quedan === 1 ? 'queda 1 intento' : "quedan $quedan intentos") . '.');
        }
    } else {
        $token = (string) ($datos['token'] ?? '');
        if (!preg_match('/^[0-9a-f]{64}$/', $token)) {
            fallo(400, 'El enlace de verificación no es válido.');
        }
        $r = uno("SELECT * FROM reservas WHERE token_hash = ? AND $vigente", [hash('sha256', $token)])
            ?? fallo(410, 'El enlace ya se ha usado o ha caducado. Si no completaste la reserva, vuelve a solicitarla.');
    }

    // Mientras el cliente verificaba, el turno se ha podido llenar
    con_bloqueo_reservas(function () use ($r) {
        try {
            comprobar_aforo($r['fecha'], substr($r['hora'], 0, 5), (int) $r['comensales'], (int) $r['id']);
        } catch (ApiError $e) {
            consulta('DELETE FROM reservas WHERE id = ?', [$r['id']]);
            fallo(409, 'Lo sentimos: mientras verificabas tu correo se ha completado el aforo de ese turno. Prueba otro día u hora.');
        }
        consulta("UPDATE reservas SET estado = 'pendiente', verificada = NOW(), token_hash = NULL, codigo_hash = NULL WHERE id = ?", [$r['id']]);
    });
    $r['estado'] = 'pendiente';
    correo_aviso_equipo($r);

    return [
        'id'         => $r['id'],
        'estado'     => 'pendiente',
        'nombre'     => explode(' ', $r['nombre'])[0],
        'fecha'      => $r['fecha'],
        'hora'       => substr($r['hora'], 0, 5),
        'comensales' => $r['comensales'],
    ];
}

/* ------------------------------------------------------------------
 *  Gestión desde el TPV
 * ------------------------------------------------------------------ */
function listar_reservas(): array
{
    $where = ["r.estado <> 'sin_verificar'"];   // el equipo sólo ve solicitudes con el correo verificado
    $p = [];
    if (!empty($_GET['estado'])) {
        $estados = array_values(array_intersect(explode(',', $_GET['estado']), ESTADOS_RESERVA));
        if ($estados) {
            $where[] = 'r.estado IN (' . implode(',', array_fill(0, count($estados), '?')) . ')';
            array_push($p, ...$estados);
        }
    }
    $where[] = 'r.fecha >= ?';
    $p[] = $_GET['desde'] ?? date('Y-m-d');
    if (!empty($_GET['hasta'])) {
        $where[] = 'r.fecha <= ?';
        $p[] = $_GET['hasta'];
    }
    return todos(
        "SELECT r.id, r.nombre, r.email, r.telefono, r.fecha, TIME_FORMAT(r.hora, '%H:%i') AS hora,
                r.comensales, r.zona, r.comentarios, r.estado, r.id_mesa, m.nombre AS mesa,
                r.creada, r.gestionada, r.anulada_por_cliente,
                CONCAT(pe.nombre, ' ', pe.apellidos) AS gestionada_por
           FROM reservas r
           LEFT JOIN mesas m     ON m.id = r.id_mesa
           LEFT JOIN personal pe ON pe.id = r.id_personal
          WHERE " . implode(' AND ', $where) . '
          ORDER BY r.fecha, r.hora, r.id LIMIT 500', $p);
}

function gestionar_reserva(array $u, int $id, array $datos): array
{
    $r = uno('SELECT * FROM reservas WHERE id = ?', [$id]) ?? fallo(404, 'Reserva no encontrada');
    $d = validar($datos, ['estado' => 'texto', 'id_mesa' => 'entero?']);

    if (!in_array($d['estado'], TRANSICIONES_RESERVA[$r['estado']], true)) {
        fallo(409, "Una reserva {$r['estado']} no puede pasar a «{$d['estado']}»");
    }
    $mesa = null;
    if ($d['estado'] === 'confirmada' && isset($d['id_mesa'])) {
        uno('SELECT id FROM mesas WHERE id = ?', [$d['id_mesa']]) ?? fallo(404, 'Mesa no encontrada');
        // Una mesa sólo puede tener una reserva confirmada por turno
        foreach (mesas_reservadas($r['fecha'], substr($r['hora'], 0, 5)) as $otra) {
            if ($otra['id_mesa'] === $d['id_mesa'] && $otra['id'] !== $id) {
                fallo(409, "Esa mesa ya está reservada en este turno: {$otra['nombre']} a las {$otra['hora']} (nº {$otra['id']})");
            }
        }
        $mesa = $d['id_mesa'];
    }
    if ($d['estado'] === 'no_presentado' && strtotime("{$r['fecha']} {$r['hora']}") > time()) {
        fallo(409, 'Solo se puede marcar «no se presentó» cuando ya ha pasado la hora de la reserva');
    }

    // Al confirmar se crea el enlace de anulación para el cliente (un solo uso)
    $tokenAnular = $d['estado'] === 'confirmada' ? bin2hex(random_bytes(32)) : null;

    consulta('UPDATE reservas SET estado = ?, id_mesa = COALESCE(?, id_mesa), id_personal = ?, gestionada = NOW(),
                     anular_hash = ? WHERE id = ?',
        [$d['estado'], $mesa, $u['id'], $tokenAnular ? hash('sha256', $tokenAnular) : null, $id]);

    correo_estado_reserva(['estado' => $d['estado']] + $r, $tokenAnular);   // aviso al cliente (si hay SMTP)

    // No presentado: a la lista negra, con SMS para que llame la próxima vez
    $lista = $d['estado'] === 'no_presentado' ? anadir_lista_negra($r, 'no_presentado', (int) $u['id']) : null;

    $_GET = ['desde' => $r['fecha'], 'hasta' => $r['fecha']];
    foreach (listar_reservas() as $fila) {
        if ($fila['id'] === $id) {
            return $fila + ($lista ? ['lista_negra' => ['id' => $lista['id'], 'sms_estado' => $lista['sms_estado']]] : []);
        }
    }
    fallo(500, 'No se pudo leer la reserva');
}
