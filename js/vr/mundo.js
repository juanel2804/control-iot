/* =========================================================================
   Excavadora XR · todo lo que se ve: gemelo 3D, arena, cabina de control, consola con palancas,
   pantalla del HUD y hologramas para realidad mixta. Medidas en metros (WebXR "local-floor").
   ========================================================================= */
import * as THREE from "three";
import { crearCabinaReal, crearBrazoReal, crearOrugas, crearObra, crearCieloDia, ESCALA_OBRA, ALTURA_PISO } from "./cabina.js";

export const rad = g => g * Math.PI / 180;
export const ARENA_Z = 4.4;          // la arena está 4.4 m frente al puesto
const acotar = (v, a, b) => Math.max(a, Math.min(b, v));
const NEON = 0x3ee6ff, MAGENTA = 0xff3ec8, AMBAR = 0xffb547, ROJO = 0xff2a4a, VERDE = 0x39ff9a;

/* ---------------- física de juguete del gemelo (igual que el gemelo de index.html) ---------------- */
export const VEL = { avance: .45, giro: 75, cabina: 90, pala: 55 };   // unidades o grados por segundo
export const nuevoEstado = () => ({ x: 0, z: 0, rumbo: 0, cabina: 0, pala: 15 });
export function moverGemelo(e, c, dt) {
  const s = { AVANZAR: 1, RETROCEDER: -1 }[c];
  if (s) { e.x = acotar(e.x + Math.sin(e.rumbo) * VEL.avance * s * dt, -5, 5); e.z = acotar(e.z + Math.cos(e.rumbo) * VEL.avance * s * dt, -5, 5); }
  else if (c === "GIRO_IZQUIERDA") e.rumbo += rad(VEL.giro) * dt;
  else if (c === "GIRO_DERECHA") e.rumbo -= rad(VEL.giro) * dt;
  else if (c === "ROTACION_IZQUIERDA") e.cabina += rad(VEL.cabina) * dt;
  else if (c === "ROTACION_DERECHA") e.cabina -= rad(VEL.cabina) * dt;
  else if (c === "PALA_ARRIBA") e.pala = Math.min(60, e.pala + VEL.pala * dt);
  else if (c === "PALA_ABAJO") e.pala = Math.max(-30, e.pala - VEL.pala * dt);
}

/* ---------------- utilidades ---------------- */
const estandar = (color, brillo = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness: .35, roughness: .45,
  emissive: brillo ? color : 0x000000, emissiveIntensity: brillo, ...extra });
