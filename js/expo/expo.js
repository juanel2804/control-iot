/* Pantalla de la expo (tablet): administra la sala de turnos (QR, fila, turno) y anima en vivo cómo viaja cada orden.
   Es un cliente WSS más del vehículo (con la llave, como administrador) y usa los mismos módulos REST de MONITOREO.
   Protocolo real: vehiculo-iot-api/app/routers/ws.py (auth, sala, control, movimiento, demo_*, telemetria). */
import { obtenerHistorial, obtenerJSON } from "../monitoreo/api.js";
import { API_BASE, CANAL, VEHICULO } from "../monitoreo/config.js";
import { aInstante, hora } from "../monitoreo/fechas.js";
import { detalle, estadoNodo, pulso, viajar } from "./diagrama.js";

const $ = id => document.getElementById(id);
const leer = k => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
const NOMBRE = c => String(c ?? "").replaceAll("_", " ");
const QR_URL = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js";

const E = { ws: null, intentos: 0, autorizado: false, sala: null, recibido: 0, codigo: "", ultimaTele: 0,
            ultimoCtl: { c: null, t: 0 }, histIds: new Set(), histCargado: false, demo: null, qrDe: "" };

/* ============================ indicadores ============================ */
function led(id, texto, nivel) { const l = $(id); l.dataset.n = nivel; l.querySelector("span").textContent = texto; }
async function vigilarApi() {
  try { const r = await obtenerJSON("/salud", { timeout: 5000 }); led("exApi", r?.estado === "ok" ? "API AWS · Disponible" : "API AWS · No disponible", r?.estado === "ok" ? "ok" : "mal"); }
  catch { led("exApi", "API AWS · No disponible", "mal"); }
}
function marcarRds(ok, e) {
  if (ok) led("exRds", "RDS · Disponible", "ok");
  else if (e?.tipo === "rds") led("exRds", "RDS · No disponible", "mal");
  else led("exRds", "RDS · Sin verificar", "espera");
}
function revisarEsp() {
  const vivo = Date.now() - E.ultimaTele < 12000;
  led("exEsp", vivo ? "ESP32 · En línea" : "ESP32 · Sin señal", vivo ? "ok" : "mal");
  estadoNodo("nEsp", vivo ? "ok" : "mal"); estadoNodo("nMot", vivo ? "" : "mal");
  if (!vivo) detalle("dEsp", "sin señal");
}

/* ============================ WebSocket (con espera progresiva) ============================ */
function conectar() {
  const ws = new WebSocket(`${API_BASE.replace(/^http/, "ws")}/ws/vehiculos/${VEHICULO}`);
  E.ws = window.EXPO.ws = ws;
  led("exWs", E.intentos ? "WebSocket · Reconectando" : "WebSocket · Conectando", E.intentos ? "mal" : "espera");
  ws.onopen = () => {
    const reconexion = E.intentos > 0; E.intentos = 0;
    led("exWs", "WebSocket · En línea", "ok"); estadoNodo("nApi", "ok");
    CANAL.dispatchEvent(new CustomEvent("abierto", { detail: { reconexion } }));
    const k = leer("iot_api_key");
    if (k) ws.send(JSON.stringify({ tipo: "auth", llave: k })); else pintarSala();
    cargarHistorial(false);
  };
  ws.onclose = e => {
    const espera = Math.min(8000, 1000 * 2 ** Math.min(E.intentos, 3)); E.intentos++;
    E.autorizado = false;
    led("exWs", E.intentos > 3 ? `WebSocket · Desconectado (reintento en ${espera / 1000} s)` : "WebSocket · Reconectando", "mal");
    estadoNodo("nApi", "mal");
    CANAL.dispatchEvent(new CustomEvent("cerrado", { detail: { codigo: e.code, espera } }));
    setTimeout(conectar, espera);
  };
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m && typeof m === "object") recibir(m); };
}
const enviar = m => { if (E.ws?.readyState === 1) { E.ws.send(JSON.stringify(m)); return true; } aviso("Sin conexión con el servidor"); return false; };
setInterval(() => { if (E.ws?.readyState === 1) E.ws.send(JSON.stringify({ tipo: "ping", p: performance.now() })); }, 5000);

