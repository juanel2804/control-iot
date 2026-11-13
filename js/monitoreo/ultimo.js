/* Tarjeta «Último movimiento reportado».
   Fuentes: REST GET /estado (RDS), WSS estado_inicial (RDS al conectar) y eventos WSS en vivo
   (movimiento, control, demo_*). Reglas:
   · Un evento WSS cuenta como «publicado por el servidor», no como «ejecutado» por el motor.
   · Una respuesta REST que salió ANTES de un evento WSS más nuevo no lo sobrescribe (versión de eventos + timestamps).
   · Eventos fuera de orden (timestamp anterior al mostrado) se ignoran.
   · Sin datos: «Sin movimientos»; sin conexión: el último valor queda etiquetado como «último conocido». */
import { NOMBRE_ZONA } from "./config.js";
import { fecha, hora } from "./fechas.js";

const $ = id => document.getElementById(id);
let actual = null;          // lo que se muestra
let versionEventos = 0;     // sube con cada evento WSS que cambia la tarjeta
let desactualizado = false;
let demo = null;            // { id, total } mientras el WSS informa una DEMO en curso

export const version = () => versionEventos;
export const enDemo = () => demo !== null;
export const comandoActual = () => actual?.comando ?? null;

const NOMBRE = c => String(c).replaceAll("_", " ");

function pintar() {
  const tarjeta = $("monUltimo");
  tarjeta.setAttribute("aria-busy", "false");
  tarjeta.classList.toggle("viejo", desactualizado);
  tarjeta.classList.toggle("demo", !!actual?.esDemo);
  if (!actual) {
    $("monCmd").textContent = "Sin movimientos";
    $("monDetalle").textContent = "El vehículo aún no tiene un estado registrado en RDS.";
    ["monFecha", "monHora", "monCodigo", "monFuente"].forEach(id => ($(id).textContent = "—"));
    $("monChips").replaceChildren();
    return;
  }
  $("monCmd").textContent = NOMBRE(actual.comando);
  let det = actual.detalle || "";
  if (demo) det = `DEMO #${demo.id} en curso${demo.total ? ` (${demo.total} pasos)` : ""}${det ? " · " + det : ""}`;
  if (desactualizado) det = `Último valor conocido · sin datos actualizados${det ? " · " + det : ""}`;
  $("monDetalle").textContent = det;
  $("monFecha").textContent = actual.instante ? fecha(actual.instante) : "Sin fecha en el origen";
  $("monHora").textContent = actual.instante ? hora(actual.instante) : "—";
  $("monHora").title = actual.instante ? NOMBRE_ZONA : "";
  $("monCodigo").textContent = actual.codigo ?? "—";
  $("monFuente").textContent = actual.fuente;
  const chips = [];
  if (actual.wss) chips.push(["ok", "✔ Publicado por WSS"]);
  if (actual.rds) chips.push(["ok", "✔ Leído de RDS"]);
  if (actual.esDemo) chips.push(["info", "ⓘ Paso de DEMO: no se guarda en el historial"]);
  else if (actual.idHistorial) chips.push(["ok", `✔ En historial RDS · ID ${actual.idHistorial}`]);
  else if (actual.wss) chips.push(["espera", "… Esperando confirmación del historial"]);
  if (actual.conectado !== undefined) chips.push(["info", `ⓘ Conexión del vehículo según RDS: ${actual.conectado ? "sí" : "no"}`]);
  chips.push(["aviso", "⚠ Ejecución física: sin confirmar"]);
  $("monChips").replaceChildren(...chips.map(([nivel, txt]) => {
    const li = document.createElement("li"); li.className = "chip-" + nivel; li.textContent = txt; return li;
  }));
}

// RDS guarda TIMESTAMP en segundos enteros: a sus marcas se les da 1 s de tolerancia frente a los eventos (con ms)
const masViejo = (inst, tolerancia = 0) => !!(actual?.instante && inst && inst.getTime() + tolerancia < actual.instante.getTime());

