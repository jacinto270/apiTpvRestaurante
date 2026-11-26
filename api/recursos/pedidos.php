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
const ESTADOS_LINEA = ['pendiente', 'marchado', 'en cocina', 'listo', 'servido'];
const NOMBRES_PASE = [0 => 'Bebidas', 1 => '1er pase', 2 => '2º pase', 3 => '3er pase', 4 => 'Postres'];

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
    if ($sub === 'marchar' && $metodo === 'POST') {
        responder(marchar($id, cuerpo()));
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

    $d = validar($datos, ['id_platos' => 'entero', 'cantidad' => 'entero?', 'notas' => 'texto?', 'pase' => 'entero?']);
    $cantidad = $d['cantidad'] ?? 1;
    if ($cantidad < 1) {
        fallo(422, 'La cantidad debe ser al menos 1');
    }
    $plato = uno('SELECT p.precio, p.disponible, g.pase FROM platos p JOIN generos g ON g.id = p.id_genero WHERE p.id = ?',
        [$d['id_platos']]) ?? fallo(404, 'Plato no encontrado');
    if (!$plato['disponible']) {
        fallo(409, 'Ese plato no está disponible ahora');
    }
    $notas = isset($d['notas']) ? mb_substr($d['notas'], 0, 255) : null;
    // El pase viene de la sección del plato; las bebidas (pase 0) no van a cocina
    $pase = $plato['pase'] == 0 ? 0 : max(1, min(4, $d['pase'] ?? (int) $plato['pase']));

    return transaccion(function () use ($idPedido, $d, $cantidad, $plato, $notas, $pase) {
        // Si ya hay una línea igual en espera (mismo pase, sin nota), se suma a ella
        $igual = $notas === null ? uno(
            "SELECT id FROM linea_pedido WHERE id_pedido = ? AND id_platos = ? AND precio = ? AND pase = ?
                AND notas IS NULL AND estado = 'pendiente' LIMIT 1",
            [$idPedido, $d['id_platos'], $plato['precio'], $pase]) : null;

        if ($igual) {
            consulta('UPDATE linea_pedido SET cantidad = cantidad + ? WHERE id = ?', [$cantidad, $igual['id']]);
        } else {
            consulta('INSERT INTO linea_pedido (id_pedido, id_platos, cantidad, precio, notas, pase) VALUES (?, ?, ?, ?, ?, ?)',
                [$idPedido, $d['id_platos'], $cantidad, $plato['precio'], $notas, $pase]);
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
        $d = validar(cuerpo(), ['cantidad' => 'entero?', 'notas' => 'texto?', 'estado' => 'texto?', 'pase' => 'entero?'], parcial: true);

        if ((isset($d['cantidad']) || isset($d['notas'])) && $linea['estado_pedido'] !== 'abierto') {
            fallo(409, 'Reabre el pedido para cambiar cantidades o notas');
        }
        if (isset($d['pase'])) {
            if ($linea['pase'] == 0) {
                fallo(409, 'Las bebidas no van por pases');
            }
            if ($linea['estado'] !== 'pendiente') {
                fallo(409, 'Este plato ya se ha marchado: no se puede cambiar de pase');
            }
            $d['pase'] = max(1, min(4, $d['pase']));
        }
        // Marcas de tiempo para la cocina y la sala
        if (($d['estado'] ?? null) === 'marchado' && $linea['estado'] === 'pendiente') {
            $d['marchada'] = date('Y-m-d H:i:s');
        }
        if (($d['estado'] ?? null) === 'listo') {
            $d['lista'] = date('Y-m-d H:i:s');
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
        if ($linea['estado'] !== 'pendiente' && $linea['pase'] > 0 && !in_array($u['rango'], RANGOS_SALA, true)) {
            fallo(403, 'Este plato ya se ha marchado a cocina: sólo un jefe de sala puede quitarlo');
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
/**
 * POST /pedidos/{id}/marchar  {pase?}
 * Marcha a cocina los platos en espera de un pase. Sin pase: el siguiente pase con platos en espera.
 */
function marchar(int $idPedido, array $datos): array
{
    $pedido = uno('SELECT estado FROM pedidos WHERE id = ?', [$idPedido]) ?? fallo(404, 'Pedido no encontrado');
    if (!in_array($pedido['estado'], ['abierto', 'cerrado'], true)) {
        fallo(409, "El pedido está {$pedido['estado']}");
    }
    $d = validar($datos, ['pase' => 'entero?']);
    $pase = $d['pase'] ?? (int) (uno("SELECT MIN(pase) AS p FROM linea_pedido
                                       WHERE id_pedido = ? AND estado = 'pendiente' AND pase > 0", [$idPedido])['p'] ?? 0);
    if ($pase < 1) {
        fallo(409, 'No hay platos en espera para marchar');
    }
    $st = consulta("UPDATE linea_pedido SET estado = 'marchado', marchada = NOW()
                     WHERE id_pedido = ? AND pase = ? AND estado = 'pendiente'", [$idPedido, $pase]);
    if (!$st->rowCount()) {
        fallo(409, 'Ese pase no tiene platos en espera');
    }
    return detalle_pedido($idPedido) + ['marchado' => ['pase' => $pase, 'nombre' => NOMBRES_PASE[$pase] ?? "Pase $pase", 'platos' => $st->rowCount()]];
}

/**
 * GET /cocina            platos de los pedidos activos que pasan por cocina:
 *                        marchados, en cocina, listos y (como aviso) los que esperan a ser marchados
 * GET /cocina/listos     platos listos esperando a que sala los saque
 */
function ruta_cocina(string $metodo, ?string $sub = null): never
{
    requiere_login();
    if ($metodo !== 'GET') {
        fallo(405, 'Método no permitido');
    }
    $estados = $sub === 'listos' ? "('listo')" : "('pendiente', 'marchado', 'en cocina', 'listo')";
    responder(todos(
        "SELECT l.id, l.id_pedido, l.cantidad, l.notas, l.estado, l.pase, l.marchada, l.lista,
                pl.nombre AS plato, pl.id_genero, g.nombre AS genero, m.id AS id_mesa, m.nombre AS mesa, m.salon,
                pe.fecha, CONCAT(pr.nombre, ' ', pr.apellidos) AS camarero
           FROM linea_pedido l
           JOIN pedidos pe  ON pe.id = l.id_pedido
           JOIN platos pl   ON pl.id = l.id_platos
           JOIN generos g   ON g.id = pl.id_genero
           JOIN mesas m     ON m.id = pe.id_mesa
           JOIN personal pr ON pr.id = pe.id_personal
          WHERE pe.estado IN ('abierto', 'cerrado') AND l.pase > 0 AND l.estado IN $estados
          ORDER BY COALESCE(l.marchada, '2999-01-01'), pe.fecha, pe.id, l.pase, l.id"));
}
