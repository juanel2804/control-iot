/* =========================================================================
   Cabina · Excavadora de Juan: pantalla de arranque, telemetría real y sonidos de interfaz.
   Script clásico: va después del script de index.html y antes de sala.js y arena.js.
   No manda comandos: solo lee lo que la app ya sabe (ws, leds, tele, hud) y lo muestra.
   ========================================================================= */
(() => {
const sesion = {
  leer: k => { try { return sessionStorage.getItem(k) || ""; } catch { return ""; } },
  guardar: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} },
};

/* ---------------------------- sonidos (se pueden apagar en Ajustes) ---------------------------- */
let actx = null;
const sonidos = () => leer("sonidos", "1") === "1";
function audio() {
  if (!sonidos()) return null;
  try { actx ||= new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === "suspended") actx.resume(); return actx; } catch { return null; }
}
function tono(f0, f1, dur, tipo = "square", vol = .04, cuando = 0) {
  const a = audio(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + cuando;
  o.type = tipo; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + .02);
}
const SON = {
  toque: () => tono(520, 780, .06, "square", .03),
  listo: () => tono(660, 990, .09, "square", .03),
  paro: () => tono(220, 70, .22, "sawtooth", .07),
  motor: () => { tono(38, 96, 1.1, "sawtooth", .09); tono(76, 192, 1.1, "square", .025); tono(880, 1320, .12, "square", .03, .95); },
};
// solo toques reales de la persona (los cambios de pestaña automáticos no suenan)
document.querySelector("nav").addEventListener("click", e => { if (e.isTrusted && e.target.closest("button")) SON.toque(); });
document.querySelectorAll("[data-stop]").forEach(b => b.addEventListener("click", e => { if (e.isTrusted) SON.paro(); }));

/* ---------------------------- telemetría real bajo el tablero ---------------------------- */
const tira = document.createElement("div"); tira.className = "tele";
tira.innerHTML = `<div><small>Latencia</small><b id="tPing">—</b><canvas id="tGraf" aria-hidden="true"></canvas></div>
  <div><small>Señal</small><b id="tRssi">Apagada</b><span class="barras" aria-hidden="true"><i></i><i></i><i></i><i></i></span></div>
  <div><small>Sesión</small><b id="tSesion">00:00</b></div>
  <div><small>Órdenes</small><b id="tOrdenes">0</b></div>`;
document.querySelector("#vControl .hud").after(tira);

