/* =========================================================================
   Excavadora XR · arranque: página 2D (preparación / espectador) y sesiones WebXR
   vr.html                → preparación: llave, micrófono, entrar a realidad mixta o cabina VR
   vr.html?espectador     → pantalla para la tele de la expo: solo el gemelo en vivo
   vr.html?sim            → fuerza el simulador (no manda nada a la excavadora)
   ========================================================================= */
import * as THREE from "three";
import { crearMundo, moverGemelo, nuevoEstado, ARENA_Z } from "./mundo.js";
import { crearControlXR } from "./xr.js";
import * as E from "./enlace.js";
import { procesarFrase } from "./ordenes.js";
import { voz, empezar, terminar, prepararMicro, revisarServicio, servicioVoz } from "./voz.js";

const $ = id => document.getElementById(id);
const ESPECTADOR = new URLSearchParams(location.search).has("espectador");
if (ESPECTADOR) document.body.classList.add("espectador");

/* ---------------- render ---------------- */
const lienzo = $("lienzo");
const renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
renderer.xr.enabled = true; renderer.xr.setReferenceSpaceType("local-floor");
const camara = new THREE.PerspectiveCamera(60, 1, .05, 80); camara.position.set(0, 1.6, 0);
const mundo = crearMundo(); mundo.escena.add(camara);
let modo = "2d"; mundo.modo("2d");
function ajustar() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camara.aspect = w / h;
  // con el panel a la izquierda, el gemelo se recorre a la derecha para que no quede tapado
  if (!ESPECTADOR && w > 700) { camara.aspect = (w + 460) / h; camara.setViewOffset(w + 460, h, 0, 0, w, h); } else camara.clearViewOffset();
  camara.updateProjectionMatrix();
}
addEventListener("resize", ajustar); ajustar();

/* ---------------- gemelo ---------------- */
const gem = nuevoEstado();
const vivo = { c: null, hasta: 0 };
E.on("comando", ({ c, ms }) => {
  if (c === "DETENER") { vivo.c = null; return; }
  vivo.c = c; vivo.hasta = performance.now() + (ms > 0 ? ms : 1000);
});

/* ---------------- voz ---------------- */
let vozTxt = "";
async function hablar() {
  if (await empezar()) { vozTxt = "MIC: escuchando… suelta para mandar"; xr?.vibrarTodos(.2, 30); }
}
async function soltarHablar() {
  if (voz.estado !== "escuchando") return;
  vozTxt = "MIC: transcribiendo…";
  const t = await terminar();
  vozTxt = t ? "MIC: " + await procesarFrase(t) : "MIC: no escuché nada";
}

/* ---------------- controles XR ---------------- */
let xr = null;
try {
  xr = crearControlXR(renderer, mundo, { estadoGemelo: () => gem, alHablar: hablar, alSoltarHablar: soltarHablar,
    alCentrar: () => mundo.centrar(renderer.xr.getCamera()), modoActual: () => modo });
} catch (e) { console.warn("Controles XR no disponibles", e); }

async function entrar(tipo) {
  if (!navigator.xr) return;
  const mr = tipo === "mr";
  try {
    const s = await navigator.xr.requestSession(mr ? "immersive-ar" : "immersive-vr", {
      requiredFeatures: ["local-floor"], optionalFeatures: ["hand-tracking", "hit-test", "layers"] });
    modo = mr ? "mr" : "vr"; mundo.modo(modo);
    s.addEventListener("end", () => { xr?.soltarTodo(); E.alto(); modo = "2d"; mundo.modo("2d"); centrado = 0;
      mundo.puesto.position.set(0, 0, 0); mundo.puesto.rotation.set(0, 0, 0); });
    // si se quita las gafas o abre el menú del sistema: alto inmediato
    s.addEventListener("visibilitychange", () => { if (s.visibilityState !== "visible") { xr?.soltarTodo(); E.alto(); } });
    await renderer.xr.setSession(s);
    document.body.classList.add("en-xr"); s.addEventListener("end", () => document.body.classList.remove("en-xr"));
    xr?.pedirHitTests();
  } catch (e) { E.aviso("No se pudo entrar: " + (e.message || e)); pintar2D(); }
}
$("btnMR").addEventListener("click", () => entrar("mr"));
$("btnVR").addEventListener("click", () => entrar("vr"));
async function revisarXR() {
  const ok = async t => { try { return !!navigator.xr && await navigator.xr.isSessionSupported(t); } catch { return false; } };
  const [ar, vr] = await Promise.all([ok("immersive-ar"), ok("immersive-vr")]);
  $("btnMR").disabled = !ar; $("btnVR").disabled = !vr;
  $("sinXR").hidden = ar || vr;
}

