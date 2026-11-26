<?php
declare(strict_types=1);

/**
 * Cierre de caja
 *   GET  /caja/x               informe X: periodo abierto desde el último cierre Z (no cambia nada)
 *   POST /caja/z               cierre Z: congela el informe, lo numera y deja la caja a 0
 *                              {efectivo_contado?, notas?}            (admin, gerente, jefe de sala)
 *   GET  /caja/cierres         histórico de cierres Z
 *   GET  /caja/cierres/{id}    informe completo de un cierre Z
 *
 * El periodo abierto son los pedidos cobrados o anulados con id_cierre NULL.
 * Al hacer la Z se sellan con el id del cierre: la siguiente X empieza de cero.
 */

function ruta_caja(string $metodo, ?string $id, ?string $sub): never
{
    $u = requiere_login();

    if ($id === 'x' && $metodo === 'GET') {
        responder(['tipo' => 'X', 'generado' => date('Y-m-d H:i:s'),
                   'personal' => "{$u['nombre']} {$u['apellidos']}"] + informe_caja());
    }
    if ($id === 'z' && $metodo === 'POST') {
        requiere_rango(RANGOS_SALA);
        responder(cierre_z($u, cuerpo()), 201);
    }
    if ($id === 'cierres' && $metodo === 'GET') {
        requiere_rango(RANGOS_SALA);
        if ($sub === null) {
            responder(todos(
                "SELECT c.id, c.numero, c.desde, c.hasta, c.tickets, c.total, c.efectivo, c.efectivo_contado,
                        c.descuadre, CONCAT(pe.nombre, ' ', pe.apellidos) AS personal
                   FROM cierres_caja c JOIN personal pe ON pe.id = c.id_personal
                  ORDER BY c.numero DESC LIMIT 60"));
        }
        responder(leer_cierre(id_valido($sub)));
    }
    fallo(404, 'Ruta de caja no encontrada');
}

/**
 * Informe de caja. Sin $idCierre: periodo abierto (informe X).
 * Con $idCierre: los pedidos sellados por ese cierre.
 */
function informe_caja(?int $idCierre = null): array
{
    $filtro = $idCierre === null ? 'pe.id_cierre IS NULL' : 'pe.id_cierre = ?';
    $p = $idCierre === null ? [] : [$idCierre];

    $cobros = todos(
        "SELECT pe.id, pe.total, LOWER(COALESCE(pe.tipo_pago, 'sin indicar')) AS tipo_pago, pe.fecha, pe.id_personal,
                CONCAT(pr.nombre, ' ', pr.apellidos) AS camarero, m.nombre AS mesa
           FROM pedidos pe
           JOIN personal pr ON pr.id = pe.id_personal
           JOIN mesas m     ON m.id = pe.id_mesa
          WHERE $filtro AND pe.estado = 'pagado'
          ORDER BY pe.fecha", $p);

    // Formas de pago
    $pagos = [];
    foreach ($cobros as $c) {
        $pagos[$c['tipo_pago']] ??= ['tipo_pago' => $c['tipo_pago'], 'tickets' => 0, 'importe' => 0.0];
        $pagos[$c['tipo_pago']]['tickets']++;
        $pagos[$c['tipo_pago']]['importe'] += $c['total'];
    }
    usort($pagos, fn($a, $b) => $b['importe'] <=> $a['importe']);
    $porTipo = fn(string $t) => round(array_sum(array_map(fn($x) => $x['tipo_pago'] === $t ? $x['importe'] : 0, $pagos)), 2);

    // Camareros
    $camareros = [];
    foreach ($cobros as $c) {
        $camareros[$c['id_personal']] ??= ['id' => $c['id_personal'], 'camarero' => $c['camarero'],
                                           'tickets' => 0, 'total' => 0.0, 'efectivo' => 0.0];
        $camareros[$c['id_personal']]['tickets']++;
        $camareros[$c['id_personal']]['total'] += $c['total'];
        if ($c['tipo_pago'] === 'efectivo') {
            $camareros[$c['id_personal']]['efectivo'] += $c['total'];
        }
    }
    $camareros = array_values(array_map(fn($x) => ['total' => round($x['total'], 2), 'efectivo' => round($x['efectivo'], 2)] + $x, $camareros));
    usort($camareros, fn($a, $b) => $b['total'] <=> $a['total']);

    // Productos vendidos
    $productos = todos(
        "SELECT pl.id, pl.nombre AS producto, g.nombre AS seccion, SUM(l.cantidad) AS unidades,
                ROUND(SUM(l.cantidad * l.precio), 2) AS importe
           FROM linea_pedido l
           JOIN pedidos pe ON pe.id = l.id_pedido
           JOIN platos pl  ON pl.id = l.id_platos
           JOIN generos g  ON g.id = pl.id_genero
          WHERE $filtro AND pe.estado = 'pagado'
          GROUP BY pl.id, pl.nombre, g.nombre, g.orden
          ORDER BY g.orden, importe DESC", $p);

    // Anulados con consumiciones (control)
    $anulados = todos(
        "SELECT pe.id, pe.total, pe.fecha, m.nombre AS mesa, CONCAT(pr.nombre, ' ', pr.apellidos) AS camarero
           FROM pedidos pe
           JOIN mesas m     ON m.id = pe.id_mesa
           JOIN personal pr ON pr.id = pe.id_personal
          WHERE $filtro AND pe.estado = 'anulado' AND pe.total > 0
          ORDER BY pe.fecha", $p);

    $total = round(array_sum(array_column($cobros, 'total')), 2);
    $efectivo = $porTipo('efectivo');
    $tarjeta = $porTipo('tarjeta');
    $ultimo = uno('SELECT numero, hasta FROM cierres_caja ORDER BY numero DESC LIMIT 1');

    $informe = [
        'desde'             => $cobros[0]['fecha'] ?? ($anulados[0]['fecha'] ?? null),
        'ultimo_cierre'     => $ultimo,
        'fondo'             => (float) FONDO_CAJA,
        'tickets'           => count($cobros),
        'total'             => $total,
        'ticket_medio'      => $cobros ? round($total / count($cobros), 2) : 0.0,
        'efectivo'          => $efectivo,
        'tarjeta'           => $tarjeta,
        'otros'             => round($total - $efectivo - $tarjeta, 2),
        'efectivo_esperado' => round(FONDO_CAJA + $efectivo, 2),
        'formas_pago'       => array_map(fn($x) => ['importe' => round($x['importe'], 2)] + $x, $pagos),
        'camareros'         => $camareros,
        'productos'         => $productos,
        'unidades'          => (int) array_sum(array_column($productos, 'unidades')),
        'anulados'          => $anulados,
        'anulados_importe'  => round(array_sum(array_column($anulados, 'total')), 2),
    ];

    if ($idCierre === null) {
        $informe['mesas_abiertas'] = todos(
            "SELECT pe.id, m.nombre AS mesa, pe.total, pe.estado, CONCAT(pr.nombre, ' ', pr.apellidos) AS camarero
               FROM pedidos pe
               JOIN mesas m     ON m.id = pe.id_mesa
               JOIN personal pr ON pr.id = pe.id_personal
              WHERE pe.estado IN ('abierto', 'cerrado')
              ORDER BY m.salon, m.id");
    }
    return $informe;
}

function cierre_z(array $u, array $datos): array
{
    $d = validar($datos, ['efectivo_contado' => 'decimal?', 'notas' => 'texto?']);

    return transaccion(function () use ($u, $d) {
        // Bloquea los pedidos del periodo para que nadie cobre a mitad del cierre
        consulta("SELECT id FROM pedidos WHERE id_cierre IS NULL AND estado IN ('pagado', 'anulado', 'abierto', 'cerrado') FOR UPDATE");

        $inf = informe_caja();
        if ($inf['mesas_abiertas']) {
            $mesas = implode(', ', array_map(fn($m) => $m['mesa'], $inf['mesas_abiertas']));
            fallo(409, "No se puede cerrar la caja con mesas abiertas: $mesas. Cóbralas o anúlalas antes de la Z.");
        }
        $pedidos = (int) uno("SELECT COUNT(*) AS n FROM pedidos WHERE id_cierre IS NULL AND estado IN ('pagado', 'anulado')")['n'];
        if (!$pedidos) {
            fallo(409, 'No hay ventas desde el último cierre: la caja ya está a 0.');
        }

        $contado = $d['efectivo_contado'] ?? null;
        $descuadre = $contado === null ? null : round($contado - $inf['efectivo_esperado'], 2);
        $numero = (int) uno('SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM cierres_caja')['n'];
        unset($inf['mesas_abiertas']);
        $detalle = $inf + ['efectivo_contado' => $contado, 'descuadre' => $descuadre,
                           'retirar' => $contado === null ? null : round(max(0, $contado - FONDO_CAJA), 2)];

        consulta('INSERT INTO cierres_caja (numero, desde, fondo, tickets, total, efectivo, tarjeta, otros, efectivo_esperado,
                                            efectivo_contado, descuadre, anulados, anulados_importe, id_personal, notas, detalle)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$numero, $inf['desde'], FONDO_CAJA, $inf['tickets'], $inf['total'], $inf['efectivo'], $inf['tarjeta'],
             $inf['otros'], $inf['efectivo_esperado'], $contado, $descuadre, count($inf['anulados']), $inf['anulados_importe'],
             $u['id'], isset($d['notas']) ? mb_substr($d['notas'], 0, 500) : null,
             json_encode($detalle, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION)]);
        $id = (int) db()->lastInsertId();

        // Sellar el periodo: la siguiente X empieza de cero
        consulta("UPDATE pedidos SET id_cierre = ? WHERE id_cierre IS NULL AND estado IN ('pagado', 'anulado')", [$id]);
        return leer_cierre($id);
    });
}

function leer_cierre(int $id): array
{
    $c = uno("SELECT c.*, CONCAT(pe.nombre, ' ', pe.apellidos) AS personal
                FROM cierres_caja c JOIN personal pe ON pe.id = c.id_personal WHERE c.id = ?", [$id])
        ?? fallo(404, 'Cierre no encontrado');
    $detalle = json_decode($c['detalle'], true) ?: [];
    unset($c['detalle']);
    return ['tipo' => 'Z', 'generado' => $c['hasta']] + $c + $detalle + ['numero' => $c['numero'], 'personal' => $c['personal']];
}
