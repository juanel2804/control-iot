/* =========================================================================
   Excavadora XR · controles del Meta Quest (Touch y manos)
   · Palancas: se agarran con el GRIP (controles) o pellizcando (manos) y se inclinan.
   · Sticks: izq. = orugas, der. = brazo/cabina; SOLO con los dos grips apretados (hombre muerto).
   · A = STOP · B = mantén para hablar · X = prender/apagar · Y = centrar · gatillo = apuntar y oprimir.
   · En realidad mixta: gatillo apuntando al piso = anclar el holograma sobre la excavadora real.
   Soltar todo = DETENER. Vibración al cambiar de comando, "motor" mientras se mueve y fuerte en STOP.
   ========================================================================= */
import * as THREE from "three";
import { XRControllerModelFactory } from "three/addons/webxr/XRControllerModelFactory.js";
import { XRHandModelFactory } from "three/addons/webxr/XRHandModelFactory.js";
import { mantener, soltar, alto, pulso, actual, origenActual, aviso, ETIQUETA } from "./enlace.js";

const UMBRAL_STICK = .55, UMBRAL_PALANCA = .4, RECORRIDO = .07;
const acotar = (v, a, b) => Math.max(a, Math.min(b, v));
const BTN = { gatillo: 0, grip: 1, stick: 3, a: 4, b: 5 };   // mapeo "xr-standard" del Quest

