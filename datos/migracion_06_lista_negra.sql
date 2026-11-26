-- =====================================================================
--  Migración 06 · No presentados y lista negra
--  · Nuevo estado de reserva «no_presentado».
--  · Tabla lista_negra: clientes que no se presentaron o anularon a
--    última hora. Mientras estén activos no pueden reservar por la web.
-- =====================================================================
ALTER TABLE `reservas`
  MODIFY `estado` enum('sin_verificar','pendiente','confirmada','rechazada','cancelada','no_presentado') NOT NULL DEFAULT 'pendiente';

CREATE TABLE `lista_negra` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(80) NOT NULL,
  `email` varchar(120) DEFAULT NULL,
  `telefono` varchar(20) DEFAULT NULL,
  `telefono_norm` varchar(20) DEFAULT NULL,            -- sólo dígitos, para comparar
  `motivo` enum('no_presentado','anulacion_tardia') NOT NULL,
  `id_reserva` int(11) DEFAULT NULL,
  `id_personal` int(11) DEFAULT NULL,                  -- quién lo marcó (NULL = automático)
  `creada` timestamp NOT NULL DEFAULT current_timestamp(),
  `sms_estado` enum('pendiente','enviado','error','sin_configurar') NOT NULL DEFAULT 'pendiente',
  `sms_fecha` timestamp NULL DEFAULT NULL,
  `activa` tinyint(1) NOT NULL DEFAULT 1,
  `retirada` timestamp NULL DEFAULT NULL,
  `id_personal_retira` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `email` (`email`, `activa`),
  KEY `telefono_norm` (`telefono_norm`, `activa`),
  KEY `id_reserva` (`id_reserva`),
  CONSTRAINT `lista_negra_ibfk_reserva` FOREIGN KEY (`id_reserva`) REFERENCES `reservas` (`id`) ON DELETE SET NULL,
  CONSTRAINT `lista_negra_ibfk_personal` FOREIGN KEY (`id_personal`) REFERENCES `personal` (`id`),
  CONSTRAINT `lista_negra_ibfk_retira` FOREIGN KEY (`id_personal_retira`) REFERENCES `personal` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
