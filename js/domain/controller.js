import { Emitter } from '../core/emitter.js';
import { ApiError, friendly, esErrorDeLlave } from '../core/errors.js';
import { norm } from './commands.js';

/**
 * Coordinador ÚNICO de comandos: joystick, botones y teclado pasan todos por aquí (sin duplicar reglas).
 *
 * Reglas:
 *  - Solo se envía cuando cambia el comando efectivo (no por cada píxel del joystick).
 *  - Una sola solicitud normal en vuelo; el último deseado se envía al terminar («gana el más reciente»).
 *  - DETENER es prioritaria: no espera a la cola, descarta lo pendiente y se reasegura si había otra en vuelo.
 *  - Mientras hay una DEMO en ejecución solo DETENER/cancelar están permitidos.
 *  - Una respuesta tardía de un comando anterior a un DETENER NO vuelve a activar visualmente el movimiento.
 *
 * Fases de cada intento (sin asumir ejecución física):
 *   requested → accepted (HTTP 2xx de la API) → event (llegó el evento WebSocket correspondiente) | error
 *
 * Eventos: 'attempt' {…}, 'active' {command|null}, 'rejected' {reason}, 'error' {message}, 'auth-required'.
 */
export class CommandController extends Emitter {
  #api;
  #cfg;
  #getCatalog;
  #seq = 0;
  #stopSeq = 0;
  #inFlight = null;
  #desired = null;
  #lastSent = null;
  #active = null;
  #lastSendAt = 0;
  #recheckStop = false;
  #stopSent = false;
  #timerPump = null;
  #demoRunning = false;
  #intentos = new Map();

  constructor({ api, config, getCatalog }) {
    super();
    this.#api = api;
    this.#cfg = config;
    this.#getCatalog = getCatalog;
  }

  get active() {
    return this.#active;
  }

  setDemoRunning(running) {
    this.#demoRunning = running;
    if (running) {
      this.#desired = null;
      this.#setActive(null);
    }
  }

  /** Pide un comando normal (movimiento). Regresa true si se aceptó para envío. */
  request(command) {
    if (!command) return false;
    if (this.#demoRunning) {
      this.emit('rejected', { reason: 'Hay una DEMO en ejecución: usa DETENER o cancela la DEMO.' });
      return false;
    }
    if (this.#desired?.id === command.id) return false; // sin duplicados
    this.#desired = command;
    this.#pump();
    return true;
  }

  /** DETENER con prioridad absoluta. */
  stop() {
    const detener = this.#getCatalog()?.joystick.stop;
    if (!detener) {
      this.emit('error', { message: 'El catálogo de comandos no tiene DETENER.' });
      return false;
    }
    clearTimeout(this.#timerPump);
    this.#desired = detener; // lo pendiente deja de ser relevante
    if (this.#stopSent) return false; // ya se envió DETENER después del último movimiento: no se duplica
    if (this.#inFlight) this.#recheckStop = true; // si la solicitud en vuelo llega después, se vuelve a detener
    this.#send(detener, { priority: true });
    return true;
  }

  /**
   * Correlaciona eventos 'movimiento' del WebSocket con el intento más antiguo del mismo comando que aún no tiene evento.
   * El backend emite el evento ANTES de responder el POST, así que puede llegar mientras el intento sigue «requested».
   */
  onWsEvent(msg) {
    if (msg.tipo !== 'movimiento' || msg.origen !== this.#cfg.origin) return;
    const clave = norm(msg.comando ?? '');
    const intento = [...this.#intentos.values()].find(
      (a) => !a.eventAt && (a.phase === 'requested' || a.phase === 'accepted') && a.command.key === clave,
    );
    if (!intento) return;
    intento.eventAt = Date.now();
    intento.wsTimestamp = typeof msg.timestamp === 'string' ? msg.timestamp : null;
    if (intento.phase === 'accepted') intento.phase = 'event'; // si aún no responde el POST, pasa a «event» al aceptarse
    this.emit('attempt', { ...intento });
  }

  #pump() {
    if (this.#inFlight || !this.#desired) return;
    const detener = this.#getCatalog()?.joystick.stop;
    if (this.#recheckStop && detener) {
      this.#recheckStop = false;
      this.#send(detener, { priority: true, reassure: true });
      return;
    }
    if (this.#desired.id === this.#lastSent?.id) return; // ya se envió ese comando
    const espera = this.#lastSendAt + this.#cfg.timing.minSendIntervalMs - Date.now();
    if (espera > 0) {
      clearTimeout(this.#timerPump);
      this.#timerPump = setTimeout(() => this.#pump(), espera);
      return;
    }
    this.#lastSendAt = Date.now();
    this.#send(this.#desired);
  }

  async #send(command, { priority = false, reassure = false } = {}) {
    const id = ++this.#seq;
    const intento = { id, command, phase: 'requested', priority, reassure, at: Date.now() };
    this.#intentos.set(id, intento);
    if (this.#intentos.size > 20) this.#intentos.delete(this.#intentos.keys().next().value);
    if (priority) this.#stopSeq = id;
    this.#stopSent = priority; // un movimiento normal vuelve a habilitar el siguiente DETENER
    this.#lastSent = command;
    if (!priority) this.#inFlight = id;
    this.emit('attempt', { ...intento });

    try {
      const res = await this.#api.post(
        this.#cfg.paths.movimientos,
        { id_vehiculo: this.#cfg.vehicleId, id_comando: command.id, origen: this.#cfg.origin },
        { auth: true },
      );
      intento.phase = intento.eventAt ? 'event' : 'accepted'; // el evento WS pudo llegar antes que la respuesta HTTP
      intento.acceptedAt = Date.now();
      intento.apiTimestamp = typeof res?.timestamp === 'string' ? res.timestamp : null;
      intento.superseded = id < this.#stopSeq; // llegó tarde: ya hubo un DETENER después
      if (!intento.superseded) this.#setActive(command.id === this.#getCatalog()?.joystick.stop?.id ? null : command);
      else if (priority === false) this.#setActive(null);
    } catch (err) {
      intento.phase = 'error';
      intento.error = friendly(err instanceof ApiError ? err : new ApiError('network', ''));
      this.#desired = null; // para que el usuario pueda reintentar el mismo comando
      this.#lastSent = null;
      if (priority) this.#stopSent = false; // un DETENER fallido debe poder reintentarse
      if (esErrorDeLlave(err)) this.emit('auth-required');
      this.emit('error', { message: intento.error });
    } finally {
      if (this.#inFlight === id) this.#inFlight = null;
    }
    this.emit('attempt', { ...intento });
    this.#pump();
  }

  #setActive(command) {
    if (this.#active?.id === command?.id) return;
    this.#active = command;
    this.emit('active', { command });
  }
}