/** Estado leído de RDS (REST o estado_inicial). `versionAlPedir`: versión de eventos cuando salió la solicitud. */
export function desdeRds(est, { versionAlPedir, fuente }) {
  if (!est) { if (!actual) { desactualizado = false; pintar(); } return false; }
  if (versionAlPedir !== versionEventos && actual?.wss && !(est.instante && actual.instante && est.instante > actual.instante)) {
    // llegó un evento WSS mientras viajaba la respuesta: la respuesta REST es más vieja, no se sobrescribe
    if (actual.comando === est.comando) { actual.rds = true; actual.conectado = est.conectado; pintar(); }
    return false;
  }
  // un paso de DEMO nunca bloquea al estado de RDS (al terminar/cancelar, RDS tiene el estado final)
  if (masViejo(est.instante, 1000) && actual?.wss && !actual.esDemo) return false;
  const mismo = actual && actual.comando === est.comando && !actual.esDemo;
  if (mismo && actual.wss) {   // RDS confirma lo que ya llegó por WSS: se conserva la fuente del evento
    actual.rds = true; actual.conectado = est.conectado; if (actual.codigo == null) actual.codigo = est.codigo;
    desactualizado = false; pintar(); return true;
  }
  actual = { comando: est.comando || "SIN COMANDO", codigo: est.codigo, instante: est.instante, fuente,
             wss: mismo ? actual.wss : false, rds: true, conectado: est.conectado,
             idHistorial: mismo ? actual.idHistorial : null, esDemo: false,
             detalle: mismo ? actual.detalle : "" };
  desactualizado = false;
  pintar();
  return true;
}

/** Evento WSS validado del mismo vehículo. Devuelve true si cambió la tarjeta. */
export function desdeEvento(ev) {
  if (ev.instante && masViejo(ev.instante)) return false;           // fuera de orden
  switch (ev.tipo) {
    case "control":
      // El canal rápido renueva el mismo comando cada 250 ms: no es un movimiento nuevo
      if (actual?.wss && !actual.esDemo && actual.comando === ev.comando && ev.ms === 0 && actual.ms === 0) return false;
      versionEventos++;
      actual = { comando: ev.comando, codigo: null, instante: ev.instante, ms: ev.ms, wss: true, rds: false, esDemo: false,
                 fuente: `WSS · control (canal rápido${ev.origen ? ", " + ev.origen : ""})`,
                 detalle: /^DETENER$/i.test(ev.comando) ? "Alto: orden de apagar todas las salidas"
                   : ev.ms > 0 ? `Pulso de ${ev.ms} ms` : "Continuo (mientras se mantiene)", conectado: actual?.conectado };
      break;
    case "movimiento":
      versionEventos++;
      actual = { comando: ev.comando, codigo: ev.codigo, instante: ev.instante, wss: true, rds: false, esDemo: false,
                 fuente: `WSS · movimiento (POST /movimientos${ev.origen ? ", " + ev.origen : ""})`,
                 detalle: "Guardado en RDS antes de publicarse (commit → evento)", conectado: actual?.conectado };
      break;
    case "demo_movimiento":
      versionEventos++;
      demo = { id: ev.idDemo, total: ev.total };
      actual = { comando: ev.comando, codigo: ev.codigo, instante: ev.instante, wss: true, rds: false, esDemo: true,
                 fuente: `WSS · DEMO #${ev.idDemo} · paso ${ev.orden}${ev.total ? "/" + ev.total : ""}`,
                 detalle: ev.duracion != null ? `Paso de ${ev.duracion} ms` : "", conectado: actual?.conectado };
      break;
    case "demo_inicio":
      demo = { id: ev.idDemo, total: ev.total }; break;
    case "demo_fin": case "demo_cancelada": case "demo_error": {
      versionEventos++;
      const fin = { demo_fin: "terminada", demo_cancelada: "cancelada", demo_error: "detenida por error" }[ev.tipo];
      demo = null;
      if (actual) actual.detalle = `DEMO #${ev.idDemo} ${fin} · se relee el estado final en RDS`;
      break;
    }
    case "conexion":
      if (actual) actual.conectado = ev.conectado; break;
    default:
      return false;
  }
  desactualizado = false;
  pintar();
  return true;
}

/** El historial confirmó (o no) el movimiento mostrado: marca su ID real de RDS. */
export function confirmarConHistorial(filas) {
  if (!actual || actual.esDemo || !filas.length) return;
  const top = filas[0];
  // tolerancia de 3 s entre el reloj del EC2 (evento) y el de RDS (registro)
  const cerca = !actual.instante || !top.instante || top.instante.getTime() >= actual.instante.getTime() - 3000;
  if (top.comando === actual.comando && cerca) {
    actual.idHistorial = top.id; actual.rds = true;
    if (actual.codigo == null && top.codigo != null) actual.codigo = top.codigo;   // el canal rápido no trae el código; RDS sí
  }
  pintar();
}

export function marcarDesactualizado(si) { if (desactualizado !== si) { desactualizado = si; pintar(); } }
export function demoEnCurso(idDemo) { demo = idDemo ? { id: idDemo, total: demo?.id === idDemo ? demo.total : null } : null; pintar(); }
