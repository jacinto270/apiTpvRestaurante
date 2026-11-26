-- =====================================================================
--  Migración 03 · Verificación de reservas por correo
--  Nuevo estado «sin_verificar»: la solicitud espera a que el cliente
--  abra el enlace que le enviamos. Sólo entonces pasa a «pendiente»
--  y la ve el equipo de sala. Del token sólo se guarda su huella SHA-256.
-- =====================================================================
ALTER TABLE `reservas`
  MODIFY `estado` enum('sin_verificar','pendiente','confirmada','rechazada','cancelada') NOT NULL DEFAULT 'pendiente',
  ADD COLUMN `token_hash` char(64) DEFAULT NULL AFTER `ip_hash`,
  ADD COLUMN `verificada` timestamp NULL DEFAULT NULL AFTER `token_hash`,
  ADD UNIQUE KEY `token_hash` (`token_hash`);
