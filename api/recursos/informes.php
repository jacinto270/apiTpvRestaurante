<?php
declare(strict_types=1);

/**
 * GET /resumen?fecha=2026-11-25   resumen de caja del día (por defecto, hoy)
 */
function ruta_resumen(string $metodo): never
{
    requiere_login();
    if ($metodo !== 'GET') {
        fallo(405, 'Método no permitido');
    }
    $fecha = $_GET['fecha'] ?? date('Y-m-d');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) {
        fallo(422, 'Fecha no válida (AAAA-MM-DD)');
    }

    $caja = uno("SELECT COUNT(*) AS pedidos, COALESCE(SUM(total), 0) AS ventas,
                        COALESCE(AVG(total), 0) AS ticket_medio
                   FROM pedidos WHERE estado = 'pagado' AND DATE(fecha) = ?", [$fecha]);

    $activos = uno("SELECT COUNT(*) AS mesas, COALESCE(SUM(total), 0) AS importe
                      FROM pedidos WHERE estado IN ('abierto', 'cerrado')");

    responder([
        'fecha'          => $fecha,
        'pedidos'        => $caja['pedidos'],
        'ventas'         => round($caja['ventas'], 2),
        'ticket_medio'   => round($caja['ticket_medio'], 2),
        'mesas_ocupadas' => $activos['mesas'],
        'en_curso'       => round($activos['importe'], 2),
        'por_tipo_pago'  => todos("SELECT tipo_pago, COUNT(*) AS pedidos, SUM(total) AS importe
                                     FROM pedidos WHERE estado = 'pagado' AND DATE(fecha) = ?
                                    GROUP BY tipo_pago ORDER BY importe DESC", [$fecha]),
        'mas_vendidos'   => todos("SELECT pl.id, pl.nombre, SUM(l.cantidad) AS unidades_vendidas,
                                          SUM(l.cantidad * l.precio) AS importe
                                     FROM linea_pedido l
                                     JOIN pedidos pe ON pe.id = l.id_pedido
                                     JOIN platos pl  ON pl.id = l.id_platos
                                    WHERE pe.estado = 'pagado' AND DATE(pe.fecha) = ?
                                    GROUP BY pl.id, pl.nombre ORDER BY unidades_vendidas DESC LIMIT 5", [$fecha]),
    ]);
}
