/* =========================================================================
   Excavadora XR · sonido sintetizado con Web Audio (no se descarga ningún archivo)
   Motor diésel que acelera al moverse, hidráulica de la pala, bip de reversa, freno de aire en STOP,
   golpes y tierra para los retos, lluvia y una radio de cabina con música generada.
   ========================================================================= */
let ctx = null, maestro = null, ruido = null;
const S = { activo: true, motorOn: false, radio: false, lluvia: false, c: null, rpm: .25, modo: "2d" };
const n = {};                                    // nodos que viven todo el tiempo

const leer = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
S.activo = leer("vr_sonido", "1") !== "0";

/** El navegador solo deja prender el audio dentro de un clic o toque. */
export function desbloquear() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC(); maestro = ctx.createGain(); maestro.gain.value = S.activo ? .9 : 0; maestro.connect(ctx.destination);
    const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    ruido = b; armar();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
}
const fuenteRuido = () => { const s = ctx.createBufferSource(); s.buffer = ruido; s.loop = true; s.start(0, Math.random() * 2); return s; };
const osc = (tipo, f) => { const o = ctx.createOscillator(); o.type = tipo; o.frequency.value = f; o.start(); return o; };
const gan = (v = 0, destino = maestro) => { const g = ctx.createGain(); g.gain.value = v; g.connect(destino); return g; };
const filtro = (tipo, f, q = 1) => { const x = ctx.createBiquadFilter(); x.type = tipo; x.frequency.value = f; x.Q.value = q; return x; };
const rampa = (param, v, t = .15) => param.setTargetAtTime(v, ctx.currentTime, t);

function armar() {
  // motor: dos osciladores graves + ruido con "golpeteo" (modulación de amplitud a la velocidad de los pistones)
  n.motor = gan(0); n.motorLP = filtro("lowpass", 260, .7); n.motorLP.connect(n.motor);
  n.golpe = ctx.createGain(); n.golpe.gain.value = .6; n.golpe.connect(n.motorLP);
  n.o1 = osc("sawtooth", 34); n.o2 = osc("square", 68); n.o2g = gan(.35, n.golpe); n.o1.connect(n.golpe); n.o2.connect(n.o2g);
  n.rm = fuenteRuido(); n.rmF = filtro("bandpass", 140, 1.2); n.rmG = gan(.9, n.golpe); n.rm.connect(n.rmF).connect(n.rmG);
  n.lfo = osc("sine", 9); n.lfoG = ctx.createGain(); n.lfoG.gain.value = .4; n.lfo.connect(n.lfoG).connect(n.golpe.gain);
  // hidráulica: siseo agudo
  n.hid = gan(0); n.hidS = fuenteRuido(); n.hidF = filtro("bandpass", 2200, .9); n.hidS.connect(n.hidF).connect(n.hid);
  n.hidO = osc("sawtooth", 180); n.hidOG = gan(.05, n.hid); n.hidO.connect(n.hidOG);
  // alarma de reversa
  n.bip = gan(0); n.bipO = osc("square", 1150); n.bipF = filtro("bandpass", 1150, 6); n.bipO.connect(n.bipF).connect(n.bip);
  // lluvia
  n.lluvia = gan(0); n.llS = fuenteRuido(); n.llF1 = filtro("highpass", 500); n.llF2 = filtro("lowpass", 5000); n.llS.connect(n.llF1).connect(n.llF2).connect(n.lluvia);
  // radio: todo pasa por un filtro de "bocina chica"
  n.radio = gan(0); n.radioF1 = filtro("highpass", 320); n.radioF2 = filtro("lowpass", 3200); n.radioF1.connect(n.radioF2).connect(n.radio);
}

/* ---------------- efectos cortos ---------------- */
function rafaga(tipoF, f, dur, vol, q = 1, barrido = null) {
  if (!ctx || !S.activo) return;
  const s = fuenteRuido(), x = filtro(tipoF, f, q), g = gan(0); s.connect(x).connect(g);
  const t = ctx.currentTime; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  if (barrido) x.frequency.exponentialRampToValueAtTime(barrido, t + dur);
  s.stop(t + dur + .05);
}
function tono(f, dur, vol = .2, tipo = "sine", cuando = 0, hasta = null) {
  if (!ctx || !S.activo) return;
  const o = ctx.createOscillator(), g = gan(0); o.type = tipo; o.frequency.value = f; o.connect(g);
  const t = ctx.currentTime + cuando; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  if (hasta) o.frequency.exponentialRampToValueAtTime(hasta, t + dur);
  o.start(t); o.stop(t + dur + .05);
}
export const efecto = {
  freno: () => rafaga("highpass", 1800, .7, .35, .7, 900),                 // freno de aire (STOP)
  golpe: (fuerza = 1) => { tono(80, .35, .5 * fuerza, "sine", 0, 35); rafaga("lowpass", 600, .25, .3 * fuerza); },
  tierra: () => rafaga("lowpass", 900, 1.1, .45, .8, 250),                  // cucharón que muerde o descarga
  acierto: () => { tono(880, .15, .18, "triangle"); tono(1320, .25, .18, "triangle", .1); },
  error: () => tono(160, .4, .22, "square", 0, 90),
  medalla: () => [660, 880, 1100, 1320].forEach((f, i) => tono(f, .3, .16, "triangle", i * .09)),
  boton: () => tono(1400, .05, .08, "square"),
  conteo: (ultimo = false) => tono(ultimo ? 1320 : 880, ultimo ? .5 : .18, .2, "sine"),
};