function caja(w, h, d, mat, x, y, z, padre, bordes = null) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); padre.add(m);
  if (bordes) m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), bordes));
  return m;
}
/** Plano con texto dibujado en canvas (se puede redibujar con .poner). */
export function etiqueta(texto, { ancho = .1, alto = .03, color = "#e8fbff", fondo = null, px = 64, peso = 800 } = {}) {
  const cv = document.createElement("canvas"); cv.width = 512; cv.height = Math.round(512 * alto / ancho);
  const ctx = cv.getContext("2d"), tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(ancho, alto), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.poner = (t, c = color) => {
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (fondo) { ctx.fillStyle = fondo; redondo(ctx, 4, 4, cv.width - 8, cv.height - 8, cv.height * .25); ctx.fill(); }
    ctx.fillStyle = c; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    let f = Math.min(px, cv.height * .8); ctx.font = `${peso} ${f}px system-ui, Segoe UI, sans-serif`;
    while (ctx.measureText(t).width > cv.width * .92 && f > 10) { f -= 2; ctx.font = `${peso} ${f}px system-ui, Segoe UI, sans-serif`; }
    ctx.fillText(t, cv.width / 2, cv.height / 2 + 2); tex.needsUpdate = true;
  };
  m.poner(texto); return m;
}
function redondo(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/* ---------------- la excavadora (sólida para la arena, holograma para realidad mixta) ---------------- */
export function crearExcavadora(estilo = "solida") {
  const holo = estilo === "holo";
  const lineas = holo ? new THREE.LineBasicMaterial({ color: NEON, transparent: true, opacity: .95 }) : null;
  const H = op => new THREE.MeshBasicMaterial({ color: NEON, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false });
  const negro = holo ? H(.12) : estandar(0x1b1f27), amarillo = holo ? H(.2) : estandar(AMBAR),
    gris = holo ? H(.14) : estandar(0x3a4150), neon = holo ? H(.6) : estandar(NEON, 1.4), vidrio = holo ? H(.3) : estandar(0x7fe6ff, .5);
  const B = (w, h, d, m, x, y, z, p) => caja(w, h, d, m, x, y, z, p, lineas);
  const maquina = new THREE.Group();
  for (const s of [-1, 1]) { B(.26, .2, 1.1, negro, s * .36, .1, 0, maquina); B(.02, .03, 1, neon, s * .5, .16, 0, maquina); }   // orugas
  B(.56, .1, .66, gris, 0, .25, 0, maquina);
  const cabina = new THREE.Group(); cabina.position.y = .3; maquina.add(cabina);
  B(.72, .28, .78, amarillo, 0, .14, -.06, cabina);
  B(.3, .26, .3, vidrio, .17, .41, .12, cabina);
  B(.5, .05, .05, neon, 0, .2, -.46, cabina);
  const brazo = new THREE.Group(); brazo.position.set(-.12, .22, .3); cabina.add(brazo);
  B(.14, .14, .82, amarillo, 0, 0, .41, brazo);
  B(.38, .22, .2, gris, 0, -.08, .86, brazo);                                       // pala
  B(.36, .03, .03, neon, 0, .04, .97, brazo);
  const punta = new THREE.Object3D(); punta.position.set(0, -.17, .9); brazo.add(punta);              // donde muerde (retos)
  const carga = new THREE.Mesh(new THREE.SphereGeometry(.14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), estandar(0x8a5a2b));
  carga.position.set(0, -.02, .86); carga.visible = false; brazo.add(carga);
  const ponerEstado = (e, conPosicion = true) => {
    maquina.position.set(conPosicion ? e.x : 0, 0, conPosicion ? e.z : 0);
    maquina.rotation.y = e.rumbo; cabina.rotation.y = e.cabina; brazo.rotation.x = -rad(e.pala);
  };
  return { grupo: maquina, cabina, brazo, punta, carga, ponerEstado };
}

/* ---------------- arena virtual (solo en la cabina VR y en la vista 2D) ---------------- */
function crearArena() {
  const g = new THREE.Group();
  const piso = new THREE.Mesh(new THREE.CircleGeometry(6.2, 64), estandar(0x0b1020, 0, { roughness: .9, metalness: .1 }));
  piso.rotation.x = -Math.PI / 2; g.add(piso);
  const rejilla = new THREE.GridHelper(12, 24, NEON, 0x1c2a44); rejilla.position.y = .002;
  rejilla.material.transparent = true; rejilla.material.opacity = .45; g.add(rejilla);
  const borde = new THREE.Mesh(new THREE.TorusGeometry(5.9, .025, 8, 96), estandar(MAGENTA, 2)); borde.rotation.x = Math.PI / 2; borde.position.y = .03; g.add(borde);
  const tierra = estandar(0x6b4a2b, 0, { roughness: 1, metalness: 0 }), cono = estandar(0xff7a1a, .3);
  [[-2.5, -2, .5], [2.8, -1.2, .35], [-1.4, 2.6, .4], [3.2, 2.4, .55]].forEach(([x, z, r]) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, r * .9, 9), tierra); m.position.set(x, r * .45, z); g.add(m);
  });
  [[-.9, -3], [0, -3.4], [.9, -3], [-4, 0], [4, .5]].forEach(([x, z]) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(.09, .28, 12), cono); m.position.set(x, .14, z); g.add(m);
  });
  for (let i = 0; i < 8; i++) {                                                     // postes con luz alrededor
    const a = i / 8 * Math.PI * 2, p = caja(.06, 1.4, .06, estandar(0x222838), Math.cos(a) * 6.3, .7, Math.sin(a) * 6.3, g);
    caja(.1, .06, .1, estandar(i % 2 ? NEON : MAGENTA, 2.5), 0, .72, 0, p);
  }
  return g;
}
function crearCielo() {
  const n = 900, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = 45, s = Math.sqrt(1 - u * u);
    pos.set([r * s * Math.cos(a), Math.abs(r * u) + 2, r * s * Math.sin(a)], i * 3);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xbfe9ff, size: .12, sizeAttenuation: true, transparent: true, opacity: .8 }));
}