/* ============================ mensajes ============================ */
function recibir(m) {
  if (m.id_vehiculo != null && m.id_vehiculo !== VEHICULO) return;     // otro vehículo
  switch (m.tipo) {
    case "auth":
      E.autorizado = !!m.ok; E.authFallo = !m.ok;
      if (m.ok) enviar({ tipo: "sala", accion: "ver" });   // cuenta como administrador presente y pide el código
      else { aviso("La llave no es válida."); pintarSala(); }
      break;
    case "estado_inicial":
      if (m.sala) estadoSala(m.sala);
      if (m.telemetria) telemetria(m.telemetria, false);
      if (m.estado?.comando) ultima(m.estado.comando, "estado guardado en RDS", aInstante(m.estado.fecha_actualizacion));
      break;
    case "sala": estadoSala(m); break;
    case "sala_admin": E.codigo = /^[A-Z0-9]{4}$/.test(m.codigo || "") ? m.codigo : ""; pintarSala(); break;
    case "control": alControl(m); break;
    case "movimiento": alMovimiento(m); break;
    case "demo_inicio": E.demo = { id: m.id_demo, total: m.total_movimientos }; detalle("dApi", `DEMO #${m.id_demo} en curso`); pulso("nApi", "demo"); break;
    case "demo_movimiento": alPasoDemo(m); break;
    case "demo_fin": case "demo_cancelada": case "demo_error":
      E.demo = null; detalle("dApi", "FastAPI · 21 APIs");
      ultima(`DEMO #${m.id_demo} ${{ demo_fin: "terminada", demo_cancelada: "cancelada", demo_error: "con error" }[m.tipo]}`, "", aInstante(m.timestamp));
      break;
    case "telemetria": telemetria(m, true); break;
    case "error": if (m.detalle) aviso(m.detalle); break;
    case "sala_error": if (m.detalle) aviso(m.detalle); break;
  }
}

/* ---------- animaciones según el evento ---------- */
function quien() {
  const s = E.sala;
  if (s?.abierta && s.turno && !s.pausada) return s.turno.nombre;
  return "administrador";
}
async function alControl(m) {
  if (typeof m.comando !== "string") return;
  const ahora = performance.now();
  const mismo = E.ultimoCtl.c === m.comando;
  if (mismo && ahora - E.ultimoCtl.t < 1200) return;      // el canal rápido renueva cada 250 ms: no se dibuja cada renovación
  E.ultimoCtl = { c: m.comando, t: ahora };
  const persona = quien();
  detalle("dCel", persona);
  ultima(m.comando, `${persona} · ${m.ms ? `pulso ${m.ms} ms` : "continuo"} · WSS`, aInstante(m.timestamp));
  pulso("nCel", "mov");
  await viajar("cCelApi", "mov", NOMBRE(m.comando));
  pulso("nApi", "mov");
  if (!mismo) programarHistorial(700);                     // el backend lo guarda en RDS en segundo plano
  await viajar("cApiEsp", "mov", NOMBRE(m.comando), 550);
  llegaAlEsp(m.comando);
}
async function alMovimiento(m) {
  if (typeof m.comando !== "string") return;
  detalle("dCel", m.origen || "cliente REST");
  ultima(m.comando, `${m.origen || "REST"} · POST /movimientos`, aInstante(m.timestamp));
  pulso("nCel", "mov");
  await viajar("cCelApi", "mov", `POST ${NOMBRE(m.comando)}`);
  pulso("nApi", "mov");
  programarHistorial(150);                                 // aquí el commit en RDS ya ocurrió antes del evento
  await viajar("cApiEsp", "mov", NOMBRE(m.comando), 550);
  llegaAlEsp(m.comando);
}
async function alPasoDemo(m) {
  if (typeof m.comando !== "string") return;
  E.demo = { id: m.id_demo, total: m.total_movimientos };
  detalle("dApi", `DEMO #${m.id_demo} · paso ${m.orden}/${m.total_movimientos ?? "?"}`);
  ultima(m.comando, `DEMO #${m.id_demo} · paso ${m.orden}/${m.total_movimientos ?? "?"} · no va al historial`, aInstante(m.timestamp));
  pulso("nApi", "demo");
  viajar("cApiRds", "demo", "UPDATE estado", 600).then(() => { pulso("nRds", "demo"); detalle("dRds", "estado ✓ · historial ✗"); });
  await viajar("cApiEsp", "demo", `${NOMBRE(m.comando)} · ${m.orden}/${m.total_movimientos ?? "?"}`, 600);
  llegaAlEsp(m.comando, "demo");
}
function llegaAlEsp(comando, clase = "mov") {
  const vivo = Date.now() - E.ultimaTele < 12000;
  if (vivo) {
    pulso("nEsp", clase); detalle("dEsp", `recibió ${NOMBRE(comando)}`);
    viajar("cEspMot", clase, NOMBRE(comando), 450).then(() => { pulso("nMot", clase); });
  } else {
    detalle("dEsp", "sin señal: no llegó");                // no se finge que el carro se movió
  }
}
function telemetria(t, animar) {
  E.ultimaTele = Date.now();
  revisarEsp();
  const rssi = Number.isFinite(t.rssi) ? `${t.rssi} dBm` : "";
  detalle("dEsp", rssi ? `Wi-Fi ${rssi}` : "en línea");
  if (animar) { viajar("cEspApi", "tele", rssi ? `♥ ${rssi}` : "♥", 700, { reversa: false }).then(() => pulso("nApi", "tele")); }
}

