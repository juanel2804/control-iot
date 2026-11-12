/* =========================================================================
   Sala de turnos (QR), panel del administrador y botón DEMOS — Excavadora de Juan
   Script clásico: se carga DESPUÉS del script de index.html y ANTES de arena.js (Arena envuelve lo de aquí,
   así el simulador sigue sin necesitar turno). Usa las globales de index.html: ws, autorizado, mandar,
   detenerTodo, pedirLlave, conectar, aviso, vibrar, leer, guardar, API_BASE, vehiculo, NUBE, $.
   Protocolo (vehiculo-iot-api/app/routers/ws.py):
     invitado → {"tipo":"unirse","nombre","ficha","codigo"} · {"tipo":"salir"} · "control" solo con turno
     admin    → {"tipo":"sala","accion":"ver|abrir|cerrar|config|pausar|reanudar|siguiente|mas|sacar|dar"}
     ambos    → {"tipo":"demo","id"} · {"tipo":"demo_cancelar"} (admin, o el invitado que tiene el turno)
   La llave NUNCA va en el QR: el QR solo lleva el código de la sala (#sala=ABCD).
   ========================================================================= */
(() => {
if (!NUBE) return;   // servida por el ESP32 (sin internet): no hay sala

const QR_URL = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sesion = {
  leer: k => { try { return sessionStorage.getItem(k) || ""; } catch { return ""; } },
  guardar: (k, v) => { try { v ? sessionStorage.setItem(k, v) : sessionStorage.removeItem(k); } catch {} },
};
const reloj = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

// El QR trae el código de la sala: se guarda en esta pestaña y se quita de la barra de direcciones
const enHash = location.hash.match(/^#sala=([A-Za-z0-9]{4})$/);
if (enHash) { sesion.guardar("sala_codigo", enHash[1].toUpperCase()); history.replaceState(null, "", location.pathname + location.search); }

// Ficha: secreto de este teléfono para recuperar su lugar si se corta la red (nunca se muestra)
let ficha = leer("sala_ficha", "");
if (!/^[A-Za-z0-9_-]{8,64}$/.test(ficha)) {
  const b = new Uint8Array(16); crypto.getRandomValues(b);
  ficha = [...b].map(x => x.toString(16).padStart(2, "0")).join(""); guardar("sala_ficha", ficha);
}

const SL = { codigo: sesion.leer("sala_codigo"), codigoMal: false, nombre: leer("sala_nombre", ""), yo: null, est: null,
  recibido: 0, adminCodigo: "", demos: null, demo: null, ultAviso: 0, html: "", mostrado: false };
const esInvitado = () => !autorizado && !leer("iot_api_key", "");
const lugar = () => SL.yo && SL.est ? SL.est.fila.findIndex(j => j.id === SL.yo) : -1;
const tengoTurno = () => !!(SL.yo && SL.est?.abierta && SL.est.turno?.id === SL.yo);
const miTurno = () => tengoTurno() && !SL.est.pausada;
const restan = () => { const t = SL.est?.turno; if (!t) return 0; return SL.est.pausada ? t.restan_ms : t.restan_ms - (performance.now() - SL.recibido); };
function enviar(m) {
  if (ws && ws.readyState === 1) { ws.send(JSON.stringify(m)); return true; }
  aviso("Sin enlace con el servidor"); return false;
}

/* ---------------------------- interfaz: pestaña, barra de turno, DEMOS ---------------------------- */
const sec = document.createElement("section"); sec.id = "vSala"; sec.hidden = true; $("vAjustes").before(sec);
const nb = document.createElement("button"); nb.dataset.v = "vSala"; nb.innerHTML = "<b>🎟️</b>Sala";
document.querySelector('nav button[data-v="vAjustes"]').before(nb);
nb.addEventListener("click", () => {   // index.html ya repartió sus listeners: este botón trae el suyo
  document.querySelectorAll("nav button").forEach(x => x.removeAttribute("aria-current")); nb.setAttribute("aria-current", "page");
  document.querySelectorAll("main section").forEach(s => s.hidden = s.id !== "vSala");
  apagarCamara(); apagarVoz(); apagarMapa();
  if (autorizado) enviar({ tipo: "sala", accion: "ver" });   // el admin recibe el código y cuenta como presente
  pintar(true);
});
const irA = v => document.querySelector(`nav button[data-v="${v}"]`).click();
if (esInvitado()) document.querySelector('nav button[data-v="vIA"]').hidden = true;   // el copiloto pide la llave

const barra = document.createElement("button"); barra.id = "salaBarra"; barra.className = "sala-barra"; barra.hidden = true;
barra.innerHTML = '<span class="sb-txt"></span><span class="sb-reloj"></span><i class="sb-prog"></i>';
document.querySelector("main").prepend(barra);
barra.addEventListener("click", () => irA("vSala"));

const bd = document.createElement("button"); bd.className = "grande sala-demosBtn"; bd.id = "btnDemos"; bd.textContent = "🎬 DEMOS";
document.querySelector("#vControl .hud .der").prepend(bd);
const hoja = document.createElement("div"); hoja.id = "hojaDemos"; hoja.className = "hoja"; hoja.hidden = true;
hoja.innerHTML = `<div class="hoja-caja vidrio">
  <div class="fila"><span class="sala-tit">🎬 DEMOS</span><button class="icono" data-cerrar aria-label="Cerrar">✕</button></div>
  <p class="nota" id="demosNota"></p><ul class="demos" id="demosLista"></ul>
  <button class="stop barra" id="demoCancelar" hidden>⏹ CANCELAR DEMO</button></div>`;
document.body.append(hoja);
bd.addEventListener("click", () => { hoja.hidden = false; SL.demos ? pintarDemos() : cargarDemos(); });
hoja.addEventListener("click", e => {
  if (e.target === hoja || e.target.closest("[data-cerrar]")) { hoja.hidden = true; return; }
  const b = e.target.closest("[data-demo]"); if (b) lanzarDemo(Number(b.dataset.demo));
});
$("demoCancelar").addEventListener("click", () => enviar({ tipo: "demo_cancelar" }));

async function cargarDemos() {
  $("demosNota").textContent = "Cargando…"; $("demosLista").innerHTML = "";
  try {
    const r = await fetch(`${API_BASE}/vehiculos/${vehiculo}/demos`, { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    SL.demos = (await r.json()).filter(d => d.activo);
  } catch {
    SL.demos = null; $("demosNota").textContent = "No se pudo leer la lista (¿API apagada?). Cierra y vuelve a tocar 🎬 DEMOS."; return;
  }
  pintarDemos();
}
const puedeDemo = () => autorizado || miTurno();
function pintarDemos() {
  if (!SL.demos) return;
  const puede = puedeDemo();
  $("demosNota").textContent = !SL.demos.length ? "Este vehículo no tiene DEMO activas."
    : SL.demo ? `Corriendo DEMO #${SL.demo.id} · paso ${SL.demo.paso} de ${SL.demo.total ?? "?"}`
    : puede ? "Toca ▶ para ejecutarla en la excavadora." : "Las DEMO se lanzan solo en tu turno.";
  $("demosLista").innerHTML = SL.demos.map(d => `<li class="${SL.demo?.id === d.id_demo ? "corre" : ""}">
    <div><b>${esc(d.nombre)}</b><span class="nota">${esc(d.descripcion || "")}</span></div>
    <button class="redondo primario" data-demo="${Number(d.id_demo)}" aria-label="Ejecutar ${esc(d.nombre)}" ${puede && !SL.demo ? "" : "disabled"}>▶</button></li>`).join("");
  $("demoCancelar").hidden = !(SL.demo && puede);
}
function lanzarDemo(id) {
  if (!puedeDemo()) { aviso(esInvitado() ? "Espera tu turno para lanzar una DEMO." : "Pon tu llave de control en Ajustes."); return; }
  detenerTodo(false);
  if (enviar({ tipo: "demo", id })) aviso("DEMO enviada…");
}

/* ---------------------------- pestaña Sala ---------------------------- */
const SEGS = [30, 60, 90, 120];
const botonesSeg = actual => SEGS.map(s => `<button data-acc="config" data-s="${s}" aria-pressed="${s === actual}">${s} s</button>`).join("");
const chipSenal = j => j.conectado ? "" : '<span class="chip mal">sin señal</span>';

function htmlAdmin(e) {
  const seg = e?.segundos || 60;
  if (!e?.abierta) return `<div class="vidrio tarjeta sala-hero">
    <div class="sala-tit">🎟️ SALA DE TURNOS</div>
    <p class="nota">Abre la sala y comparte el QR: tus compañeros juegan desde su cel, <b>uno a la vez</b> y con cronómetro.
      La llave de control no sale de tu teléfono.</p>
    <div class="fila sala-seg"><span class="nota">Tiempo por turno</span><div class="seg">${botonesSeg(seg)}</div></div>
    <button class="grande primario" data-acc="abrir">▶ ABRIR SALA</button></div>`;
  const t = e.turno;
  const turno = t
    ? `<div class="sala-turno${e.pausada ? " pausa" : ""}"><div><small>JUGANDO</small><b>${esc(t.nombre)}</b> ${chipSenal(t)}</div>
       <div class="sala-reloj" data-reloj></div><i class="sb-prog" data-prog></i></div>`
    : `<div class="sala-turno vacio"><div><small>JUGANDO</small><b>Nadie</b></div>
       <span class="nota">${e.fila.length ? "Esperando a que se conecte el siguiente" : "Esperando jugadores"}</span></div>`;
  const fila = e.fila.length ? e.fila.map((j, i) => `<li><span class="pos">${i + 1}</span><b>${esc(j.nombre)}</b>${chipSenal(j)}
      <button class="mini" data-acc="dar" data-id="${esc(j.id)}">▶ Turno</button>
      <button class="mini rojo" data-acc="sacar" data-id="${esc(j.id)}" aria-label="Sacar a ${esc(j.nombre)}">✕</button></li>`).join("")
    : '<li class="vacia">Nadie en la fila todavía.</li>';
  return `<div class="dosCol">
    <div class="vidrio tarjeta sala-qr"><div class="sala-tit">📲 ESCANEA Y JUEGA</div>
      <div class="qr" id="salaQR"></div>
      <div class="codigo">${esc(SL.adminCodigo || "····")}</div>
      <div class="fila sala-centro"><button class="mini" data-acc="copiar">📋 Copiar liga</button><button class="mini" data-acc="compartir">📤 Compartir</button></div>
      <p class="nota sala-centro">Sin QR: abren la página, pestaña 🎟️ Sala, y escriben el código.</p></div>
    <div class="vidrio tarjeta">
      ${turno}
      <div class="sala-acciones">
        <button class="grande" data-acc="siguiente" ${t ? "" : "disabled"}>⏭ Siguiente</button>
        <button class="grande" data-acc="mas" data-s="30" ${t ? "" : "disabled"}>＋30 s</button>
        <button class="grande${e.pausada ? " primario" : ""}" data-acc="${e.pausada ? "reanudar" : "pausar"}">${e.pausada ? "▶ Reanudar" : "⏸ Pausar"}</button>
      </div>
      <p class="nota">${e.pausada ? "En pausa: el reloj está congelado y tú tienes el control."
        : t ? "Mientras alguien juega, de tu control solo pasa el STOP. Pausa para tomar el mando." : "Sin turno activo: tú puedes mover."}</p>
      <div class="sala-sub">EN FILA · ${e.fila.length}</div><ul class="sala-fila">${fila}</ul>
      <div class="fila sala-seg"><span class="nota">Tiempo por turno</span><div class="seg">${botonesSeg(seg)}</div></div>
      <button class="grande sala-cerrar" data-acc="cerrar">Cerrar sala</button>
    </div></div>`;
}

function htmlInvitado(e) {
  if (SL.yo && e?.abierta) {
    const t = e.turno, i = lugar();
    const cab = tengoTurno()
      ? `<div class="sala-turno mio${e.pausada ? " pausa" : ""}"><div><small>${e.pausada ? "TURNO EN PAUSA" : "¡TU TURNO!"}</small><b>A jugar, ${esc(SL.nombre)}</b></div>
         <div class="sala-reloj" data-reloj></div><i class="sb-prog" data-prog></i></div>
         <button class="grande primario" data-acc="control">🎮 IR AL CONTROL</button>`
      : `<div class="sala-turno"><div><small>TU LUGAR</small><b>${i >= 0 ? "#" + (i + 1) : "—"}</b></div>
         <div><small>JUEGA</small><b>${t ? esc(t.nombre) : "nadie"}</b></div><div class="sala-reloj" data-reloj></div></div>`;
    const fila = e.fila.length ? e.fila.map((j, k) => `<li class="${j.id === SL.yo ? "yo" : ""}"><span class="pos">${k + 1}</span>
        <b>${esc(j.nombre)}</b>${j.id === SL.yo ? '<span class="chip">tú</span>' : ""}</li>`).join("")
      : '<li class="vacia">Nadie más en la fila.</li>';
    return `<div class="vidrio tarjeta">${cab}
      ${e.pausada ? '<p class="nota">⏸ El administrador pausó la sala; el reloj está congelado.</p>' : ""}
      <p class="nota">Cuando sea tu turno tu cel vibra y te lleva al control. Si se te corta la red, guardamos tu lugar unos segundos.</p>
      <div class="sala-sub">FILA</div><ul class="sala-fila">${fila}</ul>
      <button class="grande sala-cerrar" data-acc="salir">Salir de la sala</button></div>`;
  }
  const motivo = SL.codigo && e && !e.abierta ? "La sala está cerrada por ahora. Cuando el administrador la abra, entra desde aquí." : "";
  return `<div class="vidrio tarjeta sala-hero"><div class="sala-tit">🎟️ ÚNETE A LA SALA</div>
    <p class="nota">Manejas la excavadora real, <b>uno a la vez</b> y con cronómetro.</p>
    <label class="sala-campo"><span>Tu nombre</span>
      <input class="campo" id="salaNombre" maxlength="14" autocomplete="nickname" value="${esc(SL.nombre)}" placeholder="Ej. Ana"></label>
    <label class="sala-campo"${SL.codigo && !SL.codigoMal ? " hidden" : ""}><span>Código de la sala</span>
      <input class="campo codigo-in" id="salaCodigo" maxlength="4" autocomplete="off" autocapitalize="characters" value="${esc(SL.codigo)}" placeholder="ABCD"></label>
    ${motivo ? `<p class="nota">${motivo}</p>` : ""}
    <button class="grande primario" data-acc="unirse">ENTRAR A LA FILA</button>
    <p class="nota">¿Eres el administrador? Pon tu llave en <a href="#" data-acc="ajustes">⚙️ Ajustes</a>.</p></div>`;
}

function pintar(forzar = false) {
  pintarBarra();
  if (sec.hidden && !forzar) return;
  const h = autorizado ? htmlAdmin(SL.est) : htmlInvitado(SL.est);
  if (h === SL.html && !forzar) { tickReloj(); return; }
  const foco = document.activeElement?.id;
  SL.html = h; sec.innerHTML = h;
  if (foco === "salaNombre" || foco === "salaCodigo") { const i = $(foco); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
  if (autorizado && SL.est?.abierta && SL.adminCodigo) pintarQR($("salaQR"), ligaSala());
  tickReloj();
}

function pintarBarra() {
  const e = SL.est; barra.hidden = !e?.abierta;
  if (barra.hidden) return;
  const t = e.turno, i = lugar();
  barra.className = "sala-barra" + (tengoTurno() ? " mio" : "") + (e.pausada ? " pausa" : "");
  barra.querySelector(".sb-txt").textContent = e.pausada ? "⏸ Sala en pausa" + (t ? ` · ${t.nombre}` : "")
    : tengoTurno() ? "🎮 ¡TU TURNO!"
    : i >= 0 ? `En fila · lugar ${i + 1}` + (t ? ` · juega ${t.nombre}` : "")
    : t ? `Juega ${t.nombre}` + (e.fila.length ? ` · ${e.fila.length} en fila` : "")
    : autorizado ? `Sala abierta · ${e.fila.length} en fila` : "Sala abierta · toca para unirte";
}

function tickReloj() {
  const t = SL.est?.abierta && SL.est.turno, ms = restan();
  const txt = t ? reloj(ms) : "", pct = t && t.total_ms ? Math.max(0, Math.min(100, ms / t.total_ms * 100)) : 0;
  barra.querySelector(".sb-reloj").textContent = txt;
  document.querySelectorAll("#salaBarra .sb-prog, #vSala [data-prog]").forEach(p => p.style.width = pct + "%");
  sec.querySelectorAll("[data-reloj]").forEach(r => r.textContent = txt);
  barra.classList.toggle("urge", miTurno() && ms < 10000);
}
setInterval(tickReloj, 250);

sec.addEventListener("input", e => {
  if (e.target.id === "salaNombre") { SL.nombre = e.target.value; guardar("sala_nombre", SL.nombre.trim()); }
  if (e.target.id === "salaCodigo") SL.codigo = e.target.value.trim().toUpperCase();
});
sec.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches("#salaNombre, #salaCodigo")) unirse(); });
sec.addEventListener("click", e => {
  const b = e.target.closest("[data-acc]"); if (!b || b.disabled) return;
  e.preventDefault();
  const a = b.dataset.acc;
  if (a === "unirse") unirse();
  else if (a === "salir") salir();
  else if (a === "control") irA("vControl");
  else if (a === "ajustes") irA("vAjustes");
  else if (a === "copiar") copiar();
  else if (a === "compartir") compartir();
  else if (a === "cerrar" && !b.dataset.seguro) {           // dos toques: sin diálogos del navegador
    b.dataset.seguro = "1"; b.textContent = "¿Seguro? Toca otra vez para cerrar";
    setTimeout(() => { delete b.dataset.seguro; b.textContent = "Cerrar sala"; }, 3000);
  }
  else enviar({ tipo: "sala", accion: a, segundos: Number(b.dataset.s) || SL.est?.segundos || 60, id: b.dataset.id });
});

function unirse() {
  const n = SL.nombre.trim();
  if (!n) { aviso("Escribe tu nombre."); $("salaNombre")?.focus(); return; }
  if (!/^[A-Z0-9]{4}$/.test(SL.codigo)) { aviso("Escribe el código de 4 letras (viene en el QR)."); SL.codigoMal = true; pintar(true); return; }
  sesion.guardar("sala_codigo", SL.codigo); sesion.guardar("sala_fila", "1");
  enviar({ tipo: "unirse", nombre: n, ficha, codigo: SL.codigo });
}
function salir() {
  enviar({ tipo: "salir" }); SL.yo = null; sesion.guardar("sala_fila", ""); detenerTodo(false); pintar(true);
}

const ligaSala = () => `${location.origin}${location.pathname}${location.search}#sala=${SL.adminCodigo}`;
async function copiar() {
  try { await navigator.clipboard.writeText(ligaSala()); aviso("Liga copiada."); } catch { aviso(ligaSala()); }
}
async function compartir() {
  if (!navigator.share) return copiar();
  try { await navigator.share({ title: "Juega con la excavadora", text: `Sala ${SL.adminCodigo}: escanea y haz fila`, url: ligaSala() }); } catch {}
}
let qrLib = null;
const cargarQR = () => qrLib ||= new Promise((ok, mal) => {
  const s = document.createElement("script"); s.src = QR_URL; s.onload = () => ok(window.qrcode); s.onerror = () => { qrLib = null; mal(); };
  document.head.append(s);
});
async function pintarQR(el, texto) {
  if (!el) return;
  try {
    const q = (await cargarQR())(0, "M"); q.addData(texto); q.make();
    el.innerHTML = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  } catch { el.textContent = "Sin QR (no cargó la librería): usa Copiar liga."; }
}

function pitido() {
  try {
    const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain();
    o.type = "square"; o.frequency.value = 880; g.gain.setValueAtTime(.08, a.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, a.currentTime + .35);
    o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + .35); setTimeout(() => a.close(), 600);
  } catch {}
}

/* ---------------------------- mensajes del servidor ---------------------------- */
function estado(s) {
  const teniaTurno = tengoTurno(), podia = miTurno();
  SL.est = { abierta: !!s.abierta, pausada: !!s.pausada, segundos: s.segundos, admin: s.admin, turno: s.turno || null, fila: s.fila || [] };
  SL.recibido = performance.now();
  if (!SL.est.abierta) {
    if (SL.yo) aviso("El administrador cerró la sala.");
    SL.yo = null; SL.adminCodigo = ""; sesion.guardar("sala_fila", "");
  } else if (SL.yo && SL.est.turno?.id !== SL.yo && lugar() < 0) {   // ya no estoy: se acabó mi turno o me sacaron
    SL.yo = null; sesion.guardar("sala_fila", "");
    aviso(teniaTurno ? "¡Se acabó tu turno! Gracias por jugar 🙌" : "Ya no estás en la fila.");
  }
  if (tengoTurno() && !teniaTurno) {
    vibrar([80, 60, 80, 60, 220]); pitido();
    aviso(`🎮 ¡Tu turno, ${SL.nombre}! Tienes ${reloj(restan())}.`); irA("vControl");
  }
  if (podia && !miTurno()) detenerTodo(false);   // perdí el control (fin, pausa o cierre): que no siga renovando
  pintar();
  if (!hoja.hidden) pintarDemos();
}

function recibir(m) {
  switch (m.tipo) {
    case "estado_inicial":
      if (m.demo_en_ejecucion) SL.demo = { id: m.demo_en_ejecucion, paso: "…", total: null };
      if (m.sala) estado(m.sala);
      break;
    case "sala": estado(m); break;
    case "sala_admin": SL.adminCodigo = m.codigo || ""; pintar(); break;
    case "unido": SL.yo = m.id; SL.codigoMal = false; aviso(`¡Listo, ${m.nombre}! Estás en la sala.`); pintar(true); break;
    case "sala_error":
      aviso(m.detalle || "No se pudo entrar a la sala."); SL.yo = null;
      if (/código/i.test(m.detalle || "")) SL.codigoMal = true;
      if (/cerrada|sacó/i.test(m.detalle || "")) sesion.guardar("sala_fila", "");
      pintar(true); break;
    case "auth":
      if (m.ok) { if (SL.est?.abierta || !sec.hidden) enviar({ tipo: "sala", accion: "ver" }); pintar(true); }
      break;
    case "demo_inicio": SL.demo = { id: m.id_demo, paso: 0, total: m.total_movimientos }; pintarDemos(); break;
    case "demo_movimiento": if (SL.demo) { SL.demo.paso = m.orden; SL.demo.total = m.total_movimientos; pintarDemos(); } break;
    case "demo_fin": case "demo_cancelada": case "demo_error": SL.demo = null; pintarDemos(); break;
  }
}

function alAbrir() {   // al (re)conectar, el invitado recupera su lugar con la misma ficha
  if (esInvitado() && sesion.leer("sala_fila") && SL.codigo && SL.nombre.trim())
    ws.send(JSON.stringify({ tipo: "unirse", nombre: SL.nombre.trim(), ficha, codigo: SL.codigo }));
}
function envolver(s) {
  if (!s || s._sala) return;
  s._sala = true;
  const om = s.onmessage, oo = s.onopen;
  s.onmessage = e => { om && om.call(s, e); let m; try { m = JSON.parse(e.data); } catch { return; } recibir(m); };
  s.onopen = ev => { oo && oo.call(s, ev); alAbrir(); };
  if (s.readyState === 1) alAbrir();   // ya había abierto mientras se descargaba este archivo
}
const conectarBase = conectar;
conectar = () => { conectarBase(); envolver(ws); };
envolver(ws);

/* ---------------------------- desvíos del control ---------------------------- */
// El invitado (sin llave) manda "control" solo en su turno; el resto lo resuelve el servidor.
const mandarBase = mandar;
mandar = (c, ms) => {
  if (!esInvitado()) return mandarBase(c, ms);
  if (!ws || ws.readyState !== 1) { aviso("Sin enlace con el servidor"); return; }
  if (miTurno()) { ws.send(JSON.stringify({ tipo: "control", c, ms })); return; }
  if (c === "DETENER") return;
  const ahora = Date.now();
  if (ahora - SL.ultAviso > 2500) {
    SL.ultAviso = ahora;
    aviso(SL.yo ? (SL.est?.pausada ? "La sala está en pausa." : "Espera tu turno: estás en la fila.") : "Únete a la sala (🎟️ Sala) para jugar.");
  }
};
// Sin llave ya no se manda a Ajustes: al invitado se le lleva una vez a la Sala
const pedirLlaveBase = pedirLlave;
pedirLlave = () => {
  if (!esInvitado()) return pedirLlaveBase();
  if (!SL.yo && !SL.mostrado) { SL.mostrado = true; irA("vSala"); }
};
if (esInvitado() && document.querySelector('nav button[data-v="vAjustes"]').getAttribute("aria-current")) irA("vSala");

window.__sala = { SL, recibir, ligaSala };   // para pruebas
})();
