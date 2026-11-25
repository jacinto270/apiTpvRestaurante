<?php
declare(strict_types=1);

/**
 * Pedidos
 *   GET   /pedidos?estado=abierto&mesa=3&desde=2026-11-01&hasta=2026-11-30&limite=50
 *   POST  /pedidos                    {id_mesa}  — lo abre el empleado de la sesión
 *   GET   /pedidos/{id}               pedido con sus líneas
 *   PATCH /pedidos/{id}               {estado?, tipo_pago?, id_mesa?}
 *   GET   /pedidos/{id}/lineas
 *   POST  /pedidos/{id}/lineas        {id_platos, cantidad?, notas?}
 *
 * Líneas
 *   PATCH  /lineas/{id}               {cantidad?, notas?, estado?}
 *   DELETE /lineas/{id}
 *
 * Cocina
 *   GET   /cocina?excluir_generos=6,7,8   líneas pendientes o en cocina de pedidos activos
 *
 * Ciclo de vida del pedido:  abierto ⇄ cerrado (cuenta pedida)  →  pagado | anulado
 */

const TRANSICIONES = [
    'abierto' => ['cerrado', 'pagado', 'anulado'],
    'cerrado' => ['abierto', 'pagado', 'anulado'],
    'pagado'  => [],
    'anulado' => [],
];
const ESTADOS_LINEA = ['pendiente', 'en cocina', 'servido'];

function ruta_pedidos(string $metodo, ?string $id, ?string $sub): never
{
    $u = requiere_login();

    if ($id === null) {
        match ($metodo) {
            'GET'   => responder(listar_pedidos()),
            'POST'  => responder(abrir_pedido($u, cuerpo()), 201),
            default => fallo(405, 'Método no permitido'),
        };
    }

    $id = id_valido($id);

    if ($sub === 'lineas') {
        match ($metodo) {
            'GET'   => responder(lineas_pedido($id)),
            'POST'  => responder(anadir_linea($id, cuerpo()), 201),
            default => fallo(405, 'Método no permitido'),
        };
    }
    if ($sub !== null) {
        fallo(404, 'Ruta no encontrada');
    }

    match ($metodo) {
        'GET'          => responder(detalle_pedido($id)),
        'PUT', 'PATCH' => responder(modificar_pedido($u, $id, cuerpo())),
        default        => fallo(405, 'Los pedidos no se borran: usa estado «anulado»'),
    };
}

function listar_pedidos(): array
{
    $where = [];
    $p = [];
    if (!empty($_GET['estado'])) {
        $estados = explode(',', $_GET['estado']);
        $where[] = 'pe.estado IN (' . implode(',', array_fill(0, count($estados), '?')) . ')';
        array_push($p, ...$estados);
    }
    if (!empty($_GET['mesa'])) {
        $where[] = 'pe.id_mesa = ?';
        $p[] = (int) $_GET['mesa'];
    }
    if (!empty($_GET['personal'])) {
        $where[] = 'pe.id_personal = ?';
        $p[] = (int) $_GET['personal'];
    }
    if (!empty($_GET['desde'])) {
        $where[] = 'pe.fecha >= ?';
        $p[] = $_GET['desde'] . ' 00:00:00';
    }
    if (!empty($_GET['hasta'])) {
        $where[] = 'pe.fecha <= ?';
        $p[] = $_GET['hasta'] . ' 23:59:59';
    }
    $limite = min(500, max(1, (int) ($_GET['limite'] ?? 100)));

    return todos(
        "SELECT pe.*, m.nombre AS mesa, m.salon, CONCAT(pr.nombre, ' ', pr.apellidos) AS personal,
                (SELECT COALESCE(SUM(cantidad), 0) FROM linea_pedido WHERE id_pedido = pe.id) AS unidades
           FROM pedidos pe
           JOIN mesas m     ON m.id = pe.id_mesa
           JOIN personal pr ON pr.id = pe.id_personal"
        . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
        . " ORDER BY pe.fecha DESC, pe.id DESC LIMIT $limite", $p);
}

