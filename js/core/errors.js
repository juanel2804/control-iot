/** Errores de la capa HTTP y su traducción a mensajes seguros para el usuario (sin trazas ni datos internos). */
export class ApiError extends Error {
  /** @param {'network'|'timeout'|'aborted'|'invalid'|'auth'|'http'} kind */
  constructor(kind, message, { status = 0, detail = '' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.detail = detail;
  }
}

/** El "detail" de la API es texto no confiable: se recorta y solo se muestra con textContent. */
export function friendly(err) {
  if (!(err instanceof ApiError)) return 'Ocurrió un error inesperado.';
  switch (err.kind) {
    case 'network': return 'No se pudo contactar con la API. Revisa tu conexión.';
    case 'timeout': return 'La API tardó demasiado en responder.';
    case 'aborted': return 'La solicitud fue cancelada.';
    case 'invalid': return 'La API devolvió una respuesta no válida.';
    case 'auth': return 'Falta la llave de acceso (X-API-Key).';
    default: break;
  }
  switch (err.status) {
    case 401: return 'Falta la llave de acceso (X-API-Key).';
    case 403: return 'La llave de acceso no es válida.';
    case 404: return 'El recurso solicitado no existe en la API.';
    case 409: return err.detail ? `Conflicto: ${err.detail}` : 'La API rechazó la acción por un conflicto.';
    case 422: return 'La API rechazó los datos enviados.';
    case 503: return 'La API reporta que un servicio no está disponible.';
    default: return `La API respondió con un error (HTTP ${err.status}).`;
  }
}

export const esErrorDeLlave = (err) => err instanceof ApiError && (err.kind === 'auth' || err.status === 401 || err.status === 403);