const pings = [], MUESTRAS = 30;
function grafica() {
  const c = $("tGraf"), w = c.clientWidth, h = c.clientHeight; if (!w) return;
  const d = window.devicePixelRatio || 1; c.width = w * d; c.height = h * d;
  const x = c.getContext("2d"); x.scale(d, d);
  const max = Math.max(150, ...pings), ancho = w / MUESTRAS;
  pings.forEach((p, i) => {
    const alto = Math.max(2, p / max * h);
    x.fillStyle = p < 120 ? "#b6ff3e" : p < 300 ? "#ffc400" : "#ff3b4e";
    x.fillRect((MUESTRAS - pings.length + i) * ancho, h - alto, Math.max(1, ancho - 1), alto);
  });
}
function ping(ms) {
  pings.push(ms); if (pings.length > MUESTRAS) pings.shift();
  const b = $("tPing"); b.textContent = `${ms} ms`; b.className = ms < 120 ? "bien" : ms < 300 ? "regular" : "mal";
  grafica();
}
function senal(rssi) {
  const b = $("tRssi"), viva = Number.isFinite(rssi);
  const n = !viva ? 0 : rssi > -55 ? 4 : rssi > -67 ? 3 : rssi > -75 ? 2 : rssi > -85 ? 1 : 0;
  b.textContent = viva ? `${rssi} dBm` : "Apagada"; b.className = !viva ? "" : n >= 3 ? "bien" : n === 2 ? "regular" : "mal";
  tira.querySelectorAll(".barras i").forEach((i, k) => i.classList.toggle("on", k < n));
}
const ledBase = led;
led = (id, txt, e) => {
  ledBase(id, txt, e);
  if (id === "ledPing") { const ms = parseInt(txt, 10); if (!Number.isNaN(ms)) ping(ms); }
  if (id === "ledEsp" && e === "mal") senal(null);
  if (id === "ledEnlace" && e === "mal") { $("tPing").textContent = "—"; $("tPing").className = ""; }
};
const teleBase = tele;
tele = d => { teleBase(d); senal(Number(d.rssi)); };
let ultimo = "DETENER", ordenes = 0;
const hudBase = hud;
hud = (c, ms = 0) => {
  hudBase(c, ms);
  if (c === ultimo) return;
  ultimo = c;
  const el = $("cmd"); el.classList.remove("golpe"); void el.offsetWidth; el.classList.add("golpe");
  if (c !== "DETENER") $("tOrdenes").textContent = ++ordenes;
};
const inicio = Date.now();
setInterval(() => {
  const s = Math.floor((Date.now() - inicio) / 1000), m = Math.floor(s / 60);
  $("tSesion").textContent = (m >= 60 ? `${Math.floor(m / 60)}:` : "") + `${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}, 1000);

/* ---------------------------- Ajustes: sonidos y repetir el arranque ---------------------------- */
const extra = document.createElement("div");
extra.innerHTML = `<label class="sw"><span><b>🔊 Sonidos de la cabina</b></span><input type="checkbox" id="swSonidos"></label>
  <button class="grande" id="btnIntro" style="min-height:42px;margin-top:8px">Ver el arranque otra vez</button>`;
$("instalarNota").before(extra);
$("swSonidos").checked = sonidos();
$("swSonidos").addEventListener("change", e => { guardar("sonidos", e.target.checked ? "1" : "0"); if (e.target.checked) SON.listo(); });
$("btnIntro").addEventListener("click", () => arranque());

/* ---------------------------- arranque: compuertas + revisión de sistemas ---------------------------- */
const pausa = ms => new Promise(r => setTimeout(r, ms));
// espera a que `cond` deje de dar null (true/false = ya se sabe) o a que pase el plazo
const saber = (cond, plazo) => new Promise(r => {
  const t0 = performance.now();
  (function ver() { const v = cond(); if (v != null || performance.now() - t0 >= plazo) r(v); else setTimeout(ver, 120); })();
});
const claseLed = id => { const c = $(id).classList; return c.contains("ok") ? true : c.contains("mal") ? false : null; };

function arranque() {
  if ($("intro")) return;
  const codigo = sesion.leer("sala_codigo"), conLlave = !!leer("iot_api_key", "");
  const el = document.createElement("div"); el.id = "intro"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Arranque de la estación de mando");
  el.innerHTML = `<div class="puerta a"></div><div class="puerta b"></div>
  <div class="consola">
    <svg class="maquina" viewBox="0 0 260 150" aria-hidden="true">
      <rect x="18" y="112" width="128" height="26" rx="13" pathLength="1"/>
      <circle cx="32" cy="125" r="6" pathLength="1"/><circle cx="57" cy="125" r="6" pathLength="1"/><circle cx="82" cy="125" r="6" pathLength="1"/>
      <circle cx="107" cy="125" r="6" pathLength="1"/><circle cx="132" cy="125" r="6" pathLength="1"/>
      <path d="M30 112V92h108v20M30 92V74h44" pathLength="1"/>
      <path class="t2" d="M74 92V56h36l14 36" pathLength="1"/><path class="t2" d="M82 64h24l9 22H82z" pathLength="1"/>
      <path class="t2" d="M124 90l52-62 10 8-48 56" pathLength="1"/>
      <path class="t3" d="M112 84l44-32" pathLength="1"/>
      <path class="t3" d="M180 30l46 54-9 6-41-50" pathLength="1"/>
      <path class="t3" d="M214 86l22 6-6 24-24-8zM206 108l-4 9M214 111l-3 9M222 114l-2 9" pathLength="1"/>
      <path class="hol" d="M4 144h252M150 144v-6M190 144v-6M230 144v-6" pathLength="1"/>
    </svg>
    <h1>EXCAVADORA</h1><div class="placa">JUAN</div>
    <p class="lema" id="introLema">Bienvenido a la estación de mando. Revisando sistemas…</p>
    <ul>
      <li data-k="enlace"><span>Enlace con el servidor</span><b>…</b></li>
      <li data-k="api"><span>API en AWS</span><b>…</b></li>
      <li data-k="maquina"><span>Excavadora</span><b>…</b></li>
      <li data-k="acceso"><span>Tu acceso</span><b>…</b></li>
    </ul>
    <div class="carga"><i></i></div>
    <button class="tomar" disabled>Revisando…</button>
    <button class="saltar">Saltar</button>
  </div>`;
  document.body.append(el);
  document.documentElement.classList.remove("arranque");

  let cerrado = false;
  const cerrar = conMotor => {
    if (cerrado) return; cerrado = true;
    sesion.guardar("intro_vista", "1");
    if (conMotor) SON.motor();
    el.classList.add("abre"); setTimeout(() => el.remove(), 820);
  };
  const tomar = el.querySelector(".tomar");
  tomar.addEventListener("click", () => cerrar(true));
  el.querySelector(".saltar").addEventListener("click", () => cerrar(false));

  // Las cuatro revisiones corren a la vez (son datos reales de la app) y se muestran en orden
  const revisiones = [
    ["enlace", saber(() => ws && ws.readyState === 1 ? true : null, 3000).then(ok => ok ? ["En línea", "bien"] : ["Sin enlace", "mal"])],
    ["api", !NUBE ? Promise.resolve(["Modo local", "medio"])
      : saber(() => claseLed("ledApi"), 4500).then(ok => ok ? ["Disponible", "bien"] : ["No responde", "mal"])],
    ["maquina", saber(() => claseLed("ledEsp"), 3000).then(ok => ok ? ["En línea", "bien"] : ["Apagada", "medio"])],
    ["acceso", saber(() => autorizado ? true : null, conLlave ? 2500 : 0)
      .then(ok => ok ? ["Administrador", "bien"] : codigo ? [`Invitado, sala ${codigo}`, "bien"] : ["Invitado", "medio"])],
  ];
  (async () => {
    const res = {};
    for (let i = 0; i < revisiones.length; i++) {
      const [k, promesa] = revisiones[i];
      const [[txt, clase]] = await Promise.all([promesa, pausa(330)]);
      if (cerrado) return;
      res[k] = clase;
      const li = el.querySelector(`li[data-k="${k}"]`); li.classList.add("visto", clase); li.querySelector("b").textContent = txt;
      el.querySelector(".carga i").style.width = `${(i + 1) / revisiones.length * 100}%`;
    }
    $("introLema").textContent = res.enlace === "mal" || res.api === "mal" ? "No hay enlace con AWS. Puedes entrar y practicar en el simulador de la Arena."
      : res.maquina !== "bien" ? "La excavadora está apagada. Puedes entrar y practicar en el simulador de la Arena."
      : autorizado ? "Bienvenido, Juan. Todos los sistemas responden." : "Bienvenido. Todos los sistemas responden: entra a la sala y espera tu turno.";
    tomar.disabled = false; tomar.textContent = autorizado ? "Tomar el mando" : "Entrar a la sala";
    tomar.focus({ preventScroll: true });
  })();
}

window.__gamer = { arranque, SON };
if (NUBE && !sesion.leer("intro_vista")) arranque();
else document.documentElement.classList.remove("arranque");
})();