function detalle_pedido(int $id): array
{
    $pedido = uno(
        "SELECT pe.*, m.nombre AS mesa, m.salon, m.comensales, CONCAT(pr.nombre, ' ', pr.apellidos) AS personal
           FROM pedidos pe
           JOIN mesas m     ON m.id = pe.id_mesa
           JOIN personal pr ON pr.id = pe.id_personal
          WHERE pe.id = ?", [$id]) ?? fallo(404, 'Pedido no encontrado');

    $pedido['lineas'] = lineas_pedido($id);
    return $pedido;
}

function lineas_pedido(int $idPedido): array
{
    return todos(
        'SELECT l.*, p.nombre AS plato, p.id_genero, ROUND(l.cantidad * l.precio, 2) AS subtotal
           FROM linea_pedido l JOIN platos p ON p.id = l.id_platos
          WHERE l.id_pedido = ? ORDER BY l.id', [$idPedido]);
}

function abrir_pedido(array $u, array $datos): array
{
    $d = validar($datos, ['id_mesa' => 'entero']);
    uno('SELECT id FROM mesas WHERE id = ?', [$d['id_mesa']]) ?? fallo(404, 'Mesa no encontrada');
    mesa_libre($d['id_mesa']);

    consulta('INSERT INTO pedidos (id_mesa, id_personal) VALUES (?, ?)', [$d['id_mesa'], $u['id']]);
    return detalle_pedido((int) db()->lastInsertId());
}

function mesa_libre(int $idMesa): void
{
    $activo = uno("SELECT id FROM pedidos WHERE id_mesa = ? AND estado IN ('abierto', 'cerrado')", [$idMesa]);
    if ($activo) {
        fallo(409, "La mesa ya tiene un pedido activo (nº {$activo['id']})");
    }
}

function modificar_pedido(array $u, int $id, array $datos): array
{
    $pedido = detalle_pedido($id);
    $d = validar($datos, ['estado' => 'texto?', 'tipo_pago' => 'texto?', 'id_mesa' => 'entero?'], parcial: true);
    $actual = $pedido['estado'];

    if (!TRANSICIONES[$actual]) {
        fallo(409, "El pedido está {$actual} y ya no se puede modificar");
    }

    $cambios = [];

    if (isset($d['id_mesa']) && $d['id_mesa'] !== $pedido['id_mesa']) {
        uno('SELECT id FROM mesas WHERE id = ?', [$d['id_mesa']]) ?? fallo(404, 'Mesa no encontrada');
        mesa_libre($d['id_mesa']);
        $cambios['id_mesa'] = $d['id_mesa'];
    }

    if (isset($d['tipo_pago'])) {
        $cambios['tipo_pago'] = mb_substr($d['tipo_pago'], 0, 60);
    }

    if (isset($d['estado']) && $d['estado'] !== $actual) {
        $nuevo = $d['estado'];
        if (!in_array($nuevo, TRANSICIONES[$actual], true)) {
            fallo(409, "No se puede pasar un pedido de «{$actual}» a «{$nuevo}»");
        }
        if ($nuevo === 'pagado') {
            if (!$pedido['lineas']) {
                fallo(409, 'No se puede cobrar un pedido vacío');
            }
            if (empty($cambios['tipo_pago']) && empty($pedido['tipo_pago'])) {
                fallo(422, 'Indica el tipo de pago para cobrar');
            }
        }
        if ($nuevo === 'anulado' && $pedido['lineas'] && !in_array($u['rango'], RANGOS_SALA, true)) {
            fallo(403, 'Sólo un jefe de sala o la gerencia pueden anular un pedido con consumiciones');
        }
        $cambios['estado'] = $nuevo;
    }

    if ($cambios) {
        $set = implode(', ', array_map(fn($c) => "`$c` = ?", array_keys($cambios)));
        consulta("UPDATE pedidos SET $set WHERE id = ?", [...array_values($cambios), $id]);
    }
    return detalle_pedido($id);
}

function recalcular_total(int $idPedido): void
{
    consulta('UPDATE pedidos SET total = (SELECT COALESCE(SUM(cantidad * precio), 0)
                                            FROM linea_pedido WHERE id_pedido = ?)
               WHERE id = ?', [$idPedido, $idPedido]);
}

/* ------------------------------------------------------------------
 *  Líneas
 * ------------------------------------------------------------------ */
function anadir_linea(int $idPedido, array $datos): array
{
    $pedido = uno('SELECT estado FROM pedidos WHERE id = ?', [$idPedido]) ?? fallo(404, 'Pedido no encontrado');
    if ($pedido['estado'] !== 'abierto') {
        fallo(409, 'Sólo se pueden añadir platos a un pedido abierto');
    }

    $d = validar($datos, ['id_platos' => 'entero', 'cantidad' => 'entero?', 'notas' => 'texto?']);
    $cantidad = $d['cantidad'] ?? 1;
    if ($cantidad < 1) {
        fallo(422, 'La cantidad debe ser al menos 1');
    }
    $plato = uno('SELECT precio, disponible FROM platos WHERE id = ?', [$d['id_platos']])
        ?? fallo(404, 'Plato no encontrado');
    if (!$plato['disponible']) {
        fallo(409, 'Ese plato no está disponible ahora');
    }
    $notas = isset($d['notas']) ? mb_substr($d['notas'], 0, 255) : null;

    return transaccion(function () use ($idPedido, $d, $cantidad, $plato, $notas) {
        // Si ya hay una línea igual sin enviar, se suma a ella
        $igual = $notas === null ? uno(
            "SELECT id FROM linea_pedido WHERE id_pedido = ? AND id_platos = ? AND precio = ?
                AND notas IS NULL AND estado = 'pendiente' LIMIT 1",
            [$idPedido, $d['id_platos'], $plato['precio']]) : null;

        if ($igual) {
            consulta('UPDATE linea_pedido SET cantidad = cantidad + ? WHERE id = ?', [$cantidad, $igual['id']]);
        } else {
            consulta('INSERT INTO linea_pedido (id_pedido, id_platos, cantidad, precio, notas) VALUES (?, ?, ?, ?, ?)',
                [$idPedido, $d['id_platos'], $cantidad, $plato['precio'], $notas]);
        }
        recalcular_total($idPedido);
        return detalle_pedido($idPedido);
    });
}

function ruta_lineas(string $metodo, ?string $id): never
{
    $u = requiere_login();
    $id = id_valido($id);

    $linea = uno('SELECT l.*, pe.estado AS estado_pedido FROM linea_pedido l
                    JOIN pedidos pe ON pe.id = l.id_pedido WHERE l.id = ?', [$id])
        ?? fallo(404, 'Línea no encontrada');

    if (!in_array($linea['estado_pedido'], ['abierto', 'cerrado'], true)) {
        fallo(409, "El pedido está {$linea['estado_pedido']} y ya no se puede modificar");
    }

    if (in_array($metodo, ['PUT', 'PATCH'], true)) {
        $d = validar(cuerpo(), ['cantidad' => 'entero?', 'notas' => 'texto?', 'estado' => 'texto?'], parcial: true);

        if ((isset($d['cantidad']) || isset($d['notas'])) && $linea['estado_pedido'] !== 'abierto') {
            fallo(409, 'Reabre el pedido para cambiar cantidades o notas');
        }
        if (isset($d['cantidad']) && $d['cantidad'] < 1) {
            fallo(422, 'La cantidad debe ser al menos 1 (para quitarla, bórrala)');
        }
        if (isset($d['estado']) && !in_array($d['estado'], ESTADOS_LINEA, true)) {
            fallo(422, 'Estado no válido. Opciones: ' . implode(', ', ESTADOS_LINEA));
        }
        if (isset($d['notas'])) {
            $d['notas'] = mb_substr($d['notas'], 0, 255);
        }
        // Permite borrar la nota enviando "notas": ""
        $cuerpo = cuerpo();
        if (array_key_exists('notas', $cuerpo) && trim((string) $cuerpo['notas']) === '') {
            $d['notas'] = null;
        }

        transaccion(function () use ($d, $id, $linea) {
            $set = implode(', ', array_map(fn($c) => "`$c` = ?", array_keys($d)));
            consulta("UPDATE linea_pedido SET $set WHERE id = ?", [...array_values($d), $id]);
            recalcular_total($linea['id_pedido']);
        });
        responder(detalle_pedido($linea['id_pedido']));
    }

    if ($metodo === 'DELETE') {
        if ($linea['estado_pedido'] !== 'abierto') {
            fallo(409, 'Reabre el pedido para quitar platos');
        }
        if ($linea['estado'] !== 'pendiente' && !in_array($u['rango'], RANGOS_SALA, true)) {
            fallo(403, 'Este plato ya está en cocina: sólo un jefe de sala puede quitarlo');
        }
        transaccion(function () use ($id, $linea) {
            consulta('DELETE FROM linea_pedido WHERE id = ?', [$id]);
            recalcular_total($linea['id_pedido']);
        });
        responder(detalle_pedido($linea['id_pedido']));
    }

    fallo(405, 'Método no permitido');
}

/* ------------------------------------------------------------------
 *  Cocina
 * ------------------------------------------------------------------ */
function ruta_cocina(string $metodo): never
{
    requiere_login();
    if ($metodo !== 'GET') {
        fallo(405, 'Método no permitido');
    }
    $p = [];
    $excluir = '';
    if (!empty($_GET['excluir_generos'])) {
        $ids = array_map('intval', explode(',', $_GET['excluir_generos']));
        $excluir = ' AND pl.id_genero NOT IN (' . implode(',', array_fill(0, count($ids), '?')) . ')';
        $p = $ids;
    }
    responder(todos(
        "SELECT l.id, l.id_pedido, l.cantidad, l.notas, l.estado, pl.nombre AS plato, pl.id_genero,
                g.nombre AS genero, m.nombre AS mesa, m.salon, pe.fecha
           FROM linea_pedido l
           JOIN pedidos pe ON pe.id = l.id_pedido
           JOIN platos pl  ON pl.id = l.id_platos
           JOIN generos g  ON g.id = pl.id_genero
           JOIN mesas m    ON m.id = pe.id_mesa
          WHERE pe.estado IN ('abierto', 'cerrado') AND l.estado <> 'servido' $excluir
          ORDER BY pe.fecha, pe.id, g.orden, l.id", $p));
}
