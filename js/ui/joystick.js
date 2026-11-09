import { Emitter } from '../core/emitter.js';
import { $ } from './dom.js';

/**
 * Joystick circular con Pointer Events (mouse + táctil + lápiz) y teclado (flechas, Espacio = DETENER).
 *  - Zona neutral visible (punto central) y retorno al centro al soltar / cancelar / perder el puntero.
 *  - Emite 'direction' SOLO cuando cambia la dirección efectiva: no genera tráfico por cada píxel.
 *  - 4 direcciones por eje dominante, con histéresis para que no «parpadee» en las diagonales.
 *
 * Eventos: 'direction' {direction: 'up'|'down'|'left'|'right'|null}, 'release' {}
 */
const ZONA_NEUTRA = 0.32; // fracción del recorrido máximo
const HISTERESIS = 1.25; // para cambiar de eje, el nuevo debe dominar un 25 %

export class Joystick extends Emitter {
  #root = $('#joystick');
  #knob = $('#joystickKnob');
  #direction = null;
  #pointerId = null;
  #teclas = [];
  #disponibles = { up: true, down: true, left: true, right: true };

  constructor() {
    super();
    const r = this.#root;
    r.addEventListener('pointerdown', (e) => this.#abajo(e));
    r.addEventListener('pointermove', (e) => e.pointerId === this.#pointerId && this.#mover(e));
    r.addEventListener('pointerup', (e) => e.pointerId === this.#pointerId && this.#soltar());
    r.addEventListener('pointercancel', (e) => e.pointerId === this.#pointerId && this.#soltar());
    r.addEventListener('lostpointercapture', (e) => e.pointerId === this.#pointerId && this.#soltar());
    r.addEventListener('contextmenu', (e) => e.preventDefault());
    r.addEventListener('keydown', (e) => this.#tecla(e, true));
    r.addEventListener('keyup', (e) => this.#tecla(e, false));
    r.addEventListener('blur', () => this.#teclas.length && this.#soltar());
    // si la ventana pierde el foco con el joystick en uso, se suelta (seguridad); en reposo no se envía nada
    window.addEventListener('blur', () => (this.#pointerId !== null || this.#teclas.length) && this.#soltar());
  }

  /** Direcciones que sí tienen comando real en el catálogo. */
  setAvailable(disponibles) {
    this.#disponibles = { ...this.#disponibles, ...disponibles };
    for (const [dir, ok] of Object.entries(this.#disponibles)) {
      const marca = $(`[data-dir="${dir}"]`, this.#root);
      if (marca) marca.dataset.disabled = ok ? 'false' : 'true';
    }
  }

  get direction() {
    return this.#direction;
  }

  #abajo(e) {
    if (e.button !== undefined && e.button > 0) return;
    e.preventDefault();
    this.#pointerId = e.pointerId;
    this.#root.setPointerCapture(e.pointerId);
    this.#root.dataset.active = 'true';
    this.#root.focus({ preventScroll: true });
    this.#mover(e);
  }

  #mover(e) {
    const caja = this.#root.getBoundingClientRect();
    const cx = caja.left + caja.width / 2;
    const cy = caja.top + caja.height / 2;
    const maximo = (caja.width / 2) * 0.62;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maximo) {
      dx = (dx / dist) * maximo;
      dy = (dy / dist) * maximo;
    }
    this.#pintar(dx, dy);

    let dir = null;
    if (dist / maximo >= ZONA_NEUTRA) {
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      const horizontal = ax >= ay;
      const actual = this.#direction;
      if (actual && ax / (ay || 1) < HISTERESIS && ay / (ax || 1) < HISTERESIS) {
        dir = actual; // zona diagonal: se conserva la dirección que ya había
      } else {
        dir = horizontal ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
      }
    }
    this.#fijar(dir && this.#disponibles[dir] ? dir : null);
  }

  #soltar() {
    if (this.#pointerId !== null) {
      try {
        this.#root.releasePointerCapture(this.#pointerId);
      } catch { /* ya liberado */ }
      this.#pointerId = null;
    }
    this.#teclas = [];
    this.#root.dataset.active = 'false';
    this.#pintar(0, 0);
    this.#fijar(null);
    this.emit('release', {}); // soltar SIEMPRE solicita DETENER (el coordinador evita duplicados)
  }

  #tecla(e, abajo) {
    const mapa = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    if (e.key === ' ' || e.key === 'Escape') {
      if (abajo) {
        e.preventDefault();
        this.#soltar();
      }
      return;
    }
    const dir = mapa[e.key];
    if (!dir) return;
    e.preventDefault();
    if (abajo) {
      if (e.repeat) return;
      this.#teclas = [...this.#teclas.filter((d) => d !== dir), dir];
    } else {
      this.#teclas = this.#teclas.filter((d) => d !== dir);
    }
    const actual = this.#teclas.at(-1) ?? null;
    const p = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[actual] ?? [0, 0];
    const maximo = (this.#root.getBoundingClientRect().width / 2) * 0.62;
    this.#pintar(p[0] * maximo, p[1] * maximo);
    this.#root.dataset.active = actual ? 'true' : 'false';
    if (actual) this.#fijar(this.#disponibles[actual] ? actual : null);
    else this.#soltar();
  }

  #pintar(dx, dy) {
    this.#knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  #fijar(dir) {
    if (dir === this.#direction) return;
    this.#direction = dir;
    this.#root.dataset.direction = dir ?? 'neutral';
    this.emit('direction', { direction: dir });
  }
}
