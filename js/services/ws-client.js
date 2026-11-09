import { Emitter } from '../core/emitter.js';

/**
 * Sesión WSS REAL del navegador con el servidor de AWS.
 * Estados: connecting | online | reconnecting | offline.
 * OJO: «online» significa que ESTE navegador está conectado al servidor WSS; NO prueba que el vehículo físico lo esté.
 *
 * Eventos: 'state' {state, code?}, 'retry' {inMs, attempt}, 'message' {…JSON del servidor…}.
 */
export class WsClient extends Emitter {
  state = 'connecting';

  #url;
  #t;
  #ws = null;
  #retry = 0;
  #intentos = 0;
  #cerradoPorUsuario = false;
  #temporizadores = { conexion: null, reintento: null, ping: null, pong: null };

  constructor({ url, timing }) {
    super();
    this.#url = url;
    this.#t = timing;
    window.addEventListener('online', () => this.reconnectNow());
    window.addEventListener('offline', () => {
      // se cierra el socket de verdad: onclose marca «Desconectado» y programa el reintento (sin dejar sockets huérfanos)
      if (this.#ws) this.#ws.close();
      else this.#setState('offline');
    });
  }

  start() {
    this.#cerradoPorUsuario = false;
    this.#abrir();
  }

  stop() {
    this.#cerradoPorUsuario = true;
    this.#limpiar();
    this.#ws?.close(1000, 'cliente');
    this.#ws = null;
    this.#setState('offline');
  }

  /** Para pruebas y para el botón «reintentar»: cierra lo que haya y abre de inmediato. */
  reconnectNow() {
    if (this.state === 'online' || this.state === 'connecting' || this.state === 'reconnecting') return;
    clearTimeout(this.#temporizadores.reintento);
    this.#abrir();
  }

  get isOnline() {
    return this.state === 'online';
  }

  /** Envía JSON solo si la sesión está abierta; regresa true/false. */
  send(obj) {
    if (this.#ws?.readyState !== WebSocket.OPEN) return false;
    this.#ws.send(JSON.stringify(obj));
    return true;
  }

  #setState(state, extra = {}) {
    if (this.state === state && !extra.force) return;
    this.state = state;
    this.emit('state', { state, ...extra });
  }

  #abrir() {
    this.#intentos += 1;
    this.#setState(this.#intentos === 1 ? 'connecting' : 'reconnecting');

    let ws;
    try {
      ws = new WebSocket(this.#url);
    } catch {
      this.#programarReintento();
      return;
    }
    this.#ws = ws;

    // si se queda atascado en CONNECTING, se cierra para disparar el reintento
    this.#temporizadores.conexion = setTimeout(() => ws.close(), this.#t.wsConnectTimeoutMs);

    ws.onopen = () => {
      if (this.#ws !== ws) return;
      clearTimeout(this.#temporizadores.conexion);
      this.#retry = 0;
      this.#setState('online');
      this.#iniciarLatido(ws);
    };

    ws.onmessage = (ev) => {
      if (this.#ws !== ws || typeof ev.data !== 'string') return;
      clearTimeout(this.#temporizadores.pong); // cualquier mensaje prueba que el canal sigue vivo
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return; // el servidor solo manda JSON; lo demás se ignora
      }
      if (msg && typeof msg === 'object') this.emit('message', msg);
    };

    ws.onerror = () => { /* el detalle llega en onclose; los navegadores no exponen la causa */ };

    ws.onclose = (ev) => {
      if (this.#ws !== ws) return;
      this.#limpiar();
      this.#ws = null;
      this.#setState('offline', { code: ev.code });
      // 4404 = el vehículo no existe: reintentar no sirve
      if (!this.#cerradoPorUsuario && ev.code !== 4404) this.#programarReintento();
    };
  }

  #iniciarLatido(ws) {
    clearInterval(this.#temporizadores.ping);
    this.#temporizadores.ping = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ tipo: 'ping', p: Date.now() }));
      clearTimeout(this.#temporizadores.pong);
      this.#temporizadores.pong = setTimeout(() => ws.close(), this.#t.wsPongTimeoutMs); // sin respuesta → se da por caído
    }, this.#t.wsPingMs);
  }

  #programarReintento() {
    const espera = Math.min(this.#t.wsRetryMaxMs, 1000 * 2 ** this.#retry) * (0.8 + Math.random() * 0.4);
    this.#retry += 1;
    this.emit('retry', { inMs: Math.round(espera), attempt: this.#retry });
    clearTimeout(this.#temporizadores.reintento);
    this.#temporizadores.reintento = setTimeout(() => this.#abrir(), espera);
  }

  #limpiar() {
    clearTimeout(this.#temporizadores.conexion);
    clearInterval(this.#temporizadores.ping);
    clearTimeout(this.#temporizadores.pong);
  }
}
