<?php
declare(strict_types=1);

/**
 * CRUD de las tablas de catálogo + rutas especiales:
 *   GET  /carta                          carta pública completa
 *   GET  /platos/{id}                    plato con ingredientes, alérgenos y escandallo
 *   PUT  /platos/{id}/ingredientes       sustituye la receta  [{id_ingredientes, cantidad}]
 *   GET  /ingredientes/{id}              ingrediente con sus alérgenos
 *   PUT  /ingredientes/{id}/alergenos    sustituye sus alérgenos  [id, id, ...]
 *   GET  /mesas                          mesas con su pedido activo (si lo hay)
 */

const CATALOGO = [
    'alergenos' => [
        'campos'   => ['nombre' => 'texto', 'icono' => 'texto?'],
        'orden'    => 'id',
        'escribir' => RANGOS_CARTA,
    ],
    'generos' => [
        'campos'   => ['nombre' => 'texto', 'orden' => 'entero?'],
        'orden'    => 'orden, nombre',
        'escribir' => RANGOS_CARTA,
    ],
    'ingredientes' => [
        'campos'   => ['nombre' => 'texto', 'unidades' => 'texto', 'precio' => 'decimal'],
        'orden'    => 'nombre',
        'escribir' => RANGOS_CARTA,
        'privado'  => true, // los costes no son públicos
    ],
    'mesas' => [
        'campos'   => ['nombre' => 'texto', 'comensales' => 'entero', 'salon' => 'texto',
                       'pos_x' => 'entero?', 'pos_y' => 'entero?'],
        'orden'    => 'salon, id',
        'escribir' => RANGOS_SALA,   // la distribución del salón: dirección y jefes de sala
        'privado'  => true,
    ],
    'platos' => [
        'campos'   => ['nombre' => 'texto', 'precio' => 'decimal', 'imagen' => 'texto?',
                       'id_genero' => 'entero', 'orden' => 'entero?', 'disponible' => 'bool?'],
        'orden'    => 'id_genero, orden, nombre',
        'escribir' => RANGOS_CARTA,
    ],
];

function ruta_catalogo(string $tabla, string $metodo, ?string $id, ?string $sub): never
{
    $cfg = CATALOGO[$tabla];

    if ($metodo === 'GET' && !empty($cfg['privado'])) {
        requiere_login();
    }

    // --- rutas especiales -------------------------------------------------
    if ($tabla === 'mesas' && $id === 'plano') {
        if ($metodo !== 'PUT') {
            fallo(405, 'Método no permitido');
        }
        requiere_rango($cfg['escribir']);
        responder(guardar_plano(cuerpo()));
    }

    if ($sub !== null) {
        $id = id_valido($id);
        requiere_rango($cfg['escribir']);
        match ("$tabla/$sub/$metodo") {
            'platos/ingredientes/PUT'      => responder(guardar_receta($id, cuerpo())),
            'ingredientes/alergenos/PUT'   => responder(guardar_alergenos_ingrediente($id, cuerpo())),
            default                        => fallo(404, 'Ruta no encontrada'),
        };
    }

    if ($metodo === 'GET' && $id === null) {
        responder(match ($tabla) {
            'platos' => listar_platos(),
            'mesas'  => listar_mesas(),
            default  => todos("SELECT * FROM `$tabla` ORDER BY {$cfg['orden']}"),
        });
    }

    if ($metodo === 'GET') {
        $id = id_valido($id);
        responder(match ($tabla) {
            'platos'       => detalle_plato($id),
            'ingredientes' => detalle_ingrediente($id),
            default        => buscar($tabla, $id),
        });
    }

    // --- escritura --------------------------------------------------------
    requiere_rango($cfg['escribir']);

    if ($metodo === 'POST' && $id === null) {
        $d = validar(cuerpo(), $cfg['campos']);
        if ($tabla === 'platos') {
            $d += ['imagen' => '', 'orden' => 0, 'disponible' => 1];
        } elseif ($tabla === 'alergenos') {
            $d += ['icono' => ''];
        } elseif ($tabla === 'generos') {
            $d += ['orden' => (int) uno('SELECT COALESCE(MAX(orden), 0) + 1 AS n FROM generos')['n']];
        }
        $cols = implode(', ', array_map(fn($c) => "`$c`", array_keys($d)));
        $ph   = implode(', ', array_fill(0, count($d), '?'));
        consulta("INSERT INTO `$tabla` ($cols) VALUES ($ph)", array_values($d));
        responder(buscar($tabla, (int) db()->lastInsertId()), 201);
    }

    if (in_array($metodo, ['PUT', 'PATCH'], true) && $id !== null) {
        $id = id_valido($id);
        buscar($tabla, $id);
        $d = validar(cuerpo(), $cfg['campos'], parcial: true);
        $set = implode(', ', array_map(fn($c) => "`$c` = ?", array_keys($d)));
        consulta("UPDATE `$tabla` SET $set WHERE id = ?", [...array_values($d), $id]);
        responder(buscar($tabla, $id));
    }

    if ($metodo === 'DELETE' && $id !== null) {
        $id = id_valido($id);
        buscar($tabla, $id);
        transaccion(function () use ($tabla, $id) {
            // Las tablas puente se borran con su dueño
            if ($tabla === 'platos') {
                consulta('DELETE FROM platos_ingredientes WHERE id_platos = ?', [$id]);
            } elseif ($tabla === 'ingredientes') {
                consulta('DELETE FROM ingredientes_alergenos WHERE id_ingredientes = ?', [$id]);
            }
            consulta("DELETE FROM `$tabla` WHERE id = ?", [$id]);
        });
        responder(null, 204);
    }

    fallo(405, 'Método no permitido');
}

