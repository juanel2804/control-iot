/* ADMINISTRACIÓN (dentro de Ajustes, solo con la llave puesta): vehículos, comandos del catálogo y DEMOs
   con sus movimientos. Usa los servicios REST que YA existen en la API (no se agregó nada al backend):
     /vehiculos · /vehiculos/{id}/actualizar · /vehiculos/{id}/eliminar
     /vehiculos/{id}/comandos[/{id_comando}/actualizar|eliminar]
     /vehiculos/{id}/demos[/{id_demo}/actualizar|eliminar|iniciar|movimientos[/{id_mov}/actualizar|eliminar]] · /demos/cancelar
   Todo el texto que viene de la API se pinta con textContent (nunca innerHTML). */
import { API_BASE, VEHICULO } from "../monitoreo/config.js";

const $ = id => document.getElementById(id);
const llave = () => { try { return localStorage.getItem("iot_api_key") || ""; } catch { return ""; } };

/* ---------------------------- cliente REST ---------------------------- */
async function pedir(metodo, ruta, cuerpo) {
  const ctrl = new AbortController(), reloj = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(API_BASE + ruta, {
      method: metodo, signal: ctrl.signal, cache: "no-store",
      headers: { "Content-Type": "application/json", "X-API-Key": llave() },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    let j = null; try { j = await r.json(); } catch {}
    if (!r.ok) {
      let d = j?.detail;
      if (Array.isArray(d)) d = d.map(x => `${(x.loc || []).slice(-1)[0] ?? ""}: ${x.msg}`).join(" · ");
      throw new Error(d || `HTTP ${r.status}`);
    }
    return j;
  } catch (e) {
    if (e.name === "AbortError") throw new Error("La API no respondió en 10 s");
    if (e instanceof TypeError) throw new Error("Sin conexión con la API de AWS");
    throw e;
  } finally { clearTimeout(reloj); }
}

/* ---------------------------- DOM seguro ---------------------------- */
function h(tag, props = {}, ...hijos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k in el && typeof v !== "string") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of hijos.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
const campo = (etq, input) => h("label", { class: "adm-campo" }, h("span", {}, etq), input);
const entrada = (nombre, valor = "", extra = {}) => h("input", { class: "campo", name: nombre, value: valor ?? "", autocomplete: "off", ...extra });
const casilla = (nombre, marcado) => h("input", { type: "checkbox", name: nombre, checked: !!marcado });

let estadoTimer = null;
function estado(texto, nivel = "") {
  const p = $("admEstado"); p.textContent = texto; p.dataset.nivel = nivel;
  clearTimeout(estadoTimer);
  if (nivel === "ok") estadoTimer = setTimeout(() => { p.textContent = ""; p.dataset.nivel = ""; }, 4000);
}

/** Botón de borrar con doble toque (sin diálogos del navegador). */
function botonBorrar(accion) {
  const b = h("button", { type: "button", class: "adm-btn peligro" }, "Eliminar");
  b.addEventListener("click", async () => {
    if (!b.dataset.seguro) {
      b.dataset.seguro = "1"; b.textContent = "¿Seguro? Toca otra vez";
      setTimeout(() => { delete b.dataset.seguro; b.textContent = "Eliminar"; }, 3000);
      return;
    }
    b.disabled = true;
    try { await accion(); } catch (e) { estado(e.message, "mal"); b.disabled = false; }
  });
  return b;
}

async function ejecutar(promesa, ok, despues) {
  try { await promesa; estado(ok, "ok"); await despues?.(); }
  catch (e) { estado(e.message, "mal"); }
}

/* ---------------------------- estado ---------------------------- */
const A = { pestana: "vehiculos", vehiculo: VEHICULO, vehiculos: [], comandos: [], demos: [], demo: null, movs: [], editando: null };

async function cargarVehiculos() {
  A.vehiculos = await pedir("GET", "/vehiculos");
  if (!A.vehiculos.some(v => v.id_vehiculo === A.vehiculo) && A.vehiculos.length) A.vehiculo = A.vehiculos[0].id_vehiculo;
}
const cargarComandos = async () => { A.comandos = await pedir("GET", `/vehiculos/${A.vehiculo}/comandos`); };
const cargarDemos = async () => { A.demos = await pedir("GET", `/vehiculos/${A.vehiculo}/demos`); };
const cargarMovs = async () => { A.movs = A.demo ? await pedir("GET", `/vehiculos/${A.vehiculo}/demos/${A.demo}/movimientos`) : []; };

async function recargar() {
  try {
    estado("Cargando…", "espera");
    await cargarVehiculos();
    if (A.pestana !== "vehiculos") { await cargarComandos(); await cargarDemos(); }
    if (A.pestana === "demos") {
      if (A.demo && !A.demos.some(d => d.id_demo === A.demo)) A.demo = null;
      await cargarMovs();
    }
    estado("", "");
    pintar();
  } catch (e) { estado(e.message, "mal"); }
}

/* ---------------------------- vistas ---------------------------- */
function selectorVehiculo() {
  const s = h("select", { class: "campo", "aria-label": "Vehículo a administrar" },
    A.vehiculos.map(v => h("option", { value: String(v.id_vehiculo), selected: v.id_vehiculo === A.vehiculo }, `#${v.id_vehiculo} · ${v.nombre}${v.activo ? "" : " (inactivo)"}`)));
  s.addEventListener("change", () => { A.vehiculo = Number(s.value); A.demo = null; A.editando = null; recargar(); });
  return campo("Vehículo", s);
}

function tabla(cabeza, filas) {
  return h("div", { class: "adm-tabla-caja" }, h("table", { class: "adm-tabla" },
    h("thead", {}, h("tr", {}, cabeza.map(c => h("th", { scope: "col" }, c)))),
    h("tbody", {}, filas.length ? filas : h("tr", {}, h("td", { colSpan: cabeza.length, class: "adm-vacio" }, "Sin registros")))));
}

function formulario(titulo, campos, alGuardar, alCancelar) {
  const f = h("form", { class: "adm-form" }, h("b", {}, titulo), h("div", { class: "adm-grid" }, campos),
    h("div", { class: "adm-acciones" },
      h("button", { type: "submit", class: "adm-btn primario" }, "Guardar"),
      alCancelar && h("button", { type: "button", class: "adm-btn", onclick: alCancelar }, "Cancelar")));
  f.addEventListener("submit", e => {
    e.preventDefault();
    const d = Object.fromEntries([...f.elements].filter(x => x.name).map(x => [x.name, x.type === "checkbox" ? x.checked : x.value.trim()]));
    alGuardar(d);
  });
  return f;
}
const opc = v => (v === "" ? null : v);

function vistaVehiculos() {
  const ed = A.editando?.tipo === "vehiculo" ? A.vehiculos.find(v => v.id_vehiculo === A.editando.id) : null;
  const filas = A.vehiculos.map(v => h("tr", {},
    h("td", {}, String(v.id_vehiculo)), h("td", { class: "fuerte" }, v.nombre), h("td", {}, v.modelo ?? "—"),
    h("td", {}, v.microcontrolador ?? "—"), h("td", {}, v.activo ? "✔ Activo" : "✖ Inactivo"),
    h("td", { class: "adm-acc" },
      h("button", { type: "button", class: "adm-btn", onclick: () => { A.editando = { tipo: "vehiculo", id: v.id_vehiculo }; pintar(); } }, "Editar"),
      botonBorrar(async () => { await pedir("POST", `/vehiculos/${v.id_vehiculo}/eliminar`); estado(`Vehículo #${v.id_vehiculo} eliminado`, "ok"); await recargar(); }))));
  const campos = [
    campo("Nombre *", entrada("nombre", ed?.nombre, { required: true, maxLength: 80 })),
    campo("Modelo", entrada("modelo", ed?.modelo, { maxLength: 80 })),
    campo("Microcontrolador", entrada("microcontrolador", ed?.microcontrolador, { maxLength: 50, placeholder: "ESP32" })),
    campo("Descripción", entrada("descripcion", ed?.descripcion, { maxLength: 255 })),
    ed && campo("Activo", casilla("activo", ed.activo)),
  ];
  const form = formulario(ed ? `Editar vehículo #${ed.id_vehiculo}` : "Nuevo vehículo", campos, d => {
    const cuerpo = { nombre: d.nombre, modelo: opc(d.modelo), descripcion: opc(d.descripcion), microcontrolador: opc(d.microcontrolador) };
    if (ed) ejecutar(pedir("POST", `/vehiculos/${ed.id_vehiculo}/actualizar`, { ...cuerpo, activo: d.activo }), "Vehículo actualizado", () => { A.editando = null; return recargar(); });
    else ejecutar(pedir("POST", "/vehiculos", cuerpo), "Vehículo creado", recargar);
  }, ed && (() => { A.editando = null; pintar(); }));
  return [tabla(["ID", "Nombre", "Modelo", "Micro", "Estado", ""], filas), form];
}

function vistaComandos() {
  const ed = A.editando?.tipo === "comando" ? A.comandos.find(c => c.id_comando === A.editando.id) : null;
  const filas = [...A.comandos].sort((a, b) => a.codigo - b.codigo).map(c => h("tr", {},
    h("td", {}, String(c.id_comando)), h("td", { class: "fuerte" }, c.nombre), h("td", {}, String(c.codigo)),
    h("td", {}, c.activo ? "✔ Activo" : "✖ Inactivo"), h("td", { class: "adm-desc" }, c.descripcion ?? ""),
    h("td", { class: "adm-acc" },
      h("button", { type: "button", class: "adm-btn", onclick: () => { A.editando = { tipo: "comando", id: c.id_comando }; pintar(); } }, "Editar"),
      botonBorrar(async () => { await pedir("POST", `/vehiculos/${A.vehiculo}/comandos/${c.id_comando}/eliminar`); estado(`Comando ${c.nombre} eliminado`, "ok"); await recargar(); }))));
  const campos = [
    campo("Nombre *", entrada("nombre", ed?.nombre, { required: true, maxLength: 60, placeholder: "AVANZAR" })),
    campo("Código *", entrada("codigo", ed?.codigo, { required: true, type: "number", min: 0, max: 65535 })),
    campo("Descripción", entrada("descripcion", ed?.descripcion, { maxLength: 255 })),
    ed && campo("Activo", casilla("activo", ed.activo)),
  ];
  const form = formulario(ed ? `Editar comando ${ed.nombre}` : "Nuevo comando", campos, d => {
    const cuerpo = { nombre: d.nombre, codigo: Number(d.codigo), descripcion: opc(d.descripcion) };
    if (ed) ejecutar(pedir("POST", `/vehiculos/${A.vehiculo}/comandos/${ed.id_comando}/actualizar`, { ...cuerpo, activo: d.activo }), "Comando actualizado", () => { A.editando = null; return recargar(); });
    else ejecutar(pedir("POST", `/vehiculos/${A.vehiculo}/comandos`, cuerpo), "Comando creado", recargar);
  }, ed && (() => { A.editando = null; pintar(); }));
  return [selectorVehiculo(), tabla(["ID", "Nombre", "Código", "Estado", "Descripción", ""], filas), form,
    h("p", { class: "nota" }, "Los botones de CONTROL usan los 12 comandos de la excavadora; un comando nuevo queda en el catálogo y se puede usar en las DEMO.")];
}

function vistaDemos() {
  const ed = A.editando?.tipo === "demo" ? A.demos.find(d => d.id_demo === A.editando.id) : null;
  const filas = A.demos.map(d => h("tr", { class: d.id_demo === A.demo ? "sel" : "" },
    h("td", {}, String(d.id_demo)), h("td", { class: "fuerte" }, d.nombre), h("td", { class: "adm-desc" }, d.descripcion ?? ""),
    h("td", {}, d.activo ? "✔ Activa" : "✖ Inactiva"),
    h("td", { class: "adm-acc" },
      h("button", { type: "button", class: "adm-btn primario", onclick: async () => { A.demo = d.id_demo; A.editando = null; await ejecutar(cargarMovs(), "", pintar); } }, "Pasos"),
      h("button", { type: "button", class: "adm-btn", onclick: () => { A.editando = { tipo: "demo", id: d.id_demo }; pintar(); } }, "Editar"),
      botonBorrar(async () => { await pedir("POST", `/vehiculos/${A.vehiculo}/demos/${d.id_demo}/eliminar`); if (A.demo === d.id_demo) A.demo = null; estado(`DEMO ${d.nombre} eliminada`, "ok"); await recargar(); }))));
  const formDemo = formulario(ed ? `Editar DEMO #${ed.id_demo}` : "Nueva DEMO", [
    campo("Nombre *", entrada("nombre", ed?.nombre, { required: true, maxLength: 80, placeholder: "Saludo de la expo" })),
    campo("Descripción", entrada("descripcion", ed?.descripcion, { maxLength: 255 })),
    ed && campo("Activa", casilla("activo", ed.activo)),
  ], d => {
    const cuerpo = { nombre: d.nombre, descripcion: opc(d.descripcion) };
    if (ed) ejecutar(pedir("POST", `/vehiculos/${A.vehiculo}/demos/${ed.id_demo}/actualizar`, { ...cuerpo, activo: d.activo }), "DEMO actualizada", () => { A.editando = null; return recargar(); });
    else ejecutar(pedir("POST", `/vehiculos/${A.vehiculo}/demos`, cuerpo).then(r => { A.demo = r?.id ?? A.demo; }), "DEMO creada: agrega sus pasos", recargar);
  }, ed && (() => { A.editando = null; pintar(); }));
  const partes = [selectorVehiculo(), tabla(["ID", "Nombre", "Descripción", "Estado", ""], filas), formDemo];
  if (A.demo) partes.push(vistaPasos());
  return partes;
}

function vistaPasos() {
  const demo = A.demos.find(d => d.id_demo === A.demo);
  const activos = A.comandos.filter(c => c.activo);
  const edM = A.editando?.tipo === "mov" ? A.movs.find(m => m.id_demo_movimiento === A.editando.id) : null;
  const total = A.movs.reduce((s, m) => s + m.duracion_ms + m.pausa_ms, 0);
  const filas = A.movs.map(m => h("tr", {},
    h("td", {}, String(m.orden)), h("td", { class: "fuerte" }, m.comando), h("td", {}, `${m.duracion_ms} ms`), h("td", {}, `${m.pausa_ms} ms`),
    h("td", { class: "adm-acc" },
      h("button", { type: "button", class: "adm-btn", onclick: () => { A.editando = { tipo: "mov", id: m.id_demo_movimiento }; pintar(); } }, "Editar"),
      botonBorrar(async () => { await pedir("POST", `/vehiculos/${A.vehiculo}/demos/${A.demo}/movimientos/${m.id_demo_movimiento}/eliminar`); estado(`Paso ${m.orden} eliminado`, "ok"); await cargarMovs(); pintar(); }))));
  const sel = h("select", { class: "campo", name: "id_comando", required: true },
    activos.map(c => h("option", { value: String(c.id_comando), selected: edM ? c.id_comando === edM.id_comando : false }, `${c.nombre} (${c.codigo})`)));
  const siguiente = (A.movs.reduce((m, x) => Math.max(m, x.orden), 0) || 0) + 1;
  const form = formulario(edM ? `Editar paso ${edM.orden}` : "Agregar paso", [
    campo("Comando", sel),
    campo("Orden", entrada("orden", edM?.orden ?? siguiente, { type: "number", min: 1, max: 10000, required: true })),
    campo("Duración (ms)", entrada("duracion_ms", edM?.duracion_ms ?? 800, { type: "number", min: 0, max: 600000, step: 100, required: true })),
    campo("Pausa después (ms)", entrada("pausa_ms", edM?.pausa_ms ?? 200, { type: "number", min: 0, max: 600000, step: 100, required: true })),
  ], d => {
    const cuerpo = { id_comando: Number(d.id_comando), orden: Number(d.orden), duracion_ms: Number(d.duracion_ms), pausa_ms: Number(d.pausa_ms) };
    const ruta = `/vehiculos/${A.vehiculo}/demos/${A.demo}/movimientos`;
    const p = edM ? pedir("POST", `${ruta}/${edM.id_demo_movimiento}/actualizar`, cuerpo) : pedir("POST", ruta, cuerpo);
    ejecutar(p, edM ? "Paso actualizado" : "Paso agregado", async () => { A.editando = null; await cargarMovs(); pintar(); });
  }, edM && (() => { A.editando = null; pintar(); }));
  const correr = h("div", { class: "adm-acciones" },
    h("button", { type: "button", class: "adm-btn primario", disabled: !A.movs.length || !demo?.activo,
      onclick: () => ejecutar(pedir("POST", `/vehiculos/${A.vehiculo}/demos/${A.demo}/iniciar`), "DEMO iniciada: mírala en MONITOREO o en la pantalla de la expo") }, "▶ Ejecutar DEMO"),
    h("button", { type: "button", class: "adm-btn peligro", onclick: () => ejecutar(pedir("POST", `/vehiculos/${A.vehiculo}/demos/cancelar`), "Cancelación enviada") }, "■ Cancelar DEMO"));
  return h("div", { class: "adm-pasos" },
    h("b", {}, `Pasos de «${demo?.nombre ?? "DEMO"}» · ${A.movs.length} paso(s) · ${(total / 1000).toFixed(1)} s`),
    tabla(["Orden", "Comando", "Duración", "Pausa", ""], filas), form, correr,
    h("p", { class: "nota" }, "Los pasos de una DEMO llegan al vehículo por WebSocket y no se guardan en el historial individual."));
}

function pintar() {
  document.querySelectorAll("#admPestanas button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.p === A.pestana)));
  const cuerpo = { vehiculos: vistaVehiculos, comandos: vistaComandos, demos: vistaDemos }[A.pestana]();
  $("admCuerpo").replaceChildren(...[cuerpo].flat().filter(Boolean));
}

/* ---------------------------- arranque ---------------------------- */
function montar() {
  const ajustes = $("vAjustes");
  if (!ajustes || $("admin")) return;
  const caja = h("div", { class: "vidrio tarjeta adm", id: "admin", hidden: true },
    h("div", { class: "fila" }, h("b", {}, "🛠️ Administración"),
      h("a", { class: "adm-btn primario adm-expo", href: "expo.html", target: "_blank", rel: "noopener" }, "📺 Pantalla de la expo")),
    h("p", { class: "nota" }, "Solo aparece con la llave puesta. Los cambios se guardan en Amazon RDS con los servicios de la API."),
    h("div", { class: "seg", id: "admPestanas", role: "group", "aria-label": "Sección de administración" },
      h("button", { type: "button", dataset: { p: "vehiculos" } }, "🚜 Vehículos"),
      h("button", { type: "button", dataset: { p: "comandos" } }, "🎛️ Comandos"),
      h("button", { type: "button", dataset: { p: "demos" } }, "🎬 DEMOs")),
    h("p", { class: "adm-estado", id: "admEstado", role: "status", "aria-live": "polite" }),
    h("div", { id: "admCuerpo" }));
  ajustes.append(caja);
  caja.querySelectorAll("#admPestanas button").forEach(b => b.addEventListener("click", () => { A.pestana = b.dataset.p; A.editando = null; recargar(); }));
  let cargado = false;
  const revisar = () => {
    const visible = !ajustes.hidden && !!llave();
    caja.hidden = !llave();
    if (visible && !cargado) { cargado = true; recargar(); }
  };
  new MutationObserver(revisar).observe(ajustes, { attributes: true, attributeFilter: ["hidden"] });
  $("btnLlave")?.addEventListener("click", () => setTimeout(revisar, 0));
  revisar();
}

if (window.IOT?.NUBE) montar();
