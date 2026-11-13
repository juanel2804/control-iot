/* Bitácora en pantalla de los eventos WSS recibidos (para correlacionar con el cliente externo y con la tabla).
   El canal rápido renueva «control» cada 250 ms: las renovaciones iguales se agrupan en una sola línea (×N). */
import { hora } from "./fechas.js";

const $ = id => document.getElementById(id);
const MAX = 25;
let total = 0, ultimo = null;

function resumen(ev) {
  switch (ev.tipo) {
    case "control": return `control · ${ev.comando}${ev.ms ? ` · pulso ${ev.ms} ms` : " · continuo"}`;
    case "movimiento": return `movimiento · ${ev.comando} · código ${ev.codigo ?? "—"}`;
    case "demo_movimiento": return `demo_movimiento · DEMO #${ev.idDemo} paso ${ev.orden}${ev.total ? "/" + ev.total : ""} · ${ev.comando}`;
    case "demo_inicio": case "demo_fin": case "demo_cancelada": case "demo_error": return `${ev.tipo} · DEMO #${ev.idDemo}`;
    case "estado_inicial": return `estado_inicial · ${ev.estado?.comando ?? "sin estado"}`;
    case "conexion": return `conexion · vehículo ${ev.conectado ? "conectado" : "desconectado"} (RDS)`;
    case "error": return `error · ${ev.detalle}`;
    default: return ev.tipo;
  }
}

export function registrar(ev, nota = "") {
  total++;
  $("monEvCuenta").textContent = `(${total})`;
  const lista = $("monEventos");
  const clave = resumen(ev);
  if (ultimo && ultimo.clave === clave && ev.tipo === "control") {
    ultimo.veces++;
    ultimo.li.querySelector(".ev-veces").textContent = ` ×${ultimo.veces}`;
    return;
  }
  const li = document.createElement("li");
  const t = document.createElement("time");
  t.textContent = ev.instante ? hora(ev.instante) : "sin hora";
  if (ev.instante) t.dateTime = ev.instante.toISOString();
  const txt = document.createElement("span"); txt.textContent = clave + (nota ? ` — ${nota}` : "");
  const veces = document.createElement("span"); veces.className = "ev-veces";
  li.append(t, txt, veces);
  lista.prepend(li);
  while (lista.children.length > MAX) lista.lastChild.remove();
  ultimo = { clave, veces: 1, li };
}

/** Evento local de la conexión (apertura/cierre) para la misma bitácora. */
export function local(texto) {
  registrar({ tipo: "local", instante: new Date() });
  ultimo.li.querySelector("span").textContent = texto;
  ultimo.clave = "local:" + texto;
}
