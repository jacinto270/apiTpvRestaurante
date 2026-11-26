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

// --- Reservas desde la web ------------------------------------------------
const RESERVA_TURNOS = [['13:00', '15:30'], ['20:00', '23:00']];
const RESERVA_DIAS_MAX = 60;
const RESERVA_MAX_COMENSALES = 12;
// Porcentaje del aforo (suma de plazas de todas las mesas) que se puede reservar por turno.
// Baja de 100 si quieres guardar sitio para clientes sin reserva.
const RESERVA_PORCENTAJE_AFORO = 100;
const RESERVA_MAX_POR_HORA = 3;
const RESERVA_SEGUNDOS_MIN = 4;
// Pon aquí una cadena aleatoria larga y secreta (p. ej. php -r "echo bin2hex(random_bytes(24));")
const RESERVA_SAL = 'cambia-esto-por-una-cadena-aleatoria';

// --- Correo (SMTP) ----------------------------------------------------------
const SMTP_HOST = 'smtp.gmail.com';
const SMTP_PORT = 465;
const SMTP_USER = 'tu-cuenta@gmail.com';
const SMTP_PASS = '';                        // contraseña de aplicación; vacío = sin correos
const CORREO_REMITENTE = 'tu-cuenta@gmail.com';
const CORREO_NOMBRE = 'Olea · Reservas';
const CORREO_AVISOS = ['tu-cuenta@gmail.com'];
const URL_WEB = 'http://localhost/apiTpvRestaurante/';
const RESERVA_VERIFICAR_EMAIL = true;

// --- Lista negra y SMS -------------------------------------------------------
// Anular con menos de estas horas de antelación cuenta como «anulación tardía»
const RESERVA_HORAS_ANULACION_TARDIA = 3;
// Teléfono que se indica en los SMS para que el cliente llame (p. ej. '+34 900 000 000')
const TELEFONO_RESTAURANTE = '';
// Proveedor de SMS: '' (sin envío) o 'twilio'
const SMS_PROVEEDOR = '';
const TWILIO_SID = '';         // Account SID (empieza por AC…)
const TWILIO_TOKEN = '';       // Auth Token: secreto, no lo compartas
const SMS_REMITENTE = '';      // número de Twilio en formato +34… o un remitente alfanumérico

// --- Caja ---------------------------------------------------------------------
// Fondo de cambio que se deja siempre en el cajón para los cobros en efectivo
const FONDO_CAJA = 300.00;