/* ---------------- cabina de control (marco alrededor del usuario, solo VR) ---------------- */
function crearCabina() {
  const g = new THREE.Group(), marco = estandar(0x151a26, 0, { metalness: .7, roughness: .35 }), tira = estandar(NEON, 2.2), tira2 = estandar(MAGENTA, 2);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.3, .06, 6), estandar(0x0e121c, 0, { metalness: .6 })); base.position.y = .03; g.add(base);
  const aro = new THREE.Mesh(new THREE.TorusGeometry(1.24, .012, 6, 6), tira); aro.rotation.x = Math.PI / 2; aro.rotation.z = Math.PI / 6; aro.position.y = .065; g.add(aro);
  for (const s of [-1, 1]) {
    caja(.07, 2.3, .07, marco, s * .95, 1.15, -1.05, g); caja(.015, 2.2, .015, tira, s * .95, 1.15, -1.01, g);
    caja(.07, 2.3, .07, marco, s * 1.2, 1.15, .3, g);
    caja(.05, .05, 1.4, marco, s * 1.1, 2.28, -.37, g);
  }
  caja(1.97, .07, .07, marco, 0, 2.3, -1.05, g); caja(1.9, .015, .015, tira2, 0, 2.26, -1.01, g);
  caja(1.97, .05, .05, marco, 0, .55, -1.05, g); caja(1.9, .012, .012, tira, 0, .58, -1.02, g);
  const vidrio = new THREE.Mesh(new THREE.PlaneGeometry(1.86, 1.68), new THREE.MeshBasicMaterial({ color: NEON, transparent: true, opacity: .035, depthWrite: false }));
  vidrio.position.set(0, 1.43, -1.05); g.add(vidrio);
  return g;
}

