/* =========================================================================
   Excavadora XR · retos (SOLO en el gemelo: mientras hay un reto, nada sale a la excavadora real)
   carga  → Carga el camión: muerde el montón y descarga en el camión antes de que se acabe el tiempo
   zanja  → Zanja guiada: sigue la línea con la pala abajo; puntaje por precisión
   slalom → Slalom de conos contra reloj: pasa cada cono por el lado marcado sin tirarlo
   pared  → Demoler la pared: tira los bloques con el cucharón o con la máquina (física sencilla)
   simon  → KAI dice: repite la secuencia de movimientos que dice KAI; cada ronda es más larga
   Medallas del día y récords: se guardan en este dispositivo (localStorage).
   Coordenadas: unidades del gemelo dentro de la arena (en la cabina VR, 1 unidad = 4 m).
   ========================================================================= */
import * as THREE from "three";
import * as E from "./enlace.js";
import { nuevoEstado } from "./mundo.js";
import { efecto } from "./sonido.js";

export const RETOS = ["carga", "zanja", "slalom", "pared", "simon"];
export const NOMBRE = { carga: "Carga el camión", zanja: "Zanja guiada", slalom: "Slalom de conos", pared: "Demoler la pared", simon: "KAI dice" };
export const MEDALLAS = { camionero: "Camionero", cirujano: "Pulso de cirujano", sinChocar: "Sin chocar", rapido: "El más rápido del día",
  demoledor: "Demoledor", memoria: "Memoria de elefante" };
const DICHO = { AVANZAR: "avanza", RETROCEDER: "reversa", GIRO_IZQUIERDA: "gira a la izquierda", GIRO_DERECHA: "gira a la derecha",
  PALA_ARRIBA: "sube la pala", PALA_ABAJO: "baja la pala", ROTACION_IZQUIERDA: "rota la cabina a la izquierda", ROTACION_DERECHA: "rota la cabina a la derecha" };
const MOVS = Object.keys(DICHO);

const sinAcentos = t => t.normalize("NFD").replace(/[̀-ͯ]/g, "");
const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const leerJSON = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const guardarJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const reloj = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .6, metalness: .1, ...extra });

// lugares de la obra (coinciden con cabina.js / mundo.js)
const PILA = { x: 2.8, z: -1.2, r: .58 };
const CAMION = { x: 4.2, z: -3.2, rot: -.6 };
const CAJA = { x: 4.26, z: -3.28 };                       // centro de la caja del camión de la obra