/* ---------------- HUD ---------------- */
function datosHUD(salida) {
  const st = E.estado, ahora = performance.now(), sim = E.simulando();
  const mueve = !!vivo.c;
  const wsTxt = { en_linea: "NUBE EN LÍNEA", conectando: "CONECTANDO", reconectando: "RECONECTANDO", caido: "SIN ENLACE" }[st.ws];
  const chips = [[wsTxt, st.ws === "en_linea" ? true : st.ws === "caido" ? false : null],
    [E.espEnLinea() ? `ESP32 ${st.esp.rssi ?? ""} dBm` : "ESP32 FUERA", E.espEnLinea()]];
  if (st.ping != null && st.ws === "en_linea") chips.push([`${st.ping} ms`, st.ping < 250]);
  let sala = "";
  if (st.sala?.abierta) sala = st.sala.turno ? `SALA: turno de ${st.sala.turno.nombre}${st.sala.pausada ? " (pausada)" : ""}` : "SALA ABIERTA · sin turno";
  const plan = st.plan ? `PLAN ${st.plan.k + 1}/${st.plan.pasos.length}: ${E.ETIQUETA[st.plan.pasos[st.plan.k].comando] || ""}` : "";
  return {
    modo: (sim ? "SIMULADOR · " : "") + (modo === "mr" ? "REALIDAD MIXTA" : modo === "vr" ? "CABINA VR" : "ESPECTADOR"),
    comando: mueve ? (E.ETIQUETA[vivo.c] || vivo.c) : "DETENIDO", mueve,
    origen: mueve && salida?.origen ? "desde " + salida.origen : mueve && E.origenActual() ? "desde " + E.origenActual().toUpperCase() : "",
    chips, seguro: !!salida?.seguro, seguroTxt: salida?.seguroTxt || "",
    sala, plan, voz: vozTxt, aviso: st.avisoHasta > ahora ? st.aviso : "",
  };
}

/* ---------------- página 2D ---------------- */
const P2 = { ang: .6, arrastre: null };
lienzo.addEventListener("pointerdown", e => { P2.arrastre = { x: e.clientX, a: P2.ang }; lienzo.setPointerCapture(e.pointerId); });
lienzo.addEventListener("pointermove", e => { if (P2.arrastre) P2.ang = P2.arrastre.a - (e.clientX - P2.arrastre.x) / 200; });
lienzo.addEventListener("pointerup", () => { P2.arrastre = null; });
function camara2D(dt) {
  if (!P2.arrastre) P2.ang += dt * .08;
  const c = new THREE.Vector3(gem.x, 0, gem.z - ARENA_Z);
  const r = innerWidth < 700 ? 5.2 : 4.2;
  camara.position.set(c.x + Math.sin(P2.ang) * r, 2.3, c.z + Math.cos(P2.ang) * r); camara.lookAt(c.x, .4, c.z);
}
function pintar2D() {
  const d = datosHUD(null), st = E.estado;
  for (const id of ["estCmd", "estCmdEsp"]) { $(id).textContent = d.comando; $(id).classList.toggle("mueve", d.mueve); }
  $("estModo").textContent = E.simulando() ? "SIMULADOR (no mueve la excavadora)" : "CONTROL REAL";
  $("estModo").className = "insignia " + (E.simulando() ? "ambar" : "verde");
  $("chips").replaceChildren(...d.chips.map(([t, ok]) => {
    const s = document.createElement("span"); s.className = "chip " + (ok === true ? "ok" : ok === false ? "mal" : ""); s.textContent = t; return s;
  }));
  $("estAviso").textContent = d.aviso; $("estVoz").textContent = vozTxt;
  $("cajaLlave").classList.toggle("lista", !!E.llave() && !st.llaveMala);
  $("txtLlave").textContent = !E.llave() ? "Sin llave: solo simulador" : st.llaveMala ? "Llave inválida" : st.autorizado ? "Llave aceptada" : "Llave guardada";
}

