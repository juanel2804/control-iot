/* =========================================================================
   Excavadora XR · enlace con la nube (mismo protocolo que index.html)
   wss://<api>/ws/vehiculos/{id}:  {"tipo":"auth","llave"} → {"tipo":"control","c","ms"}
   ms = 0 → continuo (se renueva cada 250 ms; si deja de llegar, el ESP32 se detiene solo)
   ms > 0 → pulso exacto, cronometrado por el ESP32
   Sin enlace o sin llave → MODO SIMULADOR: los comandos solo mueven el gemelo 3D (plan B de la expo).
   ========================================================================= */
const API_PERMITIDAS = new Set(["https://100-63-187-92.sslip.io"]);
const API_DEFECTO = "https://100-63-187-92.sslip.io";
const qs = new URLSearchParams(location.search);

export function leer(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } }
export function guardar(k, v) { try { localStorage.setItem(k, v); } catch {} }

// Liga privada con la llave (#k=…): se borra de la barra (el # nunca llega al servidor).
// Solo se guarda si no había llave; si ya había otra, NO se reemplaza sola: queda en el campo para que la guardes tú.
export let llaveDeLiga = "";
if (location.hash.startsWith("#k=")) {
  try { llaveDeLiga = decodeURIComponent(location.hash.slice(3)).trim(); } catch {}
  history.replaceState(null, "", location.pathname + location.search);
  if (llaveDeLiga && !leer("iot_api_key", "")) { guardar("iot_api_key", llaveDeLiga); llaveDeLiga = ""; }
}

// Seguridad: ?api= solo acepta servidores de la lista (la llave no puede irse a otro dominio)
export const API_BASE = (() => { let a = null; try { a = new URL(qs.get("api") || "").origin; } catch {} return API_PERMITIDAS.has(a) ? a : API_DEFECTO; })();
export const vehiculo = Number(qs.get("v") || leer("iot_vehiculo", "1"));
export const SOLO_SIM = qs.has("sim");
export const RENOVAR_MS = 250;
export const llave = () => leer("iot_api_key", "");

export const CMDS = ["AVANZAR", "RETROCEDER", "GIRO_IZQUIERDA", "GIRO_DERECHA", "ROTACION_IZQUIERDA", "ROTACION_DERECHA",
  "PALA_ARRIBA", "PALA_ABAJO", "ENCENDER_APAGAR"];   // AUX_1..3 ocultos: no tienen nada conectado
export const ETIQUETA = { AVANZAR: "AVANZAR", RETROCEDER: "REVERSA", GIRO_IZQUIERDA: "GIRO IZQ.", GIRO_DERECHA: "GIRO DER.",
  ROTACION_IZQUIERDA: "CABINA IZQ.", ROTACION_DERECHA: "CABINA DER.", PALA_ARRIBA: "SUBIR PALA", PALA_ABAJO: "BAJAR PALA",
  ENCENDER_APAGAR: "PRENDER / APAGAR", DETENER: "DETENIDO" };

/* ---------------- estado compartido (lo pintan la pantalla del HUD y la página 2D) ---------------- */
export const estado = {
  ws: "conectando",          // conectando | en_linea | reconectando | caido
  autorizado: false, llaveMala: false,
  ping: null, esp: { ultima: 0, rssi: null, ip: null },
  api: null,                 // true | false | null (sin verificar)
  comando: "DETENER", comandoHasta: 0,
  sala: null, salaRecibida: 0, aviso: "", avisoHasta: 0,
  plan: null,                // { pasos, k } mientras corre un plan del copiloto
};
const bus = new EventTarget();
export const on = (tipo, f) => bus.addEventListener(tipo, e => f(e.detail));
const emitir = (tipo, d) => bus.dispatchEvent(new CustomEvent(tipo, { detail: d }));
export function aviso(t, ms = 4000) { estado.aviso = t; estado.avisoHasta = performance.now() + ms; emitir("aviso", t); }
export const simulando = () => SOLO_SIM || juego || !ws || ws.readyState !== 1 || !estado.autorizado;
/** Hay enlace real con la nube y la llave fue aceptada (aunque se esté jugando un reto). */
export const conNube = () => !SOLO_SIM && !!ws && ws.readyState === 1 && estado.autorizado;