/* ---------------- consola: 2 palancas, STOP y botones ---------------- */
// Palanca izquierda = orugas; derecha = brazo. Adelante = AVANZAR / SUBIR PALA.
const MAPA_PALANCAS = {
  orugas: { ad: "AVANZAR", at: "RETROCEDER", iz: "GIRO_IZQUIERDA", de: "GIRO_DERECHA" },
  brazo:  { ad: "PALA_ARRIBA", at: "PALA_ABAJO", iz: "ROTACION_IZQUIERDA", de: "ROTACION_DERECHA" },
};
export const BOTONES = [
  { accion: "ENCENDER_APAGAR", texto: "PRENDER", color: AMBAR },
  { accion: "VOZ", texto: "VOZ", color: VERDE, mantener: true },
  { accion: "CENTRAR", texto: "CENTRAR", color: NEON },
  // segunda fila: retos (solo gemelo), clima y radio
  { accion: "RETO", texto: "RETO", color: MAGENTA, fila: 2 }, { accion: "CLIMA", texto: "CLIMA", color: 0x7fb3e6, fila: 2 },
  { accion: "RADIO", texto: "RADIO", color: 0xffd23e, fila: 2 },
];
function crearConsola() {
  const g = new THREE.Group();
  // plástico negro mate como en una cabina real; solo los acentos llevan color
  const cuerpo = estandar(0x26282d, 0, { metalness: .25, roughness: .7 });
  const bordes = new THREE.LineBasicMaterial({ color: 0x4a4f58, transparent: true, opacity: .8 });
  const hule = estandar(0x0f1012, 0, { roughness: .95, metalness: 0 }), empuñadura = estandar(0x1a1b1e, 0, { roughness: .6 });
  for (const x of [-.215, .215]) caja(.15, .06, .32, cuerpo, x, -.03, .0, g, bordes);          // descansabrazos con joystick
  caja(.13, .05, .14, cuerpo, 0, -.025, -.03, g, bordes);                                       // base del STOP
  caja(.3, .03, .07, cuerpo, 0, -.012, .1, g, bordes);                                           // panel de botones (sin los AUX)
  caja(.3, .03, .06, cuerpo, 0, -.012, .162, g, bordes);                                         // segunda fila
  const palancas = [], botones = [];
  for (const [nombre, x, titulo] of [["orugas", -.215, "ORUGAS"], ["brazo", .215, "BRAZO · CABINA"]]) {
    const fuelle = new THREE.Mesh(new THREE.CylinderGeometry(.012, .042, .045, 16, 3), hule); fuelle.position.set(x, .022, -.02); g.add(fuelle);
    const pivote = new THREE.Group(); pivote.position.set(x, 0, -.02); g.add(pivote);
    const vara = new THREE.Mesh(new THREE.CylinderGeometry(.007, .009, .13, 12), estandar(0x9aa4b8, 0, { metalness: .9, roughness: .2 }));
    vara.position.y = .065; pivote.add(vara);
    const perilla = new THREE.Mesh(new THREE.CapsuleGeometry(.02, .045, 6, 16), empuñadura);
    perilla.position.y = .135; pivote.add(perilla);
    const gatillo = new THREE.Mesh(new THREE.CylinderGeometry(.009, .009, .008, 14), estandar(nombre === "orugas" ? AMBAR : ROJO, .6));
    gatillo.position.y = .037; perilla.add(gatillo);
    const et = etiqueta(titulo, { ancho: .16, alto: .022, color: "#9feaff" }); et.rotation.x = -Math.PI / 2; et.position.set(x, .001, .045); g.add(et);
    const guia = etiqueta(nombre === "orugas" ? "AVANZA ▲  ◀ GIRA ▶  ▼ REVERSA" : "SUBE ▲  ◀ ROTA ▶  ▼ BAJA",
      { ancho: .2, alto: .016, color: "#6f8bab", peso: 600 }); guia.rotation.x = -Math.PI / 2; guia.position.set(x, .001, .065); g.add(guia);
    palancas.push({ nombre, pivote, perilla, mapa: MAPA_PALANCAS[nombre], inc: { x: 0, z: 0 }, agarre: null, cmd: null, fuerza: 0 });
  }
  // STOP tipo hongo
  const aroStop = new THREE.Mesh(new THREE.CylinderGeometry(.052, .055, .012, 32), estandar(AMBAR, .4)); aroStop.position.set(0, .006, -.03); g.add(aroStop);
  const stop = new THREE.Mesh(new THREE.CylinderGeometry(.04, .043, .03, 32), estandar(ROJO, 1.1)); stop.position.set(0, .027, -.03); g.add(stop);
  const etStop = etiqueta("STOP", { ancho: .06, alto: .02, color: "#ffffff" }); etStop.rotation.x = -Math.PI / 2; etStop.position.y = .016; stop.add(etStop);
  botones.push({ accion: "STOP", malla: stop, yBase: stop.position.y, radio: .05 });
  // fila de botones
  const fila1 = BOTONES.filter(b => !b.fila), fila2 = BOTONES.filter(b => b.fila === 2);
  BOTONES.forEach(b => {
    const f = b.fila === 2 ? fila2 : fila1, i = f.indexOf(b);
    const x = (i - (f.length - 1) / 2) * .088;
    const m = caja(.072, .016, .042, estandar(b.color, .5), x, .008, b.fila === 2 ? .162 : .1, g);
    const et = etiqueta(b.texto, { ancho: .068, alto: .022, color: "#06101c", peso: 900 }); et.rotation.x = -Math.PI / 2; et.position.y = .0085; m.add(et);
    botones.push({ ...b, malla: m, yBase: m.position.y, radio: .045 });
  });
  return { grupo: g, palancas, botones };
}

