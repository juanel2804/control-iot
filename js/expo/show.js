/* =========================================================================
   Pantalla de la expo · SHOW (para impresionar y jugar con la excavadora REAL)
   🎙️ KAI narrador: comenta en vivo los turnos y movimientos reales, como partido.
   🏁 Carrera: pista física en la mesa. El cronómetro arranca con la primera orden de quien maneja;
      el juez (esta tablet) marca «Cono +3 s» y «META». Ranking del día guardado en este dispositivo.
   🎬 Modo SHOW: lanza una DEMO y la pantalla se pone de fiesta (luces, música, confeti y KAI animando)
      mientras dura la DEMO real (eventos demo_inicio … demo_fin del servidor).
   Todo reacciona a eventos reales del WebSocket; no se finge ningún movimiento.
   ========================================================================= */
import * as son from "../vr/sonido.js";

const $ = id => document.getElementById(id);
const leer = k => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
const NOMBRE = c => String(c ?? "").replaceAll("_", " ");
const azar = a => a[Math.floor(Math.random() * a.length)];
const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
const seg = s => s.toFixed(1).replace(".", ",");

/* ---------------- frases del narrador ---------------- */
const DICHO = {
  AVANZAR: ["¡{n} mete el acelerador!", "Avanza con todo {n}.", "¡Ahí va la máquina!"],
  RETROCEDER: ["Reversa con cuidado…", "{n} se echa para atrás.", "Bip, bip, bip: reversa."],
  GIRO_IZQUIERDA: ["Giro a la izquierda.", "¡Qué vuelta!"], GIRO_DERECHA: ["Giro a la derecha.", "¡Gira, gira!"],
  ROTACION_IZQUIERDA: ["La cabina rota a la izquierda.", "Mira cómo gira la torre."], ROTACION_DERECHA: ["Rota la cabina a la derecha.", "¡Vuelta de torre!"],
  PALA_ARRIBA: ["¡Arriba esa pala!", "Sube el brazo."], PALA_ABAJO: ["Pala abajo, a escarbar.", "Baja el brazo con precisión."],
  DETENER: ["¡Frenazo!", "Alto total.", "Se detiene en seco."],
};
const INVITA = ["¿Quién se anima? Escanea el código y maneja una excavadora real desde tu celular.",
  "La excavadora está lista. Escanea el QR y forma parte de la fila.",
  "Todo lo que ves viaja por la nube de Amazon hasta el ESP32. ¡Ven a manejarla!"];

