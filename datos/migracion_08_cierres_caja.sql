-- =====================================================================
--  Migración 08 · Cierres de caja (X y Z)
--  · cierres_caja: un registro por cada cierre Z (numerado), con el
--    informe completo congelado en «detalle» (JSON).
--  · pedidos.id_cierre: los pedidos cobrados o anulados quedan sellados
--    con el cierre Z que los incluyó. Los que tienen id_cierre NULL forman
--    el periodo de caja abierto (lo que muestra el informe X).
-- =====================================================================
CREATE TABLE `cierres_caja` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `numero` int(11) NOT NULL,
  `desde` timestamp NULL DEFAULT NULL,
  `hasta` timestamp NOT NULL DEFAULT current_timestamp(),
  `fondo` decimal(10,2) NOT NULL,
  `tickets` int(11) NOT NULL DEFAULT 0,
  `total` decimal(10,2) NOT NULL DEFAULT 0.00,
  `efectivo` decimal(10,2) NOT NULL DEFAULT 0.00,
  `tarjeta` decimal(10,2) NOT NULL DEFAULT 0.00,
  `otros` decimal(10,2) NOT NULL DEFAULT 0.00,
  `efectivo_esperado` decimal(10,2) NOT NULL DEFAULT 0.00,
  `efectivo_contado` decimal(10,2) DEFAULT NULL,
  `descuadre` decimal(10,2) DEFAULT NULL,
  `anulados` int(11) NOT NULL DEFAULT 0,
  `anulados_importe` decimal(10,2) NOT NULL DEFAULT 0.00,
  `id_personal` int(11) NOT NULL,
  `notas` varchar(500) DEFAULT NULL,
  `detalle` longtext NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `numero` (`numero`),
  KEY `id_personal` (`id_personal`),
  CONSTRAINT `cierres_caja_ibfk_personal` FOREIGN KEY (`id_personal`) REFERENCES `personal` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE `pedidos`
  ADD COLUMN `id_cierre` int(11) DEFAULT NULL AFTER `estado`,
  ADD KEY `id_cierre` (`id_cierre`),
  ADD CONSTRAINT `pedidos_ibfk_cierre` FOREIGN KEY (`id_cierre`) REFERENCES `cierres_caja` (`id`);