/* ---------------- pantalla del HUD (canvas) ---------------- */
function crearPantalla() {
  const cv = document.createElement("canvas"); cv.width = 1024; cv.height = 600;
  const ctx = cv.getContext("2d"), tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const malla = new THREE.Mesh(new THREE.PlaneGeometry(.72, .72 * 600 / 1024), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  let clave = "";
  const F = (px, peso = 700) => `${peso} ${px}px system-ui, Segoe UI, sans-serif`;
  function chip(x, y, txt, ok) {
    ctx.font = F(26, 800); const w = ctx.measureText(txt).width + 44;
    ctx.fillStyle = ok === true ? "rgba(57,255,154,.16)" : ok === false ? "rgba(255,42,74,.18)" : "rgba(255,181,71,.16)";
    redondo(ctx, x, y, w, 46, 23); ctx.fill();
    ctx.fillStyle = ok === true ? "#39ff9a" : ok === false ? "#ff5a72" : "#ffb547";
    ctx.beginPath(); ctx.arc(x + 20, y + 23, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#e8fbff"; ctx.textBaseline = "middle"; ctx.fillText(txt, x + 34, y + 24);
    return x + w + 12;
  }
  /** d: { modo, comando, mueve, origen, chips:[[txt,ok]], seguro, sala, voz, plan, aviso } */
  function dibujar(d) {
    const k = JSON.stringify(d); if (k === clave) return; clave = k;
    ctx.clearRect(0, 0, cv.width, cv.height);
    const grad = ctx.createLinearGradient(0, 0, 0, cv.height); grad.addColorStop(0, "rgba(8,16,32,.88)"); grad.addColorStop(1, "rgba(4,8,18,.82)");
    ctx.fillStyle = grad; redondo(ctx, 6, 6, cv.width - 12, cv.height - 12, 34); ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = "rgba(62,230,255,.85)"; ctx.shadowColor = "#3ee6ff"; ctx.shadowBlur = 18; ctx.stroke(); ctx.shadowBlur = 0;
    ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
    ctx.fillStyle = "#3ee6ff"; ctx.font = F(34, 900); ctx.fillText("EXCAVADORA XR", 40, 62);
    ctx.font = F(24, 800); const mw = ctx.measureText(d.modo).width + 36;
    ctx.fillStyle = d.modo.includes("SIMULADOR") ? "rgba(255,181,71,.25)" : "rgba(255,62,200,.22)"; redondo(ctx, cv.width - 40 - mw, 30, mw, 42, 21); ctx.fill();
    ctx.fillStyle = d.modo.includes("SIMULADOR") ? "#ffb547" : "#ff8ae0"; ctx.fillText(d.modo, cv.width - 22 - mw, 59);
    // comando actual
    ctx.font = F(96, 900); ctx.fillStyle = d.mueve ? "#39ff9a" : "#e8fbff";
    if (d.mueve) { ctx.shadowColor = "#39ff9a"; ctx.shadowBlur = 24; }
    ctx.fillText(d.comando, 40, 182); ctx.shadowBlur = 0;
    if (d.origen) { ctx.font = F(26, 600); ctx.fillStyle = "#7f98b8"; ctx.fillText(d.origen, 44, 220); }
    // chips de estado
    let x = 40; for (const [t, ok] of d.chips) x = chip(x, 244, t, ok);
    // seguro (hombre muerto)
    ctx.fillStyle = d.seguro ? "rgba(57,255,154,.18)" : "rgba(255,181,71,.14)"; redondo(ctx, 40, 312, cv.width - 80, 64, 18); ctx.fill();
    ctx.fillStyle = d.seguro ? "#39ff9a" : "#ffb547"; ctx.font = F(32, 900);
    ctx.fillText(d.seguro ? "SEGURO ARMADO · PUEDES MANEJAR" : d.seguroTxt, 64, 355);
    // líneas de información
    ctx.font = F(28, 600); let y = 420;
    for (const [t, c] of [[d.reto, "#ff8ae0"], [d.sala, "#c9b8ff"], [d.plan, "#9feaff"], [d.voz, "#b6ffd8"], [d.aviso, "#ff7a8e"]]) {
      if (!t) continue; ctx.fillStyle = c;
      let s = t; while (ctx.measureText(s).width > cv.width - 90 && s.length > 4) s = s.slice(0, -2);
      ctx.fillText(s === t ? s : s + "…", 44, y); y += 42; if (y > 580) break;
    }
    tex.needsUpdate = true;
  }
  return { malla, dibujar };
}

/* ---------------- mundo completo ---------------- */
export function crearMundo() {
  const escena = new THREE.Scene();
  escena.add(new THREE.HemisphereLight(0xbfefff, 0x1a1030, 1.1));
  const sol = new THREE.DirectionalLight(0xffffff, 1.5); sol.position.set(3, 6, 2); escena.add(sol);

  // decorado solo VR / 2D (en realidad mixta se ve el cuarto real)
  const decorado = new THREE.Group(); escena.add(decorado);
  const cielo = crearCielo(); decorado.add(cielo);

  // cielo de día (solo VR)
  const cieloDia = crearCieloDia(); cieloDia.visible = false; escena.add(cieloDia);
  const solDia = new THREE.HemisphereLight(0xdcefff, 0x6b5434, 0); escena.add(solDia);

  // "puesto": todo lo que va frente al usuario; se recoloca con CENTRAR
  const puesto = new THREE.Group(); escena.add(puesto);
  const cabinaNeon = crearCabina(); cabinaNeon.visible = false; puesto.add(cabinaNeon);   // (cabina futurista anterior, en reserva)
  // cabina realista: se coloca a la altura de los ojos con CENTRAR
  const cabReal = new THREE.Group(); puesto.add(cabReal);
  const cabina = crearCabinaReal(); cabReal.add(cabina.grupo);
  const brazoReal = crearBrazoReal(); cabReal.add(brazoReal.grupo);
  const orugas = crearOrugas(); cabReal.add(orugas);
  // la arena guarda la obra realista (VR) y el decorado neón (2D / espectador)
  const arena = crearArena(); arena.matrixAutoUpdate = false; puesto.add(arena);
  const neon = arena.children.slice();                     // piso, rejilla, aro, montones y postes neón
  const obra = crearObra(); arena.add(obra);
  const gemelo = crearExcavadora("solida"); arena.add(gemelo.grupo);
  const retos = new THREE.Group(); arena.add(retos);       // objetos de los retos (unidades del gemelo)
  const efectosArena = new THREE.Group(); arena.add(efectosArena);   // polvo y lluvia sobre la obra
  const etGemelo = etiqueta("GEMELO EN VIVO", { ancho: 1.2, alto: .16, color: "#e8fbff", fondo: "rgba(6,14,28,.7)" });
  arena.add(etGemelo);

  const consola = crearConsola(); puesto.add(consola.grupo);
  const pantalla = crearPantalla(); puesto.add(pantalla.malla);
  const soporteKai = new THREE.Group(); puesto.add(soporteKai);   // aquí se monta el holograma del asistente
  let modoActual = "2d";

  // mini holograma sobre la consola (radar del gemelo: solo giros, cabina y pala)
  const mini = crearExcavadora("holo"); mini.grupo.scale.setScalar(.13);
  const baseMini = new THREE.Group(); puesto.add(baseMini); baseMini.add(mini.grupo);
  const aroMini = new THREE.Mesh(new THREE.RingGeometry(.1, .108, 48), new THREE.MeshBasicMaterial({ color: NEON, transparent: true, opacity: .7, side: THREE.DoubleSide }));
  aroMini.rotation.x = -Math.PI / 2; baseMini.add(aroMini);

  // holograma anclado sobre la excavadora real (realidad mixta)
  const ancla = new THREE.Group(); ancla.visible = false; escena.add(ancla);
  const escalaAncla = new THREE.Group(); escalaAncla.scale.setScalar(.3); ancla.add(escalaAncla);
  const desfase = new THREE.Group(); escalaAncla.add(desfase);
  const holo = crearExcavadora("holo"); desfase.add(holo.grupo);
  const aroHolo = new THREE.Mesh(new THREE.RingGeometry(.62, .68, 64), new THREE.MeshBasicMaterial({ color: VERDE, transparent: true, opacity: .0, side: THREE.DoubleSide, depthWrite: false }));
  aroHolo.rotation.x = -Math.PI / 2; aroHolo.position.y = .01; holo.grupo.add(aroHolo);
  const etHolo = etiqueta("", { ancho: .9, alto: .14, color: "#39ff9a", fondo: "rgba(6,14,28,.7)" }); etHolo.position.y = 1.5; holo.grupo.add(etHolo);
  const anclaje = { e0: null };

  // retícula de colocación (hit-test)
  const reticula = new THREE.Mesh(new THREE.RingGeometry(.05, .065, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: VERDE, transparent: true, opacity: .9 }));
  reticula.matrixAutoUpdate = false; reticula.visible = false; escena.add(reticula);

  /** Coloca el puesto frente a la cabeza del usuario. */
  function centrar(camara) {
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), d = new THREE.Vector3(0, 0, -1);
    camara.getWorldPosition(p); camara.getWorldQuaternion(q); d.applyQuaternion(q);
    const altura = acotar(p.y || 1.5, 1, 2);
    puesto.position.set(p.x, 0, p.z); puesto.rotation.set(0, Math.atan2(-d.x, -d.z), 0);
    const yC = acotar(altura - .5, .65, 1.3);
    consola.grupo.position.set(0, yC, -.4); consola.grupo.rotation.x = .12;
    if (modoActual === "vr") {
      // sentado en la cabina: ojos ~1.2 m sobre el piso de la cabina
      cabReal.position.set(0, altura - 1.2, -.05);
      // pantalla = monitor del tablero, a la derecha; KAI flota en el centro del tablero
      pantalla.malla.position.set(.36, altura - .12, -.56); pantalla.malla.rotation.set(-.15, -.55, 0); pantalla.malla.scale.setScalar(.55);
      soporteKai.position.set(-.02, altura - .42, -.6);
      baseMini.position.set(-.4, yC + .02, -.42);
    } else {
      // realidad mixta: la pantalla va arriba de la línea de vista para no tapar la excavadora real
      pantalla.malla.position.set(0, acotar(altura + .3, 1.3, 2.3), -.9); pantalla.malla.rotation.set(.28, 0, 0); pantalla.malla.scale.setScalar(1);
      soporteKai.position.set(-.48, altura - .38, -.62);
      baseMini.position.set(-.5, yC + .02, -.38);
    }
  }

  /** Ancla el holograma en un punto del cuarto, viendo hacia "rumbo". */
  function anclar(punto, rumbo, e) {
    anclaje.e0 = { ...e };
    ancla.position.copy(punto); ancla.rotation.set(0, rumbo - e.rumbo, 0);
    desfase.position.set(-e.x, 0, -e.z); ancla.visible = true;
  }

  let reloj = 0;
  const mA = new THREE.Matrix4(), mB = new THREE.Matrix4();
  /** Primera persona: el mundo se acomoda alrededor de la cabina (la cabina no se mueve: menos mareo). */
  function colocarArena(e) {
    if (modoActual !== "vr") { arena.matrix.makeTranslation(0, 0, -ARENA_Z); return; }
    const yaw = Math.PI - (e.rumbo + e.cabina);
    arena.matrix.makeTranslation(0, cabReal.position.y - ALTURA_PISO, cabReal.position.z)
      .multiply(mA.makeRotationY(yaw)).multiply(mB.makeScale(ESCALA_OBRA, ESCALA_OBRA, ESCALA_OBRA))
      .multiply(mA.makeTranslation(-e.x, 0, -e.z));
  }
  /** e: estado del gemelo; c: comando en curso (o null); txt: texto del comando. */
  function actualizar(e, c, txt, dt, ojo) {
    reloj += dt;
    colocarArena(e);
    brazoReal.poner(e.pala);
    orugas.rotation.y = -e.cabina;                      // al rotar la cabina, las orugas giran debajo
    cabina.faro.rotation.y += dt * (c ? 9 : 2);
    cabina.faro.material.emissiveIntensity = c ? 1.2 + Math.sin(reloj * 18) * .8 : .6;
    gemelo.ponerEstado(e); mini.ponerEstado(e, false); holo.ponerEstado(e);
    etGemelo.position.set(e.x, 1.25, e.z);
    if (ojo) { etGemelo.lookAt(ojo); if (ancla.visible) etHolo.lookAt(ojo); }   // los letreros siempre de frente
    const etiquetaTxt = c ? txt : "GEMELO EN VIVO";
    if (etGemelo.userData.t !== etiquetaTxt) { etGemelo.userData.t = etiquetaTxt; etGemelo.poner(etiquetaTxt, c ? "#39ff9a" : "#e8fbff"); }
    if (etHolo.userData.t !== (c ? txt : "")) { etHolo.userData.t = c ? txt : ""; etHolo.poner(c ? txt : "", "#39ff9a"); etHolo.visible = !!c; }
    aroHolo.material.opacity = c ? .45 + .35 * Math.sin(reloj * 10) : 0;
    aroMini.material.color.setHex(c ? VERDE : NEON);
  }

  /** "vr" | "mr" | "2d": qué se muestra en cada modo. */
  function modo(m) {
    modoActual = m;
    const mr = m === "mr", vr = m === "vr";
    escena.background = mr ? null : vr ? new THREE.Color(0xbcd3e6) : new THREE.Color(0x05070d);
    escena.fog = mr ? null : vr ? new THREE.Fog(0xc9d6df, 40, 220) : new THREE.Fog(0x05070d, 9, 30);
    solDia.intensity = vr ? 1.4 : 0; cieloDia.visible = vr;
    decorado.visible = m === "2d"; arena.visible = !mr;
    cabReal.visible = vr;
    neon.forEach(o => o.visible = !vr); obra.visible = vr;
    gemelo.grupo.visible = etGemelo.visible = !vr;          // en VR vas DENTRO de la excavadora
    consola.grupo.visible = pantalla.malla.visible = baseMini.visible = soporteKai.visible = m !== "2d";
    if (!mr) { ancla.visible = false; reticula.visible = false; }
    alModo.forEach(f => f(m));
  }
  const alModo = [];

  /** Punta del cucharón en coordenadas de la arena (unidades del gemelo). En VR usa el brazo real de la cabina. */
  const vPunta = new THREE.Vector3();
  function puntaPala(destino = new THREE.Vector3()) {
    const p = modoActual === "vr" ? brazoReal.punta : gemelo.punta;
    p.getWorldPosition(vPunta); arena.updateWorldMatrix(true, false);
    return destino.copy(arena.worldToLocal(vPunta));
  }
  /** Tierra en el cucharón: 0 (vacío) a 1 (lleno). */
  function ponerCarga(f) {
    for (const c of [brazoReal.carga, gemelo.carga]) { c.visible = f > .02; c.scale.y = Math.max(.01, f) * (c === gemelo.carga ? 1 : .9); }
  }

  return { escena, puesto, arena, gemelo, consola, pantalla, soporteKai, centrar, anclar, ancla, anclaje, reticula, actualizar, modo,
    retos, efectosArena, cabina, cabReal, brazoReal, sol, solDia, cieloDia, decorado, obra, alModo, puntaPala, ponerCarga,
    get modoActual() { return modoActual; } };
}
