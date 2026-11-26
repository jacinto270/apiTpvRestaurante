<?php
declare(strict_types=1);

/**
 * Envío de SMS. Proveedor soportado: Twilio (API REST).
 * Sin proveedor configurado no se envía nada y se informa al equipo
 * para que llame al cliente.
 */

function sms_configurado(): bool
{
    return SMS_PROVEEDOR === 'twilio' && TWILIO_SID !== '' && TWILIO_TOKEN !== '' && SMS_REMITENTE !== ''
        && TELEFONO_RESTAURANTE !== '';
}

/** Teléfono en formato internacional E.164. Los móviles españoles de 9 cifras reciben +34. */
function telefono_e164(string $tel): ?string
{
    $digitos = preg_replace('/\D/', '', $tel);
    if (str_starts_with(trim($tel), '+')) {
        return strlen($digitos) >= 8 ? "+$digitos" : null;
    }
    if (str_starts_with($digitos, '00')) {
        return '+' . substr($digitos, 2);
    }
    if (strlen($digitos) === 9 && preg_match('/^[6-9]/', $digitos)) {
        return "+34$digitos";
    }
    return null;
}

/** Sólo dígitos (sin prefijo 34), para comparar teléfonos escritos de formas distintas. */
function telefono_normalizado(string $tel): string
{
    $d = preg_replace('/\D/', '', $tel);
    if (str_starts_with($d, '0034')) {
        $d = substr($d, 4);
    } elseif (strlen($d) === 11 && str_starts_with($d, '34')) {
        $d = substr($d, 2);
    }
    return $d;
}

/**
 * Envía un SMS. Devuelve 'enviado', 'error' o 'sin_configurar'.
 * Nunca lanza excepciones: los fallos se anotan en el log de PHP.
 */
function enviar_sms(string $telefono, string $texto): string
{
    if (!sms_configurado()) {
        return 'sin_configurar';
    }
    $destino = telefono_e164($telefono);
    if (!$destino) {
        error_log("[sms] teléfono no válido: $telefono");
        return 'error';
    }

    $ch = curl_init('https://api.twilio.com/2010-04-01/Accounts/' . rawurlencode(TWILIO_SID) . '/Messages.json');
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query(['To' => $destino, 'From' => SMS_REMITENTE, 'Body' => $texto]),
        CURLOPT_USERPWD        => TWILIO_SID . ':' . TWILIO_TOKEN,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $respuesta = curl_exec($ch);
    $codigo = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($respuesta === false || $codigo >= 300) {
        $detalle = $error ?: (json_decode((string) $respuesta, true)['message'] ?? "HTTP $codigo");
        error_log("[sms] envío fallido a $destino: $detalle");
        return 'error';
    }
    return 'enviado';
}

/** Texto del SMS para un cliente que entra en la lista negra (sin tildes: cabe en un solo SMS). */
function texto_sms_lista_negra(array $entrada, ?array $reserva): string
{
    $nombre = explode(' ', $entrada['nombre'])[0];
    $cuando = $reserva ? ' del ' . date('j/n', strtotime($reserva['fecha'])) : '';
    $motivo = $entrada['motivo'] === 'no_presentado'
        ? "no pudimos verte en tu reserva$cuando"
        : "anulaste tu reserva$cuando a ultima hora";
    $texto = "Olea: Hola $nombre, $motivo. Para tus proximas reservas, llamanos al " . TELEFONO_RESTAURANTE . '. Gracias.';
    // Quitar tildes y eñes para usar la codificación GSM de 160 caracteres
    return strtr($texto, ['á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u', 'ñ' => 'n',
                          'Á' => 'A', 'É' => 'E', 'Í' => 'I', 'Ó' => 'O', 'Ú' => 'U', 'Ñ' => 'N']);
}