function buscar(string $tabla, int $id): array
{
    return uno("SELECT * FROM `$tabla` WHERE id = ?", [$id])
        ?? fallo(404, 'No encontrado');
}

/* ------------------------------------------------------------------
 *  Platos
 * ------------------------------------------------------------------ */

/** GET /platos?genero=4&disponible=1&buscar=arroz */
function listar_platos(): array
{
    $where = [];
    $p = [];
    if (isset($_GET['genero'])) {
        $where[] = 'p.id_genero = ?';
        $p[] = (int) $_GET['genero'];
    }
    if (isset($_GET['disponible'])) {
        $where[] = 'p.disponible = ?';
        $p[] = filter_var($_GET['disponible'], FILTER_VALIDATE_BOOLEAN) ? 1 : 0;
    }
    if (!empty($_GET['buscar'])) {
        $where[] = 'p.nombre LIKE ?';
        $p[] = '%' . $_GET['buscar'] . '%';
    }
    $sql = 'SELECT p.*, g.nombre AS genero FROM platos p JOIN generos g ON g.id = p.id_genero'
        . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
        . ' ORDER BY g.orden, p.orden, p.nombre';

    $platos = todos($sql, $p);
    $alergenos = alergenos_por_plato();
    foreach ($platos as &$pl) {
        $pl['alergenos'] = $alergenos[$pl['id']] ?? [];
    }
    return $platos;
}