/* ============================ historial de RDS (REST) ============================ */
let tHist = null, enVuelo = false, otra = false;
function programarHistorial(ms) { clearTimeout(tHist); tHist = setTimeout(() => cargarHistorial(true), ms); }
async function cargarHistorial(animar, reintento = 1) {
  if (enVuelo) { otra = true; return; }
  enVuelo = true;
  try {
    const filas = await obtenerHistorial();
    marcarRds(true);
    const nuevas = E.histCargado ? filas.filter(f => !E.histIds.has(f.id)) : [];
    E.histIds = new Set(filas.map(f => f.id)); E.histCargado = true;
    pintarHistorial(filas, new Set(nuevas.map(f => f.id)));
    if (animar && nuevas.length) {
      for (const f of nuevas.slice(0, 3).reverse()) {
        await viajar("cApiRds", "rds", `INSERT #${f.id}`, 600);
        pulso("nRds", "rds"); detalle("dRds", `guardó ID ${f.id} · ${NOMBRE(f.comando)}`);
      }
    } else if (animar && !nuevas.length && reintento > 0) {
      setTimeout(() => cargarHistorial(true, reintento - 1), 1800);   // escritura en segundo plano: un reintento
    }
  } catch (e) { marcarRds(false, e); }
  finally {
    enVuelo = false;
    if (otra) { otra = false; cargarHistorial(animar, 0); }
  }
}
function pintarHistorial(filas, nuevas) {
  $("exHist").replaceChildren(...filas.slice(0, 5).map(f => {
    const li = document.createElement("li");
    if (nuevas.has(f.id)) li.className = "nuevo";
    const id = document.createElement("span"); id.className = "id"; id.textContent = `#${f.id}`;
    const c = document.createElement("b"); c.textContent = NOMBRE(f.comando);
    const t = document.createElement("time"); t.textContent = hora(f.instante);
    li.append(id, c, t); return li;
  }));
  if (!filas.length) { const li = document.createElement("li"); li.textContent = "Sin movimientos todavía"; $("exHist").append(li); }
}
function ultima(cmd, det, instante) {
  $("exUltCmd").textContent = NOMBRE(cmd);
  $("exUltDet").textContent = [det, instante ? hora(instante) : ""].filter(Boolean).join(" · ");
}

/* ============================ sala de turnos ============================ */
function estadoSala(s) {
  E.sala = { abierta: !!s.abierta, pausada: !!s.pausada, segundos: s.segundos, turno: s.turno || null, fila: Array.isArray(s.fila) ? s.fila : [] };
  E.recibido = performance.now();
  if (!E.sala.abierta) E.codigo = "";
  pintarSala();
}
const restan = () => { const t = E.sala?.turno; if (!t) return 0; return E.sala.pausada ? t.restan_ms : t.restan_ms - (performance.now() - E.recibido); };
const reloj = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

