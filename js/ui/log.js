import { $, el, hora } from './dom.js';

/** Bitácora visible de acciones y eventos (últimos 40). Todo el texto se inserta con textContent. */
export class ActivityLog {
  #lista = $('#logList');
  #max = 40;

  add(tipo, texto) {
    const fila = el('li', { class: `log-item log-${tipo}` }, el('time', {}, hora()), el('span', { class: 'log-tag' }, tipo), el('span', { class: 'log-text' }, texto));
    this.#lista.prepend(fila);
    while (this.#lista.children.length > this.#max) this.#lista.lastElementChild.remove();
  }
}
