<?php
declare(strict_types=1);

/**
 * Envío de correo por SMTP (sin dependencias) y plantillas de reservas.
 *
 * Soporta SSL directo (puerto 465) y STARTTLS (587) con AUTH LOGIN,
 * que es lo que piden Gmail y la mayoría de proveedores.
 */

function correo_configurado(): bool
{
    return defined('SMTP_PASS') && SMTP_PASS !== '' && defined('SMTP_HOST') && SMTP_HOST !== '';
}

/** Quita saltos de línea para que nadie pueda inyectar cabeceras. */
function linea_segura(string $t): string
{
    return trim(preg_replace('/[\r\n]+/', ' ', $t));
}

function cabecera_utf8(string $t): string
{
    return '=?UTF-8?B?' . base64_encode(linea_segura($t)) . '?=';
}

/**
 * Envía un correo. Devuelve true si el servidor lo aceptó.
 * Nunca lanza excepciones: los fallos se anotan en el log de PHP.
 */
function enviar_correo(string $para, string $asunto, string $html, string $texto, ?string $responderA = null): bool
{
    if (!correo_configurado()) {
        return false;
    }
    if (!filter_var($para, FILTER_VALIDATE_EMAIL)) {
        error_log("[correo] destinatario no válido: $para");
        return false;
    }

    $ssl = (int) SMTP_PORT === 465;
    $contexto = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true]]);
    $smtp = @stream_socket_client(($ssl ? 'ssl://' : 'tcp://') . SMTP_HOST . ':' . SMTP_PORT,
        $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $contexto);
    if (!$smtp) {
        error_log("[correo] no se pudo conectar con " . SMTP_HOST . ": $errstr ($errno)");
        return false;
    }
    stream_set_timeout($smtp, 15);

    $leer = function () use ($smtp): array {
        $texto = '';
        while (($linea = fgets($smtp, 1024)) !== false) {
            $texto .= $linea;
            if (strlen($linea) < 4 || $linea[3] !== '-') {   // «250-» continúa, «250 » termina
                break;
            }
        }
        return [(int) substr($texto, 0, 3), trim($texto)];
    };
    $orden = function (string $cmd, array $esperados, bool $ocultar = false) use ($smtp, $leer): void {
        fwrite($smtp, $cmd . "\r\n");
        [$codigo, $respuesta] = $leer();
        if (!in_array($codigo, $esperados, true)) {
            throw new RuntimeException(($ocultar ? '[credenciales]' : $cmd) . " → $respuesta");
        }
    };

    try {
        [$codigo, $saludo] = $leer();
        if ($codigo !== 220) {
            throw new RuntimeException("saludo inesperado: $saludo");
        }
        $dominio = parse_url(URL_WEB, PHP_URL_HOST) ?: 'localhost';
        $orden("EHLO $dominio", [250]);
        if (!$ssl) {
            $orden('STARTTLS', [220]);
            if (!stream_socket_enable_crypto($smtp, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT)) {
                throw new RuntimeException('no se pudo activar TLS');
            }
            $orden("EHLO $dominio", [250]);
        }
        $orden('AUTH LOGIN', [334]);
        $orden(base64_encode(SMTP_USER), [334], true);
        $orden(base64_encode(str_replace(' ', '', SMTP_PASS)), [235], true);   // Google la muestra con espacios
        $orden('MAIL FROM:<' . CORREO_REMITENTE . '>', [250]);
        $orden("RCPT TO:<$para>", [250, 251]);
        $orden('DATA', [354]);

        $limite = 'olea-' . bin2hex(random_bytes(8));
        $cabeceras = [
            'Date: ' . date(DATE_RFC2822),
            'From: ' . cabecera_utf8(CORREO_NOMBRE) . ' <' . CORREO_REMITENTE . '>',
            "To: <$para>",
            'Subject: ' . cabecera_utf8($asunto),
            'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . (explode('@', CORREO_REMITENTE)[1] ?? 'localhost') . '>',
            'MIME-Version: 1.0',
            "Content-Type: multipart/alternative; boundary=\"$limite\"",
        ];
        if ($responderA && filter_var($responderA, FILTER_VALIDATE_EMAIL)) {
            $cabeceras[] = "Reply-To: <$responderA>";
        }
        $cuerpo = implode("\r\n", $cabeceras) . "\r\n\r\n"
            . "--$limite\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
            . chunk_split(base64_encode($texto))
            . "--$limite\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
            . chunk_split(base64_encode($html))
            . "--$limite--\r\n";
        // El cuerpo va en base64, así que ninguna línea empieza por «.»
        fwrite($smtp, $cuerpo . "\r\n.\r\n");
        [$codigo, $respuesta] = $leer();
        if ($codigo !== 250) {
            throw new RuntimeException("DATA → $respuesta");
        }
        fwrite($smtp, "QUIT\r\n");
        return true;
    } catch (Throwable $e) {
        error_log('[correo] envío fallido a ' . $para . ': ' . $e->getMessage());
        return false;
    } finally {
        fclose($smtp);
    }
}

/* ------------------------------------------------------------------
 *  Plantillas
 * ------------------------------------------------------------------ */
