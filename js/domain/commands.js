/**
 * Catálogo de comandos REAL del vehículo (GET /vehiculos/{id}/comandos).
 * No se inventan nombres: el joystick solo se enlaza con comandos que EXISTAN en el catálogo.
 * Si el catálogo usa otro nombre (p. ej. GIRO_IZQ), se resuelve con alias; si no hay coincidencia la dirección queda sin comando.
 */

export const norm = (s) =>
  String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');

const ALIAS_DIRECCION = {
  up: ['AVANZAR', 'ADELANTE'],
  down: ['RETROCEDER', 'ATRAS', 'REVERSA'],
  left: ['IZQUIERDA', 'GIRO_IZQ', 'GIRO_IZQUIERDA', 'GIRAR_IZQUIERDA'],
  right: ['DERECHA', 'GIRO_DER', 'GIRO_DERECHA', 'GIRAR_DERECHA'],
  stop: ['DETENER', 'PARAR', 'ALTO'],
};

export const DIRECCIONES = ['up', 'down', 'left', 'right'];

/** Valida la forma de la respuesta de la API (los datos remotos no son confiables). */
export function parseComandos(data) {
  if (!Array.isArray(data)) throw new Error('El catálogo de comandos no es una lista.');
  return data
    .filter((c) => c && Number.isInteger(c.id_comando) && typeof c.nombre === 'string' && c.activo !== false)
    .map((c) => ({ id: c.id_comando, name: c.nombre, key: norm(c.nombre), code: c.codigo, description: c.descripcion ?? '' }));
}

export function buildCatalog(lista) {
  const byKey = new Map(lista.map((c) => [c.key, c]));
  const joystick = {};
  for (const [dir, alias] of Object.entries(ALIAS_DIRECCION)) {
    const clave = alias.find((a) => byKey.has(a));
    joystick[dir] = clave ? byKey.get(clave) : null;
  }
  const usados = new Set(Object.values(joystick).filter(Boolean).map((c) => c.id));
  return {
    all: lista,
    byKey,
    joystick,
    others: lista.filter((c) => !usados.has(c.id)), // el resto se presenta como botones
  };
}

export const etiqueta = (nombre) =>
  String(nombre).replace(/_/g, ' ').toLowerCase().replace(/^\w/, (m) => m.toUpperCase());

/** Icono de Bootstrap Icons por palabra clave (solo decorativo). */
export function icono(key) {
  if (key.includes('ARRIBA')) return 'bi-arrow-up-square';
  if (key.includes('ABAJO')) return 'bi-arrow-down-square';
  if (key.includes('CABINA')) return key.includes('IZQ') ? 'bi-arrow-counterclockwise' : 'bi-arrow-clockwise';
  if (key.includes('GIRO') || key.includes('GIRAR')) return key.includes('IZQ') ? 'bi-arrow-90deg-left' : 'bi-arrow-90deg-right';
  if (key.includes('ENCENDER') || key.includes('APAGAR')) return 'bi-power';
  if (key.startsWith('AUX')) return 'bi-plus-square-dotted';
  return 'bi-gear';
}