// teclado (para probar en la compu): WASD orugas, flechas brazo, espacio STOP
const TECLAS = { w: "AVANZAR", s: "RETROCEDER", a: "GIRO_IZQUIERDA", d: "GIRO_DERECHA",
  arrowup: "PALA_ARRIBA", arrowdown: "PALA_ABAJO", arrowleft: "ROTACION_IZQUIERDA", arrowright: "ROTACION_DERECHA", q: "ROTACION_IZQUIERDA", e: "ROTACION_DERECHA" };
const teclas = new Set();
addEventListener("keydown", e => {
  if (e.target.matches("input") || ESPECTADOR) return;
  if (e.key === " ") { e.preventDefault(); teclas.clear(); E.alto(); return; }
  const c = TECLAS[e.key.toLowerCase()]; if (!c || e.repeat) return;
  e.preventDefault(); teclas.add(c); E.mantener(c, "manual");
});
addEventListener("keyup", e => {
  const c = TECLAS[e.key.toLowerCase()]; if (!c) return;
  teclas.delete(c);
  if (teclas.size) E.mantener([...teclas].pop(), "manual"); else if (E.origenActual() === "manual") E.soltar();
});
addEventListener("blur", () => { if (teclas.size) { teclas.clear(); E.soltar(); } });

// llave y micrófono
$("llave").value = E.llaveDeLiga || E.llave();
if (E.llaveDeLiga) E.aviso("La liga trae otra llave: revísala y oprime Guardar para usarla", 8000);
$("btnLlave").addEventListener("click", () => { E.guardar("iot_api_key", $("llave").value.trim()); E.reautenticar(); E.aviso("Llave guardada"); });
$("btnMic").addEventListener("click", async () => {
  const ok = await prepararMicro(); const s = await revisarServicio();
  $("btnMic").textContent = ok ? "🎙️ Micrófono listo" : "🎙️ Micrófono bloqueado";
  $("btnMic").classList.toggle("on", ok);
  $("txtMic").textContent = s === "nube" ? "Voz con OpenAI (API en AWS)" : s === "navegador" ? "Voz del navegador" : "Voz no configurada en la API todavía";
});
$("btnHablar").addEventListener("pointerdown", e => { e.preventDefault(); hablar(); });
["pointerup", "pointerleave", "pointercancel"].forEach(ev => $("btnHablar").addEventListener(ev, soltarHablar));
$("btnStop").addEventListener("click", () => { teclas.clear(); E.alto(); });
$("ligaEspectador").href = location.pathname + "?espectador";

/* ---------------- ciclo principal ---------------- */
let t0 = performance.now(), centrado = 0, ultimo2D = 0;
const ojo = new THREE.Vector3();
renderer.setAnimationLoop((ahora, frame) => {
  const dt = Math.min(.1, (ahora - t0) / 1000); t0 = ahora;
  if (vivo.c && ahora > vivo.hasta) vivo.c = null;
  if (vivo.c) moverGemelo(gem, vivo.c, dt);
  let salida = null;
  if (renderer.xr.isPresenting) {
    const camXR = renderer.xr.getCamera();
    if (centrado < 2) { centrado++; if (centrado === 2) mundo.centrar(camXR); }   // espera una pose válida
    salida = xr ? xr.cuadro(dt, frame) : null;
    mundo.pantalla.dibujar(datosHUD(salida));
    camXR.getWorldPosition(ojo);
  } else {
    camara2D(dt); camara.getWorldPosition(ojo);
    if (ahora - ultimo2D > 150) { ultimo2D = ahora; pintar2D(); }
  }
  mundo.actualizar(gem, vivo.c, E.ETIQUETA[vivo.c] || vivo.c || "", dt, ojo);
  renderer.render(mundo.escena, camara);
});

E.conectar(); revisarXR(); revisarServicio().then(s => { $("txtMic").textContent = s === "nube" ? "Voz con OpenAI (API en AWS)" : s === "navegador" ? "Voz del navegador (solo compu)" : "Voz no configurada en la API todavía"; });
window.XR_DEBUG = { E, gem, vivo, mundo };
