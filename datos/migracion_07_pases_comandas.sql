-- =====================================================================
--  Migración 07 · Pases y marcha de comandas
--  · generos.pase: pase por defecto de cada sección (0 = no va a cocina).
--  · linea_pedido.pase: pase de cada plato (lo puede cambiar el camarero).
--  · Estados de línea:
--      pendiente  → en espera (anotado, aún no marchado)
--      marchado   → el camarero lo ha marchado: la cocina debe empezarlo
--      en cocina  → la cocina lo está preparando
--      listo      → en el pase, esperando a que el camarero lo saque
--      servido    → en la mesa
-- =====================================================================
ALTER TABLE `generos`
  ADD COLUMN `pase` tinyint(4) NOT NULL DEFAULT 1 AFTER `orden`;

UPDATE `generos` SET `pase` = CASE
    WHEN `nombre` IN ('Entrantes', 'Raciones') THEN 1
    WHEN `nombre` = 'Primeros' THEN 2
    WHEN `nombre` = 'Segundos' THEN 3
    WHEN `nombre` = 'Postres' THEN 4
    WHEN `nombre` IN ('Bebidas', 'Vinos', 'Cervezas') THEN 0
    ELSE 1 END;

ALTER TABLE `linea_pedido`
  MODIFY `estado` enum('pendiente','marchado','en cocina','listo','servido') NOT NULL DEFAULT 'pendiente',
  ADD COLUMN `pase` tinyint(4) NOT NULL DEFAULT 1 AFTER `notas`,
  ADD COLUMN `marchada` timestamp NULL DEFAULT NULL AFTER `estado`,
  ADD COLUMN `lista` timestamp NULL DEFAULT NULL AFTER `marchada`;

-- Pase de las líneas existentes según su sección
UPDATE `linea_pedido` l
  JOIN `platos` p  ON p.id = l.id_platos
  JOIN `generos` g ON g.id = p.id_genero
   SET l.pase = g.pase;

-- Hasta ahora «pendiente» significaba «en la cola de cocina»: en los pedidos
-- activos esos platos pasan a «marchado» para que la cocina los siga viendo.
UPDATE `linea_pedido` l
  JOIN `pedidos` pe ON pe.id = l.id_pedido
   SET l.estado = 'marchado', l.marchada = pe.fecha
 WHERE l.estado = 'pendiente' AND l.pase > 0 AND pe.estado IN ('abierto', 'cerrado');
