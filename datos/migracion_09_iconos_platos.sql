-- =====================================================================
--  Migración 09 · Iconos originales de la carta
--  Las imágenes de los platos pasan a los iconos SVG propios de Olea
--  (img/iconos/platos/, generados con herramientas/generar-iconos-platos.js).
--  Las imágenes anteriores (img/platos/*.webp) no se borran.
-- =====================================================================
UPDATE `platos`
   SET `imagen` = CONCAT('img/iconos/platos/', SUBSTRING_INDEX(SUBSTRING_INDEX(`imagen`, '/', -1), '.', 1), '.svg')
 WHERE `imagen` LIKE 'img/platos/%';
