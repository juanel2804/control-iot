/* Tabla de los últimos DIEZ movimientos individuales PERSISTIDOS en RDS.
   · La única fuente es GET /vehiculos/{id}/historial (nunca se fabrican filas en el navegador).
   · Orden: fecha_hora DESC y, en empate, id_historial DESC (el mismo criterio del SP sp_obtener_historial).
   · Sin duplicados (por id_historial) y máximo 10 filas; la fila 11 solo deja de mostrarse, RDS la conserva.
   · Se actualiza solo lo necesario del DOM: las filas se reutilizan por id y las nuevas se resaltan. */
import { LIMITE_HISTORIAL } from "./config.js";
import { fecha, hora } from "./fechas.js";

const $ = id => document.getElementById(id);
let filasActuales = [];                 // última lista confirmada por la API
const nodos = new Map();                // id_historial → <tr>
let cargado = false;

export const ids = () => filasActuales.map(f => f.id);
export const masReciente = () => filasActuales[0] ?? null;

function ordenar(filas) {
  return [...filas].sort((a, b) => ((b.instante?.getTime() ?? 0) - (a.instante?.getTime() ?? 0)) || (b.id - a.id));
}

function celda(texto, clase) {
  const td = document.createElement("td");
  if (clase) td.className = clase;
  td.textContent = texto;
  return td;
}

function crearFila(f) {
  const tr = document.createElement("tr");
  tr.dataset.id = String(f.id);
  const num = celda("", "c-num");
  const mov = celda(f.comando.replaceAll("_", " "), "c-mov");
  if (f.codigo != null) mov.title = `Código ${f.codigo}`;
  tr.append(num, mov, celda(fecha(f.instante)), celda(hora(f.instante)),
            celda(String(f.id), "c-id d-none d-sm-table-cell"), celda(f.origen, "c-org d-none d-md-table-cell"));
  return tr;
}

function mensaje(texto, clase = "mon-vacia") {
  const tr = document.createElement("tr"); tr.className = clase;
  const td = document.createElement("td"); td.colSpan = 6; td.textContent = texto;
  tr.append(td);
  $("monFilas").replaceChildren(tr);
  nodos.clear();
}

/** Reemplaza la tabla con la lista confirmada por la API. Devuelve los ids nuevos respecto a la anterior. */
export function aplicar(filasApi) {
  const vistas = new Set();
  const lista = ordenar(filasApi.filter(f => !vistas.has(f.id) && vistas.add(f.id))).slice(0, LIMITE_HISTORIAL);
  const antes = new Set(filasActuales.map(f => f.id));
  const nuevos = cargado ? lista.filter(f => !antes.has(f.id)).map(f => f.id) : [];
  filasActuales = lista;
  cargado = true;

  if (!lista.length) { mensaje("Sin movimientos registrados para este vehículo."); pintarMeta(); return nuevos; }

  const cuerpo = $("monFilas");
  cuerpo.querySelectorAll("tr.mon-vacia, tr.mon-error").forEach(tr => tr.remove());
  const siguen = new Set(lista.map(f => f.id));
  for (const [id, tr] of nodos) if (!siguen.has(id)) { tr.remove(); nodos.delete(id); }   // solo sale de la pantalla
  lista.forEach((f, i) => {
    let tr = nodos.get(f.id);
    if (!tr) { tr = crearFila(f); nodos.set(f.id, tr); if (nuevos.includes(f.id)) tr.classList.add("nuevo"); }
    tr.firstChild.textContent = String(i + 1);
    if (cuerpo.children[i] !== tr) cuerpo.insertBefore(tr, cuerpo.children[i] ?? null);
  });
  pintarMeta();
  return nuevos;
}

function pintarMeta() {
  $("monHistMeta").textContent = `${filasActuales.length} de máx. ${LIMITE_HISTORIAL}`;
}

/** Error al consultar: si ya había filas se conservan marcadas; si no, se muestra el mensaje. */
export function error(texto) {
  if (!cargado || !filasActuales.length) { mensaje(texto, "mon-error"); $("monHistMeta").textContent = "Error"; return; }
  $("monHistMeta").textContent = "Mostrando la última lista confirmada";
}