/* ---------------- radio de cabina: música generada (cumbia lo-fi a 96 BPM) ---------------- */
const ACORDES = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];   // Am – F – C – G
const BAJO = [45, 41, 36, 43];
const midi = m => 440 * 2 ** ((m - 69) / 12);
let radioTimer = null, paso = 0, proximo = 0;
function notaRadio(f, t, dur, vol, tipo) {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = tipo; o.frequency.value = f; o.connect(g); g.connect(n.radioF1);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.001, t + dur); o.start(t); o.stop(t + dur + .05);
}
function golpeRadio(t, f, dur, vol) {
  const s = ctx.createBufferSource(); s.buffer = ruido; const x = filtro(f > 3000 ? "highpass" : "bandpass", f, 1); const g = ctx.createGain();
  s.connect(x).connect(g); g.connect(n.radioF1); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur); s.start(t); s.stop(t + dur + .05);
}
function agendarRadio() {
  const corchea = 60 / 96 / 2;
  while (proximo < ctx.currentTime + .25) {
    const compas = Math.floor(paso / 8) % 4, k = paso % 8, t = proximo;
    if (k === 0 || k === 4) notaRadio(midi(BAJO[compas]), t, corchea * 1.8, .32, "triangle");
    if (k === 2 || k === 6) notaRadio(midi(BAJO[compas] + 7), t, corchea * 1.5, .22, "triangle");
    if (k % 2 === 1) ACORDES[compas].forEach(m => notaRadio(midi(m + 12), t, corchea * .8, .06, "square"));   // "rasgueo" a contratiempo
    golpeRadio(t, 7000, .05, k % 2 ? .12 : .06);                                                           // güira
    if (k === 0 || k === 3 || k === 4 || k === 7) golpeRadio(t, 180, .12, .35);                            // tambora
    if (paso % 32 === 28) notaRadio(midi(ACORDES[compas][2] + 24), t, corchea * 3, .05, "sine");            // adorno
    paso++; proximo += corchea;
  }
}
export function radio(on = !S.radio) {
  desbloquear(); if (!ctx) return S.radio;
  S.radio = on; clearInterval(radioTimer);
  if (on) { rafaga("bandpass", 2500, .5, .25, .5); paso = 0; proximo = ctx.currentTime + .4; radioTimer = setInterval(agendarRadio, 80); rampa(n.radio.gain, .55, .3); }
  else rampa(n.radio.gain, 0, .1);
  return S.radio;
}

/* ---------------- control general ---------------- */
export function activar(on = !S.activo) {
  S.activo = on; try { localStorage.setItem("vr_sonido", on ? "1" : "0"); } catch {}
  if (ctx) rampa(maestro.gain, on ? .9 : 0, .05);
  return on;
}
export const sonidoActivo = () => S.activo;
export const radioPrendida = () => S.radio;
/** El motor se oye en la cabina VR y en la vista 2D; en realidad mixta no (ya suena la máquina de verdad). */
export function modo(m) { S.modo = m; S.motorOn = m === "vr" || m === "2d"; }
export function lluvia(on) { S.lluvia = on; if (ctx) rampa(n.lluvia.gain, on ? .1 : 0, .8); }
export function comando(c) {
  if (c === S.c) return;
  const antes = S.c; S.c = c;
  if (!c && antes) efecto.freno();
}

/** Se llama cada cuadro: ajusta el motor, la hidráulica y la reversa al comando en curso. */
export function cuadro(dt, ahora) {
  if (!ctx || ctx.state !== "running") return;
  const c = S.c, mueve = !!c;
  const brazo = c && /^(PALA|ROTACION)/.test(c);
  S.rpm += ((mueve ? (brazo ? .75 : 1) : .25) - S.rpm) * Math.min(1, dt * (mueve ? 2.5 : 1.2));
  const r = S.rpm;
  n.o1.frequency.value = 30 + r * 26; n.o2.frequency.value = (30 + r * 26) * 2;
  n.lfo.frequency.value = 7 + r * 14; n.motorLP.frequency.value = 180 + r * 420; n.rmF.frequency.value = 110 + r * 160;
  const motor = S.modo === "vr" || (S.modo === "2d" && (mueve || r > .3));   // en la página 2D solo suena al moverse
  rampa(n.motor.gain, motor ? .16 + r * .2 : 0, .2);
  rampa(n.hid.gain, brazo ? .11 : 0, .08); if (brazo) n.hidF.frequency.value = 1800 + 600 * Math.sin(ahora / 300);
  const reversa = c === "RETROCEDER" && Math.floor(ahora / 500) % 2 === 0;
  rampa(n.bip.gain, reversa ? .09 : 0, .01);
}