function h(?string $t): string
{
    return htmlspecialchars((string) $t, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function fecha_humana(string $fecha): string
{
    $dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    $meses = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
              'septiembre', 'octubre', 'noviembre', 'diciembre'];
    $t = strtotime($fecha);
    return $dias[(int) date('w', $t)] . ' ' . date('j', $t) . ' de ' . $meses[(int) date('n', $t)];
}

/** Envuelve el contenido en el diseño de la marca (estilos en línea para los clientes de correo). */
function plantilla_correo(string $titulo, string $contenido, ?array $boton = null): string
{
    $btn = $boton ? '<p style="margin:28px 0 8px"><a href="' . h($boton[1]) . '" style="display:inline-block;padding:15px 30px;'
        . 'background:#04263d;color:#ffffff;text-decoration:none;border-radius:999px;font-weight:700;letter-spacing:.08em;'
        . 'text-transform:uppercase;font-size:13px">' . h($boton[0]) . '</a></p>' : '';
    return '<!doctype html><html lang="es"><body style="margin:0;padding:0;background:#2aaae8">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#2aaae8;padding:32px 12px">'
        . '<tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        . 'style="max-width:560px;background:#ffffff;border-radius:22px;font-family:Helvetica,Arial,sans-serif;color:#04263d">'
        . '<tr><td style="padding:36px 36px 8px;font-family:Georgia,serif;font-size:26px;letter-spacing:.06em">Olea</td></tr>'
        . '<tr><td style="padding:8px 36px 0;font-family:Georgia,serif;font-style:italic;font-size:30px;line-height:1.2">' . h($titulo) . '</td></tr>'
        . '<tr><td style="padding:16px 36px 34px;font-size:15px;line-height:1.65">' . $contenido . $btn . '</td></tr>'
        . '<tr><td style="padding:18px 36px;border-top:1px solid #d5eefb;font-size:12px;color:#4a6577">'
        . 'Olea · Cocina mediterránea. Nunca te pediremos datos de pago por correo ni por teléfono.</td></tr>'
        . '</table></td></tr></table></body></html>';
}

function tabla_reserva(array $r): string
{
    $fila = fn($k, $v) => '<tr><td style="padding:6px 16px 6px 0;color:#4a6577">' . $k . '</td><td style="padding:6px 0;font-weight:700">' . $v . '</td></tr>';
    return '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0;padding:16px 20px;background:#eef8fe;border-radius:14px;width:100%">'
        . $fila('Día', h(fecha_humana($r['fecha'])))
        . $fila('Hora', h(substr($r['hora'], 0, 5)))
        . $fila('Personas', (string) (int) $r['comensales'])
        . (!empty($r['zona']) ? $fila('Zona', h(ucfirst($r['zona']))) : '')
        . '</table>';
}

function texto_reserva(array $r): string
{
    return 'Día: ' . fecha_humana($r['fecha']) . "\nHora: " . substr($r['hora'], 0, 5)
        . "\nPersonas: {$r['comensales']}" . (!empty($r['zona']) ? "\nZona: " . ucfirst($r['zona']) : '') . "\n";
}

/** Al cliente: enlace para verificar su correo. */
function correo_verificacion(array $r, string $token, string $codigo): bool
{
    $enlace = URL_WEB . '?verificar=' . $token . '#reservar';
    $nombre = explode(' ', $r['nombre'])[0];
    $html = plantilla_correo('Confirma tu solicitud',
        '<p>Hola, ' . h($nombre) . ':</p><p>Hemos recibido una solicitud de reserva con este correo. '
        . 'Para que nuestro equipo la revise, escribe este código en la web, donde hiciste la solicitud:</p>'
        . '<p style="margin:20px 0;text-align:center"><span style="display:inline-block;padding:14px 26px;border-radius:14px;'
        . 'background:#eef8fe;font-family:Georgia,serif;font-size:36px;font-weight:700;letter-spacing:.3em;color:#04263d">'
        . h($codigo) . '</span></p>'
        . '<p>O confírmala directamente con el botón. El código y el enlace caducan en 24 horas.</p>'
        . tabla_reserva($r)
        . '<p style="color:#4a6577;font-size:13px">Si no has sido tú, ignora este mensaje y la solicitud se borrará sola.</p>',
        ['Confirmar mi solicitud', $enlace]);
    $texto = "Hola, $nombre:\n\nHemos recibido una solicitud de reserva con este correo. Para que nuestro equipo la revise, "
        . "escribe este código en la web: $codigo\n\nO ábrela en este enlace (caduca en 24 horas):\n$enlace\n\n" . texto_reserva($r)
        . "\nSi no has sido tú, ignora este mensaje.\n\nOlea · Nunca te pediremos datos de pago.";
    return enviar_correo($r['email'], 'Confirma tu solicitud de reserva en Olea', $html, $texto, CORREO_REMITENTE);
}

/** Al equipo: nueva solicitud verificada. */
function correo_aviso_equipo(array $r): void
{
    $html = plantilla_correo('Nueva solicitud de reserva',
        '<p>Un cliente ha verificado su correo y su solicitud espera confirmación en el TPV.</p>'
        . tabla_reserva($r)
        . '<p><strong>' . h($r['nombre']) . '</strong><br>☎ ' . h($r['telefono']) . '<br>✉ ' . h($r['email']) . '</p>'
        . (!empty($r['comentarios']) ? '<p style="font-style:italic">«' . h($r['comentarios']) . '»</p>' : '')
        . '<p style="color:#4a6577;font-size:13px">Llama al cliente antes de confirmar para comprobar que la reserva es real.</p>',
        ['Abrir reservas en el TPV', URL_WEB . 'tpv.html']);
    $texto = "Nueva solicitud de reserva verificada.\n\n" . texto_reserva($r)
        . "\nCliente: {$r['nombre']}\nTeléfono: {$r['telefono']}\nCorreo: {$r['email']}\n"
        . (!empty($r['comentarios']) ? "Comentarios: {$r['comentarios']}\n" : '')
        . "\nRevísala en el TPV: " . URL_WEB . "tpv.html\n";
    $asunto = 'Reserva por confirmar · ' . fecha_humana($r['fecha']) . ' ' . substr($r['hora'], 0, 5) . ' · ' . $r['comensales'] . ' pers.';
    foreach (CORREO_AVISOS as $buzon) {
        enviar_correo($buzon, $asunto, $html, $texto, $r['email']);
    }
}

/** Al cliente: la reserva ha cambiado de estado en el TPV. */
function correo_estado_reserva(array $r, ?string $tokenAnular = null): void
{
    $nombre = explode(' ', $r['nombre'])[0];
    $porCliente = !empty($r['por_cliente']);
    [$titulo, $parrafo, $asunto] = match ($r['estado']) {
        'confirmada' => ['¡Reserva confirmada!', 'Tu mesa te espera. Si cambian vuestros planes, anúlala con el botón de abajo para que podamos ofrecerla a otra persona.', 'Tu reserva en Olea está confirmada'],
        'rechazada'  => ['No ha sido posible realizar tu reserva', 'Lo sentimos mucho: no hemos podido realizar tu reserva porque el aforo del restaurante para ese día y turno está completo. Puedes probar con otra fecha u hora desde nuestra web, o responder a este correo y te ayudamos a encontrar un hueco.', 'Tu reserva en Olea: aforo completo'],
        'cancelada'  => $porCliente
            ? ['Reserva anulada', 'Hemos anulado tu reserva como nos has pedido. Gracias por avisarnos: esperamos verte en otra ocasión.', 'Has anulado tu reserva en Olea']
            : ['Reserva cancelada', 'Tu reserva ha sido cancelada. Si crees que es un error, responde a este correo.', 'Tu reserva en Olea ha sido cancelada'],
        default      => [null, null, null],
    };
    if ($titulo === null) {
        return;
    }

    $anular = '';
    $anularTexto = '';
    if ($r['estado'] === 'confirmada' && $tokenAnular) {
        $enlace = URL_WEB . '?anular=' . $tokenAnular . '#reservar';
        $anular = '<p style="margin:26px 0 0;padding-top:20px;border-top:1px solid #d5eefb;font-size:13.5px;color:#4a6577">'
            . '¿No podéis venir? <a href="' . h($enlace) . '" style="color:#c23b2f;font-weight:700">Anular mi reserva</a>. '
            . 'Te pediremos que lo confirmes antes de anularla.</p>';
        $anularTexto = "\n¿No podéis venir? Anula tu reserva aquí (te pediremos que lo confirmes):\n$enlace\n";
    }

    $html = plantilla_correo($titulo, '<p>Hola, ' . h($nombre) . ':</p><p>' . h($parrafo) . '</p>' . tabla_reserva($r) . $anular);
    $texto = "Hola, $nombre:\n\n$parrafo\n\n" . texto_reserva($r) . $anularTexto . "\nOlea · Nunca te pediremos datos de pago.";
    enviar_correo($r['email'], $asunto, $html, $texto, CORREO_REMITENTE);
}

/** Al equipo: un cliente ha anulado su reserva confirmada. */
function correo_aviso_anulacion(array $r): void
{
    $html = plantilla_correo('Reserva anulada por el cliente',
        '<p>El cliente ha anulado su reserva desde el enlace del correo de confirmación. La mesa queda libre.</p>'
        . tabla_reserva($r)
        . '<p><strong>' . h($r['nombre']) . '</strong><br>☎ ' . h($r['telefono']) . '<br>✉ ' . h($r['email']) . '</p>',
        ['Ver reservas en el TPV', URL_WEB . 'tpv.html']);
    $texto = "Reserva anulada por el cliente. La mesa queda libre.\n\n" . texto_reserva($r)
        . "\nCliente: {$r['nombre']}\nTeléfono: {$r['telefono']}\nCorreo: {$r['email']}\n";
    $asunto = 'Reserva anulada · ' . fecha_humana($r['fecha']) . ' ' . substr($r['hora'], 0, 5) . ' · ' . $r['comensales'] . ' pers.';
    foreach (CORREO_AVISOS as $buzon) {
        enviar_correo($buzon, $asunto, $html, $texto, $r['email']);
    }
}
