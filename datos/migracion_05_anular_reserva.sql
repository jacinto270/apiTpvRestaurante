-- =====================================================================
--  Migración 05 · Anulación por el cliente
--  Al confirmar una reserva se genera un enlace de anulación de un solo
--  uso. Sólo se guarda la huella SHA-256 del token.
--  «anulada_por_cliente» distingue estas cancelaciones de las del equipo.
-- =====================================================================
ALTER TABLE `reservas`
  ADD COLUMN `anular_hash` char(64) DEFAULT NULL AFTER `intentos`,
  ADD COLUMN `anulada_por_cliente` tinyint(1) NOT NULL DEFAULT 0 AFTER `anular_hash`,
  ADD UNIQUE KEY `anular_hash` (`anular_hash`);
