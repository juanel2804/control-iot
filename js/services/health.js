import { Emitter } from '../core/emitter.js';

/**
 * Verificaciones reales y SEPARADAS de la API de AWS y de Amazon RDS.
 *  - API:  GET /salud (documentado en Swagger). «up» = respondió 200 con {"estado":"ok"}. No prueba las 21 operaciones.
 *  - RDS:  solo si el backend expone un diagnóstico seguro (config.paths.dbHealth). Hoy NO existe → «unverified».
 *
 * Estados API: checking | up | down        Estados RDS: unverified | checking | up | down
 * Evento: 'change' {api, db}
 */
export class HealthMonitor extends Emitter {
  api = 'checking';
  db = 'unverified';

  #client;
  #cfg;
  #timer = null;
  #enCurso = false;

  constructor({ client, config }) {
    super();
    this.#client = client;
    this.#cfg = config;
    if (config.paths.dbHealth) this.db = 'checking';
  }

  start() {
    this.checkNow();
    this.#timer = setInterval(() => !document.hidden && this.checkNow(), this.#cfg.timing.healthIntervalMs);
    document.addEventListener('visibilitychange', () => !document.hidden && this.checkNow());
  }

  async checkNow() {
    if (this.#enCurso) return;
    this.#enCurso = true;
    try {
      const t = this.#cfg.timing.healthTimeoutMs;
      const [api, db] = await Promise.all([this.#probarApi(t), this.#probarDb(t)]);
      this.#fijar(api, db);
    } finally {
      this.#enCurso = false;
    }
  }

  async #probarApi(timeoutMs) {
    try {
      const r = await this.#client.get(this.#cfg.paths.health, { timeoutMs });
      return r?.estado === 'ok' ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }

  async #probarDb(timeoutMs) {
    const ruta = this.#cfg.paths.dbHealth;
    if (!ruta) return 'unverified'; // sin diagnóstico seguro en el backend no se afirma nada
    try {
      await this.#client.get(ruta, { timeoutMs });
      return 'up';
    } catch (err) {
      return err.status === 503 ? 'down' : 'unverified';
    }
  }

  #fijar(api, db) {
    if (api === this.api && db === this.db) return;
    this.api = api;
    this.db = db;
    this.emit('change', { api, db });
  }
}
