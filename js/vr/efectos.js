/* =========================================================================
   Excavadora XR · inmersión
   - Clima: día, atardecer (faros de trabajo), niebla y lluvia (gotas en el parabrisas y limpiador)
   - Polvo que levantan las orugas y el cucharón
   - Vibración ligera de la cabina con el motor (solo la cabina: el mundo no se mueve, para no marear)
   - Espejo retrovisor que de verdad refleja la obra de atrás
   - Radio y sonido (sonido.js)
   ========================================================================= */
import * as THREE from "three";
import * as son from "./sonido.js";

const sinAcentos = t => t.normalize("NFD").replace(/[̀-ͯ]/g, "");
export const CLIMAS = ["dia", "atardecer", "niebla", "lluvia"];
export const NOMBRE_CLIMA = { dia: "día soleado", atardecer: "atardecer", niebla: "niebla", lluvia: "lluvia" };
const PARAM = {
  dia:       { fondo: 0xbcd3e6, niebla: [0xc9d6df, 40, 220], hemi: [0xdcefff, 1.4], sol: 1.5, faros: 0,  cielo: ["#2f6fb8", "#7fb3e6", "#d9e6ee"] },
  atardecer: { fondo: 0xf0b98f, niebla: [0xe0a47f, 30, 170], hemi: [0xffb27a, .75], sol: .55, faros: 9, cielo: ["#2a2a5e", "#d9735a", "#ffc58a"] },
  niebla:    { fondo: 0xb3babd, niebla: [0xb3babd, 5, 42],   hemi: [0xdde3e6, 1.0], sol: .4,  faros: 4,  cielo: ["#9aa3a8", "#b3babd", "#c4c9cb"] },
  lluvia:    { fondo: 0x6f7c86, niebla: [0x6f7c86, 14, 100], hemi: [0xa9b7c3, .8], sol: .25, faros: 5,  cielo: ["#3d4852", "#69767f", "#8a959c"] },
};
function texturaCielo([arriba, medio, horizonte]) {
  const cv = document.createElement("canvas"); cv.width = 16; cv.height = 512; const c = cv.getContext("2d");
  const g = c.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, arriba); g.addColorStop(.42, medio); g.addColorStop(.5, horizonte); g.addColorStop(.52, "#9c8d74"); g.addColorStop(1, "#6e6150");
  c.fillStyle = g; c.fillRect(0, 0, 16, 512);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function crearEfectos(renderer, mundo) {
  const { escena, puesto, cabina, brazoReal, efectosArena, cieloDia, solDia, sol } = mundo;
  let clima = CLIMAS.includes(localStorage.getItem("vr_clima")) ? localStorage.getItem("vr_clima") : "dia";
  const cielos = { dia: cieloDia.material.map };
  for (const k of CLIMAS) if (!cielos[k]) cielos[k] = texturaCielo(PARAM[k].cielo);

  /* ---------------- lluvia: gotas como líneas alrededor del usuario (metros) ---------------- */
  const NL = 900, posL = new Float32Array(NL * 6);
  const geoL = new THREE.BufferGeometry(); geoL.setAttribute("position", new THREE.BufferAttribute(posL, 3));
  const lluvia = new THREE.LineSegments(geoL, new THREE.LineBasicMaterial({ color: 0xb9d4ea, transparent: true, opacity: .42, depthWrite: false }));
  lluvia.frustumCulled = false; lluvia.visible = false; puesto.add(lluvia);
  const gota = (i, y = Math.random() * 9) => {
    let x = (Math.random() - .5) * 16, z = -14 + Math.random() * 18;
    if (mundo.modoActual === "vr" && Math.abs(x) < .8 && z > -1.05 && z < .9) x += Math.sign(x || 1) * 1.1;   // no llueve dentro de la cabina
    posL.set([x, y, z, x + .02, y + .38, z], i * 6);
  };
  for (let i = 0; i < NL; i++) gota(i);

  /* ---------------- polvo: partículas con su propia transparencia (unidades del gemelo) ---------------- */
  const NP = 220, posP = new Float32Array(NP * 3).fill(-50), vidaP = new Float32Array(NP), velP = new Float32Array(NP * 3);
  const geoP = new THREE.BufferGeometry();
  geoP.setAttribute("position", new THREE.BufferAttribute(posP, 3)); geoP.setAttribute("vida", new THREE.BufferAttribute(vidaP, 1));
  const matP = new THREE.ShaderMaterial({
    uniforms: { tam: { value: .25 }, color: { value: new THREE.Color(0xa8875e) } }, transparent: true, depthWrite: false,
    vertexShader: `attribute float vida; varying float a; uniform float tam;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = tam * (1.0 + (1.0 - vida) * 2.0) * (420.0 / max(.3, -mv.z)); a = vida; }`,
    fragmentShader: `uniform vec3 color; varying float a;
      void main() { float r = length(gl_PointCoord - .5); if (r > .5) discard; gl_FragColor = vec4(color, a * .55 * (1.0 - r * 2.0)); }`,
  });
  const polvo = new THREE.Points(geoP, matP); polvo.frustumCulled = false; efectosArena.add(polvo);
  let siguienteP = 0;
  /** Suelta n partículas de polvo en (x, y, z) de la arena. */
  function soltarPolvo(x, y, z, n = 6, fuerza = 1) {
    for (let k = 0; k < n; k++) {
      const i = siguienteP; siguienteP = (siguienteP + 1) % NP;
      posP.set([x + (Math.random() - .5) * .12, y + Math.random() * .05, z + (Math.random() - .5) * .12], i * 3);
      velP.set([(Math.random() - .5) * .35 * fuerza, (.12 + Math.random() * .25) * fuerza, (Math.random() - .5) * .35 * fuerza], i * 3);
      vidaP[i] = .7 + Math.random() * .3;
    }
  }

  /* ---------------- espejo retrovisor con cámara propia ---------------- */
  const rt = new THREE.WebGLRenderTarget(256, 160);
  rt.texture.colorSpace = THREE.SRGBColorSpace; rt.texture.repeat.x = -1; rt.texture.offset.x = 1;     // un espejo invierte izquierda-derecha
  const camEsp = new THREE.PerspectiveCamera(50, 1.6, .2, 300);
  camEsp.position.copy(cabina.espejo.position); camEsp.rotation.set(-.06, Math.PI - .32, 0); cabina.grupo.add(camEsp);
  cabina.espejo.material = new THREE.MeshBasicMaterial({ map: rt.texture });
  let cuadroEsp = 0;
  function pintarEspejo() {
    if (mundo.modoActual !== "vr" || ++cuadroEsp % 3) return;      // 1 de cada 3 cuadros basta
    const xrOn = renderer.xr.enabled, previo = renderer.getRenderTarget();
    renderer.xr.enabled = false; cabina.espejo.visible = false;
    renderer.setRenderTarget(rt); renderer.render(escena, camEsp); renderer.setRenderTarget(previo);
    renderer.xr.enabled = xrOn; cabina.espejo.visible = true;
  }

  /* ---------------- gotas en el parabrisas y limpiador ---------------- */
  const { cv, tex } = cabina.gotas.userData, cg = cv.getContext("2d");
  let angLimp = 1.4, dirLimp = -1, tGotas = 0;
  cabina.limpiador.rotation.z = angLimp;
  function gotasYLimpiador(dt) {
    const llueve = clima === "lluvia" && mundo.modoActual === "vr";
    if (llueve) {
      angLimp += dirLimp * dt * 2.2;
      if (angLimp < -.8 || angLimp > 1.4) { angLimp = Math.max(-.8, Math.min(1.4, angLimp)); dirLimp *= -1; cg.clearRect(0, 0, 256, 256); tex.needsUpdate = true; }
      if ((tGotas += dt) > .06) {
        tGotas = 0;
        for (let k = 0; k < 3; k++) {
          const x = Math.random() * 256, y = Math.random() * 256, r = 1.5 + Math.random() * 3.5;
          const g = cg.createRadialGradient(x - r * .3, y - r * .3, 0, x, y, r);
          g.addColorStop(0, "rgba(255,255,255,.55)"); g.addColorStop(.6, "rgba(190,215,235,.28)"); g.addColorStop(1, "rgba(120,150,170,0)");
          cg.fillStyle = g; cg.beginPath(); cg.arc(x, y, r, 0, 7); cg.fill();
        }
        tex.needsUpdate = true;
      }
    } else if (angLimp < 1.4) angLimp = Math.min(1.4, angLimp + dt * 2.2);   // se estaciona solo
    cabina.limpiador.rotation.z = angLimp;
  }

  /* ---------------- aplicar el clima al modo actual ---------------- */
  function aplicar() {
    const m = mundo.modoActual, P = PARAM[clima], vr = m === "vr";
    if (vr) {
      escena.background = new THREE.Color(P.fondo); escena.fog = new THREE.Fog(...P.niebla);
      solDia.color.setHex(P.hemi[0]); solDia.intensity = P.hemi[1]; sol.intensity = P.sol;
      cieloDia.material.map = cielos[clima]; cieloDia.material.needsUpdate = true;
    } else {
      sol.intensity = 1.5;
      if (m === "2d" && clima === "niebla") escena.fog = new THREE.Fog(0x0b1222, 3, 13);
      if (m === "2d" && clima === "lluvia") escena.fog = new THREE.Fog(0x070b14, 6, 22);
    }
    cabina.faros.forEach(f => { f.intensity = vr ? P.faros : 0; });
    cabina.lucesFaro.forEach(l => l.material.color.setHex(vr && P.faros ? 0xfff6d8 : 0x555555));
    lluvia.visible = clima === "lluvia" && m !== "mr";
    cabina.gotas.visible = clima === "lluvia" && vr;
    if (cabina.gotas.visible === false) { cg.clearRect(0, 0, 256, 256); tex.needsUpdate = true; }
    son.lluvia(clima === "lluvia" && m !== "mr");
    matP.uniforms.tam.value = vr ? .9 : .22;
  }
  mundo.alModo.push(aplicar);

  function ponerClima(c) { if (!CLIMAS.includes(c)) return clima; clima = c; try { localStorage.setItem("vr_clima", c); } catch {} aplicar(); return clima; }
  const siguienteClima = () => ponerClima(CLIMAS[(CLIMAS.indexOf(clima) + 1) % CLIMAS.length]);

  /* ---------------- cada cuadro ---------------- */
  let t = 0, tPolvo = 0;
  const ORUGAS = { AVANZAR: 1, RETROCEDER: -1, GIRO_IZQUIERDA: 0, GIRO_DERECHA: 0 };
  function cuadro(dt, gem, c) {
    t += dt; const m = mundo.modoActual;
    // vibración del motor: solo la cabina y el brazo, unos milímetros
    const amp = m === "vr" ? (c ? (c in ORUGAS ? .0032 : .0018) : .0007) : 0;
    const dy = amp * (Math.sin(t * 47) + .5 * Math.sin(t * 31 + 1.3));
    cabina.grupo.position.y = dy; brazoReal.grupo.position.y = .45 + dy;
    // polvo de las orugas
    if (m !== "mr" && c in ORUGAS && (tPolvo += dt) > .05) {
      tPolvo = 0;
      const f = [Math.sin(gem.rumbo), Math.cos(gem.rumbo)], l = [Math.cos(gem.rumbo), -Math.sin(gem.rumbo)], atras = ORUGAS[c] || .3;
      for (const s of [-1, 1]) soltarPolvo(gem.x + l[0] * .36 * s - f[0] * .5 * atras, .03, gem.z + l[1] * .36 * s - f[1] * .5 * atras, 2, .8);
    }
    for (let i = 0; i < NP; i++) {
      if (vidaP[i] <= 0) continue;
      vidaP[i] -= dt * .9;
      if (vidaP[i] <= 0) { posP[i * 3 + 1] = -50; continue; }
      for (let k = 0; k < 3; k++) posP[i * 3 + k] += velP[i * 3 + k] * dt;
      velP[i * 3 + 1] -= dt * .05;
    }
    geoP.attributes.position.needsUpdate = true; geoP.attributes.vida.needsUpdate = true;
    // lluvia
    if (lluvia.visible) {
      const caida = dt * 9;
      for (let i = 0; i < NL; i++) { posL[i * 6 + 1] -= caida; posL[i * 6 + 4] -= caida; if (posL[i * 6 + 1] < 0) gota(i, 9); }
      geoL.attributes.position.needsUpdate = true;
    }
    gotasYLimpiador(dt);
  }

  /** Órdenes de voz de clima, radio y sonido. Regresa { sub, dicho } o null si no es para aquí. */
  function comandoVoz(texto) {
    const t = sinAcentos(texto.toLowerCase());
    if (/\b(radio|musica|cancion|rola)\b/.test(t)) {
      const on = son.radio(/\b(apaga|quita|para|deten|silencio)\b/.test(t) ? false : /\b(pon|prende|enciende|pone|ponle)\b/.test(t) ? true : undefined);
      return { sub: `“${texto}” → radio ${on ? "prendida" : "apagada"}`, dicho: on ? "Radio de la obra prendida." : "Radio apagada." };
    }
    if (/\b(silencio|sin sonido|mute|quita el sonido|apaga el sonido)\b/.test(t)) { son.activar(false); return { sub: `“${texto}” → sonido apagado`, dicho: "Listo, sin sonidos de la máquina." }; }
    if (/\b(prende|activa|pon) el sonido\b/.test(t)) { son.activar(true); return { sub: `“${texto}” → sonido prendido`, dicho: "Sonido de la máquina prendido." }; }
    let c = null;
    if (/\b(llueve|lluvia|llover|lluvioso)\b/.test(t)) c = "lluvia";
    else if (/\b(atardecer|anochecer|noche|oscuro)\b/.test(t)) c = "atardecer";
    else if (/\b(niebla|neblina|nublado)\b/.test(t)) c = "niebla";
    else if (/\b(de dia|soleado|despejado|que salga el sol)\b/.test(t)) c = "dia";
    else if (/\b(cambia el clima|otro clima|clima)\b/.test(t)) c = CLIMAS[(CLIMAS.indexOf(clima) + 1) % CLIMAS.length];
    if (!c) return null;
    ponerClima(c);
    return { sub: `“${texto}” → clima: ${NOMBRE_CLIMA[c]}`, dicho: c === "lluvia" ? "Que llueva. Prendo los limpiadores y los faros." : c === "atardecer" ? "Atardecer en la obra. Faros de trabajo encendidos." : c === "niebla" ? "Niebla cerrada. Maneja con cuidado." : "Día despejado." };
  }

  aplicar();
  return { cuadro, pintarEspejo, soltarPolvo, ponerClima, siguienteClima, comandoVoz, get clima() { return clima; } };
}