/* ---------------- modo juego: retos y tutorial solo en el gemelo, nunca en la excavadora real ---------------- */
let juego = false, bloqueo = false, realHasta = 0;
export const enJuego = () => juego;
/** Al salir de un reto, las palancas/teclas sostenidas NO pasan a la real: hay que soltar todo primero. */
export const bloqueado = () => bloqueo;
export function liberarBloqueo() { bloqueo = false; }
export function modoJuego(v) {
  v = !!v; if (v === juego) return;
  // frena la real solo si ESTE control la estaba moviendo (incluye un pulso que aún corre): no estorba el turno de otro
  if (!juego && (mov.c || estado.plan || performance.now() < realHasta)) alto();
  juego = v; cancelarPlan(); cortarRenovar(); mov.c = null; mov.origen = null;
  if (!v) bloqueo = true;
  verComando("DETENER"); emitir("juego", v);
}
export const espEnLinea = () => Date.now() - estado.esp.ultima < 12000;

/* ---------------- WebSocket con reconexión 1, 2, 4 y luego cada 8 s ---------------- */
let ws = null, intentos = 0;
const salaLlego = m => { estado.sala = m; estado.salaRecibida = performance.now(); emitir("sala", m); };
export function conectar() {
  if (SOLO_SIM) { estado.ws = "caido"; return; }
  estado.ws = intentos ? "reconectando" : "conectando";
  try { ws = new WebSocket(`${API_BASE.replace(/^http/, "ws")}/ws/vehiculos/${vehiculo}`); }
  catch { programarReconexion(); return; }
  ws.onopen = () => {
    intentos = 0; estado.ws = "en_linea";
    const k = llave(); if (k) ws.send(JSON.stringify({ tipo: "auth", llave: k }));
  };
  ws.onclose = () => { estado.autorizado = false; cortarRenovar(); programarReconexion(); };
  ws.onmessage = e => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (!m || typeof m !== "object") return;
    switch (m.tipo) {
      case "pong": if (m.p != null) estado.ping = Math.round(performance.now() - m.p); break;
      case "auth": estado.autorizado = !!m.ok; estado.llaveMala = !m.ok; if (!m.ok) aviso("Llave inválida: el control queda en SIMULADOR"); break;
      case "estado_inicial":
        if (m.telemetria) tele(m.telemetria);
        if (m.sala) salaLlego(m.sala); break;
      // durante un reto el gemelo es solo del jugador: no lo mueven las órdenes de otros
      case "control": if (!juego) verComando(m.comando, m.ms); break;
      case "movimiento": if (!juego) verComando(m.comando, 0); break;
      case "demo_movimiento": if (!juego) verComando(m.comando, m.duracion_ms); break;
      case "telemetria": tele(m); break;
      case "sala": salaLlego(m); break;
      case "error": aviso(m.detalle || "Error del servidor"); emitir("rechazo", m.detalle); break;
    }
  };
}
function programarReconexion() {
  const espera = Math.min(8000, 1000 * 2 ** Math.min(intentos, 3)); intentos++;
  estado.ws = intentos > 3 || !navigator.onLine ? "caido" : "reconectando";
  setTimeout(conectar, espera);
}
function tele(t) { estado.esp = { ultima: Date.now(), rssi: t.rssi ?? estado.esp.rssi, ip: t.ip ?? estado.esp.ip }; }
export function reautenticar() { estado.llaveMala = false; if (ws && ws.readyState === 1) ws.send(JSON.stringify({ tipo: "auth", llave: llave() })); }

// el gemelo y el HUD siguen lo que de verdad pasó por el servidor (o el simulador)
function verComando(c, ms = 0) {
  if (!c) return;
  c = String(c).toUpperCase();
  estado.comando = c;
  estado.comandoHasta = c === "DETENER" ? 0 : performance.now() + (ms > 0 ? ms : 1000);
  emitir("comando", { c, ms });
}