function detalle_plato(int $id): array
{
    $plato = uno('SELECT p.*, g.nombre AS genero FROM platos p JOIN generos g ON g.id = p.id_genero WHERE p.id = ?', [$id])
        ?? fallo(404, 'Plato no encontrado');

    $plato['ingredientes'] = todos(
        'SELECT i.id, i.nombre, i.unidades, pi.cantidad, ROUND(pi.cantidad * i.precio, 4) AS coste
           FROM platos_ingredientes pi JOIN ingredientes i ON i.id = pi.id_ingredientes
          WHERE pi.id_platos = ? ORDER BY pi.cantidad DESC', [$id]);

    $plato['alergenos'] = alergenos_por_plato($id)[$id] ?? [];

    // Escandallo: sólo para quien gestiona la carta
    $u = usuario();
    if ($u && in_array($u['rango'], RANGOS_CARTA, true)) {
        $coste = array_sum(array_column($plato['ingredientes'], 'coste'));
        $plato['coste'] = round($coste, 2);
        $plato['margen'] = round($plato['precio'] - $coste, 2);
    } else {
        foreach ($plato['ingredientes'] as &$ing) {
            unset($ing['coste'], $ing['cantidad'], $ing['unidades']);
        }
    }
    return $plato;
}

/** Alérgenos de cada plato, deducidos de sus ingredientes. [id_plato => [alergeno...]] */
function alergenos_por_plato(?int $idPlato = null): array
{
    $sql = 'SELECT DISTINCT pi.id_platos, a.id, a.nombre, a.icono
              FROM platos_ingredientes pi
              JOIN ingredientes_alergenos ia ON ia.id_ingredientes = pi.id_ingredientes
              JOIN alergenos a ON a.id = ia.id_alergenos'
        . ($idPlato ? ' WHERE pi.id_platos = ?' : '')
        . ' ORDER BY a.id';
    $res = [];
    foreach (todos($sql, $idPlato ? [$idPlato] : []) as $f) {
        $res[$f['id_platos']][] = ['id' => $f['id'], 'nombre' => $f['nombre'], 'icono' => $f['icono']];
    }
    return $res;
}

/** PUT /platos/{id}/ingredientes  [{id_ingredientes, cantidad}, ...] */
function guardar_receta(int $id, array $lista): array
{
    buscar('platos', $id);
    if (!array_is_list($lista)) {
        fallo(422, 'Se esperaba una lista de ingredientes');
    }
    $lineas = array_map(fn($l) => validar((array) $l, ['id_ingredientes' => 'entero', 'cantidad' => 'decimal']), $lista);

    transaccion(function () use ($id, $lineas) {
        consulta('DELETE FROM platos_ingredientes WHERE id_platos = ?', [$id]);
        foreach ($lineas as $l) {
            consulta('INSERT INTO platos_ingredientes (id_platos, id_ingredientes, cantidad) VALUES (?, ?, ?)',
                [$id, $l['id_ingredientes'], $l['cantidad']]);
        }
    });
    return detalle_plato($id);
}

/* ------------------------------------------------------------------
 *  Ingredientes
 * ------------------------------------------------------------------ */
function detalle_ingrediente(int $id): array
{
    $ing = buscar('ingredientes', $id);
    $ing['alergenos'] = todos(
        'SELECT a.* FROM ingredientes_alergenos ia JOIN alergenos a ON a.id = ia.id_alergenos
          WHERE ia.id_ingredientes = ? ORDER BY a.id', [$id]);
    $ing['platos'] = todos(
        'SELECT p.id, p.nombre FROM platos_ingredientes pi JOIN platos p ON p.id = pi.id_platos
          WHERE pi.id_ingredientes = ? ORDER BY p.nombre', [$id]);
    return $ing;
}

/** PUT /ingredientes/{id}/alergenos  [1, 7, ...] */
function guardar_alergenos_ingrediente(int $id, array $ids): array
{
    buscar('ingredientes', $id);
    if (!array_is_list($ids) || array_filter($ids, fn($v) => filter_var($v, FILTER_VALIDATE_INT) === false)) {
        fallo(422, 'Se esperaba una lista de ids de alérgenos');
    }
    transaccion(function () use ($id, $ids) {
        consulta('DELETE FROM ingredientes_alergenos WHERE id_ingredientes = ?', [$id]);
        foreach (array_unique(array_map('intval', $ids)) as $a) {
            consulta('INSERT INTO ingredientes_alergenos (id_ingredientes, id_alergenos) VALUES (?, ?)', [$id, $a]);
        }
    });
    return detalle_ingrediente($id);
}

/* ------------------------------------------------------------------
 *  Mesas
 * ------------------------------------------------------------------ */

/** GET /mesas?salon=terraza — cada mesa incluye su pedido activo o null */
function listar_mesas(): array
{
    $p = [];
    $sql = "SELECT m.*, pe.id AS pedido_id, pe.estado AS pedido_estado, pe.total AS pedido_total,
                   pe.fecha AS pedido_fecha, CONCAT(pr.nombre, ' ', pr.apellidos) AS pedido_personal,
                   (SELECT COALESCE(SUM(l.cantidad), 0) FROM linea_pedido l
                     WHERE l.id_pedido = pe.id AND l.estado = 'listo') AS pedido_listos
              FROM mesas m
              LEFT JOIN pedidos pe ON pe.id_mesa = m.id AND pe.estado IN ('abierto', 'cerrado')
              LEFT JOIN personal pr ON pr.id = pe.id_personal";
    if (!empty($_GET['salon'])) {
        $sql .= ' WHERE m.salon = ?';
        $p[] = $_GET['salon'];
    }
    $sql .= ' ORDER BY m.salon, m.id';

    // Próxima reserva confirmada de hoy en cada mesa (las que empezaron hace más de 2 h ya no cuentan)
    $reservas = [];
    foreach (todos("SELECT id, id_mesa, TIME_FORMAT(hora, '%H:%i') AS hora, nombre, comensales FROM reservas
                     WHERE fecha = CURDATE() AND estado = 'confirmada' AND id_mesa IS NOT NULL
                       AND hora >= CURTIME() - INTERVAL 2 HOUR
                     ORDER BY hora") as $r) {
        $reservas[$r['id_mesa']] ??= ['id' => $r['id'], 'hora' => $r['hora'], 'nombre' => $r['nombre'], 'comensales' => $r['comensales']];
    }

    return array_map(function ($f) use ($reservas) {
        $pedido = $f['pedido_id'] ? [
            'id'       => $f['pedido_id'],
            'estado'   => $f['pedido_estado'],
            'total'    => $f['pedido_total'],
            'fecha'    => $f['pedido_fecha'],
            'personal' => $f['pedido_personal'],
            'listos'   => (int) $f['pedido_listos'],
        ] : null;
        return ['id' => $f['id'], 'nombre' => $f['nombre'], 'comensales' => $f['comensales'],
                'salon' => $f['salon'], 'pos_x' => $f['pos_x'], 'pos_y' => $f['pos_y'], 'pedido' => $pedido,
                'reserva' => $reservas[$f['id']] ?? null];
    }, todos($sql, $p));
}

/**
 * PUT /mesas/plano — guarda de una vez la distribución de un salón.
 * {
 *   "salon":  "comedor",
 *   "mesas":  [{"id": 3, "comensales": 4, "pos_x": 220, "pos_y": 180},      ← existentes
 *              {"nombre": "Comedor 11", "comensales": 6, "pos_x": 500, "pos_y": 300}], ← nuevas
 *   "borrar": [7]
 * }
 */
function guardar_plano(array $datos): array
{
    $salon = validar($datos, ['salon' => 'texto'])['salon'];
    $mesas = $datos['mesas'] ?? [];
    $borrar = $datos['borrar'] ?? [];
    if (!is_array($mesas) || !array_is_list($mesas) || !is_array($borrar) || !array_is_list($borrar)) {
        fallo(422, 'Se esperaban las listas «mesas» y «borrar»');
    }

    $coordenada = function (array $m, string $campo, int $max): int {
        if (!isset($m[$campo]) || $m[$campo] < 0 || $m[$campo] > $max) {
            fallo(422, "«{$campo}» debe estar entre 0 y {$max}");
        }
        return $m[$campo];
    };

    transaccion(function () use ($salon, $mesas, $borrar, $coordenada) {
        foreach ($borrar as $id) {
            $id = (int) $id;
            $mesa = uno('SELECT nombre FROM mesas WHERE id = ? AND salon = ?', [$id, $salon])
                ?? fallo(404, "La mesa {$id} no existe en este salón");
            if (uno('SELECT id FROM pedidos WHERE id_mesa = ? LIMIT 1', [$id])) {
                fallo(409, "«{$mesa['nombre']}» tiene pedidos registrados y no se puede eliminar");
            }
            consulta('DELETE FROM mesas WHERE id = ?', [$id]);
        }

        foreach ($mesas as $m) {
            $m = validar((array) $m, ['id' => 'entero?', 'nombre' => 'texto?', 'comensales' => 'entero',
                                      'pos_x' => 'entero', 'pos_y' => 'entero']);
            if ($m['comensales'] < 1 || $m['comensales'] > 20) {
                fallo(422, 'Cada mesa debe tener entre 1 y 20 comensales');
            }
            $x = $coordenada($m, 'pos_x', 1000);
            $y = $coordenada($m, 'pos_y', 620);

            if (isset($m['id'])) {
                $st = consulta('UPDATE mesas SET comensales = ?, pos_x = ?, pos_y = ? WHERE id = ? AND salon = ?',
                    [$m['comensales'], $x, $y, $m['id'], $salon]);
                if (!$st->rowCount() && !uno('SELECT id FROM mesas WHERE id = ? AND salon = ?', [$m['id'], $salon])) {
                    fallo(404, "La mesa {$m['id']} no existe en este salón");
                }
            } else {
                if (empty($m['nombre'])) {
                    fallo(422, 'Las mesas nuevas necesitan nombre');
                }
                consulta('INSERT INTO mesas (nombre, comensales, salon, pos_x, pos_y) VALUES (?, ?, ?, ?, ?)',
                    [mb_substr($m['nombre'], 0, 20), $m['comensales'], $salon, $x, $y]);
            }
        }
    });

    $_GET['salon'] = $salon;
    return listar_mesas();
}

/* ------------------------------------------------------------------
 *  Carta pública: géneros con sus platos disponibles
 * ------------------------------------------------------------------ */
function ruta_carta(string $metodo): never
{
    if ($metodo !== 'GET') {
        fallo(405, 'Método no permitido');
    }
    $generos = todos('SELECT id, nombre, orden FROM generos ORDER BY orden, nombre');
    $platos = todos('SELECT id, nombre, precio, imagen, id_genero FROM platos WHERE disponible = 1 ORDER BY orden, nombre');
    $alergenos = alergenos_por_plato();

    $ingredientes = [];
    foreach (todos('SELECT pi.id_platos, i.nombre FROM platos_ingredientes pi
                      JOIN ingredientes i ON i.id = pi.id_ingredientes
                     ORDER BY pi.id_platos, pi.cantidad DESC') as $f) {
        $ingredientes[$f['id_platos']][] = $f['nombre'];
    }

    foreach ($generos as &$g) {
        $g['platos'] = [];
        foreach ($platos as $p) {
            if ($p['id_genero'] === $g['id']) {
                unset($p['id_genero']);
                $p['ingredientes'] = $ingredientes[$p['id']] ?? [];
                $p['alergenos'] = $alergenos[$p['id']] ?? [];
                $g['platos'][] = $p;
            }
        }
    }
    responder([
        'generos'   => array_values(array_filter($generos, fn($g) => $g['platos'])),
        'alergenos' => todos('SELECT * FROM alergenos ORDER BY id'),
    ]);
}