export function crearShow({ E, enviar, aviso, API_BASE, VEHICULO }) {
  const S = { narrador: leer("expo_narrador") !== "0", carrera: leer("expo_carrera_on") === "1", sonido: false,
    turnoId: null, turnoNombre: "", avisado10: false, ultimoDicho: 0, ultimoCmd: null, ultimaActividad: performance.now(), demo: null, demos: [] };

  /* ---------------- voz: OpenAI (API en AWS, con la llave de la tablet) o la del navegador ---------------- */
  let hablando = false, audio = null, vozNube = null;
  const cache = new Map();
  async function vozAWS(texto) {
    const k = leer("iot_api_key"); if (!k || vozNube === false) throw new Error("sin voz nube");
    if (cache.has(texto)) return cache.get(texto);
    const r = await fetch(`${API_BASE}/vehiculos/${VEHICULO}/voz/habla`, { method: "POST", signal: AbortSignal.timeout(12000),
      headers: { "Content-Type": "application/json", "X-API-Key": k }, body: JSON.stringify({ texto }) });
    if (!r.ok) { if (r.status === 404 || r.status === 503) vozNube = false; throw new Error("tts " + r.status); }
    const url = URL.createObjectURL(await r.blob()); if (cache.size < 80) cache.set(texto, url); return url;
  }
  function vozNavegador(texto) {
    return new Promise(ok => {
      if (!window.speechSynthesis) return ok();
      const u = new SpeechSynthesisUtterance(texto); u.lang = "es-MX"; u.rate = 1.08;
      const v = speechSynthesis.getVoices().find(v => /^es(-|_)MX/i.test(v.lang)) || speechSynthesis.getVoices().find(v => /^es/i.test(v.lang)); if (v) u.voice = v;
      u.onend = u.onerror = () => ok(); speechSynthesis.speak(u); setTimeout(ok, 12000);
    });
  }
  /** prioridad alta interrumpe; baja se descarta si ya está hablando o habló hace muy poco. */
  async function decir(texto, alta = false) {
    if (!S.narrador || !S.sonido || !texto) return;
    const ahora = performance.now();
    if (!alta && (hablando || ahora - S.ultimoDicho < 4500)) return;
    if (alta) { audio?.pause(); try { speechSynthesis.cancel(); } catch {} }
    hablando = true; S.ultimoDicho = ahora;
    $("shNarra").textContent = "🎙️ " + texto;
    try {
      try { const url = await vozAWS(texto); audio = new Audio(url); await audio.play(); await new Promise(r => { audio.onended = audio.onerror = r; }); }
      catch { await vozNavegador(texto); }
    } finally { hablando = false; audio = null; }
  }
  const con = (frase, n) => frase.replaceAll("{n}", n || "el piloto");

  /* ---------------- carrera ---------------- */
  const C = { corredor: null, armada: false, corriendo: false, t0: 0, pen: 0, conos: 0, ultimo: null };
  const ranking = () => { try { return (JSON.parse(localStorage.getItem("expo_ranking") || "{}")[hoy()] || []); } catch { return []; } };
  function guardarRanking(lista) {
    let todo = {}; try { todo = JSON.parse(localStorage.getItem("expo_ranking") || "{}"); } catch {}
    todo[hoy()] = lista; try { localStorage.setItem("expo_ranking", JSON.stringify(todo)); } catch {}
  }
  function armar(nombre) {
    C.corredor = nombre; C.armada = true; C.corriendo = false; C.t0 = 0; C.pen = 0; C.conos = 0; C.ultimo = null;
    pintarCarrera();
  }
  function arrancar() {
    C.corriendo = true; C.armada = false; C.t0 = performance.now(); son.efecto.conteo(true);
    decir(`¡Arrancó ${C.corredor}! El cronómetro corre.`, true); pintarCarrera();
  }
  function tiempo() { return C.corriendo ? (performance.now() - C.t0) / 1000 + C.pen : 0; }
  function cono() {
    if (!C.corriendo) { aviso("La carrera no ha arrancado."); return; }
    C.pen += 3; C.conos++; son.efecto.golpe(.8); destello("rojo"); pintarCarrera();
    decir(azar([`¡Cono tirado! Más tres segundos para ${C.corredor}.`, "¡Uy, se llevó un cono! Tres segundos de castigo."]), true);
  }
  function meta() {
    if (!C.corriendo) { aviso("La carrera no ha arrancado."); return; }
    const t = Math.round(tiempo() * 10) / 10, lista = ranking(), antes = lista[0]?.t;
    C.corriendo = false; C.ultimo = { nombre: C.corredor, t, conos: C.conos };
    const yo = { nombre: C.corredor, t, conos: C.conos };
    lista.push(yo); lista.sort((a, b) => a.t - b.t); guardarRanking(lista.slice(0, 50));
    const lugar = lista.indexOf(yo) + 1;
    confeti(lugar === 1 ? 260 : 140); son.efecto.medalla();
    decir(lugar === 1 && antes != null ? `¡Nuevo récord del día! ${C.corredor} hizo ${seg(t)} segundos.`
      : lugar === 1 ? `¡${C.corredor} pone el primer tiempo del día: ${seg(t)} segundos!`
      : `${C.corredor} terminó en ${seg(t)} segundos. Queda en el lugar ${lugar}.`, true);
    pintarCarrera();
  }
  function noTermino(motivo) {
    if (!C.corriendo) return;
    C.corriendo = false; C.ultimo = { nombre: C.corredor, t: null };
    decir(`${motivo} ${C.corredor} no llegó a la meta. ¡Será la próxima!`, true); pintarCarrera();
  }
  function pintarCarrera() {
    $("shMarcador").hidden = !S.carrera; document.body.classList.toggle("carrera", S.carrera);   // el marcador toma el lugar del historial
    $("shCarreraBtn").classList.toggle("on", S.carrera);
    if (!S.carrera) return;
    $("shCorredor").textContent = C.corredor || "Esperando piloto…";
    $("shEstado").textContent = C.corriendo ? `conos ${C.conos} · +${C.pen} s` : C.armada ? "Listo: arranca con la primera orden"
      : C.ultimo ? (C.ultimo.t != null ? `Llegó: ${seg(C.ultimo.t)} s` : "No terminó") : "Abre un turno o toca «Nueva vuelta»";
    const lista = ranking().slice(0, 5);
    $("shRanking").replaceChildren(...(lista.length ? lista : [{ vacio: true }]).map((r, i) => {
      const li = document.createElement("li");
      if (r.vacio) { li.textContent = "Aún no hay tiempos hoy"; return li; }
      const a = document.createElement("span"); a.textContent = `${["🥇", "🥈", "🥉"][i] || i + 1 + "."} ${r.nombre}`;
      const b = document.createElement("b"); b.textContent = `${seg(r.t)} s`;
      li.append(a, b); return li;
    }));
  }
  setInterval(() => { if (S.carrera) $("shCrono").textContent = C.corriendo ? seg(tiempo()) : C.ultimo?.t != null && !C.armada ? seg(C.ultimo.t) : "0,0"; }, 100);

  /* ---------------- fiesta: luces y confeti ---------------- */
  const lienzo = $("shConfeti"), ctx = lienzo.getContext("2d"); let piezas = [], animando = false;
  function confeti(n = 160) {
    lienzo.width = innerWidth; lienzo.height = innerHeight;
    const colores = ["#ffd23e", "#ff3ec8", "#3ee6ff", "#39ff9a", "#ff6a00", "#ffffff"];
    for (let i = 0; i < n; i++) piezas.push({ x: innerWidth / 2 + (Math.random() - .5) * innerWidth * .6, y: innerHeight + 10, vx: (Math.random() - .5) * 9, vy: -12 - Math.random() * 10,
      r: Math.random() * 6.28, vr: (Math.random() - .5) * .3, w: 6 + Math.random() * 8, h: 4 + Math.random() * 6, c: colores[i % colores.length], vida: 1 });
    if (!animando) { animando = true; requestAnimationFrame(cuadro); }
  }
  function cuadro() {
    ctx.clearRect(0, 0, lienzo.width, lienzo.height);
    piezas = piezas.filter(p => p.vida > 0 && p.y < lienzo.height + 40);
    for (const p of piezas) {
      p.vy += .35; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr; if (p.vy > 0) p.vida -= .006;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.globalAlpha = Math.max(0, p.vida); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    }
    if (piezas.length) requestAnimationFrame(cuadro); else { animando = false; ctx.clearRect(0, 0, lienzo.width, lienzo.height); }
  }
  function destello(color = "") { const d = $("shDestello"); d.className = "sh-destello " + color; void d.offsetWidth; d.classList.add("va"); }
  function fiesta(on) {
    document.body.classList.toggle("fiesta", on);
    if (S.sonido) son.radio(on);
  }

  /* ---------------- modo SHOW: lanzar una DEMO ---------------- */
  async function cargarDemos() {
    try {
      const r = await fetch(`${API_BASE}/vehiculos/${VEHICULO}/demos`, { cache: "no-store", signal: AbortSignal.timeout(6000) });
      S.demos = (await r.json()).filter(d => d.activo);
    } catch { S.demos = []; }
    const sel = $("shDemo");
    sel.replaceChildren(...(S.demos.length ? S.demos : [{ id_demo: "", nombre: "Sin DEMO activas" }]).map(d => Object.assign(document.createElement("option"), { value: d.id_demo, textContent: d.nombre })));
  }
  function lanzarShow() {
    activarSonido();
    if (S.demo) { enviar({ tipo: "demo_cancelar" }); return; }              // si ya hay show, el botón lo para
    const id = Number($("shDemo").value);
    if (!id) { aviso("Crea una DEMO en Administración (Ajustes) para el show."); cargarDemos(); return; }
    const pasos = [3, 2, 1];
    $("shBanner").textContent = "3"; document.body.classList.add("cuenta");
    decir("¡Damas y caballeros! La excavadora de Juan va a dar un show. ¡Tres, dos, uno!", true);
    pasos.forEach((n, i) => setTimeout(() => { $("shBanner").textContent = String(n); son.efecto.conteo(); }, i * 900));
    setTimeout(() => { document.body.classList.remove("cuenta"); if (!enviar({ tipo: "demo", id })) fiesta(false); }, 2800);
  }

  /* ---------------- sonido (se activa con un toque: regla del navegador) ---------------- */
  function activarSonido() {
    son.desbloquear(); S.sonido = true;
    try { speechSynthesis.getVoices(); } catch {}
    $("shSonido").classList.add("on"); $("shSonido").textContent = "🔊 Sonido listo";
  }

  /* ---------------- eventos reales del servidor ---------------- */
  function evento(m) {
    const s = E.sala, t = s?.abierta ? s.turno : null;
    if (m.tipo === "estado_inicial") {          // al (re)conectar: ¿hay una DEMO corriendo? así el botón la puede parar
      S.demo = m.demo_en_ejecucion || null; $("shShowBtn").textContent = S.demo ? "⏹ Parar show" : "🎬 SHOW";
      if (!S.demo) fiesta(false);
    }
    if (m.tipo === "sala" || m.tipo === "estado_inicial") {
      const id = t ? `${t.id}:${t.total_ms}` : null;
      if (id !== S.turnoId) {
        if (C.corriendo) noTermino("¡Se acabó el turno!");
        const antes = S.turnoNombre; S.turnoId = id; S.turnoNombre = t?.nombre || ""; S.avisado10 = false;
        if (t) {
          if (S.carrera) armar(t.nombre);
          decir(azar([`¡Turno de ${t.nombre}! Tiene ${Math.round(t.total_ms / 1000)} segundos. ¡A ver qué tal maneja!`,
            `Sube a la cabina ${t.nombre}. ¡Mucha suerte!`, `¡Atención! Ahora maneja ${t.nombre}.`]), true);
        } else if (antes) decir(`¡Gran turno de ${antes}! Un aplauso.`, true);
        S.ultimaActividad = performance.now();
      }
    }
    if (m.tipo === "control" && typeof m.comando === "string") {
      const c = m.comando.toUpperCase(); S.ultimaActividad = performance.now();
      if (S.carrera && C.armada && c !== "DETENER" && (!t || !s.pausada)) arrancar();
      if (c !== S.ultimoCmd) { S.ultimoCmd = c; if (DICHO[c] && !C.corriendo) decir(con(azar(DICHO[c]), S.turnoNombre)); }
      if (c === "DETENER") destello();
    }
    if (m.tipo === "demo_inicio") {
      S.demo = m.id_demo; fiesta(true); confeti(120); $("shBanner").textContent = "🎬 SHOW";
      $("shShowBtn").textContent = "⏹ Parar show"; decir("¡Arranca el show! Música, maestro.", true);
    }
    if (m.tipo === "demo_movimiento" && typeof m.comando === "string") {
      $("shBanner").textContent = `🎬 ${NOMBRE(m.comando)} · ${m.orden}/${m.total_movimientos ?? "?"}`; destello("show");
    }
    if (["demo_fin", "demo_cancelada", "demo_error"].includes(m.tipo)) {
      const ok = m.tipo === "demo_fin"; S.demo = null; fiesta(false); $("shShowBtn").textContent = "🎬 SHOW";
      $("shBanner").textContent = "";
      if (ok) { confeti(280); son.efecto.medalla(); decir("¡Y eso fue todo! Un aplauso para la excavadora de Juan.", true); }
      else decir("Show detenido.", true);
    }
  }
  // últimos 10 segundos e invitaciones cuando no hay nadie
  setInterval(() => {
    const s = E.sala, t = s?.abierta ? s.turno : null;
    if (t && !s.pausada) {
      const r = (t.restan_ms - (performance.now() - E.recibido)) / 1000;
      if (r <= 10 && r > 1 && !S.avisado10) { S.avisado10 = true; son.efecto.conteo(); decir(C.corriendo ? "¡Diez segundos! ¡Llega a la meta!" : "¡Últimos diez segundos!", true); }
    }
    if (!t && !S.demo && performance.now() - S.ultimaActividad > 75000) { S.ultimaActividad = performance.now(); decir(azar(INVITA)); }
  }, 500);

  /* ---------------- botones ---------------- */
  $("shSonido").addEventListener("click", activarSonido);
  $("shNarrador").addEventListener("click", () => {
    activarSonido(); S.narrador = !S.narrador; try { localStorage.setItem("expo_narrador", S.narrador ? "1" : "0"); } catch {}
    $("shNarrador").classList.toggle("on", S.narrador); if (S.narrador) decir("Hola, soy KAI. Hoy les narro la excavadora en vivo.", true);
  });
  $("shCarreraBtn").addEventListener("click", () => {
    activarSonido(); S.carrera = !S.carrera; try { localStorage.setItem("expo_carrera_on", S.carrera ? "1" : "0"); } catch {}
    if (S.carrera) { armar(E.sala?.abierta && E.sala.turno ? E.sala.turno.nombre : "Invitado especial"); decir("¡Modo carrera! Del arranque a la meta, cada cono tirado suma tres segundos.", true); }
    else { C.corriendo = false; C.armada = false; }
    pintarCarrera();
  });
  $("shCono").addEventListener("click", cono);
  $("shMeta").addEventListener("click", meta);
  $("shVuelta").addEventListener("click", () => { if (!S.carrera) return; armar(C.corredor || E.sala?.turno?.nombre || "Invitado especial"); decir("Nueva vuelta. Arranca cuando quieras.", true); });
  $("shBorrar").addEventListener("click", e => {
    const b = e.currentTarget;
    if (!b.dataset.seguro) { b.dataset.seguro = "1"; b.textContent = "¿Borrar? Toca otra vez"; setTimeout(() => { delete b.dataset.seguro; b.textContent = "Borrar ranking"; }, 3000); return; }
    guardarRanking([]); delete b.dataset.seguro; b.textContent = "Borrar ranking"; pintarCarrera();
  });
  $("shShowBtn").addEventListener("click", lanzarShow);
  $("shMusica").addEventListener("click", () => { activarSonido(); $("shMusica").classList.toggle("on", son.radio()); });
  $("shNarrador").classList.toggle("on", S.narrador);
  addEventListener("pointerdown", () => son.desbloquear());

  cargarDemos(); pintarCarrera();
  return { evento, confeti, decir };
}
