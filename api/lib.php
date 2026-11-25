<?php
declare(strict_types=1);

require __DIR__ . '/config.php';

/* ------------------------------------------------------------------
 *  Errores y respuestas
 * ------------------------------------------------------------------ */
class ApiError extends Exception
{
    public function __construct(public int $estado, string $mensaje)
    {
        parent::__construct($mensaje);
    }
}

function fallo(int $estado, string $mensaje): never
{
    throw new ApiError($estado, $mensaje);
}

function responder(mixed $datos, int $estado = 200): never
{
    http_response_code($estado);
    if ($estado !== 204) {
        echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
    }
    exit;
}

/** Cuerpo JSON de la petición como array. */
function cuerpo(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === '' || $raw === false) {
        return [];
    }
    $datos = json_decode($raw, true);
    if (!is_array($datos)) {
        fallo(400, 'El cuerpo de la petición no es un JSON válido');
    }
    return $datos;
}

/* ------------------------------------------------------------------
 *  Base de datos
 * ------------------------------------------------------------------ */
function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO(
            'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
            DB_USER,
            DB_PASS,
            [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]
        );
    }
    return $pdo;
}

function consulta(string $sql, array $params = []): PDOStatement
{
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st;
}

/** Columnas DECIMAL que MySQL devuelve como texto y queremos como número. */
const CAMPOS_DECIMALES = ['precio', 'total', 'cantidad', 'subtotal', 'coste', 'margen',
    'pedido_total', 'ventas', 'ticket_medio', 'importe'];
/** Recuentos (SUM/COUNT) que también llegan como texto. */
const CAMPOS_ENTEROS = ['unidades', 'unidades_vendidas', 'pedidos', 'mesas'];

function normalizar(array $fila): array
{
    foreach ($fila as $k => $v) {
        if (!is_string($v) || !is_numeric($v)) {
            continue;
        }
        if (in_array($k, CAMPOS_DECIMALES, true)) {
            $fila[$k] = (float) $v;
        } elseif (in_array($k, CAMPOS_ENTEROS, true)) {
            $fila[$k] = (int) $v;
        }
    }
    return $fila;
}

function todos(string $sql, array $params = []): array
{
    return array_map('normalizar', consulta($sql, $params)->fetchAll());
}

function uno(string $sql, array $params = []): ?array
{
    $fila = consulta($sql, $params)->fetch();
    return $fila === false ? null : normalizar($fila);
}

function transaccion(callable $fn): mixed
{
    db()->beginTransaction();
    try {
        $r = $fn();
        db()->commit();
        return $r;
    } catch (Throwable $e) {
        db()->rollBack();
        throw $e;
    }
}

/* ------------------------------------------------------------------
 *  Validación
 *  $esquema = ['campo' => 'texto|entero|decimal|bool' . opcional '?']
 *  '?' al final = campo opcional también al crear.
 * ------------------------------------------------------------------ */
function validar(array $datos, array $esquema, bool $parcial = false): array
{
    $limpio = [];
    foreach ($esquema as $campo => $tipo) {
        $opcional = str_ends_with($tipo, '?');
        $tipo = rtrim($tipo, '?');

        if (!array_key_exists($campo, $datos) || $datos[$campo] === null) {
            if (!$parcial && !$opcional) {
                fallo(422, "El campo «{$campo}» es obligatorio");
            }
            continue;
        }
        $v = $datos[$campo];

        switch ($tipo) {
            case 'texto':
                if (!is_scalar($v) || trim((string) $v) === '') {
                    fallo(422, "El campo «{$campo}» no puede estar vacío");
                }
                $limpio[$campo] = trim((string) $v);
                break;
            case 'entero':
                if (filter_var($v, FILTER_VALIDATE_INT) === false) {
                    fallo(422, "El campo «{$campo}» debe ser un número entero");
                }
                $limpio[$campo] = (int) $v;
                break;
            case 'decimal':
                if (!is_numeric($v) || $v < 0) {
                    fallo(422, "El campo «{$campo}» debe ser un número positivo");
                }
                $limpio[$campo] = round((float) $v, 2);
                break;
            case 'bool':
                $limpio[$campo] = filter_var($v, FILTER_VALIDATE_BOOLEAN) ? 1 : 0;
                break;
        }
    }
    if ($parcial && !$limpio) {
        fallo(422, 'No se ha enviado ningún campo para modificar');
    }
    return $limpio;
}

function id_valido(?string $id): int
{
    if ($id === null || !ctype_digit($id)) {
        fallo(400, 'Identificador no válido');
    }
    return (int) $id;
}

/* ------------------------------------------------------------------
 *  Sesión y permisos
 * ------------------------------------------------------------------ */
function iniciar_sesion(): void
{
    session_name('tpv_sesion');
    session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax', 'path' => '/']);
    session_start();
}

function usuario(): ?array
{
    return $_SESSION['usuario'] ?? null;
}

function requiere_login(): array
{
    $u = usuario();
    if (!$u) {
        fallo(401, 'Debes iniciar sesión');
    }
    return $u;
}

function requiere_rango(array $rangos): array
{
    $u = requiere_login();
    if (!in_array($u['rango'], $rangos, true)) {
        fallo(403, 'Tu rango no tiene permiso para esta acción');
    }
    return $u;
}
