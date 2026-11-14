/* =========================================================================
   Excavadora XR · cabina realista de operador (modo VR) y obra de día
   Estás sentado DENTRO de la excavadora: el brazo y la pala se ven por el parabrisas y se mueven
   con SUBIR/BAJAR PALA. Al rotar la cabina o avanzar, el mundo se mueve a tu alrededor y las orugas
   giran debajo de ti. Medidas en metros; el piso de la cabina es y = 0 (cabina local).
   ========================================================================= */
import * as THREE from "three";

const rad = g => g * Math.PI / 180;
const AMARILLO = 0xf2b40a, NEGRO = 0x17181b, GRIS = 0x2b2e34, GRIS_CLARO = 0x60656e, ACERO = 0x8d939c;
export const ESCALA_OBRA = 4;          // 1 unidad del gemelo = 4 m en la obra
export const ALTURA_PISO = 1.25;       // el piso de la cabina está 1.25 m sobre la tierra

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .6, metalness: .2, ...extra });
function caja(w, h, d, m, x, y, z, padre) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); padre.add(o); return o; }
function cilindro(r1, r2, h, m, padre, seg = 20) { const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m); padre.add(o); return o; }

/* ---------------- texturas hechas con canvas (sin descargar nada) ---------------- */
function texturaRuido(base, variacion, tam = 256, repetir = 1, manchas = 0) {
  const cv = document.createElement("canvas"); cv.width = cv.height = tam; const c = cv.getContext("2d");
  c.fillStyle = base; c.fillRect(0, 0, tam, tam);
  const img = c.getImageData(0, 0, tam, tam), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const v = (Math.random() - .5) * variacion; d[i] += v; d[i + 1] += v; d[i + 2] += v * .8; }
  c.putImageData(img, 0, 0);
  for (let i = 0; i < manchas; i++) {                    // piedritas y huellas
    c.fillStyle = `rgba(${Math.random() < .5 ? "40,30,20" : "160,140,110"},${.15 + Math.random() * .25})`;
    c.beginPath(); c.ellipse(Math.random() * tam, Math.random() * tam, 1 + Math.random() * 5, 1 + Math.random() * 3, Math.random() * 3, 0, 7); c.fill();
  }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repetir, repetir); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function texturaOruga() {
  const cv = document.createElement("canvas"); cv.width = 64; cv.height = 256; const c = cv.getContext("2d");
  c.fillStyle = "#1c1d20"; c.fillRect(0, 0, 64, 256);
  for (let y = 0; y < 256; y += 16) { c.fillStyle = "#34363b"; c.fillRect(0, y, 64, 9); c.fillStyle = "#0e0f11"; c.fillRect(0, y + 9, 64, 2); }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
function texturaCielo() {
  const cv = document.createElement("canvas"); cv.width = 16; cv.height = 512; const c = cv.getContext("2d");
  const g = c.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, "#2f6fb8"); g.addColorStop(.42, "#7fb3e6"); g.addColorStop(.5, "#d9e6ee"); g.addColorStop(.52, "#c9c2b0"); g.addColorStop(1, "#8a7a62");
  c.fillStyle = g; c.fillRect(0, 0, 16, 512);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function texturaIndicador(txt, color) {
  const cv = document.createElement("canvas"); cv.width = cv.height = 128; const c = cv.getContext("2d");
  c.fillStyle = "#0b0c0e"; c.beginPath(); c.arc(64, 64, 62, 0, 7); c.fill();
  c.strokeStyle = "#555"; c.lineWidth = 4; c.stroke();
  c.strokeStyle = color; c.lineWidth = 8; c.beginPath(); c.arc(64, 64, 46, Math.PI * .8, Math.PI * (.8 + 1.4 * (.35 + Math.random() * .4))); c.stroke();
  c.fillStyle = "#ddd"; c.font = "700 22px system-ui"; c.textAlign = "center"; c.fillText(txt, 64, 100);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/* ---------------- la cabina del operador ---------------- */
export function crearCabinaReal() {
  const g = new THREE.Group();
  const pilar = mat(NEGRO, { metalness: .5, roughness: .4 }), amarillo = mat(AMARILLO, { metalness: .3, roughness: .45 });
  const interior = mat(GRIS, { roughness: .85 }), techo = mat(0x3a3d43, { roughness: .95 });
  const vidrio = new THREE.MeshStandardMaterial({ color: 0x9fc4d6, transparent: true, opacity: .1, roughness: .05, metalness: .6, depthWrite: false, side: THREE.DoubleSide });
  const W = .56, ZF = -.8, ZT = .62, H = 1.7;            // medio ancho, frente, atrás, alto

  // piso con tapete y bandeja
  caja(W * 2, .05, ZT - ZF, mat(0x1f2023, { roughness: 1 }), 0, -.025, (ZF + ZT) / 2, g);
  caja(.7, .012, .5, mat(0x111214, { roughness: 1, map: texturaRuido("#222", 30, 64, 4) }), 0, .006, -.42, g);
  // pedales de traslación (decoración)
  for (const s of [-1, 1]) { const p = caja(.09, .02, .2, mat(ACERO, { metalness: .8, roughness: .3 }), s * .1, .12, -.62, g); p.rotation.x = -.5; }

  // pilares, techo y marco del parabrisas
  for (const [x, z] of [[-W, ZF], [W, ZF], [-W, ZT], [W, ZT]]) caja(.06, H, .06, pilar, x, H / 2, z, g);
  caja(W * 2 + .14, .08, ZT - ZF + .16, amarillo, 0, H + .04, (ZF + ZT) / 2, g);              // techo por fuera
  caja(W * 2, .02, ZT - ZF, techo, 0, H - .01, (ZF + ZT) / 2, g);                             // forro interior
  caja(W * 2, .05, .05, pilar, 0, .62, ZF, g);                                                // travesaño bajo del parabrisas
  caja(W * 2, .06, .05, pilar, 0, H - .04, ZF, g);
  // parabrisas (arriba y abajo) con limpiador
  const pb = new THREE.Mesh(new THREE.PlaneGeometry(W * 2 - .06, H - .7), vidrio); pb.position.set(0, .64 + (H - .7) / 2, ZF); g.add(pb);
  const pb2 = new THREE.Mesh(new THREE.PlaneGeometry(W * 2 - .06, .56), vidrio); pb2.position.set(0, .33, ZF); g.add(pb2);
  const limpiador = caja(.012, .7, .012, pilar, .25, 1.05, ZF + .02, g); limpiador.rotation.z = .35;
  // puerta (izquierda) con ventana y barra
  caja(.04, .55, ZT - ZF - .1, amarillo, -W, .3, (ZF + ZT) / 2, g);
  const vi = new THREE.Mesh(new THREE.PlaneGeometry(ZT - ZF - .1, H - .65), vidrio); vi.rotation.y = Math.PI / 2; vi.position.set(-W, .6 + (H - .65) / 2, (ZF + ZT) / 2); g.add(vi);
  caja(.03, .03, ZT - ZF - .1, pilar, -W, .6, (ZF + ZT) / 2, g); caja(.03, .03, ZT - ZF - .1, pilar, -W, 1.15, (ZF + ZT) / 2, g);
  caja(.025, .25, .025, mat(ACERO, { metalness: .9, roughness: .2 }), -W + .05, 1.0, .1, g);   // agarradera
  // lado derecho: ventana con rejilla de protección
  caja(.04, .55, ZT - ZF - .1, amarillo, W, .3, (ZF + ZT) / 2, g);
  const vd = vi.clone(); vd.position.x = W; g.add(vd);
  for (let i = 0; i < 5; i++) caja(.015, H - .7, .015, pilar, W + .03, .6 + (H - .7) / 2, ZF + .15 + i * .3, g);
  // pared trasera con ventanita
  caja(W * 2, .9, .05, interior, 0, .45, ZT, g); caja(W * 2, .25, .05, interior, 0, H - .13, ZT, g);
  const vt = new THREE.Mesh(new THREE.PlaneGeometry(W * 2 - .06, H - 1.15), vidrio); vt.position.set(0, .9 + (H - 1.15) / 2, ZT); g.add(vt);

  // asiento del operador con descansabrazos
  const tela = mat(0x202226, { roughness: .95 }), base = mat(GRIS_CLARO, { metalness: .5 });
  caja(.34, .3, .34, base, 0, .15, .28, g);
  caja(.5, .1, .5, tela, 0, .35, .22, g);
  const resp = caja(.5, .62, .1, tela, 0, .72, .5, g); resp.rotation.x = -.15;
  caja(.3, .18, .08, tela, 0, 1.13, .56, g);                                                   // cabecera
  for (const s of [-1, 1]) caja(.09, .06, .36, tela, s * .3, .58, .2, g);

  // tablero frontal derecho con indicadores y faro giratorio en el techo
  const tablero = new THREE.Group(); tablero.position.set(.38, .95, -.68); tablero.rotation.set(-.35, -.4, 0); g.add(tablero);
  caja(.26, .16, .04, mat(0x1a1b1e), 0, 0, 0, tablero);
  [["RPM", "#ffb547"], ["TEMP", "#39ff9a"], ["DIESEL", "#3ee6ff"]].forEach(([t, c], i) => {
    const ind = new THREE.Mesh(new THREE.CircleGeometry(.035, 32), new THREE.MeshBasicMaterial({ map: texturaIndicador(t, c) }));
    ind.position.set(-.08 + i * .08, .015, .021); tablero.add(ind);
  });
  const faro = new THREE.Mesh(new THREE.CylinderGeometry(.05, .06, .09, 20), new THREE.MeshStandardMaterial({ color: 0xff8a00, emissive: 0xff6a00, emissiveIntensity: 1.5, transparent: true, opacity: .9 }));
  faro.position.set(-.35, H + .13, ZT - .1); g.add(faro);
  // espejo retrovisor exterior (izquierda)
  const brazoEsp = caja(.02, .02, .25, pilar, -W - .12, 1.25, ZF + .05, g); brazoEsp.rotation.y = .5;
  const espejo = caja(.16, .1, .01, new THREE.MeshStandardMaterial({ color: 0xcfe3ee, metalness: 1, roughness: .05 }), -W - .22, 1.25, ZF - .05, g); espejo.rotation.y = .4;
  // cofre del motor (se ve por la ventana derecha)
  caja(1.1, .7, 1.7, amarillo, W + .75, -.05, .35, g);
  caja(.3, .12, .3, mat(0x222), W + 1.0, .36, .7, g);                                          // escape
  return { grupo: g, faro };
}

/* ---------------- brazo, balancín y pala (se ven desde la cabina) ---------------- */
export function crearBrazoReal() {
  const amarillo = mat(AMARILLO, { metalness: .3, roughness: .45 }), acero = mat(ACERO, { metalness: .85, roughness: .25 }), negro = mat(NEGRO);
  const raiz = new THREE.Group(); raiz.position.set(.85, .45, -.55);     // pie de la pluma: a la derecha de la cabina
  const pluma = new THREE.Group(); raiz.add(pluma);
  caja(.3, .36, 3.1, amarillo, 0, 0, -1.55, pluma);
  caja(.34, .1, .5, amarillo, 0, .2, -2.9, pluma);
  const cil1 = cilindro(.06, .06, 1.6, acero, pluma); cil1.rotation.x = Math.PI / 2 - .25; cil1.position.set(0, -.25, -.9);
  const balancin = new THREE.Group(); balancin.position.set(0, 0, -3.05); pluma.add(balancin);
  caja(.24, .28, 2.4, amarillo, 0, 0, -1.2, balancin);
  const cil2 = cilindro(.05, .05, 1.5, acero, balancin); cil2.rotation.x = Math.PI / 2; cil2.position.set(0, .26, -.6);
  const pala = new THREE.Group(); pala.position.set(0, 0, -2.4); balancin.add(pala);
  caja(.6, .5, .06, negro, 0, -.25, -.02, pala);                                                // espalda del cucharón
  caja(.6, .06, .45, negro, 0, -.5, -.22, pala);                                                // fondo
  for (const s of [-1, 1]) caja(.04, .5, .45, negro, s * .3, -.25, -.22, pala);
  for (let i = 0; i < 5; i++) caja(.05, .04, .12, acero, -.24 + i * .12, -.5, -.48, pala);       // dientes
  /** pala: grados del gemelo (-30 a 60) */
  function poner(paladeg) {
    pluma.rotation.x = rad(15 + .6 * paladeg);
    balancin.rotation.x = rad(-72 + .25 * paladeg);
    pala.rotation.x = rad(-40 + .4 * paladeg);
  }
  poner(15);
  return { grupo: raiz, poner };
}

/* ---------------- orugas debajo de la cabina ---------------- */
export function crearOrugas() {
  const g = new THREE.Group(); g.position.y = -ALTURA_PISO + .45;
  const tex = texturaOruga(); tex.repeat.set(1, 6);
  const banda = mat(0xffffff, { map: tex, roughness: .9 }), chasis = mat(0x2c2d30, { metalness: .4 });
  for (const s of [-1, 1]) {
    caja(.6, .8, 4.2, banda, s * 1.25, 0, .2, g);
    caja(.3, .35, 3.6, chasis, s * 1.25, .1, .2, g);
  }
  caja(1.9, .35, 1.2, chasis, 0, .25, .2, g);
  return g;
}

/* ---------------- obra de día (se coloca dentro de la arena, en unidades del gemelo) ---------------- */
export function crearObra() {
  const g = new THREE.Group();
  const tierra = mat(0xffffff, { map: texturaRuido("#7a5f3e", 38, 256, 60, 900), roughness: 1, metalness: 0 });
  const suelo = new THREE.Mesh(new THREE.CircleGeometry(60, 64), tierra); suelo.rotation.x = -Math.PI / 2; suelo.position.y = -.003; g.add(suelo);
  const montones = mat(0xffffff, { map: texturaRuido("#6a4c2e", 50, 128, 3, 200), roughness: 1, metalness: 0 });
  [[-2.5, -2, .7], [2.8, -1.2, .5], [-1.4, 2.6, .6], [3.2, 2.4, .8], [-4.2, -3.5, 1]].forEach(([x, z, r]) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, r * .7, 14), montones); m.position.set(x, r * .35, z); g.add(m);
  });
  const roca = mat(0x7c7f84, { roughness: .9, flatShading: true });
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * 7, r = 2 + Math.random() * 9, m = new THREE.Mesh(new THREE.DodecahedronGeometry(.05 + Math.random() * .12, 0), roca);
    m.position.set(Math.cos(a) * r, .03, Math.sin(a) * r); m.rotation.set(Math.random() * 3, Math.random() * 3, 0); g.add(m);
  }
  const naranja = mat(0xff6a00, { roughness: .5 }), blanco = mat(0xf2f2f2);
  [[-.9, -3], [0, -3.4], [.9, -3], [-4, 0], [4, .5]].forEach(([x, z]) => {
    const c = new THREE.Mesh(new THREE.ConeGeometry(.045, .18, 14), naranja); c.position.set(x, .09, z); g.add(c);
    const b = new THREE.Mesh(new THREE.CylinderGeometry(.03, .036, .03, 14), blanco); b.position.set(x, .1, z); g.add(b);
  });
  // camión de volteo
  const cam = new THREE.Group(); cam.position.set(4.2, 0, -3.2); cam.rotation.y = -.6; g.add(cam);
  const rojo = mat(0xb3261e, { metalness: .4, roughness: .4 }), llanta = mat(0x111111, { roughness: .9 });
  caja(.55, .4, .5, rojo, 0, .42, .75, cam); caja(.6, .35, 1.1, mat(0xb8862b, { metalness: .15, roughness: .7 }), 0, .55, -.1, cam);
  caja(.5, .18, .02, mat(0x8fb5c9, { metalness: .8, roughness: .1 }), 0, .55, 1.0, cam);
  for (const [x, z] of [[-.3, .7], [.3, .7], [-.3, -.3], [.3, -.3], [-.3, -.6], [.3, -.6]]) {
    const ll = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, .1, 18), llanta); ll.rotation.z = Math.PI / 2; ll.position.set(x, .13, z); cam.add(ll);
  }
  // cerca de obra con cinta
  const poste = mat(0xdedede), cinta = mat(0xffcc00, { emissive: 0x332200 });
  for (let i = 0; i < 36; i++) {
    const a = i / 36 * Math.PI * 2, x = Math.cos(a) * 7.5, z = Math.sin(a) * 7.5;
    caja(.03, .3, .03, poste, x, .15, z, g);
    const sig = (i + 1) / 36 * Math.PI * 2, x2 = Math.cos(sig) * 7.5, z2 = Math.sin(sig) * 7.5;
    const l = Math.hypot(x2 - x, z2 - z), t = caja(l, .025, .005, cinta, (x + x2) / 2, .26, (z + z2) / 2, g); t.rotation.y = -Math.atan2(z2 - z, x2 - x);
  }
  // árboles y cerros a lo lejos
  const hoja = mat(0x2f5a2a, { roughness: 1, flatShading: true }), tronco = mat(0x5a3d22);
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * 7, r = 10 + Math.random() * 18, s = .6 + Math.random() * .8;
    const t = new THREE.Group(); t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); t.scale.setScalar(s); g.add(t);
    const tr = cilindro(.05, .07, .5, tronco, t, 6); tr.position.y = .25;
    const co = new THREE.Mesh(new THREE.ConeGeometry(.35, .9, 7), hoja); co.position.y = .85; t.add(co);
  }
  const cerro = mat(0x7d8b8f, { roughness: 1, flatShading: true });
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2 + Math.random() * .3, r = 42 + Math.random() * 8, h = 3 + Math.random() * 5;
    const c = new THREE.Mesh(new THREE.ConeGeometry(8 + Math.random() * 6, h, 6), cerro); c.position.set(Math.cos(a) * r, h / 2 - .2, Math.sin(a) * r); g.add(c);
  }
  return g;
}

/** Cielo de día (domo con degradado) para el modo VR. */
export function crearCieloDia() {
  return new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.MeshBasicMaterial({ map: texturaCielo(), side: THREE.BackSide, fog: false, depthWrite: false }));
}
