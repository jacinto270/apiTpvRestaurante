<?php
declare(strict_types=1);

/**
 * POST /auth/login   {id_personal, contrasena}
 * GET  /auth/yo      usuario de la sesión actual
 * POST /auth/logout
 */
function ruta_auth(string $metodo, ?string $accion): never
{
    if ($accion === 'login' && $metodo === 'POST') {
        $d = validar(cuerpo(), ['id_personal' => 'entero', 'contrasena' => 'texto']);

        $p = uno('SELECT id, nombre, apellidos, rango, contrasena FROM personal WHERE id = ? AND activo = 1',
            [$d['id_personal']]);

        if (!$p || !password_verify($d['contrasena'], $p['contrasena'])) {
            fallo(401, 'Empleado o contraseña incorrectos');
        }
        unset($p['contrasena']);

        session_regenerate_id(true);
        $_SESSION['usuario'] = $p;
        responder($p);
    }

    if ($accion === 'yo' && $metodo === 'GET') {
        responder(requiere_login());
    }

    if ($accion === 'logout' && $metodo === 'POST') {
        $_SESSION = [];
        session_destroy();
        responder(null, 204);
    }

    fallo(404, 'Ruta de autenticación no encontrada');
}
