<?php
declare(strict_types=1);

/**
 * GET    /personal/acceso   empleados activos (sólo nombre y rango) para la pantalla de acceso — público
 * GET    /personal          listado completo (dirección)
 * GET    /personal/{id}
 * POST   /personal          {nombre, apellidos, rango, contrasena}
 * PUT    /personal/{id}     cualquier campo; contrasena se vuelve a cifrar
 * DELETE /personal/{id}     baja lógica (activo = 0): sus pedidos se conservan
 */
const RANGOS = ['camarero', 'cocinero', 'admin', 'gerente', 'jefe de sala', 'jefe de cocina', 'fregantin'];
const CAMPOS_PERSONAL = 'id, nombre, apellidos, rango, activo';

function ruta_personal(string $metodo, ?string $id): never
{
    if ($id === 'acceso' && $metodo === 'GET') {
        responder(todos("SELECT id, nombre, apellidos, rango FROM personal WHERE activo = 1
                          ORDER BY FIELD(rango, 'gerente', 'admin', 'jefe de sala', 'jefe de cocina',
                                         'camarero', 'cocinero', 'fregantin'), nombre"));
    }

    if ($metodo === 'GET' && $id === null) {
        requiere_login();
        responder(todos('SELECT ' . CAMPOS_PERSONAL . ' FROM personal ORDER BY activo DESC, rango, nombre'));
    }

    if ($metodo === 'GET') {
        requiere_login();
        responder(buscar_personal(id_valido($id)));
    }

    requiere_rango(RANGOS_DIRECCION);
    $esquema = ['nombre' => 'texto', 'apellidos' => 'texto', 'rango' => 'texto',
                'contrasena' => 'texto', 'activo' => 'bool?'];

    if ($metodo === 'POST' && $id === null) {
        $d = preparar_personal(validar(cuerpo(), $esquema));
        $d += ['activo' => 1];
        consulta('INSERT INTO personal (nombre, apellidos, rango, contrasena, activo) VALUES (?, ?, ?, ?, ?)',
            [$d['nombre'], $d['apellidos'], $d['rango'], $d['contrasena'], $d['activo']]);
        responder(buscar_personal((int) db()->lastInsertId()), 201);
    }

    if (in_array($metodo, ['PUT', 'PATCH'], true)) {
        $id = id_valido($id);
        buscar_personal($id);
        $d = preparar_personal(validar(cuerpo(), $esquema, parcial: true));
        $set = implode(', ', array_map(fn($c) => "`$c` = ?", array_keys($d)));
        consulta("UPDATE personal SET $set WHERE id = ?", [...array_values($d), $id]);
        responder(buscar_personal($id));
    }

    if ($metodo === 'DELETE') {
        $id = id_valido($id);
        buscar_personal($id);
        if ($id === usuario()['id']) {
            fallo(409, 'No puedes darte de baja a ti mismo');
        }
        consulta('UPDATE personal SET activo = 0 WHERE id = ?', [$id]);
        responder(null, 204);
    }

    fallo(405, 'Método no permitido');
}

function preparar_personal(array $d): array
{
    if (isset($d['rango']) && !in_array($d['rango'], RANGOS, true)) {
        fallo(422, 'Rango no válido. Opciones: ' . implode(', ', RANGOS));
    }
    if (isset($d['contrasena'])) {
        if (mb_strlen($d['contrasena']) < 4) {
            fallo(422, 'La contraseña debe tener al menos 4 caracteres');
        }
        $d['contrasena'] = password_hash($d['contrasena'], PASSWORD_DEFAULT);
    }
    return $d;
}

function buscar_personal(int $id): array
{
    return uno('SELECT ' . CAMPOS_PERSONAL . ' FROM personal WHERE id = ?', [$id])
        ?? fallo(404, 'Empleado no encontrado');
}
