/* Configuración compartida entre CONTROL y MONITOREO.
   La define index.html en window.IOT (misma URL de API, mismo vehículo y el mismo WebSocket).
   Aquí NO hay llaves ni credenciales: MONITOREO solo hace GET públicos y escucha el WSS. */
const IOT = window.IOT;
if (!IOT) throw new Error("MONITOREO necesita window.IOT (lo define el script principal de index.html)");

export const API_BASE = IOT.API_BASE;          // https://100-63-187-92.sslip.io en GitHub Pages
export const VEHICULO = Number(IOT.vehiculo);  // ?v=… o el guardado en el teléfono (1 por defecto)
export const NUBE = IOT.NUBE;                  // false cuando la página la sirve el ESP32 (sin API)
export const CANAL = IOT.canal;                // eventos del WebSocket compartido
export const estadoWS = IOT.estadoWS;          // readyState real del WebSocket compartido

export const LIMITE_HISTORIAL = 10;            // la tabla muestra como máximo 10 movimientos
export const TIMEOUT_MS = 8000;                // tiempo máximo de cada GET
export const RDS_CADA_MS = 60000;              // diagnóstico de RDS (frecuencia moderada, solo con la pestaña visible)

// Los TIMESTAMP de RDS llegan sin zona ("2026-11-12T23:42:12"): la sesión MySQL de RDS usa UTC (valor por defecto
// de Amazon RDS y del respaldo vehiculo_iot_rds.sql, SET TIME_ZONE='+00:00'). Los eventos WSS traen UTC con zona.
export const ZONA_BD = "UTC";
export const ZONA_MOSTRAR = "America/Mexico_City";
export const NOMBRE_ZONA = "hora del centro de México";

// Espera antes de releer el historial tras un evento WSS (el backend guarda el canal rápido en segundo plano)
export const ESPERA_SYNC_MS = { movimiento: 250, control: 700, reintento: 2000, fin_demo: 400 };