export function crearJuegos({ mundo, gem, kai, efectos, alIniciar = () => {} }) {
  const grupo = mundo.retos;
  const pp = new THREE.Vector3(), ppPrev = new THREE.Vector3();
  let R = null;                 // reto en curso
  let resultado = null;         // { texto, hasta } se queda unos segundos en el HUD
  let indice = -1;              // para el botón RETO (va pasando de uno en uno)

  const decir = (t, alerta = false) => kai.decir(t, { alerta });

  /* ---------------- medallas y récords ---------------- */
  const medallasHoy = () => leerJSON("vr_medallas", {})[hoy()] || [];
  function otorgar(id) {
    const todas = leerJSON("vr_medallas", {}), lista = todas[hoy()] || [];
    if (lista.includes(id)) return false;
    lista.push(id); todas[hoy()] = lista; guardarJSON("vr_medallas", todas); return true;
  }
  const records = () => leerJSON("vr_records", {});
  function record(clave, valor, mejorEsMayor = true) {
    const r = records(), antes = r[clave];
    const mejor = antes == null || (mejorEsMayor ? valor > antes : valor < antes);
    if (mejor) { r[clave] = valor; guardarJSON("vr_records", r); }
    return mejor;
  }

  /* ---------------- utilidades de escena ---------------- */
  function limpiar() { while (grupo.children.length) { const o = grupo.children.pop(); o.traverse?.(x => { x.geometry?.dispose?.(); }); } }
  function flecha(color = 0xff3ec8) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.ConeGeometry(.09, .2, 16), mat(color, { emissive: color, emissiveIntensity: 1.2 })); m.rotation.x = Math.PI; g.add(m);
    const aro = new THREE.Mesh(new THREE.RingGeometry(.2, .24, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .6, side: THREE.DoubleSide }));
    aro.rotation.x = -Math.PI / 2; aro.userData.aro = true; g.add(aro);
    grupo.add(g); return g;
  }
  function ponerFlecha(f, x, z, alto, t) {
    f.position.set(x, 0, z); f.children[0].position.y = alto + .12 + Math.sin(t * 4) * .06;
    const aro = f.children[1]; aro.position.y = .01; aro.scale.setScalar(1 + .15 * Math.sin(t * 5));
  }
  function cono(x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const c = new THREE.Mesh(new THREE.ConeGeometry(.07, .26, 16), mat(0xff6a00, { emissive: 0x401400 })); c.position.y = .13; g.add(c);
    const b = new THREE.Mesh(new THREE.CylinderGeometry(.04, .05, .04, 16), mat(0xf4f4f4, { emissive: 0x333333 })); b.position.y = .15; g.add(b);
    const base = new THREE.Mesh(new THREE.BoxGeometry(.16, .015, .16), mat(0x222222)); base.position.y = .008; g.add(base);
    grupo.add(g); return g;
  }
  function franja(x1, z1, x2, z2, color = 0xffd23e, ancho = .04) {
    const l = dist2(x1, z1, x2, z2), m = new THREE.Mesh(new THREE.BoxGeometry(ancho, .006, l), new THREE.MeshBasicMaterial({ color }));
    m.position.set((x1 + x2) / 2, .006, (z1 + z2) / 2); m.rotation.y = Math.atan2(x2 - x1, z2 - z1); grupo.add(m); return m;
  }
  function camion2D() {                                     // en la vista 2D no se ve la obra: camión sencillo
    const g = new THREE.Group(); g.position.set(CAMION.x, 0, CAMION.z); g.rotation.y = CAMION.rot;
    const rojo = mat(0xb3261e), caja = mat(0xb8862b);
    const a = new THREE.Mesh(new THREE.BoxGeometry(.5, .32, .45), rojo); a.position.set(0, .26, .7); g.add(a);
    const b = new THREE.Mesh(new THREE.BoxGeometry(.6, .3, 1.0), caja); b.position.set(0, .3, -.15); g.add(b);
    g.userData.solo2D = true; grupo.add(g); return g;
  }

  /* ---------------- arranque y fin ---------------- */
  function iniciar(id) {
    if (!RETOS.includes(id)) return null;
    if (mundo.modoActual === "mr") { decir("Los retos son en la cabina VR o en la pantalla. En realidad mixta manejas la excavadora real."); return null; }
    terminar(null, true);
    alIniciar(id);
    E.modoJuego(true);                                     // desde aquí todo va al gemelo
    Object.assign(gem, nuevoEstado()); mundo.ponerCarga(0); limpiar();
    R = { id, t: 0, cuenta: 3, inicio: performance.now(), pistas: 0, ultimaPista: 0 };
    ARMAR[id](R);
    indice = RETOS.indexOf(id);
    decir(`${NOMBRE[id]}. ${R.instrucciones} Tres, dos, uno…`);
    return R;
  }
  /** Termina el reto. texto: lo que dice KAI (null = cancelado sin resumen). */
  function terminar(texto = null, silencio = false) {
    if (!R) return;
    const id = R.id; R = null;
    limpiar(); mundo.ponerCarga(0);
    E.modoJuego(false); Object.assign(gem, nuevoEstado());
    if (texto) { resultado = { texto, hasta: performance.now() + 12000 }; decir(texto); }
    else if (!silencio) { resultado = { texto: `${NOMBRE[id]} cancelado`, hasta: performance.now() + 4000 }; decir("Reto cancelado. Regresas al control normal."); }
  }
  function medallasDe(ids) {
    const nuevas = ids.filter(otorgar);
    if (nuevas.length) { setTimeout(efecto.medalla, 300); return ` ¡Ganaste la medalla ${nuevas.map(m => MEDALLAS[m]).join(" y ")}!`; }
    return "";
  }
  function pista(texto, cada = 22) {
    if (R.t - R.ultimaPista < cada) return;
    R.ultimaPista = R.t; decir(texto);
  }

  /* ---------------- definición de cada reto ---------------- */
  const ARMAR = {
    carga(r) {
      const st = E.estado.sala?.turno;
      const restan = st ? (st.restan_ms - (performance.now() - E.estado.salaRecibida)) / 1000 : 0;
      r.limite = restan > 25 ? Math.floor(restan) : 120;
      r.carga = 0; r.cargas = 0; r.flecha = flecha();
      r.camion = camion2D();
      r.monton = new THREE.Mesh(new THREE.SphereGeometry(.28, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x6a4c2e, { roughness: 1 }));
      r.monton.position.set(CAJA.x, .44, CAJA.z); r.monton.scale.set(1, .02, 1.4); r.monton.rotation.y = CAMION.rot; grupo.add(r.monton);
      r.instrucciones = "Muerde el montón marcado con la pala hasta el piso, súbela y descarga en el camión. Cada carga cuenta.";
    },
    zanja(r) {
      r.pts = [[0, .8], [0, 2.2], [1.0, 3.0], [2.2, 3.4]];
      r.largo = 0; r.tramos = [];
      for (let i = 1; i < r.pts.length; i++) {
        const [x1, z1] = r.pts[i - 1], [x2, z2] = r.pts[i], l = dist2(x1, z1, x2, z2);
        r.tramos.push({ x1, z1, x2, z2, l, s0: r.largo }); r.largo += l;
        const n = Math.floor(l / .16);
        for (let k = 0; k < n; k += 2) franja(x1 + (x2 - x1) * k / n, z1 + (z2 - z1) * k / n, x1 + (x2 - x1) * (k + 1) / n, z1 + (z2 - z1) * (k + 1) / n);
      }
      franja(-.35, .8, .35, .8, 0x39ff9a, .06); const [fx, fz] = r.pts.at(-1); franja(fx, fz - .35, fx, fz + .35, 0xff2a4a, .06);
      r.marcas = new THREE.InstancedMesh(new THREE.BoxGeometry(.26, .012, .2), mat(0x3a2817, { roughness: 1 }), 400); r.marcas.count = 0; grupo.add(r.marcas);
      r.muestras = []; r.avance = 0; r.ultimo = null; r.limite = 150; r.dummy = new THREE.Object3D();
      r.instrucciones = "Baja la pala para cavar y sigue la línea amarilla hasta la meta roja. Entre más pegado a la línea, más puntos.";
    },
    slalom(r) {
      r.conos = [1.1, 1.8, 2.5, 3.2].map((z, i) => ({ z, lado: i % 2 ? 1 : -1, m: cono(0, z), tirado: false, pasado: false }));
      r.guias = r.conos.map(c => { const g = new THREE.Mesh(new THREE.CircleGeometry(.16, 24), new THREE.MeshBasicMaterial({ color: 0x39ff9a, transparent: true, opacity: .45 }));
        g.rotation.x = -Math.PI / 2; g.position.set(c.lado * .6, .008, c.z); grupo.add(g); return g; });
      franja(-.9, .6, .9, .6, 0x39ff9a, .06); franja(-.9, 3.8, .9, 3.8, 0xff2a4a, .06);
      for (const x of [-.9, .9]) for (const z of [.6, 3.8]) { const p = new THREE.Mesh(new THREE.BoxGeometry(.04, .5, .04), mat(z > 1 ? 0xff2a4a : 0x39ff9a, { emissive: z > 1 ? 0x550000 : 0x004422 })); p.position.set(x, .25, z); grupo.add(p); }
      r.corriendo = false; r.crono = 0; r.choques = 0; r.malLado = 0; r.zPrev = 0; r.limite = 120;
      r.instrucciones = "Pasa cada cono por el lado del círculo verde, sin tirarlos, y cruza la meta roja. Cada cono tirado suma 3 segundos y por el lado equivocado 5.";
    },
    pared(r) {
      r.bloques = []; const TAM = .2, COL = 6, FIL = 4;
      const ladrillo = mat(0xa8442a, { roughness: .9 }), gris = mat(0x8d8f93, { roughness: .9 });
      for (let f = 0; f < FIL; f++) for (let c = 0; c < COL; c++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(TAM * .97, TAM * .97, TAM * .97), (f + c) % 2 ? ladrillo : gris);
        const x = (c - (COL - 1) / 2) * TAM, y = TAM / 2 + f * TAM, z = 2.0;
        m.position.set(x, y, z); grupo.add(m);
        r.bloques.push({ m, c, f, base: m.position.clone(), v: new THREE.Vector3(), w: new THREE.Vector3(), estado: "fijo" });   // fijo | cae | suelo
      }
      r.COL = COL; r.limite = 90; r.golpes = 0;
      r.instrucciones = "Tira todos los bloques de la pared con el cucharón o empujando con la máquina.";
    },
    simon(r) {
      r.ronda = 0; r.seq = []; r.k = 0; r.ultimo = null; r.esperando = false; r.tRonda = 0; r.limite = 9999;
      r.instrucciones = "Escucha la secuencia y repítela con las palancas, en orden. Cada ronda es más larga.";
    },
  };

  const TICK = {
    carga(r, dt) {
      const p = mundo.puntaPala(pp), vr = mundo.modoActual === "vr", tope = vr ? .7 : .45;
      r.camion.visible = !vr;
      const enPila = dist2(p.x, p.z, PILA.x, PILA.z) < PILA.r && p.y < .24;
      if (r.carga < 1 && enPila) {
        r.carga = Math.min(1, r.carga + dt / .8); mundo.ponerCarga(r.carga);
        if (Math.random() < .3) efectos.soltarPolvo(p.x, .05, p.z, 3, .7);
        if (r.carga >= 1) { efecto.tierra(); r.ultimaPista = r.t; decir(r.cargas ? "Lleno." : "¡Cucharón lleno! Súbelo y llévalo al camión."); }
      }
      if (r.carga >= 1 && dist2(p.x, p.z, CAJA.x, CAJA.z) < .62 && p.y > tope) {
        r.carga = 0; r.cargas++; mundo.ponerCarga(0); efecto.tierra(); efecto.acierto(); r.ultimaPista = r.t;
        efectos.soltarPolvo(CAJA.x, tope, CAJA.z, 14, 1.2);
        r.monton.scale.y = Math.min(1.1, .02 + r.cargas * .25); r.monton.position.y = vr ? .55 : .45;
        decir(r.cargas === 1 ? "¡Primera carga! Ve por otra." : `¡${r.cargas} cargas!`);
      }
      const objetivo = r.carga >= 1 ? [CAJA.x, CAJA.z, vr ? .95 : .7] : [PILA.x, PILA.z, .5];
      ponerFlecha(r.flecha, ...objetivo, r.t);
      if (r.carga < 1) pista("Acércate al montón marcado con la flecha y baja la pala hasta el piso.");
      else pista("Sube la pala al máximo y gira la cabina hasta que el cucharón quede sobre el camión.");
      if (r.t >= r.limite) {
        const n = r.cargas, nuevo = record("carga", n);
        terminar(`Se acabó el tiempo. Hiciste ${n} ${n === 1 ? "carga" : "cargas"}.${nuevo && n ? " ¡Nuevo récord!" : ""}${medallasDe(n >= 3 ? ["camionero"] : [])}`);
      }
      return `${NOMBRE.carga} · ${reloj(Math.max(0, r.limite - r.t))} · cargas ${r.cargas} · cucharón ${Math.round(r.carga * 100)}%`;
    },
    zanja(r, dt) {
      // punto más cercano de la línea
      let mejor = { d: 9, s: 0 };
      for (const t of r.tramos) {
        const dx = t.x2 - t.x1, dz = t.z2 - t.z1, u = Math.max(0, Math.min(1, ((gem.x - t.x1) * dx + (gem.z - t.z1) * dz) / (t.l * t.l)));
        const d = dist2(gem.x, gem.z, t.x1 + dx * u, t.z1 + dz * u); if (d < mejor.d) mejor = { d, s: t.s0 + u * t.l };
      }
      const movio = !r.ultimo || dist2(gem.x, gem.z, r.ultimo[0], r.ultimo[1]) > .09;
      if (movio && gem.pala < 0) {
        r.ultimo = [gem.x, gem.z];
        if (r.marcas.count < 400) { r.dummy.position.set(gem.x, .005, gem.z); r.dummy.rotation.y = gem.rumbo; r.dummy.updateMatrix(); r.marcas.setMatrixAt(r.marcas.count++, r.dummy.matrix); r.marcas.instanceMatrix.needsUpdate = true; }
        r.muestras.push(Math.max(0, 1 - mejor.d / .45)); r.avance = Math.max(r.avance, mejor.s);
        const p = mundo.puntaPala(pp); efectos.soltarPolvo(p.x, .04, p.z, 3, .6);
      } else if (movio && gem.pala >= 0 && (E.actual() === "AVANZAR")) pista("Baja la pala para cavar mientras avanzas.", 12);
      const prec = r.muestras.length ? r.muestras.reduce((a, b) => a + b, 0) / r.muestras.length : 0;
      if (mejor.d > .6 && r.muestras.length) pista("Te saliste de la línea: regresa a la franja amarilla.", 10);
      if (r.avance >= r.largo - .2) {
        const pct = Math.round(prec * 100), nuevo = record("zanja", pct);
        terminar(`¡Zanja terminada en ${Math.round(r.t)} segundos con ${pct} por ciento de precisión!${nuevo ? " ¡Nuevo récord!" : ""}${medallasDe(pct >= 90 && r.muestras.length >= 10 ? ["cirujano"] : [])}`);
      } else if (r.t >= r.limite) terminar(`Se acabó el tiempo. Llegaste al ${Math.round(r.avance / r.largo * 100)} por ciento de la zanja.`);
      return `${NOMBRE.zanja} · ${reloj(r.t)} · avance ${Math.round(r.avance / r.largo * 100)}% · precisión ${Math.round(prec * 100)}%`;
    },
    slalom(r, dt) {
      if (!r.corriendo && gem.z > .6) { r.corriendo = true; efecto.conteo(true); }
      if (r.corriendo) r.crono += dt;
      for (const [i, c] of r.conos.entries()) {
        if (!c.tirado && dist2(gem.x, gem.z, 0, c.z) < .42) {
          c.tirado = true; r.choques++; efecto.golpe(.8); efectos.soltarPolvo(0, .05, c.z, 8);
          c.m.rotation.set(Math.PI / 2, 0, Math.atan2(gem.x, c.z - gem.z)); c.m.position.y = .05;
          decir("¡Tiraste un cono! Más tres segundos.", true);
        }
        if (!c.pasado && r.zPrev < c.z && gem.z >= c.z) {
          c.pasado = true; r.guias[i].visible = false;
          if (Math.sign(gem.x || 1) !== c.lado) { r.malLado++; efecto.error(); decir("Por el otro lado. Más cinco segundos.", true); } else efecto.boton();
        }
      }
      r.zPrev = gem.z;
      const total = r.crono + r.choques * 3 + r.malLado * 5;
      if (gem.z >= 3.8 && r.conos.every(c => c.pasado)) {
        const t = Math.round(total * 10) / 10, nuevo = (!r.choques && !r.malLado) && record("slalom_" + hoy(), t, false);
        const limpio = !r.choques && !r.malLado, meds = limpio ? ["sinChocar"] : [];
        if (nuevo && limpio) meds.push("rapido");                       // el mejor tiempo del día solo cuenta si fue limpio
        terminar(`¡Meta! Tu tiempo fue de ${t} segundos${r.choques || r.malLado ? `, con ${r.choques} conos tirados y ${r.malLado} por el lado equivocado` : ", limpio"}.${nuevo ? " ¡Es el mejor tiempo de hoy!" : ""}${medallasDe(meds)}`);
      } else if (gem.z >= 3.8) pista("Te faltó pasar algún cono. Regresa por él.", 10);
      else if (r.t >= r.limite) terminar("Se acabó el tiempo del slalom.");
      return `${NOMBRE.slalom} · ${total.toFixed(1)} s · conos tirados ${r.choques} · lado equivocado ${r.malLado}`;
    },
    pared(r, dt) {
      const p = mundo.puntaPala(pp), vp = ppPrev.distanceTo(p) / Math.max(dt, .001); const dir = new THREE.Vector3();
      ppPrev.copy(p);
      const empujar = (b, desde, fuerza) => {
        dir.subVectors(b.m.position, desde); dir.y = Math.max(0, dir.y); dir.normalize();
        b.v.copy(dir).multiplyScalar(fuerza).add(new THREE.Vector3(0, .5 + Math.random() * .4, 0));
        b.w.set(Math.random() * 6 - 3, Math.random() * 6 - 3, Math.random() * 6 - 3);
        if (b.estado !== "cae") { b.estado = "cae"; r.golpes++; }
        if (r.t - (r.ultimoGolpe || 0) > .12) { r.ultimoGolpe = r.t; efecto.golpe(.6); efectos.soltarPolvo(b.m.position.x, b.m.position.y, b.m.position.z, 6); }
      };
      const cuerpo = new THREE.Vector3(gem.x, .25, gem.z);
      for (const b of r.bloques) {
        if (b.estado === "suelo" && b.v.lengthSq() < .0001) { if (p.distanceTo(b.m.position) < .15) empujar(b, p, 1.2); continue; }
        if (p.distanceTo(b.m.position) < .17) empujar(b, p, Math.max(1.3, vp * 1.3));
        else if (b.m.position.y < .5 && dist2(gem.x, gem.z, b.m.position.x, b.m.position.z) < .5) empujar(b, cuerpo, 1.3);
        if (b.estado === "fijo" && b.f > 0) {                               // si se cae el de abajo, se cae éste
          const abajo = r.bloques[(b.f - 1) * r.COL + b.c];
          if (abajo.estado !== "fijo") { b.estado = "cae"; b.v.set((Math.random() - .5) * .2, 0, (Math.random() - .5) * .2); b.w.set(Math.random() * 2, 0, Math.random() * 2); }
        }
        if (b.estado === "cae" || b.v.lengthSq() > .0001) {
          b.v.y -= 2.45 * dt; b.m.position.addScaledVector(b.v, dt);
          b.m.rotation.x += b.w.x * dt; b.m.rotation.y += b.w.y * dt; b.m.rotation.z += b.w.z * dt;
          if (b.m.position.y < .1) {
            b.m.position.y = .1; b.v.y = -b.v.y * .3; b.v.x *= .65; b.v.z *= .65; b.w.multiplyScalar(.6);
            if (b.v.length() < .06) { b.v.set(0, 0, 0); b.w.set(0, 0, 0); b.estado = "suelo"; }
          }
        }
      }
      const tirados = r.bloques.filter(b => b.estado !== "fijo" || b.m.position.distanceTo(b.base) > .15).length, total = r.bloques.length;
      if (tirados >= total) {
        const t = Math.round(r.t), nuevo = record("pared", t, false);
        terminar(`¡Pared demolida en ${t} segundos!${nuevo ? " ¡Nuevo récord!" : ""}${medallasDe(t <= 40 ? ["demoledor"] : [])}`);
      } else if (r.t >= r.limite) terminar(`Se acabó el tiempo. Tiraste ${tirados} de ${total} bloques.`);
      else if (tirados === 0) pista("Avanza hacia la pared y golpéala con el cucharón, o rota la cabina contra ella.");
      return `${NOMBRE.pared} · ${reloj(r.t)} · bloques ${tirados}/${total}`;
    },
    simon(r, dt) {
      if (!r.esperando && !r.siguiente) { r.siguiente = setTimeout(() => nuevaRonda(r), r.ronda ? 1200 : 300); }
      if (r.esperando && (r.tRonda += dt) > 12 + r.seq.length * 3) {
        terminar(`Se acabó el tiempo de la ronda. Llegaste a la ronda ${r.ronda}.`);
      }
      return `${NOMBRE.simon} · ronda ${Math.max(1, r.ronda)} · ${r.esperando ? `paso ${r.k + 1} de ${r.seq.length}` : "escucha…"}`;
    },
  };

  function nuevaRonda(r) {
    if (R !== r) return;
    r.siguiente = null; r.ronda++; r.k = 0; r.tRonda = 0; r.ultimo = null;
    let prev = r.seq.at(-1); r.seq = [];
    for (let i = 0; i < r.ronda + 1; i++) { let c; do c = MOVS[Math.floor(Math.random() * MOVS.length)]; while (c === prev); r.seq.push(c); prev = c; }
    r.esperando = true;
    decir(`Ronda ${r.ronda}. KAI dice: ${r.seq.map(c => DICHO[c]).join(", ")}.`);
  }
  // KAI dice: escucha los comandos que de verdad se ejecutaron en el gemelo
  E.on("comando", ({ c }) => {
    if (!R || R.id !== "simon" || !R.esperando) return;
    if (c === "DETENER") { R.ultimo = null; return; }
    if (c === R.ultimo || !MOVS.includes(c)) return;
    R.ultimo = c;
    if (c === R.seq[R.k]) {
      R.k++; efecto.boton();
      if (R.k >= R.seq.length) {
        R.esperando = false; efecto.acierto();
        if (R.ronda >= 10) { record("simon", R.ronda); terminar(`¡Increíble! Completaste las 10 rondas.${medallasDe(["memoria"])}`); }
      }
    } else {
      const n = R.ronda - 1, tocaba = DICHO[R.seq[R.k]], nuevo = record("simon", n); efecto.error();
      terminar(`¡Uy! Tocaba ${tocaba}. Completaste ${n} ${n === 1 ? "ronda" : "rondas"}.${nuevo && n ? " ¡Nuevo récord!" : ""}${medallasDe(n >= 5 ? ["memoria"] : [])}`);
    }
  });

  /* ---------------- cada cuadro ---------------- */
  let linea = "";
  function cuadro(dt) {
    if (!R) { linea = resultado && resultado.hasta > performance.now() ? "🏁 " + resultado.texto : ""; return; }
    if (R.cuenta > 0) {
      const antes = Math.ceil(R.cuenta); R.cuenta -= dt;
      if (Math.ceil(R.cuenta) !== antes || R.cuenta <= 0) efecto.conteo(R.cuenta <= 0);
      linea = `${NOMBRE[R.id]} · empieza en ${Math.max(1, Math.ceil(R.cuenta))}…`;
      if (R.id === "carga") ponerFlecha(R.flecha, PILA.x, PILA.z, .5, R.t + R.cuenta);
      return;
    }
    R.t += dt;
    const r = R, txt = TICK[R.id](R, dt);
    if (R === r) linea = "🎮 " + txt;
  }

  /** Botón RETO: pasa al siguiente reto; después del último, regresa al control normal. */
  function siguiente() {
    const k = (R ? RETOS.indexOf(R.id) : indice) + 1;
    if (k >= RETOS.length) { indice = -1; terminar(); return null; }
    return iniciar(RETOS[k]);
  }

  /** Órdenes de voz de los retos. Regresa { sub, dicho } o null si no es para aquí. */
  function comandoVoz(texto) {
    const t = sinAcentos(texto.toLowerCase()), sub = `“${texto}”`;
    if (/\b(sal|salir|termina|terminar|deja|dejar|cancela|cancelar|quita|acaba)\b.*\b(reto|juego)\b|\bsalir del reto\b/.test(t)) {
      if (!R) return { sub, dicho: "No hay ningún reto en curso." };
      terminar(null, true); resultado = { texto: "Reto cancelado", hasta: performance.now() + 4000 };
      return { sub: `${sub} → fin del reto`, dicho: "Reto cancelado. Regresas al control normal." };
    }
    if (/\bmedallas?\b/.test(t)) {
      const m = medallasHoy();
      return { sub: `${sub} → medallas`, dicho: m.length ? `Hoy llevas ${m.length}: ${m.map(x => MEDALLAS[x]).join(", ")}.` : "Todavía no ganas medallas hoy. Di: carga el camión, zanja, slalom, pared o KAI dice." };
    }
    let id = null;
    if (/\b(carga|cargar|camion)\b/.test(t)) id = "carga";
    else if (/\bzanja\b/.test(t)) id = "zanja";
    else if (/\b(slalom|conos?)\b/.test(t)) id = "slalom";
    else if (/\b(pared|demoler|demolicion|derriba|derribar|bloques)\b/.test(t)) id = "pared";
    else if (/\b(simon|kai dice|memoria)\b/.test(t)) id = "simon";
    else if (/\b(reto|retos|juego|jugar|juguemos)\b/.test(t)) {
      return { sub: `${sub} → retos`, dicho: "Tengo cinco retos en el simulador: carga el camión, zanja guiada, slalom de conos, demoler la pared y KAI dice. ¿Cuál quieres?" };
    }
    if (!id) return null;
    const r = iniciar(id);
    return r ? { sub: `${sub} → reto: ${NOMBRE[id]}`, dicho: null } : { sub, dicho: null };
  }

  return { iniciar, terminar, siguiente, cuadro, comandoVoz, medallasHoy, records, get depurar() { return R; },
    get activo() { return R?.id || null; }, get linea() { return linea; } };
}
