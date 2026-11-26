-- =====================================================================
--  Migración 04 · Código de verificación de 6 cifras
--  Alternativa al enlace del correo: el cliente escribe el código en la
--  web. Se guarda sólo su huella (HMAC) y se limita a 5 intentos.
-- =====================================================================
ALTER TABLE `reservas`
  ADD COLUMN `codigo_hash` char(64) DEFAULT NULL AFTER `token_hash`,
  ADD COLUMN `intentos` tinyint(4) NOT NULL DEFAULT 0 AFTER `codigo_hash`;