function pintarSala() {
  $("exSinLlave").hidden = !!leer("iot_api_key") && !E.authFallo;   // sin llave, o la llave fue rechazada
  const abierta = !!E.sala?.abierta && E.autorizado;
  $("exCerrada").hidden = !(E.autorizado && !E.sala?.abierta);
  $("exAbierta").hidden = !abierta;
  if (!abierta) return;
  if (!E.codigo) enviar({ tipo: "sala", accion: "ver" });
  $("exCodigo").textContent = E.codigo || "····";
  const liga = ligaSala();
  $("exLiga").textContent = liga.replace(/^https?:\/\//, "");
  if (E.codigo && E.qrDe !== liga) { E.qrDe = liga; pintarQR(liga); }
  const t = E.sala.turno;
  $("exTurnoNombre").textContent = t ? t.nombre : (E.sala.fila.length ? "Asignando…" : "Nadie todavía · ¡escanea!");
  $("exTurno").classList.toggle("pausada", E.sala.pausada);
  $("exPausa").textContent = E.sala.pausada ? "▶ Reanudar" : "⏸ Pausar";
  $("exPausa").dataset.acc = E.sala.pausada ? "reanudar" : "pausar";
  $("exFilaN").textContent = String(E.sala.fila.length);
  $("exFila").replaceChildren(...E.sala.fila.slice(0, 8).map((j, i) => {
    const li = document.createElement("li");
    const n = document.createElement("span"); n.textContent = `${i + 1}. ${j.nombre}`;
    const b = document.createElement("button"); b.type = "button"; b.className = "ex-x"; b.textContent = "✕";
    b.setAttribute("aria-label", `Sacar a ${j.nombre} de la fila`);
    b.addEventListener("click", () => enviar({ tipo: "sala", accion: "sacar", id: j.id }));
    li.append(n, b); return li;
  }), ...(E.sala.fila.length > 8 ? [Object.assign(document.createElement("li"), { textContent: `y ${E.sala.fila.length - 8} más…` })] : []));
  tic();
}
function tic() {
  const t = E.sala?.turno;
  if (!t || !E.sala.abierta) { $("exTurnoBarra").style.width = "0%"; $("exTurnoCrono").textContent = E.sala?.pausada ? "En pausa" : ""; return; }
  const r = restan();
  $("exTurnoBarra").style.width = `${Math.max(0, Math.min(100, (r / (t.total_ms || 1)) * 100))}%`;
  $("exTurnoCrono").textContent = E.sala.pausada ? `En pausa · ${reloj(r)}` : reloj(r);
}
setInterval(tic, 250);

const ligaSala = () => {
  const dir = location.pathname.replace(/expo\.html$/, "");
  return `${location.origin}${dir}${location.search}#sala=${E.codigo}`;
};
let qrLib = null;
const cargarQR = () => qrLib ||= new Promise((ok, mal) => {
  const s = document.createElement("script"); s.src = QR_URL; s.onload = () => ok(window.qrcode); s.onerror = () => { qrLib = null; mal(); };
  document.head.append(s);
});
async function pintarQR(texto) {
  try {
    const q = (await cargarQR())(0, "M"); q.addData(texto); q.make();
    $("exQR").innerHTML = q.createSvgTag({ cellSize: 8, margin: 2, scalable: true });   // SVG generado localmente, no viene del servidor
  } catch { $("exQR").textContent = "No cargó el QR: usa el código"; }
}

// botones de la sala
$("exTiempos").addEventListener("click", e => {
  const b = e.target.closest("button[data-s]"); if (!b) return;
  enviar({ tipo: "sala", accion: "abrir", segundos: Number(b.dataset.s) });
});
document.querySelector(".ex-ctrl").addEventListener("click", e => {
  const b = e.target.closest("button[data-acc]"); if (!b) return;
  const a = b.dataset.acc;
  if (a === "cerrar" && !b.dataset.seguro) {                     // doble toque, sin diálogos
    b.dataset.seguro = "1"; b.textContent = "¿Seguro? Toca otra vez";
    setTimeout(() => { delete b.dataset.seguro; b.textContent = "Cerrar sala"; }, 3000);
    return;
  }
  enviar({ tipo: "sala", accion: a, segundos: a === "mas" ? 30 : E.sala?.segundos || 60 });
});
$("exFormLlave").addEventListener("submit", e => {
  e.preventDefault();
  const k = $("exLlave").value.trim(); if (!k) return;
  try { localStorage.setItem("iot_api_key", k); } catch {}
  $("exLlave").value = ""; E.authFallo = false;
  if (E.ws?.readyState === 1) E.ws.send(JSON.stringify({ tipo: "auth", llave: k }));
  pintarSala();
});

let tAviso = null;
function aviso(t) { const a = $("exAviso"); a.textContent = t; clearTimeout(tAviso); tAviso = setTimeout(() => (a.textContent = ""), 5000); }

/* ============================ arranque ============================ */
const fReloj = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
setInterval(() => { $("exReloj").textContent = fReloj.format(new Date()); revisarEsp(); }, 1000);
$("exReloj").textContent = fReloj.format(new Date());
pintarSala();
revisarEsp();
vigilarApi(); setInterval(vigilarApi, 15000);
conectar();
// el diagnóstico de RDS se refresca con frecuencia moderada aunque nadie mueva el carro
setInterval(() => { if (document.visibilityState === "visible") cargarHistorial(false); }, 60000);