export function crearControlXR(renderer, mundo, { estadoGemelo, alHablar, alSoltarHablar, alCentrar, modoActual, kai = null, alTocarKai = () => {}, alBoton = () => {} }) {
  const { escena, consola, reticula } = mundo;
  const fabControles = new XRControllerModelFactory(), fabManos = new XRHandModelFactory();
  const ray = new THREE.Raycaster(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), mat = new THREE.Matrix4();
  // KAI se toca como un botón más (con el dedo, el control o apuntándole con el gatillo)
  const botones = kai ? [...consola.botones, { accion: "KAI", malla: kai, esfera: .09 }] : consola.botones;
  const mallasBotones = botones.map(b => b.malla);
  const salida = { seguro: false, seguroTxt: "TOMA LOS CONTROLES", origen: "", ultimo: null };
  let ultimoMotor = 0;

  const manos = [0, 1].map(i => {
    const m = { i, ray: renderer.xr.getController(i), grip: renderer.xr.getControllerGrip(i), mano: renderer.xr.getHand(i),
      src: null, previo: [], palanca: null, botonRay: null, toque: null, hit: null };
    const laser = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
      new THREE.LineBasicMaterial({ color: 0x3ee6ff, transparent: true, opacity: .8 }));
    laser.scale.z = 3; m.ray.add(laser); m.laser = laser;
    const punta = new THREE.Mesh(new THREE.SphereGeometry(.008, 10, 8), new THREE.MeshBasicMaterial({ color: 0x3ee6ff }));
    punta.visible = false; escena.add(punta); m.punta = punta;
    m.grip.add(fabControles.createControllerModel(m.grip));
    m.mano.add(fabManos.createHandModel(m.mano, "mesh"));
    escena.add(m.ray, m.grip, m.mano);
    m.ray.addEventListener("connected", e => { m.src = e.data; m.previo = []; laser.scale.z = e.data.hand ? 1 : 3; pedirHitTest(m); });
    m.ray.addEventListener("disconnected", () => { soltarPalanca(m); liberarBoton(m); m.src = null; m.hit?.cancel?.(); m.hit = null; });
    m.ray.addEventListener("selectstart", () => alSeleccionar(m));
    m.ray.addEventListener("selectend", () => { if (m.src?.hand) soltarPalanca(m); if (m.botonRay) { soltarBoton(m.botonRay); m.botonRay = null; } });
    m.ray.addEventListener("squeezestart", () => { if (!m.src?.hand) agarrarSiCerca(m); });
    m.ray.addEventListener("squeezeend", () => { if (!m.src?.hand) soltarPalanca(m); });
    return m;
  });
  const lado = l => manos.find(m => m.src?.handedness === l);

  /* ---------------- vibración ---------------- */
  function vibrar(m, fuerza, ms) { try { m?.src?.gamepad?.hapticActuators?.[0]?.pulse?.(fuerza, ms); } catch {} }
  const vibrarTodos = (f, ms) => manos.forEach(m => vibrar(m, f, ms));

  /* ---------------- dónde está la mano ---------------- */
  function puntoAgarre(m, v) {
    if (m.src?.hand) {
      const a = m.mano.joints?.["index-finger-tip"], b = m.mano.joints?.["thumb-tip"];
      if (a && b) return a.getWorldPosition(v).add(b.getWorldPosition(tmp2)).multiplyScalar(.5);
    }
    return m.grip.getWorldPosition(v);
  }
  function puntoToque(m, v) {
    if (m.src?.hand) { const j = m.mano.joints?.["index-finger-tip"]; if (j) return j.getWorldPosition(v); return null; }
    return m.ray.getWorldPosition(v);
  }

  /* ---------------- palancas ---------------- */
  function agarrarSiCerca(m) {
    const p = puntoAgarre(m, new THREE.Vector3());
    let mejor = null, dmin = m.src?.hand ? .06 : .09;
    for (const pal of consola.palancas) {
      if (pal.agarre) continue;
      const d = pal.perilla.getWorldPosition(tmp).distanceTo(p); if (d < dmin) { dmin = d; mejor = pal; }
    }
    if (!mejor) return false;
    const local = consola.grupo.worldToLocal(p.clone());
    mejor.agarre = m; mejor.inicio = local.sub(reposo(mejor)).sub(new THREE.Vector3(mejor.inc.x * RECORRIDO, 0, mejor.inc.z * RECORRIDO));
    m.palanca = mejor; vibrar(m, .5, 30);
    return true;
  }
  const reposo = pal => pal.pivote.position.clone().add(new THREE.Vector3(0, .135, 0));
  function soltarPalanca(m) { if (m.palanca) { m.palanca.agarre = null; m.palanca.cmd = null; m.palanca = null; } }
  function moverPalancas(dt) {
    for (const pal of consola.palancas) {
      if (pal.agarre) {
        const local = consola.grupo.worldToLocal(puntoAgarre(pal.agarre, new THREE.Vector3())).sub(reposo(pal)).sub(pal.inicio);
        pal.inc.x = acotar(local.x / RECORRIDO, -1, 1); pal.inc.z = acotar(local.z / RECORRIDO, -1, 1);
        const ax = Math.abs(pal.inc.x), az = Math.abs(pal.inc.z), f = Math.max(ax, az);
        // con histéresis: arranca a 0.4 y se suelta a 0.3
        const umbral = pal.cmd ? UMBRAL_PALANCA - .1 : UMBRAL_PALANCA;
        const nuevo = f < umbral ? null : az >= ax ? (pal.inc.z < 0 ? pal.mapa.ad : pal.mapa.at) : (pal.inc.x < 0 ? pal.mapa.iz : pal.mapa.de);
        if (nuevo !== pal.cmd && nuevo) vibrar(pal.agarre, .35, 25);
        pal.cmd = nuevo; pal.fuerza = f;
      } else {                                                   // resorte: regresa al centro
        const k = Math.min(1, dt * 12); pal.inc.x -= pal.inc.x * k; pal.inc.z -= pal.inc.z * k; pal.cmd = null; pal.fuerza = 0;
      }
      pal.pivote.rotation.set(pal.inc.z * .5, 0, -pal.inc.x * .5);
    }
  }

  /* ---------------- botones de la consola ---------------- */
  function presionarBoton(b, m) {
    b.apretado = true; if (b.yBase != null) b.malla.position.y = b.yBase - .006; vibrar(m, b.accion === "STOP" ? 1 : .45, b.accion === "STOP" ? 150 : 35);
    switch (b.accion) {
      case "KAI": alTocarKai(); break;
      case "STOP": alto(); vibrarTodos(1, 150); break;
      case "ENCENDER_APAGAR": pulso(b.accion, 400); break;
      case "AUX_1": case "AUX_2": case "AUX_3": pulso(b.accion, 500); break;
      case "VOZ": alHablar(); break;
      case "CENTRAR": alCentrar(); break;
      default: alBoton(b.accion);                                  // RETO, CLIMA, RADIO
    }
  }
  function soltarBoton(b) { if (!b.apretado) return; b.apretado = false; if (b.yBase != null) b.malla.position.y = b.yBase; if (b.accion === "VOZ") alSoltarHablar(); }
  function liberarBoton(m) { if (m.toque) { soltarBoton(m.toque); m.toque = null; } if (m.botonRay) { soltarBoton(m.botonRay); m.botonRay = null; } }
  function tocarBotones() {                                       // con la punta del control o del dedo índice
    for (const m of manos) {
      if (!m.src) continue;
      const p = puntoToque(m, new THREE.Vector3()); let tocado = null;
      if (p) for (const b of botones) {
        if (!b.malla.visible || (b.esfera && !mundo.soporteKai.visible)) continue;
        const l = b.malla.worldToLocal(p.clone());
        const dentro = b.esfera ? l.length() < b.esfera
          : b.accion === "STOP" ? Math.hypot(l.x, l.z) < .046 && l.y > -.02 && l.y < .03
          : Math.abs(l.x) < .04 && Math.abs(l.z) < .025 && l.y > -.012 && l.y < .022;
        if (dentro) { tocado = b; break; }
      }
      if (tocado !== m.toque) { if (m.toque) soltarBoton(m.toque); if (tocado) presionarBoton(tocado, m); m.toque = tocado; }
    }
  }

  /* ---------------- gatillo / pellizco: apuntar y oprimir, o anclar el holograma ---------------- */
  function rayo(m) {
    m.ray.updateMatrixWorld(); mat.identity().extractRotation(m.ray.matrixWorld);
    ray.ray.origin.setFromMatrixPosition(m.ray.matrixWorld); ray.ray.direction.set(0, 0, -1).applyMatrix4(mat);
    ray.far = 6; return ray;
  }
  function alSeleccionar(m) {
    if (m.src?.hand && agarrarSiCerca(m)) return;
    const golpe = rayo(m).intersectObjects(mallasBotones, true)[0];
    if (golpe) {
      const b = botones.find(b => b.malla === golpe.object || b.malla === golpe.object.parent);
      if (b) { m.botonRay = b; presionarBoton(b, m); return; }
    }
    if (modoActual() !== "mr") return;
    // anclar el holograma donde apunta (superficie real con hit-test o, si no hay, el piso)
    let punto = null;
    if (reticula.visible) punto = new THREE.Vector3().setFromMatrixPosition(reticula.matrix);
    else { const r = ray.ray; if (r.direction.y < -.05) { const t = -r.origin.y / r.direction.y; if (t < 6) punto = r.origin.clone().addScaledVector(r.direction, t); } }
    if (!punto) return;
    const d = ray.ray.direction; mundo.anclar(punto, Math.atan2(d.x, d.z), estadoGemelo());
    vibrar(m, .6, 60); aviso("Holograma anclado: apunta desde atrás de la excavadora real", 3500);
  }

  /* ---------------- hit-test (solo realidad mixta, control derecho) ---------------- */
  function pedirHitTest(m) {
    const s = renderer.xr.getSession();
    if (!s || modoActual() !== "mr" || !m.src || m.src.hand || m.src.handedness !== "right" || !s.requestHitTestSource) return;
    s.requestHitTestSource({ space: m.src.targetRaySpace }).then(h => { m.hit = h; }).catch(() => {});
  }
  function actualizarReticula(frame) {
    reticula.visible = false;
    const m = lado("right"); if (!frame || !m?.hit || modoActual() !== "mr") return;
    const r = frame.getHitTestResults(m.hit)[0]; if (!r) return;
    const pose = r.getPose(renderer.xr.getReferenceSpace()); if (!pose) return;
    reticula.matrix.fromArray(pose.transform.matrix); reticula.visible = true;
  }

  /* ---------------- láser: se acorta al tocar un botón ---------------- */
  function laseres() {
    for (const m of manos) {
      if (!m.src) { m.punta.visible = false; continue; }
      const g = rayo(m).intersectObjects(mallasBotones, true)[0];
      const largo = g ? g.distance : (m.src.hand ? .4 : 3);
      m.laser.scale.z = largo; m.laser.material.color.setHex(g ? 0x39ff9a : 0x3ee6ff);
      m.punta.visible = !!g; if (g) m.punta.position.copy(g.point);
    }
  }

  /* ---------------- botones físicos y sticks ---------------- */
  function botonesFisicos() {
    for (const m of manos) {
      const gp = m.src?.gamepad; if (!gp || m.src.hand) continue;
      const ahora = gp.buttons.map(b => b.pressed), antes = m.previo, baja = k => ahora[k] && !antes[k], sube = k => !ahora[k] && antes[k];
      if (m.src.handedness === "right") {
        if (baja(BTN.a)) { alto(); vibrarTodos(1, 150); }
        if (baja(BTN.b)) { vibrar(m, .3, 30); alHablar(); }
        if (sube(BTN.b)) alSoltarHablar();
      } else {
        if (baja(BTN.a)) { pulso("ENCENDER_APAGAR", 400); vibrar(m, .45, 35); }
        if (baja(BTN.b)) alCentrar();
      }
      m.previo = ahora;
    }
  }
  function stick(m, mapa) {
    const ax = m?.src?.gamepad?.axes; if (!ax || ax.length < 4) return null;
    const x = ax[2], y = ax[3], f = Math.max(Math.abs(x), Math.abs(y)); if (f < UMBRAL_STICK) return null;
    return { c: Math.abs(y) >= Math.abs(x) ? (y < 0 ? mapa.ad : mapa.at) : (x < 0 ? mapa.iz : mapa.de), f };
  }

  /* ---------------- cada cuadro ---------------- */
  function cuadro(dt, frame) {
    botonesFisicos(); moverPalancas(dt); tocarBotones(); laseres(); actualizarReticula(frame);
    const controles = manos.filter(m => m.src?.gamepad && !m.src.hand), conManos = manos.some(m => m.src?.hand);
    const grip = m => !!m.src.gamepad.buttons[BTN.grip]?.pressed;
    const seguroSticks = controles.length >= 2 ? controles.every(grip) : controles.length === 1 ? grip(controles[0]) : false;
    const palancas = consola.palancas.filter(p => p.agarre);
    const seguro = seguroSticks || palancas.length > 0;

    const cand = [];
    for (const p of palancas) if (p.cmd) cand.push({ c: p.cmd, f: p.fuerza, de: `PALANCA ${p.nombre.toUpperCase()}`, m: p.agarre });
    if (seguroSticks) {
      const iz = lado("left"), de = lado("right");
      const a = stick(iz, consola.palancas[0].mapa), b = stick(de, consola.palancas[1].mapa);
      if (a) cand.push({ ...a, de: "STICK IZQUIERDO", m: iz }); if (b) cand.push({ ...b, de: "STICK DERECHO", m: de });
    }
    const mejor = cand.sort((x, y) => y.f - x.f)[0] || null;
    const cur = actual(), org = origenActual();
    if (mejor) {
      if (cur !== mejor.c || org !== "manual") { mantener(mejor.c, "manual"); if (actual() === mejor.c) vibrar(mejor.m, .35, 30); }
      salida.origen = mejor.de;
      const ahora = performance.now();
      if (ahora - ultimoMotor > 250) { ultimoMotor = ahora; vibrar(mejor.m, .07, 40); }   // el "motor" se siente
    } else if (cur && org === "manual") {
      soltar(); if (salida.seguro && !seguro) vibrarTodos(.8, 90);
      salida.origen = "";
    }
    salida.entrada = !!mejor;                                       // ¿hay palanca o stick activo? (bloqueo tras un reto)
    salida.seguro = seguro;
    salida.seguroTxt = conManos && !controles.length ? "PELLIZCA UNA PALANCA PARA MANEJAR"
      : controles.length ? "MANTÉN LOS DOS GRIPS PARA MANEJAR" : "TOMA LOS CONTROLES";
    return salida;
  }

  /** Suelta todo (al pausar la sesión o salir). */
  function soltarTodo() { manos.forEach(m => { soltarPalanca(m); liberarBoton(m); }); if (actual()) soltar(); }

  return { cuadro, soltarTodo, vibrarTodos, pedirHitTests: () => manos.forEach(pedirHitTest) };
}
export { ETIQUETA };
