import { ApiError } from '../core/errors.js';

/**
 * Cliente REST centralizado: URL base, encabezados, timeout, parseo JSON y errores en un solo lugar.
 * Usa Fetch + async/await. La llave se pide por función para no guardarla en el módulo.
 */
export class ApiClient {
  #base;
  #getKey;
  #timeoutMs;

  constructor({ baseUrl, getKey, timeoutMs = 8000 }) {
    this.#base = baseUrl.replace(/\/$/, '');
    this.#getKey = getKey;
    this.#timeoutMs = timeoutMs;
  }

  get(path, opts) {
    return this.request(path, { ...opts, method: 'GET' });
  }

  post(path, body, opts) {
    return this.request(path, { ...opts, method: 'POST', body });
  }

  /**
   * @param {string} path
   * @param {{method?:string, body?:any, auth?:boolean, timeoutMs?:number, signal?:AbortSignal}} [opts]
   */
  async request(path, { method = 'GET', body, auth = false, timeoutMs, signal } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) {
      const llave = this.#getKey();
      if (!llave) throw new ApiError('auth', 'Falta la llave de acceso.', { status: 401 });
      headers['X-API-Key'] = llave;
    }

    const ctrl = new AbortController();
    const temporizador = setTimeout(() => ctrl.abort(new DOMException('timeout', 'TimeoutError')), timeoutMs ?? this.#timeoutMs);
    const alAbortar = () => ctrl.abort(signal.reason);
    signal?.addEventListener('abort', alAbortar, { once: true });

    let res;
    try {
      res = await fetch(this.#base + path, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
        cache: 'no-store',
        credentials: 'omit',
      });
    } catch (err) {
      if (ctrl.signal.aborted && ctrl.signal.reason?.name === 'TimeoutError') throw new ApiError('timeout', 'Tiempo de espera agotado.');
      if (signal?.aborted) throw new ApiError('aborted', 'Solicitud cancelada.');
      throw new ApiError('network', 'Error de red.');
    } finally {
      clearTimeout(temporizador);
      signal?.removeEventListener('abort', alAbortar);
    }

    let datos = null;
    const texto = await res.text();
    if (texto) {
      try {
        datos = JSON.parse(texto);
      } catch {
        if (res.ok) throw new ApiError('invalid', 'Respuesta no JSON.', { status: res.status });
      }
    }
    if (!res.ok) {
      const detalle = typeof datos?.detail === 'string' ? datos.detail.slice(0, 160) : '';
      throw new ApiError('http', `HTTP ${res.status}`, { status: res.status, detail: detalle });
    }
    return datos;
  }
}
