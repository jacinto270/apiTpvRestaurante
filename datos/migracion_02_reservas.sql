-- =====================================================================
--  Migración 02 · Reservas desde la web
--  Las solicitudes entran como «pendiente» y sólo pasan a «confirmada»
--  cuando un jefe de sala o la gerencia las revisa en el TPV.
-- =====================================================================
CREATE TABLE `reservas` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(80) NOT NULL,
  `email` varchar(120) NOT NULL,
  `telefono` varchar(20) NOT NULL,
  `fecha` date NOT NULL,
  `hora` time NOT NULL,
  `comensales` tinyint(4) NOT NULL,
  `zona` varchar(11) DEFAULT NULL,
  `comentarios` varchar(500) DEFAULT NULL,
  `estado` enum('pendiente','confirmada','rechazada','cancelada') NOT NULL DEFAULT 'pendiente',
  `id_mesa` int(11) DEFAULT NULL,
  `id_personal` int(11) DEFAULT NULL,
  `creada` timestamp NOT NULL DEFAULT current_timestamp(),
  `gestionada` timestamp NULL DEFAULT NULL,
  `ip_hash` char(64) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `fecha` (`fecha`, `hora`),
  KEY `estado` (`estado`),
  KEY `ip_hash` (`ip_hash`, `creada`),
  KEY `id_mesa` (`id_mesa`),
  KEY `id_personal` (`id_personal`),
  CONSTRAINT `reservas_ibfk_mesa` FOREIGN KEY (`id_mesa`) REFERENCES `mesas` (`id`) ON DELETE SET NULL,
  CONSTRAINT `reservas_ibfk_personal` FOREIGN KEY (`id_personal`) REFERENCES `personal` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
