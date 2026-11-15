/* =========================================================================
   Arena · simulador 3D, misiones, figuras por voz, dibuja la ruta y modo baile.
   Solo frontend: usa los mismos comandos y el mismo WebSocket que el control.
   En «Simulador» ningún comando sale del teléfono: mandar() se desvía al gemelo.
   ========================================================================= */
(() => {
const AR = { fuente: leer("arFuente", "sim"), modo: leer("arModo", "mision"), e: { x: 0, z: 0, rumbo: 0, cabina: 0, pala: 15 },
  p: null, cargando: false, t: 0, mision: null, ultimo: null, sordoHasta: 0, rastro: 0, ultRastro: null };
const cal = { get g90() { return Number(leer("cal90", "1200")); }, get lado() { return Number(leer("calLado", "1500")); } };
const enArena = () => !$("vArena").hidden, simOn = () => enArena() && AR.fuente === "sim";
const seg = ms => (ms / 1000).toFixed(1);
const ajustarGemelo = () => { VEL3D.giro = 90000 / cal.g90; };   // el gemelo gira 90° en lo mismo que la excavadora calibrada

/* ---------------------------- interfaz ---------------------------- */
const css = document.createElement("style");
css.textContent = `
.arena3d { height:min(46vh, 360px); }
.arHud { position:absolute; right:10px; top:10px; text-align:right; font-size:12px; padding:6px 10px; border-radius:12px; background:rgba(4,8,16,.7); border:1px solid var(--borde); }
.arHud b { display:block; font-size:20px; font-variant-numeric:tabular-nums; color:var(--cian); }
.arObj { position:absolute; left:10px; right:10px; bottom:10px; font-size:13px; font-weight:700; text-align:center; padding:7px 10px; border-radius:12px; background:rgba(4,8,16,.7); border:1px solid var(--borde); }
.arFin { position:absolute; inset:0; display:grid; place-content:center; gap:8px; text-align:center; background:rgba(4,8,16,.82); backdrop-filter:blur(4px); }
.arFin .estrellas { font-size:38px; letter-spacing:6px; } .arFin .tiempo { font-size:30px; font-weight:900; color:var(--cian); }
.arPad { display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; margin-top:10px; }
.arPad .btn { min-height:54px; } .arPad .btn .num { display:none; }
.arLista { display:grid; gap:8px; margin-top:10px; }
.arLista button { display:flex; align-items:center; gap:10px; text-align:left; padding:10px 12px; border-radius:14px; border:1px solid var(--borde); background:var(--vidrio2); cursor:pointer; }
.arLista button[aria-pressed="true"] { border-color:var(--cian); box-shadow:0 0 14px rgba(62,230,255,.3); }
.arLista button > b { font-size:26px; } .arLista small { display:block; color:var(--suave); font-size:12px; }
.arLista .marca { margin-left:auto; color:var(--ambar); font-weight:800; white-space:nowrap; }
.arLienzo { display:block; width:100%; aspect-ratio:1; margin-top:10px; border-radius:14px; border:1px solid var(--borde); touch-action:none; cursor:crosshair;
  background:linear-gradient(rgba(62,230,255,.07) 1px, transparent 1px) 0 0/10% 10%, linear-gradient(90deg, rgba(62,230,255,.07) 1px, transparent 1px) 0 0/10% 10%, rgba(0,0,0,.3); }
.arRango { display:grid; grid-template-columns:1fr auto; gap:4px 10px; align-items:center; margin-top:10px; font-size:14px; }
.arRango input { grid-column:1 / -1; width:100%; accent-color:var(--cian); }
.arBeat { width:86px; height:86px; margin:14px auto 6px; border-radius:50%; display:grid; place-content:center; font-weight:900; font-size:20px; border:2px solid var(--borde); transition:transform .12s, box-shadow .12s; }
.arBeat.golpe { transform:scale(1.18); border-color:var(--cian); box-shadow:0 0 34px rgba(62,230,255,.6); }
@media (min-width: 760px) { .arenaCols { grid-template-columns:1.25fr 1fr; } }`;
document.head.append(css);

$("vArena").innerHTML = `
<div class="dosCol arenaCols">
  <div class="vidrio tarjeta">
    <div class="fila"><b>🕹️ Arena</b>
      <div class="seg" id="arFuente"><button data-v="sim">🎮 Simulador</button><button data-v="real">🚜 Excavadora real</button></div></div>
    <div class="escena arena3d" id="arena3d">
      <span class="etiqueta" id="arEtq">CARGANDO…</span>
      <div class="arHud" id="arHud" hidden><span id="arNom"></span><b id="arReloj">0.0 s</b></div>
      <div class="arObj" id="arObj" hidden></div>
      <div class="arFin" id="arFin" hidden></div>
    </div>
    <div class="arPad" id="arPad"></div>
    <div class="chat">
      <button class="redondo" id="arVoz" title="Hablar">🎤</button>
      <input class="campo" id="arTexto" placeholder="haz un cuadrado · estrella grande · repite eso 2 veces" enterkeyhint="send">
      <button class="redondo primario" id="arEnviar" title="Enviar">➤</button>
    </div>
    <p class="nota" id="arEco">Dile qué hacer o maneja con los botones. Teclado: W A S D, Q/E cabina, R/F pala, espacio = alto.</p>
    <div class="mapaBarra">
      <button class="grande" id="arCentro" style="flex:1;width:auto">⟲ Al centro</button>
      <button class="grande" id="arLimpia" style="flex:1;width:auto">🧹 Borrar rastro</button>
      <button class="stop barra" id="arStop" style="flex:1;width:auto">STOP</button>
    </div>
  </div>
  <div class="vidrio tarjeta">
    <div class="seg" id="arModo" style="flex-wrap:wrap"><button data-v="mision">🏁 Misiones</button><button data-v="dibuja">✍️ Dibuja</button><button data-v="baile">🎵 Baile</button><button data-v="cal">🧭 Calibrar</button></div>
    <div id="arPmision">
      <div class="chat"><input class="campo" id="arNombre" maxlength="14" placeholder="Tu nombre para el ranking"></div>
      <div class="arLista" id="arMisiones"></div>
      <p class="nota" id="arTop"></p>
    </div>
    <div id="arPdibuja" hidden>
      <p class="nota">Traza la ruta con el dedo. La excavadora empieza donde empiezas tú, <b>viendo hacia arriba</b>.</p>
      <canvas class="arLienzo" id="arLienzo" width="600" height="600"></canvas>
      <label class="arRango"><span>El lienzo completo equivale a</span><b id="arEscalaTxt"></b><input type="range" id="arEscala" min="3" max="20" step="1"></label>
      <p class="nota" id="arRuta">Sin ruta todavía.</p>
      <div class="mapaBarra"><button class="grande primario" id="arRecorrer" style="flex:2;width:auto">▶ Recorrer</button><button class="grande" id="arBorrar" style="flex:1;width:auto">🗑</button></div>
    </div>
    <div id="arPbaile" hidden>
      <div class="fila"><b>🎵 Baila al ritmo</b><div class="seg" id="arRitmo"><button data-v="mic">🎤 Micrófono</button><button data-v="metro">🥁 Metrónomo</button></div></div>
      <div class="arBeat" id="arBeat">—</div>
      <label class="arRango" id="arBpmCaja"><span>Ritmo del metrónomo</span><b id="arBpmTxt"></b><input type="range" id="arBpm" min="60" max="160" step="2"></label>
      <button class="grande primario" id="arBailar" style="margin-top:10px">▶ Empezar a bailar</button>
      <p class="nota">Con micrófono, pon música cerca del teléfono: cada golpe del bajo es un movimiento de pala, cabina o giro. Los movimientos van en pares, así que no se sale de su lugar.</p>
    </div>
    <div id="arPcal" hidden>
      <p class="nota">Las figuras salen <b>por tiempo</b> (la excavadora no tiene sensores de posición). Ajusta hasta que el giro real sea de 90°.</p>
      <label class="arRango"><span>Un giro de 90° tarda</span><b id="arG90Txt"></b><input type="range" id="arG90" min="300" max="4000" step="50"></label>
      <label class="arRango"><span>Un lado de figura dura</span><b id="arLadoTxt"></b><input type="range" id="arLado" min="500" max="5000" step="100"></label>
      <div class="mapaBarra"><button class="grande" id="arProbarGiro" style="flex:1;width:auto">↻ Probar 90°</button><button class="grande" id="arProbarCuad" style="flex:1;width:auto">◻ Probar cuadrado</button></div>
    </div>
  </div>
</div>`;

const eco = t => { $("arEco").textContent = t; };
[0, 1, 2, 3, 6, 7, 4, 5].forEach(i => { const [c, ico, txt] = CMDS[i]; $("arPad").append(crearBoton(c, ico, txt, i + 1)); });
$("arStop").addEventListener("click", () => detenerTodo());
segmento("arFuente", AR.fuente, v => { detenerTodo(false); AR.fuente = v; guardar("arFuente", v); pintarEtq();
  if (v === "real") aviso("Ahora los comandos SÍ mueven la excavadora real."); });
segmento("arModo", AR.modo, v => { AR.modo = v; guardar("arModo", v); pintarModoArena(); });
function pintarModoArena() {
  for (const m of ["mision", "dibuja", "baile", "cal"]) $("arP" + m).hidden = m !== AR.modo;
  if (AR.modo !== "baile") pararBaile();
  if (AR.modo !== "mision") dejarMision();
  if (AR.modo === "dibuja") pintarLienzo();
}
function pintarEtq() { const v = g3.vivo.c; $("arEtq").textContent = (AR.fuente === "sim" ? "SIMULADOR" : "GEMELO DE LA REAL") + (v ? " · " + (ETIQUETA[v] || v) : ""); }

/* ---------------------------- desvíos: todo lo que ya existía sirve aquí ---------------------------- */
const mandarReal = mandar;
mandar = (c, ms) => {                       // en Simulador el comando mueve solo el gemelo
  if (!simOn()) return mandarReal(c, ms);
  vivo3D(c, ms); $("cmd").textContent = ETIQUETA[c] || c; $("cmd").classList.toggle("mueve", c !== "DETENER");
};
const detenerReal = detenerTodo;
detenerTodo = (enviar = true) => {
  if (AR.cierreWs && simOn()) return;      // en Simulador, que se caiga el servidor no corta el juego
  pararBaile(); detenerReal(enviar); if (simOn()) vivo3D("DETENER", 0);
};
const envolverWs = s => { if (!s || s._arena) return; s._arena = true; const oc = s.onclose;
  s.onclose = ev => { AR.cierreWs = true; try { oc && oc.call(s, ev); } finally { AR.cierreWs = false; } }; };
const conectarReal = conectar;
conectar = () => { conectarReal(); envolverWs(ws); };
envolverWs(ws);
document.querySelectorAll("nav button").forEach(b => b.addEventListener("click", () => {
  const estaba = AR.dentro; AR.dentro = b.dataset.v === "vArena";
  if (AR.dentro) { iniciarArena(); pintarModoArena(); }
  else if (estaba) { pararBaile(); cancelarPlan(); pararRenovar(); dejarMision(); }   // un plan del simulador no debe seguir en la real
}));

/* ---------------------------- voz: órdenes completas y figuras ---------------------------- */
const giro = (grados, der = true) => P(der ? "GIRO_DERECHA" : "GIRO_IZQUIERDA", Math.round(Math.abs(grados) / 90 * cal.g90));
const A = ms => P("AVANZAR", Math.round(acotar(ms, 150, 10000)));
const veces = (n, f) => Array.from({ length: n }, (_, i) => f(i)).flat();
const poligono = (n, lado, der) => veces(n, () => [A(lado), giro(360 / n, der)]);
const FIGURAS = [
  [/cuadrad/, "Cuadrado", (L, d) => poligono(4, L, d)],
  [/triang/, "Triángulo", (L, d) => poligono(3, L, d)],
  [/rectang/, "Rectángulo", (L, d) => veces(2, () => [A(L * 1.6), giro(90, d), A(L * .8), giro(90, d)])],
  [/pentagon/, "Pentágono", (L, d) => poligono(5, L * .8, d)],
  [/hexagon/, "Hexágono", (L, d) => poligono(6, L * .7, d)],
  [/circul|redond|rueda/, "Círculo", (L, d) => poligono(12, L / 3, d)],
  [/estrella/, "Estrella", (L, d) => veces(5, () => [A(L * 1.3), giro(144, d)])],
  [/zig ?zag|culebr|serpient/, "Zigzag", (L, d) => [giro(45, d), ...veces(4, i => [A(L * .7), giro(90, i % 2 ? d : !d)]), giro(45, !d)]],
  [/\bocho\b|infinito/, "Ocho", (L, d) => [...poligono(10, L / 3, d), ...poligono(10, L / 3, !d)]],
  [/espiral|caracol/, "Espiral", (L, d) => veces(8, i => [A(L * (.3 + .2 * i)), giro(90, d)])],
  [/escalera/, "Escalera", (L, d) => veces(3, i => [A(L * .7), giro(90, d), A(L * .7), giro(90, !d)])],
  [/media vuelta/, "Media vuelta", (L, d) => [giro(180, d)]],
  [/vuelta en u|ida y vuelta/, "Ida y vuelta", (L, d) => [A(L), giro(180, d), A(L), giro(180, d)]],
];
function figura(texto) {
  const t = " " + sinAcentos(texto.toLowerCase()).replace(/[^a-z0-9ñ.,]+/g, " ") + " ";
  const der = !/\bizquierda\b/.test(t);
  let L = cal.lado * (/\b(grande|grandote|enorme)\b/.test(t) ? 1.7 : /\b(chico|chiquito|pequeno|mini)\b/.test(t) ? .6 : 1);
  const m = t.match(/\bde (\d+(?:[.,]\d+)?|un|uno|una|dos|tres|cuatro|cinco|seis) segundos?\b/);
  if (m) L = (NUM[m[1]] || parseFloat(m[1].replace(",", "."))) * 1000;
  const r = t.match(/\b(\d+|dos|tres|cuatro|cinco|seis) veces\b/), n = r ? acotar(NUM[r[1]] || Number(r[1]), 1, 6) : 1;
  let nombre = null, pasos = null;
  if (AR.ultimo && /\b(repite|repitelo|otra vez|de nuevo|lo mismo)\b/.test(t)) { nombre = "Lo mismo"; pasos = AR.ultimo; }
  else for (const [re, nom, f] of FIGURAS) if (re.test(t)) { nombre = nom; pasos = f(L, der); break; }
  if (!pasos) return null;
  pasos = veces(n, () => pasos).slice(0, 120);
  return { explicacion: `${nombre}${n > 1 ? ` × ${n}` : ""}: ${pasos.length} pasos, ${seg(pasos.reduce((s, p) => s + p.duracion_ms + 300, 0))} s.`, pasos };
}
function decir(t) {                         // la excavadora contesta; mientras habla no se escucha a sí misma
  if (!window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(t); u.lang = "es-MX"; u.rate = 1.1;
  AR.sordoHasta = performance.now() + 900 + t.length * 70; speechSynthesis.cancel(); speechSynthesis.speak(u);
}
const copilotoIA = copiloto;
copiloto = async texto => {
  texto = (texto || "").trim(); if (!texto) return;
  const f = figura(texto);
  if (!f && !enArena()) return copilotoIA(texto);
  const r = f || planLocal(texto);
  if (enArena()) {
    eco(`“${texto}” → ${r.explicacion}`);
    if (!r.pasos.length) return;
    AR.ultimo = r.pasos; decir(f ? "A la orden. " + r.explicacion.split(":")[0] : "A la orden"); ejecutarPlan(r.pasos);
  } else {
    $("quien").textContent = "COPILOTO · FIGURAS"; $("respuesta").textContent = r.explicacion; $("pasos").innerHTML = ""; cerrarPrevia();
    AR.ultimo = r.pasos; if ($("swPrevia").checked) mostrarPrevia(r.pasos); else ejecutarPlan(r.pasos);
  }
};
const fraseIA = frase;
frase = t => {
  if (performance.now() < AR.sordoHasta) return;
  const o = interpretar(t);
  if (o && o.c === "DETENER") return fraseIA(t);
  if (enArena()) return copiloto(t);
  if (!pendiente && figura(t)) { $("oido").textContent = `“${t}” → figura`; return copiloto(t); }
  fraseIA(t);
};
$("arVoz").addEventListener("click", () => { vozOn ? apagarVoz() : encenderVoz(); $("arVoz").classList.toggle("on", vozOn); if (vozOn) eco("Escuchando… di “haz un cuadrado”."); });
if (!Reconocedor) $("arVoz").disabled = true;
$("arEnviar").addEventListener("click", () => { copiloto($("arTexto").value); $("arTexto").value = ""; });
$("arTexto").addEventListener("keydown", e => { if (e.key === "Enter") { copiloto(e.target.value); e.target.value = ""; } });

/* ---------------------------- calibración ---------------------------- */
function rango(id, clave, valor, txt, cb) {
  const el = $(id); el.value = valor; const pinta = () => { $(id + "Txt").textContent = txt(el.value); };
  el.addEventListener("input", () => { guardar(clave, el.value); pinta(); if (cb) cb(); }); pinta();
}
rango("arG90", "cal90", cal.g90, v => `${seg(v)} s`, ajustarGemelo);
rango("arLado", "calLado", cal.lado, v => `${seg(v)} s`);
rango("arEscala", "arEscala", leer("arEscala", "8"), v => `${v} s de avance`, () => pintarLienzo());
rango("arBpm", "arBpm", leer("arBpm", "110"), v => `${v} BPM`, () => { if (baile.on && baile.fuente === "metro") { pararBaile(); empezarBaile(); } });
$("arProbarGiro").addEventListener("click", () => ejecutarPlan([giro(90)]));
$("arProbarCuad").addEventListener("click", () => copiloto("cuadrado"));
ajustarGemelo();

/* ---------------------------- dibuja y la sigue ---------------------------- */
const lz = { pts: [], ruta: [], pasos: [], trazando: false };
function simplificar(p, eps) {              // Ramer-Douglas-Peucker: deja solo las esquinas
  if (p.length < 3) return p;
  const a = p[0], b = p[p.length - 1], L = Math.hypot(b.x - a.x, b.y - a.y) || 1; let max = 0, k = 0;
  for (let i = 1; i < p.length - 1; i++) { const d = Math.abs((p[i].x - a.x) * (b.y - a.y) - (p[i].y - a.y) * (b.x - a.x)) / L; if (d > max) { max = d; k = i; } }
  return max > eps ? [...simplificar(p.slice(0, k + 1), eps).slice(0, -1), ...simplificar(p.slice(k), eps)] : [a, b];
}
function rutaAPlan(ruta, msLienzo) {        // puntos en 0..1 (y hacia abajo); la máquina empieza viendo hacia arriba
  const pasos = []; let rumbo = 0;
  for (let i = 1; i < ruta.length; i++) {
    const dx = ruta[i].x - ruta[i - 1].x, dy = ruta[i].y - ruta[i - 1].y, ms = Math.hypot(dx, dy) * msLienzo;
    if (ms < 150) continue;
    let d = Math.atan2(dx, -dy) * 180 / Math.PI - rumbo; d = ((d + 540) % 360) - 180;
    if (Math.abs(d) > 6) { pasos.push(giro(d, d > 0)); rumbo += d; }
    pasos.push(A(ms));
  }
  return pasos;
}
function pintarLienzo() {
  const c = $("arLienzo"), g = c.getContext("2d"), W = c.width; g.clearRect(0, 0, W, W); g.lineCap = g.lineJoin = "round";
  const traza = (p, color, ancho) => { if (p.length < 2) return; g.strokeStyle = color; g.lineWidth = ancho; g.beginPath(); p.forEach((q, i) => g[i ? "lineTo" : "moveTo"](q.x * W, q.y * W)); g.stroke(); };
  traza(lz.pts, "rgba(255,255,255,.25)", 5);
  lz.ruta = lz.trazando ? [] : simplificar(lz.pts, .035);
  traza(lz.ruta, "#3ee6ff", 4);
  lz.ruta.forEach((q, i) => { g.fillStyle = i ? "#a78bfa" : "#3dffa8"; g.beginPath(); g.arc(q.x * W, q.y * W, i ? 7 : 12, 0, 7); g.fill(); });
  lz.pasos = rutaAPlan(lz.ruta, Number($("arEscala").value) * 1000);
  $("arRuta").textContent = lz.pasos.length ? `${lz.pasos.length} pasos · ${seg(lz.pasos.reduce((s, p) => s + p.duracion_ms + 300, 0))} s en total.` : "Sin ruta todavía.";
}
{
  const c = $("arLienzo"), punto = e => { const r = c.getBoundingClientRect(); return { x: acotar((e.clientX - r.left) / r.width, 0, 1), y: acotar((e.clientY - r.top) / r.height, 0, 1) }; };
  c.addEventListener("pointerdown", e => { e.preventDefault(); c.setPointerCapture(e.pointerId); lz.trazando = true; lz.pts = [punto(e)]; pintarLienzo(); });
  c.addEventListener("pointermove", e => { if (lz.trazando) { lz.pts.push(punto(e)); pintarLienzo(); } });
  ["pointerup", "pointercancel"].forEach(ev => c.addEventListener(ev, () => { if (lz.trazando) { lz.trazando = false; pintarLienzo(); } }));
  $("arBorrar").addEventListener("click", () => { lz.pts = []; pintarLienzo(); });
  $("arRecorrer").addEventListener("click", () => {
    if (!lz.pasos.length) return aviso("Primero traza una ruta.");
    AR.ultimo = lz.pasos; eco(`Recorriendo tu dibujo: ${lz.pasos.length} pasos.`); decir("Voy a recorrer tu dibujo"); ejecutarPlan(lz.pasos);
  });
}

/* ---------------------------- modo baile ---------------------------- */
const PASOS_BAILE = ["PALA_ARRIBA", "PALA_ABAJO", "ROTACION_IZQUIERDA", "ROTACION_DERECHA", "PALA_ARRIBA", "PALA_ABAJO", "GIRO_IZQUIERDA", "GIRO_DERECHA"];
const baile = { on: false, fuente: leer("arRitmo", "metro"), k: 0, ms: 300, ctx: null, flujo: null, reloj: null, golpes: [] };
segmento("arRitmo", baile.fuente, v => { pararBaile(); baile.fuente = v; guardar("arRitmo", v); $("arBpmCaja").hidden = v !== "metro"; });
$("arBpmCaja").hidden = baile.fuente !== "metro";
function golpe(intervalo) {                 // cada golpe = un movimiento; el par siguiente dura lo mismo y lo regresa
  if (!baile.on) return;
  if (baile.k % 2 === 0) baile.ms = Math.round(acotar(intervalo * .55, 150, 450));
  mandar(PASOS_BAILE[baile.k++ % PASOS_BAILE.length], baile.ms);
  const ahora = performance.now(); baile.golpes.push(ahora); if (baile.golpes.length > 8) baile.golpes.shift();
  const n = baile.golpes.length, bpm = n > 3 ? Math.round(60000 * (n - 1) / (ahora - baile.golpes[0])) : 0;
  const b = $("arBeat"); b.textContent = bpm ? bpm : "♪"; b.classList.add("golpe"); setTimeout(() => b.classList.remove("golpe"), 110);
}
async function empezarBaile() {
  apagarVoz(); $("arVoz").classList.remove("on"); cancelarPlan(); pararRenovar();
  baile.on = true; baile.k = 0; baile.golpes = []; $("arBailar").textContent = "■ Parar"; $("arBailar").classList.add("on");
  if (baile.fuente === "metro") { const ms = 60000 / Number($("arBpm").value); baile.reloj = setInterval(() => golpe(ms), ms); return; }
  try {
    baile.flujo = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    baile.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const an = baile.ctx.createAnalyser(); an.fftSize = 1024; an.smoothingTimeConstant = .4; baile.ctx.createMediaStreamSource(baile.flujo).connect(an);
    const d = new Uint8Array(an.frequencyBinCount); let prom = 0, ult = 0;
    const lazo = () => {
      if (!baile.on) return;
      an.getByteFrequencyData(d); let s = 0; for (let i = 1; i < 8; i++) s += d[i]; s /= 7;       // graves (≈ 40–330 Hz): bombo y bajo
      const ahora = performance.now();
      if (s > 70 && s > prom * 1.3 && ahora - ult > 300) { golpe(ult ? ahora - ult : 500); ult = ahora; }
      prom = prom * .92 + s * .08; requestAnimationFrame(lazo);
    };
    lazo();
  } catch { pararBaile(); aviso("Permite el micrófono o usa el metrónomo."); }
}
function pararBaile() {
  if (!baile.on) return; baile.on = false; clearInterval(baile.reloj);
  if (baile.flujo) baile.flujo.getTracks().forEach(t => t.stop()); if (baile.ctx) baile.ctx.close().catch(() => {});
  baile.flujo = baile.ctx = null; $("arBailar").textContent = "▶ Empezar a bailar"; $("arBailar").classList.remove("on"); $("arBeat").textContent = "—";
  mandar("DETENER", 0);
}
$("arBailar").addEventListener("click", () => baile.on ? pararBaile() : empezarBaile());

/* ---------------------------- misiones ---------------------------- */
const MISIONES = [
  { id: "slalom", ico: "🚧", nombre: "Slalom", desc: "Pasa por los 5 aros en orden.", oro: 32, plata: 46, inicio: [0, -3.4, 0],
    aros: [[.7, -2.2], [-.7, -1.1], [.7, 0], [-.7, 1.1], [.7, 2.2]] },
  { id: "cajon", ico: "🅿️", nombre: "Estaciónate", desc: "Métete al cajón viendo hacia la flecha y quédate quieto.", oro: 20, plata: 30, inicio: [-2, -2, 0],
    cajon: [1.6, 1.4, Math.PI / 2] },
  { id: "camion", ico: "🚛", nombre: "Llena el camión", desc: "Baja la pala en la tierra y súbela junto al camión. 2 cargas.", oro: 55, plata: 80, inicio: [0, -2.2, 0],
    tierra: [-1.7, .6], camion: [1.9, .6], cargas: 2 },
];
const rank = () => JSON.parse(leer("arRank", "{}"));
const estrellas = (m, s) => s <= m.oro ? 3 : s <= m.plata ? 2 : 1;
$("arNombre").value = leer("arNombre", "");
$("arNombre").addEventListener("input", e => guardar("arNombre", e.target.value.trim()));
function pintarMisiones() {
  const r = rank(), caja = $("arMisiones"); caja.innerHTML = "";
  for (const m of MISIONES) {
    const b = document.createElement("button"), mejor = (r[m.id] || [])[0];
    b.setAttribute("aria-pressed", String(AR.mision?.m === m));
    b.innerHTML = `<b>${m.ico}</b><span><strong></strong><small></small></span><span class="marca"></span>`;
    b.querySelector("strong").textContent = m.nombre; b.querySelector("small").textContent = `${m.desc} ⭐⭐⭐ en ${m.oro} s`;
    b.querySelector(".marca").textContent = mejor ? `${"⭐".repeat(estrellas(m, mejor.t))} ${mejor.t.toFixed(1)} s` : "Jugar ▶";
    b.addEventListener("click", () => empezarMision(m)); caja.append(b);
  }
  const m = AR.mision?.m, top = m ? (r[m.id] || []) : [];
  $("arTop").textContent = !m ? "Elige una misión. El reloj arranca con tu primer movimiento." :
    top.length ? `Ranking de ${m.nombre}: ` + top.map((x, i) => `${i + 1}. ${x.n} ${x.t.toFixed(1)} s`).join(" · ") : `Aún no hay marcas en ${m.nombre}.`;
}
function ponerEn([x, z, rumbo]) { Object.assign(AR.e, { x, z, rumbo, cabina: 0, pala: 15 }); borrarRastro(); }
function empezarMision(m) {
  detenerTodo(AR.fuente === "real"); iniciarArena();
  AR.mision = { m, k: 0, t0: 0, fin: false, quieto: 0, cargado: false, hechas: 0, obj: [] };
  ponerEn(m.inicio); $("arFin").hidden = true; $("arHud").hidden = $("arObj").hidden = false; $("arNom").textContent = m.nombre; $("arReloj").textContent = "0.0 s";
  armarMision(); pintarMisiones(); objetivo(m.desc);
  if (AR.fuente === "real") aviso("En la real, la posición del gemelo es estimada por tiempo.");
}
function dejarMision() {
  if (!AR.mision) return; AR.mision = null; $("arHud").hidden = $("arObj").hidden = $("arFin").hidden = true;
  if (AR.p) { AR.p.objetos.clear(); AR.p.carga.visible = false; } pintarMisiones();
}
const objetivo = t => { $("arObj").textContent = t; };
function terminarMision(s) {
  const ms = AR.mision, m = ms.m; ms.fin = true; detenerTodo(AR.fuente === "real");
  const r = rank(), n = estrellas(m, s), nombre = leer("arNombre", "") || "Anónimo";
  r[m.id] = [...(r[m.id] || []), { n: nombre, t: Math.round(s * 10) / 10, f: new Date().toISOString().slice(0, 10) }].sort((a, b) => a.t - b.t).slice(0, 5);
  guardar("arRank", JSON.stringify(r));
  const lugar = r[m.id].findIndex(x => x.n === nombre && Math.abs(x.t - s) < .06) + 1;
  const f = $("arFin"); f.hidden = false;
  f.innerHTML = `<div class="estrellas">${"⭐".repeat(n)}${"☆".repeat(3 - n)}</div><div class="tiempo">${s.toFixed(1)} s</div><div></div><button class="grande primario" style="width:auto;padding:0 22px">↻ Otra vez</button>`;
  f.children[2].textContent = lugar ? `${nombre}, quedaste en el lugar ${lugar} de este teléfono.` : "No entraste al top 5. ¡Otra vez!";
  f.lastChild.addEventListener("click", () => empezarMision(m));
  $("arObj").hidden = true; vibrar([60, 40, 60, 40, 160]); decir(`Misión cumplida en ${Math.round(s)} segundos`); pintarMisiones();
}
function armarMision() {
  if (!AR.p) return; const { T, objetos, M } = AR.p, ms = AR.mision; objetos.clear(); ms.obj = [];
  const aro = (x, z, r, color) => { const o = new T.Mesh(new T.TorusGeometry(r, .035, 8, 40), M(color, 1.2)); o.rotation.x = Math.PI / 2; o.position.set(x, .04, z); objetos.add(o); return o; };
  const caja = (w, h, d, color, x, y, z, brillo = 0) => { const o = new T.Mesh(new T.BoxGeometry(w, h, d), M(color, brillo)); o.position.set(x, y, z); objetos.add(o); return o; };
  const m = ms.m;
  if (m.aros) ms.obj = m.aros.map(([x, z]) => aro(x, z, .42, 0xa78bfa));
  if (m.cajon) { const [x, z, r] = m.cajon, g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = r; objetos.add(g);
    for (const s of [-1, 1]) { const l = new T.Mesh(new T.BoxGeometry(.04, .03, 1.5), M(0x3ee6ff, 1.2)); l.position.set(s * .6, .02, 0); g.add(l); }
    const f = new T.Mesh(new T.ConeGeometry(.16, .4, 3), M(0x3dffa8, 1)); f.rotation.x = Math.PI / 2; f.position.set(0, .05, .45); g.add(f); }
  if (m.tierra) { const o = new T.Mesh(new T.ConeGeometry(.55, .5, 9), M(0x8a5a2b)); o.position.set(m.tierra[0], .25, m.tierra[1]); objetos.add(o);
    ms.obj = [aro(m.tierra[0], m.tierra[1], .95, 0xffb547), aro(m.camion[0], m.camion[1], 1.05, 0x3ee6ff)];
    caja(.7, .5, 1.1, 0x3a4150, m.camion[0] + .25, .45, m.camion[1]); caja(.6, .55, .45, 0xff4d5e, m.camion[0] + .25, .5, m.camion[1] + .85);
    ms.pila = caja(.55, .01, .9, 0x8a5a2b, m.camion[0] + .25, .72, m.camion[1]); }
}
function tickMision(ahora, dt, moviendo) {
  const ms = AR.mision; if (!ms || ms.fin || !AR.p) return;
  if (!ms.t0) { if (!moviendo) return; ms.t0 = ahora; }
  const s = (ahora - ms.t0) / 1000, e = AR.e, m = ms.m, cerca = (x, z, r) => Math.hypot(e.x - x, e.z - z) < r;
  $("arReloj").textContent = s.toFixed(1) + " s";
  if (m.aros) {
    ms.obj.forEach((o, i) => { o.material.emissiveIntensity = i === ms.k ? 1.6 + Math.sin(ahora / 150) * .6 : .5; o.material.color.setHex(i < ms.k ? 0x3dffa8 : i === ms.k ? 0x3ee6ff : 0xa78bfa); o.material.emissive.copy(o.material.color); });
    const [x, z] = m.aros[ms.k];
    if (cerca(x, z, .42)) { ms.k++; vibrar(25); if (ms.k >= m.aros.length) return terminarMision(s); }
    objetivo(`Aro ${ms.k + 1} de ${m.aros.length}`);
  } else if (m.cajon) {
    const [x, z, r] = m.cajon, err = Math.abs(((e.rumbo - r) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI), dentro = cerca(x, z, .35), bien = dentro && err < .35;
    ms.quieto = bien && !moviendo ? ms.quieto + dt : 0;
    objetivo(bien ? (moviendo ? "¡Ahí! Suelta y quédate quieto." : "Quieto…") : dentro ? "Endereza hacia la flecha." : "Métete al cajón.");
    if (ms.quieto > 1) terminarMision(s - 1);
  } else if (m.tierra) {
    if (!ms.cargado && cerca(...m.tierra, .95) && e.pala <= -18) { ms.cargado = true; vibrar(40); }
    if (ms.cargado && cerca(...m.camion, 1.05) && e.pala >= 45) { ms.cargado = false; ms.hechas++; vibrar([30, 30, 30]); ms.pila.scale.y = 1 + ms.hechas * 14; ms.pila.position.y = .72 + ms.hechas * .07;
      if (ms.hechas >= m.cargas) return terminarMision(s); }
    AR.p.carga.visible = ms.cargado;
    objetivo(ms.cargado ? `Carga ${ms.hechas + 1}/${m.cargas}: llévala al camión y SUBE la pala.` : `Carga ${ms.hechas + 1}/${m.cargas}: ve a la tierra y BAJA la pala.`);
  }
}

/* ---------------------------- escena 3D ---------------------------- */
const RASTRO_MAX = 3000;
function borrarRastro() { AR.rastro = 0; AR.ultRastro = null; if (AR.p) AR.p.rastro.geometry.setDrawRange(0, 0); }
$("arCentro").addEventListener("click", () => { detenerTodo(AR.fuente === "real"); if (AR.mision) empezarMision(AR.mision.m); else ponerEn([0, 0, 0]); });
$("arLimpia").addEventListener("click", borrarRastro);
async function iniciarArena() {
  if (AR.p || AR.cargando) return; AR.cargando = true;
  try {
    const T = await import(THREE_URL), caja = $("arena3d");
    const ren = new T.WebGLRenderer({ antialias: true, alpha: true }); ren.setPixelRatio(Math.min(2, devicePixelRatio || 1)); caja.prepend(ren.domElement);
    const esc = new T.Scene(), cam = new T.PerspectiveCamera(52, 1, .1, 80); esc.fog = new T.Fog(0x070a12, 8, 20);
    esc.add(new T.HemisphereLight(0xbfefff, 0x1a1030, 1.1));
    const sol = new T.DirectionalLight(0xffffff, 1.6); sol.position.set(3, 6, -2); esc.add(sol);
    const piso = new T.GridHelper(10, 20, 0x3ee6ff, 0x1c2a44); piso.material.transparent = true; piso.material.opacity = .4; esc.add(piso);
    const M = (color, brillo = 0) => new T.MeshStandardMaterial({ color, metalness: .35, roughness: .45, emissive: brillo ? color : 0, emissiveIntensity: brillo });
    const B = (w, h, d, m, x, y, z, padre) => { const o = new T.Mesh(new T.BoxGeometry(w, h, d), m); o.position.set(x, y, z); padre.add(o); return o; };
    for (const [w, d, x, z] of [[10.2, .08, 0, 5.05], [10.2, .08, 0, -5.05], [.08, 10.2, 5.05, 0], [.08, 10.2, -5.05, 0]]) B(w, .12, d, M(0xa78bfa, 1), x, .06, z, esc);   // barda
    const negro = M(0x1b1f27), amarillo = M(0xffb547), gris = M(0x3a4150), neon = M(0x3ee6ff, 1.4), vidrio = M(0x7fe6ff, .5);
    const maquina = new T.Group(); esc.add(maquina);
    for (const s of [-1, 1]) { B(.26, .2, 1.1, negro, s * .36, .1, 0, maquina); B(.02, .03, 1, neon, s * .5, .16, 0, maquina); }
    B(.56, .1, .66, gris, 0, .25, 0, maquina);
    const cabina = new T.Group(); cabina.position.y = .3; maquina.add(cabina);
    B(.72, .28, .78, amarillo, 0, .14, -.06, cabina); B(.3, .26, .3, vidrio, .17, .41, .12, cabina); B(.5, .05, .05, neon, 0, .2, -.46, cabina);
    const brazo = new T.Group(); brazo.position.set(-.12, .22, .3); cabina.add(brazo);
    B(.14, .14, .82, amarillo, 0, 0, .41, brazo); B(.38, .22, .2, gris, 0, -.08, .86, brazo); B(.36, .03, .03, neon, 0, .04, .97, brazo);
    const carga = B(.3, .16, .16, M(0x8a5a2b), 0, .08, .86, brazo); carga.visible = false;
    const geo = new T.BufferGeometry(); geo.setAttribute("position", new T.BufferAttribute(new Float32Array(RASTRO_MAX * 3), 3)); geo.setDrawRange(0, 0);
    const rastro = new T.Line(geo, new T.LineBasicMaterial({ color: 0x3dffa8 })); rastro.frustumCulled = false; esc.add(rastro);
    const objetos = new T.Group(); esc.add(objetos);
    AR.p = { T, ren, esc, cam, maquina, cabina, brazo, carga, rastro, objetos, M, ojo: new T.Vector3(0, 3, -4), mira: new T.Vector3() };
    new ResizeObserver(() => { const w = caja.clientWidth, h = caja.clientHeight; if (!w || !h) return; ren.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }).observe(caja);
    if (AR.mision) armarMision();
    AR.t = performance.now(); requestAnimationFrame(cuadroArena);
  } catch { $("arEtq").textContent = "EL 3D NECESITA INTERNET"; } finally { AR.cargando = false; }
}
function cuadroArena(ahora) {
  requestAnimationFrame(cuadroArena);
  const dt = Math.min(.1, (ahora - AR.t) / 1000); AR.t = ahora;
  if (!enArena()) return;
  const v = g3.vivo, e = AR.e; if (v.c && ahora > v.hasta) v.c = null;
  if (v.c) mover3D(e, v.c, dt);
  tickMision(ahora, dt, !!v.c);
  const { ren, esc, cam, maquina, cabina, brazo, rastro, ojo, mira } = AR.p, u = AR.ultRastro;
  if ((!u || Math.hypot(e.x - u[0], e.z - u[1]) > .04) && AR.rastro < RASTRO_MAX) {
    rastro.geometry.attributes.position.setXYZ(AR.rastro++, e.x, .03, e.z); rastro.geometry.attributes.position.needsUpdate = true; rastro.geometry.setDrawRange(0, AR.rastro); AR.ultRastro = [e.x, e.z];
  }
  maquina.position.set(e.x, 0, e.z); maquina.rotation.y = e.rumbo; cabina.rotation.y = e.cabina; brazo.rotation.x = -rad(e.pala);
  const sx = Math.sin(e.rumbo), cz = Math.cos(e.rumbo);                       // cámara de persecución: adelante siempre es arriba
  ojo.lerp(mira.set(e.x - sx * 2.5, 2.1, e.z - cz * 2.5), .07); cam.position.copy(ojo); cam.lookAt(mira.set(e.x + sx * .7, .3, e.z + cz * .7));
  pintarEtq(); ren.render(esc, cam);
}

pintarMisiones(); pintarModoArena();
window.__arena = { AR, figura, rutaAPlan, simplificar, MISIONES };   // para pruebas
})();
