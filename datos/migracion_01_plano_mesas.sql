-- =====================================================================
--  Migración 01 · Plano del salón
--  Añade la posición de cada mesa en el plano de su salón.
--  Coordenadas en un lienzo de 1000 × 620 (centro de la mesa).
--  NULL = sin colocar todavía: el TPV la sitúa automáticamente.
-- =====================================================================
ALTER TABLE `mesas`
  ADD COLUMN `pos_x` SMALLINT NULL DEFAULT NULL AFTER `salon`,
  ADD COLUMN `pos_y` SMALLINT NULL DEFAULT NULL AFTER `pos_x`;
