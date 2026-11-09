import { $ } from './dom.js';

/**
 * Llave X-API-Key. Es un secreto: NUNCA va en el código ni en el repositorio.
 * Entra por (a) el cuadro de diálogo o (b) un enlace privado con #k=…, que se borra de la barra de direcciones.
 * Se guarda solo en sessionStorage (se pierde al cerrar la pestaña) o, si el usuario lo pide, en localStorage.
 */
const CLAVE = 'ctl-iot.key';

export class KeyStore {
  #valor = '';

  constructor() {
    const m = /(?:^#|&)k=([^&]+)/.exec(location.hash);
    if (m) {
      this.#valor = decodeURIComponent(m[1]);
      sessionStorage.setItem(CLAVE, this.#valor);
      history.replaceState(null, '', location.pathname + location.search); // la llave no se queda en la URL
    } else {
      this.#valor = sessionStorage.getItem(CLAVE) || localStorage.getItem(CLAVE) || '';
    }
  }

  get = () => this.#valor;
  get hasKey() {
    return this.#valor !== '';
  }

  set(valor, recordar) {
    this.#valor = valor.trim();
    sessionStorage.removeItem(CLAVE);
    localStorage.removeItem(CLAVE);
    if (this.#valor) (recordar ? localStorage : sessionStorage).setItem(CLAVE, this.#valor);
  }

  clear() {
    this.set('', false);
  }
}

/** Diálogo nativo <dialog>: accesible, con foco atrapado y cierre con Escape. */
export function initKeyDialog(store, onChange) {
  const dialog = $('#keyDialog');
  const form = $('#keyForm');
  const input = $('#keyInput');
  const recordar = $('#keyRemember');
  const boton = $('#btnKey');

  const pintar = () => {
    boton.dataset.state = store.hasKey ? 'set' : 'empty';
    boton.querySelector('i').className = `bi ${store.hasKey ? 'bi-key-fill' : 'bi-key'}`;
    boton.setAttribute('aria-label', store.hasKey ? 'Llave de acceso configurada. Cambiar' : 'Falta la llave de acceso. Configurar');
    onChange?.(store.hasKey);
  };

  const abrir = () => {
    input.value = '';
    if (!dialog.open) dialog.showModal();
    input.focus();
  };

  boton.addEventListener('click', abrir);
  $('#keyCancel').addEventListener('click', () => dialog.close());
  $('#keyClear').addEventListener('click', () => {
    store.clear();
    pintar();
    dialog.close();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value.trim()) store.set(input.value, recordar.checked);
    input.value = '';
    pintar();
    dialog.close();
  });

  pintar();
  return { open: abrir, refresh: pintar };
}
