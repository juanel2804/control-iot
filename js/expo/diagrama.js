/* Diagrama animado de la pantalla de la expo. Solo se anima cuando llega un evento REAL (expo.js decide cuándo).
   viajar() mueve un «paquete» por un cable del SVG; pulso() hace brillar un nodo. */
const NS = "http://www.w3.org/2000/svg";
const $ = id => document.getElementById(id);
const capa = $("capaPaquetes");
const lento = matchMedia("(prefers-reduced-motion: reduce)").matches;
const MAX_PAQUETES = 14;

/** Mueve un paquete por el cable `cable` (id del <path>). Devuelve una promesa que se cumple al llegar. */
export function viajar(cable, clase, etiqueta, ms = 650, { reversa = false } = {}) {
  const path = $(cable);
  if (!path || capa.childElementCount >= MAX_PAQUETES) return Promise.resolve();
  const largo = path.getTotalLength();
  const g = document.createElementNS(NS, "g");
  g.setAttribute("class", `paq ${clase}`);
  const c = document.createElementNS(NS, "circle");
  c.setAttribute("r", "11"); c.setAttribute("filter", "url(#brillo)");
  const t = document.createElementNS(NS, "text");
  t.setAttribute("y", "-20"); t.textContent = etiqueta;          // textContent: nunca HTML del servidor
  g.append(c, t);
  capa.append(g);
  path.classList.add("activo", clase);
  const dur = lento ? 1 : ms;
  return new Promise(listo => {
    const t0 = performance.now();
    const paso = ahora => {
      const k = Math.min(1, (ahora - t0) / dur);
      const e = k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;   // suavizado
      const p = path.getPointAtLength((reversa ? 1 - e : e) * largo);
      g.setAttribute("transform", `translate(${p.x} ${p.y})`);
      if (k < 1) requestAnimationFrame(paso);
      else {
        g.remove();
        if (!capa.querySelector(`.paq.${clase}`)) path.classList.remove("activo", clase);
        listo();
      }
    };
    requestAnimationFrame(paso);
  });
}

/** Hace brillar un nodo con el color de `clase`. */
export function pulso(nodo, clase) {
  const n = $(nodo); if (!n) return;
  n.classList.remove("pulso", "mov", "rds", "demo", "tele");
  void n.getBBox();                       // reinicia la animación CSS
  n.classList.add("pulso", clase);
  clearTimeout(n._t); n._t = setTimeout(() => n.classList.remove("pulso", clase), 900);
}

export function detalle(id, texto) { const d = $(id); if (d) d.textContent = texto; }
export function estadoNodo(nodo, estado) { const n = $(nodo); if (n) n.dataset.estado = estado || ""; }