setInterval(() => {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ tipo: "ping", p: performance.now() }));
}, 2000);
async function vigilarApi() {
  if (SOLO_SIM || document.hidden) return;
  const c = new AbortController(), t = setTimeout(() => c.abort(), 5000);
  try { const r = await fetch(API_BASE + "/salud", { signal: c.signal, cache: "no-store" }); estado.api = r.ok && (await r.json()).estado === "ok"; }
  catch { estado.api = false; } finally { clearTimeout(t); }
}
setInterval(vigilarApi, 15000); vigilarApi();

/* ---------------- motor de movimiento ---------------- */
// mov.origen: "manual" (palancas / sticks / teclado), "voz" o "plan" (copiloto)
const mov = { c: null, origen: null, renovar: null, tope: null };
let planId = 0;
function mandar(c, ms) {
  if (simulando()) { verComando(c, ms); return true; }
  ws.send(JSON.stringify({ tipo: "control", c, ms }));
  return true;
}
function cortarRenovar() { clearInterval(mov.renovar); clearTimeout(mov.tope); mov.renovar = null; mov.tope = null; }
export const actual = () => mov.c;
export const origenActual = () => mov.origen;

/** Movimiento continuo mientras se mantiene (se renueva cada 250 ms). */
let avisoBloqueo = 0;
export function mantener(c, origen = "manual", topeMs = 0) {
  if (mov.c === c && mov.origen === origen) return;
  if (bloqueo && origen === "manual") {
    if (performance.now() - avisoBloqueo > 3000) { avisoBloqueo = performance.now(); aviso("Suelta las palancas para retomar el control real", 3000); }
    return;
  }
  if (origen !== "plan") cancelarPlan();
  cortarRenovar();
  mov.c = c; mov.origen = origen;
  mandar(c, 0); mov.renovar = setInterval(() => mandar(c, 0), RENOVAR_MS);
  if (topeMs) mov.tope = setTimeout(() => { if (mov.c === c) soltar(); }, topeMs);   // tope de seguridad (voz)
  emitir("mueve", { c, origen });
}
/** Deja de mantener: manda DETENER. */
export function soltar() {
  if (!mov.c) return;
  cortarRenovar(); mov.c = null; mov.origen = null;
  mandar("DETENER", 0); emitir("mueve", { c: null });
}
/** Pulso exacto (lo cronometra el ESP32). */
export function pulso(c, ms, origen = "manual") {
  if (origen !== "plan") cancelarPlan();
  cortarRenovar(); mov.c = null; mov.origen = null;
  if (!simulando()) realHasta = performance.now() + ms;
  mandar(c, Math.round(ms));
}
/** STOP: siempre se manda, aunque no haya nada en movimiento. */
export function alto() {
  cancelarPlan(); cortarRenovar(); mov.c = null; mov.origen = null;
  if (juego && conNube()) { ws.send(JSON.stringify({ tipo: "control", c: "DETENER", ms: 0 })); verComando("DETENER", 0); }   // el STOP siempre llega a la real, aun en un reto
  else mandar("DETENER", 0);
  emitir("alto");
}
/** Frena solo el gemelo (retos y zona segura dentro de un reto). */
export function altoLocal() { cancelarPlan(); cortarRenovar(); mov.c = null; mov.origen = null; verComando("DETENER", 0); }

/* ---------------- planes del copiloto: paso por paso con pulsos ---------------- */
export function cancelarPlan() { if (estado.plan) { planId++; estado.plan = null; } }
export async function ejecutarPlan(pasos) {
  cancelarPlan(); const id = ++planId;
  estado.plan = { pasos, k: 0 };
  for (let k = 0; k < pasos.length; k++) {
    if (id !== planId) return false;
    estado.plan.k = k;
    const p = pasos[k];
    pulso(p.comando, p.duracion_ms, "plan");
    await new Promise(r => setTimeout(r, p.duracion_ms + 300));
  }
  if (id === planId) estado.plan = null;
  return true;
}
