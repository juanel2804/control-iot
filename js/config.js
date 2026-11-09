/**
 * Configuración de la aplicación de CONTROL.
 * Aquí NO hay llaves, contraseñas ni datos de RDS: la X-API-Key la escribe el usuario en la interfaz.
 * Todas las rutas salen del Swagger de la API ya desplegada (práctica 2.5/2.6); no se inventa ninguna.
 */

const PRODUCCION = 'https://100-63-187-92.sslip.io';

/** Solo en localhost se permite apuntar a otra API con ?api=http://127.0.0.1:8765 (pruebas con la API simulada). */
function resolverBase() {
  const esLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const pedida = new URLSearchParams(location.search).get('api');
  if (esLocal && pedida) {
    try {
      const u = new URL(pedida);
      if (['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) return u.origin;
    } catch { /* se ignora y se usa producción */ }
  }
  return PRODUCCION;
}

const base = resolverBase();

export const CONFIG = Object.freeze({
  vehicleId: 1,
  apiBase: base,
  wsBase: base.replace(/^http/, 'ws'), // https → wss (nunca ws en producción)
  origin: 'WEB-CONTROL', // campo "origen" de POST /movimientos (solo letras, números, - _ . y espacio)

  paths: Object.freeze({
    health: '/salud', // GET → {"estado":"ok"}
    dbHealth: null, // El backend NO expone diagnóstico de RDS → el indicador queda en «Sin verificar»
    vehiculo: (id) => `/vehiculos/${id}`,
    comandos: (id) => `/vehiculos/${id}/comandos`,
    demos: (id) => `/vehiculos/${id}/demos`,
    movimientos: '/movimientos', // POST (X-API-Key)
    demoIniciar: (id, demo) => `/vehiculos/${id}/demos/${demo}/iniciar`, // POST (X-API-Key) → 202
    demoCancelar: (id) => `/vehiculos/${id}/demos/cancelar`, // POST (X-API-Key) → 202
    ws: (id) => `/ws/vehiculos/${id}`,
  }),

  timing: Object.freeze({
    httpTimeoutMs: 8000,
    healthIntervalMs: 15000,
    healthTimeoutMs: 5000,
    minSendIntervalMs: 100, // separación mínima entre dos comandos normales (DETENER no espera)
    wsPingMs: 20000,
    wsPongTimeoutMs: 10000,
    wsConnectTimeoutMs: 10000,
    wsRetryMaxMs: 15000,
  }),

  credits: 'Desarrollado por Juan Elpidio López García · 2026',
});
