import { Emitter } from '../core/emitter.js';
import { friendly } from '../core/errors.js';

/**
 * DEMO existentes: se CONSULTAN, se INICIAN y se CANCELAN. Aquí no se crean ni se editan (eso es de Administración).
 * La secuencia (N movimientos, duración y pausa) la ejecuta el backend; el navegador solo la observa por WebSocket.
 * Estados: idle | starting | running | cancelling
 *
 * Eventos: 'list', 'status' {status, progress, result?}, 'error' {message}, 'auth-required'
 */
export class DemoManager extends Emitter {
  demos = [];
  selectedId = null;
  status = 'idle';
  progress = null;

  #api;
  #cfg;
  #wsOnline;
  #controller;
  #poll = null;

  constructor({ api, config, controller, wsOnline }) {
    super();
    this.#api = api;
    this.#cfg = config;
    this.#controller = controller;
    this.#wsOnline = wsOnline;
  }

  get busy() {
    return this.status !== 'idle';
  }

  async load() {
    const data = await this.#api.get(this.#cfg.paths.demos(this.#cfg.vehicleId));
    if (!Array.isArray(data)) throw new Error('La lista de DEMO no es válida.');
    this.demos = data
      .filter((d) => d && Number.isInteger(d.id_demo) && typeof d.nombre === 'string' && d.activo !== false)
      .map((d) => ({ id: d.id_demo, name: d.nombre, description: d.descripcion ?? '' }));
    if (!this.demos.some((d) => d.id === this.selectedId)) this.selectedId = this.demos[0]?.id ?? null;
    this.emit('list', { demos: this.demos });
  }

  select(id) {
    this.selectedId = this.demos.some((d) => d.id === id) ? id : null;
    this.emit('list', { demos: this.demos });
  }

  async start() {
    if (this.busy) {
      this.emit('error', { message: 'Ya hay una DEMO en curso: no se puede iniciar otra.' });
      return;
    }
    if (this.selectedId === null) {
      this.emit('error', { message: 'Elige una DEMO primero.' });
      return;
    }
    this.#setStatus('starting');
    this.#controller.setDemoRunning(true); // bloquea movimientos individuales mientras corre
    try {
      await this.#api.post(this.#cfg.paths.demoIniciar(this.#cfg.vehicleId, this.selectedId), undefined, { auth: true });
      this.#vigilarSinWs(); // 202: el avance real llega por WebSocket
    } catch (err) {
      this.#setStatus('idle');
      this.#controller.setDemoRunning(false);
      this.emit('error', { message: friendly(err) });
      if (err.status === 401 || err.status === 403 || err.kind === 'auth') this.emit('auth-required');
    }
  }

  async cancel() {
    if (!this.busy || this.status === 'cancelling') return;
    const previo = this.status;
    this.#setStatus('cancelling');
    try {
      await this.#api.post(this.#cfg.paths.demoCancelar(this.#cfg.vehicleId), undefined, { auth: true });
      this.#vigilarSinWs();
    } catch (err) {
      this.#setStatus(previo);
      this.emit('error', { message: friendly(err) });
      if (err.status === 401 || err.status === 403 || err.kind === 'auth') this.emit('auth-required');
    }
  }

  onWsEvent(msg) {
    switch (msg.tipo) {
      case 'estado_inicial':
        if (msg.demo_en_ejecucion) {
          this.#controller.setDemoRunning(true);
          this.#setStatus('running');
        }
        break;
      case 'demo_inicio':
        this.#controller.setDemoRunning(true);
        this.progress = { orden: 0, total: msg.total_movimientos ?? 0, comando: '' };
        this.#setStatus('running');
        break;
      case 'demo_movimiento':
        this.progress = { orden: msg.orden, total: msg.total_movimientos, comando: String(msg.comando ?? '') };
        this.#setStatus(this.status === 'cancelling' ? 'cancelling' : 'running');
        break;
      case 'demo_fin': this.#terminar('Finalizada'); break;
      case 'demo_cancelada': this.#terminar('Cancelada'); break;
      case 'demo_error': this.#terminar('Terminó con error'); break;
      default: break;
    }
  }

  #terminar(resultado) {
    clearInterval(this.#poll);
    this.#controller.setDemoRunning(false);
    this.#setStatus('idle', resultado);
  }

  #setStatus(status, result) {
    if (status === 'idle') this.progress = result ? this.progress : null;
    this.status = status;
    this.emit('status', { status, progress: this.progress, result });
  }

  /**
   * Sin WebSocket no llegan los eventos de fin: se consulta GET /vehiculos/{id} (campo documentado
   * demo_en_ejecucion) cada 2 s mientras la DEMO esté en curso, para no dejar la interfaz bloqueada.
   */
  #vigilarSinWs() {
    clearInterval(this.#poll);
    this.#poll = setInterval(async () => {
      if (!this.busy) return clearInterval(this.#poll);
      if (this.#wsOnline()) return;
      try {
        const d = await this.#api.get(this.#cfg.paths.vehiculo(this.#cfg.vehicleId), { timeoutMs: 4000 });
        if (!d?.demo_en_ejecucion) this.#terminar('Finalizada (verificado por HTTP)');
      } catch { /* se reintenta en el siguiente ciclo */ }
    }, 2000);
  }
}
