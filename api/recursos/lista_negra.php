<?php
declare(strict_types=1);

/**
 * Lista negra de clientes (sala: admin, gerente, jefe de sala)
 *   GET    /lista-negra             entradas activas
 *   POST   /lista-negra/{id}/sms    reintentar el SMS
 *   DELETE /lista-negra/{id}        sacar al cliente de la lista
 *
 * Las entradas se crean solas:
 *   · al marcar una reserva como «no_presentado» en el TPV
 *   · cuando el cliente anula con menos de RESERVA_HORAS_ANULACION_TARDIA horas
 */

function ruta_lista_negra(string $metodo, ?string $id, ?string $sub): never
{
    $u = requiere_rango(RANGOS_SALA);

    if ($id === null && $metodo === 'GET') {
        responder(todos(
            "SELECT ln.id, ln.nombre, ln.email, ln.telefono, ln.motivo, ln.creada, ln.sms_estado, ln.sms_fecha,
                    ln.id_reserva, r.fecha AS reserva_fecha, TIME_FORMAT(r.hora, '%H:%i') AS reserva_hora,
                    r.comensales AS reserva_comensales, CONCAT(pe.nombre, ' ', pe.apellidos) AS marcado_por
               FROM lista_negra ln
               LEFT JOIN reservas r  ON r.id = ln.id_reserva
               LEFT JOIN personal pe ON pe.id = ln.id_personal
              WHERE ln.activa = 1
              ORDER BY ln.creada DESC"));
    }

    $id = id_valido($id);
    $entrada = uno('SELECT * FROM lista_negra WHERE id = ? AND activa = 1', [$id])
        ?? fallo(404, 'Ese cliente no está en la lista negra');

    if ($sub === 'sms' && $metodo === 'POST') {
        $estado = notificar_lista_negra($entrada);
        responder(['sms_estado' => $estado]);
    }
    if ($sub === null && $metodo === 'DELETE') {
        consulta('UPDATE lista_negra SET activa = 0, retirada = NOW(), id_personal_retira = ? WHERE id = ?', [$u['id'], $id]);
        responder(null, 204);
    }
    fallo(405, 'Método no permitido');
}

/** ¿Está el cliente (por correo o teléfono) en la lista negra? */
function en_lista_negra(string $email, string $telefono): bool
{
    return (bool) uno('SELECT id FROM lista_negra WHERE activa = 1 AND (email = ? OR telefono_norm = ?) LIMIT 1',
        [mb_strtolower($email), telefono_normalizado($telefono)]);
}

/** Añade al cliente de una reserva a la lista negra y le envía el SMS. Devuelve la entrada creada. */
function anadir_lista_negra(array $reserva, string $motivo, ?int $idPersonal): array
{
    // Si ya está activo por otra reserva, no se duplica ni se le vuelve a escribir
    $existente = uno('SELECT * FROM lista_negra WHERE activa = 1 AND (email = ? OR telefono_norm = ?) LIMIT 1',
        [$reserva['email'], telefono_normalizado($reserva['telefono'])]);
    if ($existente) {
        return $existente;
    }
    consulta('INSERT INTO lista_negra (nombre, email, telefono, telefono_norm, motivo, id_reserva, id_personal)
              VALUES (?, ?, ?, ?, ?, ?, ?)',
        [$reserva['nombre'], $reserva['email'], $reserva['telefono'], telefono_normalizado($reserva['telefono']),
         $motivo, $reserva['id'], $idPersonal]);
    $entrada = uno('SELECT * FROM lista_negra WHERE id = ?', [(int) db()->lastInsertId()]);
    $entrada['sms_estado'] = notificar_lista_negra($entrada, $reserva);
    return $entrada;
}

function notificar_lista_negra(array $entrada, ?array $reserva = null): string
{
    $reserva ??= $entrada['id_reserva'] ? uno('SELECT * FROM reservas WHERE id = ?', [$entrada['id_reserva']]) : null;
    $estado = enviar_sms((string) $entrada['telefono'], texto_sms_lista_negra($entrada, $reserva));
    consulta('UPDATE lista_negra SET sms_estado = ?, sms_fecha = IF(? = \'enviado\', NOW(), sms_fecha) WHERE id = ?',
        [$estado, $estado, $entrada['id']]);
    return $estado;
}
