<?php
/**
 * API REST del TPV — punto de entrada único.
 *
 * Rutas (ver docs.html para el detalle):
 *   /index.php/{recurso}[/{id}[/{subrecurso}]]
 *   o, con mod_rewrite, /api/{recurso}[/{id}[/{subrecurso}]]
 */
declare(strict_types=1);

require __DIR__ . '/lib.php';
require __DIR__ . '/recursos/auth.php';
require __DIR__ . '/recursos/catalogo.php';
require __DIR__ . '/recursos/personal.php';
require __DIR__ . '/recursos/pedidos.php';
require __DIR__ . '/recursos/informes.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

try {
    iniciar_sesion();

    $metodo = $_SERVER['REQUEST_METHOD'];
    $ruta   = $_SERVER['PATH_INFO'] ?? ($_GET['ruta'] ?? '/');
    $partes = array_values(array_filter(explode('/', trim($ruta, '/')), 'strlen'));

    [$recurso, $id, $sub] = array_pad($partes, 3, null);

    match ($recurso) {
        null            => responder(['api' => 'TPV Restaurante', 'version' => '1.0', 'documentacion' => '../docs.html']),
        'auth'          => ruta_auth($metodo, $id),
        'carta'         => ruta_carta($metodo),
        'alergenos', 'generos', 'ingredientes', 'mesas', 'platos'
                        => ruta_catalogo($recurso, $metodo, $id, $sub),
        'personal'      => ruta_personal($metodo, $id),
        'pedidos'       => ruta_pedidos($metodo, $id, $sub),
        'lineas'        => ruta_lineas($metodo, $id),
        'cocina'        => ruta_cocina($metodo),
        'resumen'       => ruta_resumen($metodo),
        default         => fallo(404, "El recurso «{$recurso}» no existe"),
    };
} catch (ApiError $e) {
    responder(['error' => $e->getMessage()], $e->estado);
} catch (PDOException $e) {
    $codigo = $e->errorInfo[1] ?? 0;
    match ($codigo) {
        1062    => responder(['error' => 'Ya existe un registro con ese nombre'], 409),
        1451    => responder(['error' => 'No se puede borrar: está en uso por otros registros'], 409),
        1452    => responder(['error' => 'Alguna referencia (id) no existe'], 422),
        default => responder(['error' => 'Error de base de datos'] + (API_DEBUG ? ['detalle' => $e->getMessage()] : []), 500),
    };
} catch (Throwable $e) {
    responder(['error' => 'Error interno'] + (API_DEBUG ? ['detalle' => $e->getMessage()] : []), 500);
}
