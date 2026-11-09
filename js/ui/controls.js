import { $, el, icono, hora, anunciar } from './dom.js';
import { etiqueta, icono as iconoComando } from '../domain/commands.js';

/**
 * Botones de movimiento generados desde el catálogo REAL (todo lo que no es del joystick).
 * Usan exactamente la misma lógica del coordinador que el joystick.
 *  - Modo «mantener»: al presionar envía el comando; al soltar solicita DETENER (igual que el joystick).
 *  - Modo «toque»: el comando queda activo hasta pulsar DETENER.
 */
export class ActionButtons {
  #grid = $('#actionsGrid');
  #botones = new Map();
  #controller;
  #hold = $('#holdMode');

  constructor(controller) {
    this.#controller = controller;
  }

  render(comandos) {
    this.#grid.replaceChildren();
    this.#botones.clear();
    if (!comandos.length) {
      this.#grid.append(el('p', { class: 'text-secondary small mb-0' }, 'El catálogo no tiene más movimientos.'));
      return;
    }
    for (const cmd of comandos) {
      const b = el('button', { type: 'button', class: 'action-btn', 'data-state': 'idle', 'aria-pressed': 'false' },
        icono(iconoComando(cmd.key)), el('span', {}, etiqueta(cmd.name)));
      this.#cablear(b, cmd);
      this.#botones.set(cmd.id, b);
      this.#grid.append(b);
    }
  }

  setBlocked(bloqueado) {
    for (const b of this.#botones.values()) b.disabled = bloqueado;
  }

  /** Refleja el estado de cada intento en su botón. */
  onAttempt(intento) {
    const b = this.#botones.get(intento.command.id);
    if (!b || intento.reassure) return;
    b.dataset.state = { requested: 'sending', accepted: 'ok', event: 'ok', error: 'error' }[intento.phase] ?? 'idle';
  }

  onActive(comando) {
    for (const [id, b] of this.#botones) {
      const activo = comando?.id === id;
      b.setAttribute('aria-pressed', String(activo));
      if (!activo && b.dataset.state !== 'error') b.dataset.state = 'idle';
    }
  }

  #cablear(boton, cmd) {
    let presionado = false;
    const bajar = () => {
      if (presionado) return;
      presionado = true;
      this.#controller.request(cmd);
    };
    const subir = () => {
      if (!presionado) return;
      presionado = false;
      if (this.#hold.checked) this.#controller.stop();
    };
    boton.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      boton.setPointerCapture(e.pointerId);
      bajar();
    });
    boton.addEventListener('pointerup', subir);
    boton.addEventListener('pointercancel', subir);
    boton.addEventListener('lostpointercapture', subir);
    boton.addEventListener('contextmenu', (e) => e.preventDefault());
    boton.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
        e.preventDefault();
        bajar();
      }
    });
    boton.addEventListener('keyup', (e) => (e.key === 'Enter' || e.key === ' ') && subir());
  }
}

/** Cadena de fases de la última acción: Solicitado → Aceptado por la API → Evento WebSocket recibido. */
export class PhaseFeedback {
  #raiz = $('#phases');
  #nombre = $('#lastCommand');
  #detalle = $('#lastDetail');

  onAttempt(intento) {
    if (intento.reassure) return;
    const orden = { requested: 1, accepted: 2, event: 3, error: 0 };
    const n = orden[intento.phase];
    this.#nombre.textContent = etiqueta(intento.command.name);
    for (const paso of this.#raiz.querySelectorAll('[data-step]')) {
      const i = Number(paso.dataset.step);
      paso.dataset.done = String(intento.phase !== 'error' && i <= n);
      paso.dataset.error = String(intento.phase === 'error' && i === 2);
    }
    const partes = [`Solicitado ${hora(intento.at)}`];
    if (intento.acceptedAt) partes.push(`aceptado por la API ${hora(intento.acceptedAt)}`);
    if (intento.eventAt) partes.push(`evento WebSocket ${hora(intento.eventAt)}`);
    if (intento.superseded) partes.push('respuesta tardía: ya se había enviado DETENER');
    if (intento.phase === 'error') partes.push(intento.error);
    this.#detalle.textContent = partes.join(' · ');
    if (intento.phase === 'error') anunciar(`Error: ${intento.error}`);
  }
}

/** Selector de DEMO, iniciar/cancelar y progreso. */
export class DemoView {
  #select = $('#demoSelect');
  #start = $('#btnDemoStart');
  #cancel = $('#btnDemoCancel');
  #estado = $('#demoStatus');
  #barra = $('#demoProgress');
  #manager;

  constructor(manager) {
    this.#manager = manager;
    this.#select.addEventListener('change', () => manager.select(Number(this.#select.value)));
    this.#start.addEventListener('click', () => manager.start());
    this.#cancel.addEventListener('click', () => manager.cancel());
    manager.on('list', ({ demos }) => this.#pintarLista(demos));
    manager.on('status', (s) => this.#pintarEstado(s));
    this.#pintarEstado({ status: 'idle', progress: null });
  }

  #pintarLista(demos) {
    this.#select.replaceChildren(...(demos.length
      ? demos.map((d) => el('option', { value: d.id }, d.name))
      : [el('option', { value: '' }, 'Sin DEMO disponibles')]));
    if (this.#manager.selectedId !== null) this.#select.value = String(this.#manager.selectedId);
    this.#select.disabled = demos.length === 0 || this.#manager.busy;
    this.#start.disabled = demos.length === 0 || this.#manager.busy;
  }

  #pintarEstado({ status, progress, result }) {
    const ocupado = status !== 'idle';
    const textos = {
      idle: result ? `DEMO: ${result}` : 'Sin DEMO en ejecución',
      starting: 'Iniciando DEMO (solicitud enviada a la API)…',
      running: progress?.total ? `En ejecución · movimiento ${progress.orden}/${progress.total} · ${etiqueta(progress.comando || '…')}` : 'En ejecución…',
      cancelling: 'Cancelando…',
    };
    this.#estado.textContent = textos[status];
    this.#estado.dataset.state = status;
    this.#select.disabled = ocupado || this.#manager.demos.length === 0;
    this.#start.disabled = ocupado || this.#manager.demos.length === 0;
    this.#cancel.disabled = !ocupado || status === 'cancelling';
    const pct = progress?.total ? Math.round((progress.orden / progress.total) * 100) : 0;
    this.#barra.style.width = `${status === 'idle' ? 0 : pct}%`;
    this.#barra.parentElement.setAttribute('aria-valuenow', String(status === 'idle' ? 0 : pct));
    anunciar(textos[status]);
  }
}
