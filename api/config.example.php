<?php
// Plantilla de configuración.
// Copia este archivo como config.php y rellena tus datos.
// config.php está en .gitignore: nunca se sube al repositorio.
const DB_HOST = '127.0.0.1';
const DB_NAME = 'apitpvrestaurante';
const DB_USER = 'usuario';
const DB_PASS = 'contraseña';

// true = los errores 500 incluyen el detalle técnico (sólo en desarrollo)
const API_DEBUG = false;

// Rangos con permisos de gestión
const RANGOS_DIRECCION = ['admin', 'gerente'];
const RANGOS_CARTA     = ['admin', 'gerente', 'jefe de cocina'];
const RANGOS_SALA      = ['admin', 'gerente', 'jefe de sala'];
