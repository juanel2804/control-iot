/* =========================================================================
   Excavadora XR · KAI, el asistente holográfico de la cabina
   Un núcleo de luz con anillos, partículas y un ecualizador que se mueve con su voz (o con la tuya
   mientras escucha). Te da la bienvenida, avisa de lo importante y ejecuta lo que le pidas por voz.
   Tócalo (o apúntale y aprieta el gatillo) para hablarle; también sirve el botón B.
   Voz: OpenAI por la API (POST /vehiculos/{id}/voz/habla) y, si no está, la voz del navegador.
   ========================================================================= */
import * as THREE from "three";
import { API_BASE, vehiculo, llave, simulando } from "./enlace.js";

const COLOR = { lista: 0x3ee6ff, escucha: 0x39ff9a, piensa: 0xb06bff, habla: 0x6ff3ff, alerta: 0xff2a4a };
const ADITIVO = op => ({ transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false });

export function crearAsistente() {
  const g = new THREE.Group();
  const mats = [];                                           // materiales que cambian de color con el estado
  const M = (op, extra = {}) => { const m = new THREE.MeshBasicMaterial({ color: COLOR.lista, ...ADITIVO(op), ...extra }); mats.push(m); return m; };

  // emisor en el tablero y haz de luz
  const base = new THREE.Mesh(new THREE.CylinderGeometry(.045, .055, .014, 40), new THREE.MeshStandardMaterial({ color: 0x1a1d22, metalness: .8, roughness: .3 }));
  g.add(base);
  const aroBase = new THREE.Mesh(new THREE.RingGeometry(.036, .044, 48), M(.9, { side: THREE.DoubleSide })); aroBase.rotation.x = -Math.PI / 2; aroBase.position.y = .008; g.add(aroBase);
  const haz = new THREE.Mesh(new THREE.CylinderGeometry(.1, .035, .2, 40, 1, true), M(.07, { side: THREE.DoubleSide })); haz.position.y = .11; g.add(haz);

  // núcleo
  const nucleo = new THREE.Group(); nucleo.position.y = .22; g.add(nucleo);
  const esfera = new THREE.Mesh(new THREE.IcosahedronGeometry(.028, 3), M(.95)); nucleo.add(esfera);
  const brillo = new THREE.Mesh(new THREE.SphereGeometry(.05, 24, 16), M(.18)); nucleo.add(brillo);
  const red = new THREE.Mesh(new THREE.IcosahedronGeometry(.052, 1), M(.45, { wireframe: true })); nucleo.add(red);
  const anillos = [0, 1, 2].map(i => {
    const a = new THREE.Mesh(new THREE.TorusGeometry(.072 + i * .013, .0016, 6, 120), M(.75 - i * .15));
    a.rotation.set(Math.random() * 3, Math.random() * 3, 0); nucleo.add(a); return a;
  });
  const arco = new THREE.Mesh(new THREE.TorusGeometry(.112, .0028, 6, 80, Math.PI * .7),
    new THREE.MeshBasicMaterial({ color: 0xffa13d, ...ADITIVO(.85) })); nucleo.add(arco);
  // ecualizador: 48 barras en círculo
  const N = 48, barras = new THREE.InstancedMesh(new THREE.BoxGeometry(.004, .03, .004), M(.85), N);
  nucleo.add(barras);
  const dummy = new THREE.Object3D(), niveles = new Float32Array(N);
  // partículas
  const NP = 260, pos = new Float32Array(NP * 3), vel = new Float32Array(NP);
  for (let i = 0; i < NP; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * 7, r = .07 + Math.random() * .1, s = Math.sqrt(1 - u * u);
    pos.set([r * s * Math.cos(a), r * u, r * s * Math.sin(a)], i * 3); vel[i] = .3 + Math.random();
  }
  const gp = new THREE.BufferGeometry(); gp.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const matP = new THREE.PointsMaterial({ color: COLOR.lista, size: .004, ...ADITIVO(.9) }); mats.push(matP);
  const particulas = new THREE.Points(gp, matP); nucleo.add(particulas);

  // subtítulos holográficos
  const cv = document.createElement("canvas"); cv.width = 1024; cv.height = 300;
  const ctx = cv.getContext("2d"), tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(.42, .42 * 300 / 1024), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  panel.position.set(0, .4, 0); g.add(panel);
  // colisionador invisible para tocarlo
  const colisionador = new THREE.Mesh(new THREE.SphereGeometry(.09, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
  colisionador.position.y = .22; g.add(colisionador);

  const st = { estado: "lista", nivel: 0, t: 0, tu: "", kai: "Hola. Soy KAI.", sub: "" };
  function subtitulos() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = "rgba(4,14,26,.55)"; ctx.beginPath(); ctx.roundRect(4, 4, cv.width - 8, cv.height - 8, 30); ctx.fill();
    ctx.strokeStyle = "rgba(62,230,255,.6)"; ctx.lineWidth = 3; ctx.stroke();
    ctx.textBaseline = "top"; ctx.font = "800 30px system-ui, sans-serif"; ctx.fillStyle = "#3ee6ff";
    const etq = { lista: "K A I", escucha: "K A I · ESCUCHANDO", piensa: "K A I · PENSANDO", habla: "K A I", alerta: "K A I · ALERTA" }[st.estado];
    ctx.fillText(etq, 30, 22);
    let y = 70;
    const lineas = (txt, color, peso, px, max) => {
      ctx.fillStyle = color; ctx.font = `${peso} ${px}px system-ui, sans-serif`;
      const pal = txt.split(" "); let l = "", n = 0;
      for (const p of pal) { const prueba = l ? l + " " + p : p; if (ctx.measureText(prueba).width > cv.width - 60) { ctx.fillText(l, 30, y); y += px * 1.25; l = p; if (++n >= max) return; } else l = prueba; }
      if (l) { ctx.fillText(l, 30, y); y += px * 1.25; }
    };
    if (st.tu) lineas("TÚ: " + st.tu, "#b6ffd8", 600, 30, 1);
    lineas(st.kai, "#e8fbff", 700, 36, 4);
    tex.needsUpdate = true;
  }
  subtitulos();

  function estado(e) {
    if (st.estado === e) return; st.estado = e;
    mats.forEach(m => m.color.setHex(COLOR[e])); subtitulos();
  }

  /* ---------------- audio: voz de KAI y nivel del micrófono ---------------- */
  // dos analizadores: la voz de KAI va a las bocinas; el micrófono NO (si no, habría eco)
  let actx = null, anVoz = null, anMic = null, datos = null, fuenteMic = null, audioActual = null, speechOn = false;
  function desbloquear() {                                    // llamar dentro de un clic (gesto del usuario)
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch {}
    if (actx && !anVoz) {
      anVoz = actx.createAnalyser(); anVoz.fftSize = 256; anVoz.connect(actx.destination);
      anMic = actx.createAnalyser(); anMic.fftSize = 256; datos = new Uint8Array(anVoz.frequencyBinCount);
    }
  }
  function nivel(an) {
    if (!an) return 0; an.getByteFrequencyData(datos);
    let s = 0; for (let i = 2; i < 60; i++) s += datos[i]; return Math.min(1, s / (58 * 150));
  }
  function escucharMic(flujo) {
    desbloquear(); if (!actx || !flujo) return;
    try { fuenteMic?.disconnect(); fuenteMic = actx.createMediaStreamSource(flujo); fuenteMic.connect(anMic); } catch {}
  }
  function dejarMic() { try { fuenteMic?.disconnect(); } catch {} fuenteMic = null; }

  const cache = new Map();
  let vozNube = null;
  async function audioNube(texto) {
    if (cache.has(texto)) return cache.get(texto);
    const r = await fetch(`${API_BASE}/vehiculos/${vehiculo}/voz/habla`, { method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": llave() }, body: JSON.stringify({ texto }), signal: AbortSignal.timeout(15000) });
    if (!r.ok) { if (r.status === 503 || r.status === 404) vozNube = false; throw new Error("tts " + r.status); }
    const url = URL.createObjectURL(await r.blob()); if (cache.size < 60) cache.set(texto, url); return url;
  }
  function callar() {
    if (audioActual) { audioActual.pause(); audioActual = null; }
    if (speechOn) { try { speechSynthesis.cancel(); } catch {} speechOn = false; }
  }
  function vozNavegador(texto) {
    return new Promise(res => {
      if (!window.speechSynthesis) return res();
      const u = new SpeechSynthesisUtterance(texto); u.lang = "es-MX"; u.rate = 1.05; u.pitch = .9;
      const v = speechSynthesis.getVoices().find(v => /^es(-|_)MX/i.test(v.lang)) || speechSynthesis.getVoices().find(v => /^es/i.test(v.lang));
      if (v) u.voice = v;
      u.onend = u.onerror = () => { speechOn = false; res(); };
      speechOn = true; speechSynthesis.speak(u); setTimeout(res, 15000);
    });
  }
  let turno = 0;
  /** Dice una frase (interrumpe la anterior). alerta: anillo rojo mientras habla. */
  async function decir(texto, { alerta = false, tu = null } = {}) {
    if (!texto) return; const id = ++turno; callar();
    st.kai = texto; if (tu !== null) st.tu = tu; estado(alerta ? "alerta" : "habla"); subtitulos();
    try {
      const puedeNube = vozNube !== false && llave() && !simulando();
      if (puedeNube) {
        const url = await audioNube(texto); if (id !== turno) return;
        const a = new Audio(url); audioActual = a; desbloquear();
        try { if (actx && anVoz) actx.createMediaElementSource(a).connect(anVoz); } catch {}
        await a.play(); await new Promise(r => { a.onended = r; a.onerror = r; });
      } else await vozNavegador(texto);
    } catch { if (id === turno) await vozNavegador(texto); }
    if (id === turno) { audioActual = null; estado("lista"); }
  }

  /* ---------------- animación ---------------- */
  function actualizar(dt, ojo) {
    st.t += dt;
    const hablando = st.estado === "habla" || st.estado === "alerta";
    let n = 0;
    if (hablando) n = audioActual ? nivel(anVoz) : speechOn ? .35 + .3 * Math.abs(Math.sin(st.t * 11)) * Math.abs(Math.sin(st.t * 3.7)) : 0;
    else if (st.estado === "escucha") n = fuenteMic ? nivel(anMic) * 1.6 : .2;
    st.nivel += (n - st.nivel) * Math.min(1, dt * 14);
    const vel = st.estado === "piensa" ? 4 : hablando ? 1.8 : 1;
    anillos.forEach((a, i) => { a.rotation.x += dt * (.6 + i * .35) * vel; a.rotation.y += dt * (.4 + i * .2) * vel; });
    arco.rotation.z -= dt * 1.4 * vel;
    red.rotation.y += dt * .5 * vel; red.rotation.x += dt * .2;
    const pulso = 1 + st.nivel * .55 + Math.sin(st.t * 2.2) * .04;
    esfera.scale.setScalar(pulso); brillo.scale.setScalar(1 + st.nivel * .9 + Math.sin(st.t * 1.7) * .06);
    particulas.rotation.y += dt * .25 * vel; particulas.rotation.x += dt * .07;
    for (let i = 0; i < N; i++) {
      const a = i / N * Math.PI * 2, objetivo = .15 + st.nivel * (.6 + .9 * Math.abs(Math.sin(i * 1.7 + st.t * 9)));
      niveles[i] += (objetivo - niveles[i]) * Math.min(1, dt * 18);
      dummy.position.set(Math.cos(a) * .135, 0, Math.sin(a) * .135); dummy.rotation.set(0, -a, 0);
      dummy.scale.set(1, niveles[i] * 2.2, 1); dummy.updateMatrix(); barras.setMatrixAt(i, dummy.matrix);
    }
    barras.instanceMatrix.needsUpdate = true;
    haz.material.opacity = .05 + st.nivel * .12;
    if (ojo) { panel.lookAt(ojo); }
  }

  return { grupo: g, colisionador, decir, callar, estado, desbloquear, escucharMic, dejarMic, actualizar,
    oyendo: t => { st.tu = t; subtitulos(); }, get estadoActual() { return st.estado; } };
}
