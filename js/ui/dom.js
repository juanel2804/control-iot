/** Utilidades de DOM. Todo texto remoto se inserta con textContent (nunca innerHTML) para evitar inyección. */
export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function el(tag, attrs = {}, ...hijos) {
  const nodo = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') nodo.className = v;
    else if (k === 'dataset') Object.assign(nodo.dataset, v);
    else nodo.setAttribute(k, v === true ? '' : String(v));
  }
  for (const h of hijos.flat()) nodo.append(h instanceof Node ? h : document.createTextNode(String(h)));
  return nodo;
}

export const icono = (clase) => el('i', { class: `bi ${clase}`, 'aria-hidden': 'true' });

export const hora = (ms = Date.now()) =>
  new Date(ms).toLocaleTimeString('es-MX', { hour12: false });

/** Anuncio para lectores de pantalla (región aria-live). */
export function anunciar(texto) {
  const r = $('#srStatus');
  if (r) r.textContent = texto;
}
