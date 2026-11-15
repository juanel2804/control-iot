/* =========================================================================
   Excavadora XR · KAI como guía
   - Tutorial la primera vez (en el simulador): avanzar, girar, pala, cabina y STOP, esperando a que lo hagas.
   - Avisos del turno de la sala: de quién es el turno, «quedan 15 segundos» y fin del turno.
   - Zona segura virtual: si el gemelo se acerca al límite, KAI avisa; si lo pasa alejándose, frena la excavadora.
     Ojo: la posición es la del gemelo (estimada a partir de los comandos), no un GPS de la máquina.
   ========================================================================= */
import * as THREE from "three";
import * as E from "./enlace.js";
import { efecto } from "./sonido.js";

const sinAcentos = t => t.normalize("NFD").replace(/[̀-ͯ]/g, "");
export const ZONA = { aviso: 4.2, alto: 4.7 };            // radios en unidades del gemelo (en la cabina VR, ×4 m)

const PASOS = [
  { dice: "Vamos a practicar en el simulador; la excavadora real no se mueve. Primero agarra la palanca izquierda, o mantén los dos grips, y empújala hacia adelante para avanzar.",
    listo: c => c === "AVANZAR", pista: "Palanca izquierda hacia adelante. Si usas los sticks, mantén los dos grips." },
  { dice: "¡Bien! Ahora inclina la palanca izquierda hacia un lado para girar la máquina.", listo: c => /^GIRO_/.test(c), pista: "Palanca izquierda a la izquierda o a la derecha." },
  { dice: "La palanca derecha mueve el brazo. Jálala hacia ti para bajar la pala y empújala para subirla.", listo: c => /^PALA_/.test(c), pista: "Palanca derecha adelante o atrás." },
  { dice: "Inclina la palanca derecha a un lado para rotar la cabina.", listo: c => /^ROTACION_/.test(c), pista: "Palanca derecha a la izquierda o a la derecha." },
  { dice: "Por último, el freno de emergencia: aprieta el hongo rojo o el botón A.", listo: (c, alto) => alto, pista: "El botón rojo grande de en medio, o la A del control derecho." },
];

export function crearGuia({ mundo, gem, kai, juegos, enXR = () => true, espectador = false }) {
  const decir = (t, alerta = false) => kai.decir(t, { alerta });
  let T = null;                       // tutorial en curso { k, t, pistaDada }

  /* ---------------- tutorial ---------------- */
  function iniciarTutorial() {
    if (mundo.modoActual === "mr") { decir("El tutorial es en la cabina VR."); return false; }
    juegos.terminar(null, true);
    E.modoJuego(true); T = { k: 0, t: 0, pistaDada: false };
    decir(PASOS[0].dice); return true;
  }
  function terminarTutorial(completo, marcar = true) {
    if (!T) return; T = null; E.modoJuego(false);
    if (marcar) try { localStorage.setItem("vr_tutorial", "1"); } catch {}
    if (completo) { efecto.medalla(); decir("¡Listo, ya sabes manejar! Ya tienes el control real. Para jugar en el simulador toca el botón RETO, o dime: carga el camión."); }
  }
  const avanzar = (c, alto = false) => {
    if (!T || !PASOS[T.k].listo(c, alto)) return;
    efecto.acierto(); T.k++; T.t = 0; T.pistaDada = false;
    if (T.k >= PASOS.length) terminarTutorial(true); else setTimeout(() => T && decir(PASOS[T.k].dice), 700);
  };
  E.on("comando", ({ c }) => { if (c !== "DETENER") avanzar(c); });
  E.on("alto", () => avanzar(null, true));
  const primeraVez = () => { try { return !localStorage.getItem("vr_tutorial"); } catch { return false; } };

  /* ---------------- zona segura ---------------- */
  const aroZona = new THREE.Mesh(new THREE.RingGeometry(ZONA.alto - .03, ZONA.alto, 128),
    new THREE.MeshBasicMaterial({ color: 0xff2a4a, transparent: true, opacity: .55, side: THREE.DoubleSide, depthWrite: false }));
  aroZona.rotation.x = -Math.PI / 2; aroZona.position.y = .006; mundo.retos.parent.add(aroZona);
  const aroAviso = new THREE.Mesh(new THREE.RingGeometry(ZONA.aviso - .015, ZONA.aviso, 128),
    new THREE.MeshBasicMaterial({ color: 0xffb547, transparent: true, opacity: .35, side: THREE.DoubleSide, depthWrite: false }));
  aroAviso.rotation.x = -Math.PI / 2; aroAviso.position.y = .005; mundo.retos.parent.add(aroAviso);
  mundo.alModo.push(m => { aroZona.visible = aroAviso.visible = m !== "mr"; });
  const Z = { avisado: false, frenado: 0 };
  function zonaSegura(c, ahora, enXR) {
    const d = Math.hypot(gem.x, gem.z);
    if (d < ZONA.aviso - .2) Z.avisado = false;
    if (d > ZONA.aviso && !Z.avisado) { Z.avisado = true; decir("Te acercas al límite de la zona segura."); }
    const s = { AVANZAR: 1, RETROCEDER: -1 }[c];
    // solo frena quien maneja: un reto, este control moviendo la máquina o alguien dentro de las gafas (la tele no)
    if (d > ZONA.alto && s && (E.enJuego() || E.actual() || enXR)) {
      const sale = (gem.x * Math.sin(gem.rumbo) + gem.z * Math.cos(gem.rumbo)) * s > 0;   // ¿el movimiento la aleja del centro?
      if (sale && ahora - Z.frenado > 1500) {
        Z.frenado = ahora; E.enJuego() ? E.altoLocal() : E.alto(); efecto.error();
        decir("Saliste de la zona segura, así que frené. Gira hacia el centro para regresar.", true);
        E.aviso("ZONA SEGURA: frenado automático", 5000);
      }
    }
    aroZona.material.opacity = d > ZONA.aviso ? .55 + .35 * Math.sin(ahora / 120) : .45;
  }

  /* ---------------- turnos de la sala ---------------- */
  const S = { id: null, avisado15: false };
  function restanTurno() {
    const t = E.estado.sala?.turno; if (!t) return null;
    const corre = E.estado.sala.pausada ? 0 : performance.now() - E.estado.salaRecibida;
    return Math.max(0, (t.restan_ms - corre) / 1000);
  }
  E.on("sala", s => {
    const t = s?.turno, id = t ? t.id + ":" + t.total_ms : null;
    if (id === S.id) return;
    if (!enXR()) { S.id = id; return; }
    const antes = S.id; S.id = id; S.avisado15 = false;
    if (!s?.abierta) return;
    if (t) decir(`Turno de ${t.nombre}: ${Math.round(t.total_ms / 1000)} segundos. ¡Adelante!`);
    else if (antes) decir("Terminó el turno. Por seguridad, la excavadora se detiene.");
  });
  function turnos() {
    const r = restanTurno(); if (r == null || E.estado.sala?.pausada) return;
    if (r <= 15 && r > 1 && !S.avisado15) { S.avisado15 = true; efecto.conteo(); decir(`Quedan ${Math.ceil(r)} segundos del turno de ${E.estado.sala.turno.nombre}.`); }
  }

  /* ---------------- cada cuadro ---------------- */
  function cuadro(dt, c, ahora, enXR) {
    if (!espectador) zonaSegura(c, ahora, enXR);
    if (enXR) turnos();
    if (T && (T.t += dt) > 18 && !T.pistaDada) { T.pistaDada = true; decir(PASOS[T.k].pista); }
    if (T && T.t > 45) { T.k++; T.t = 0; T.pistaDada = false; if (T.k >= PASOS.length) terminarTutorial(true); else decir(PASOS[T.k].dice); }
  }

  /** Órdenes de voz del tutorial. */
  function comandoVoz(texto) {
    const t = sinAcentos(texto.toLowerCase()), sub = `“${texto}”`;
    if (/\b(tutorial|ensename|como se maneja|como manejo|practicar|practica)\b/.test(t)) { iniciarTutorial(); return { sub: `${sub} → tutorial`, dicho: null }; }
    if (T && /\b(salta|saltar|omite|omitir|ya se|ya se manejar|sin tutorial)\b/.test(t)) { terminarTutorial(false); return { sub: `${sub} → sin tutorial`, dicho: "Sin tutorial. Tienes el control real." }; }
    if (/\b(cuanto|cuantos) (tiempo|segundos)|\bturno\b/.test(t)) {
      const r = restanTurno();
      return { sub: `${sub} → turno`, dicho: r == null ? "No hay turno en curso en la sala." : `Al turno de ${E.estado.sala.turno.nombre} le quedan ${Math.ceil(r)} segundos.` };
    }
    return null;
  }

  return { cuadro, comandoVoz, iniciarTutorial, terminarTutorial, primeraVez, restanTurno, get tutorial() { return !!T; },
    get linea() { return T ? `📘 TUTORIAL ${T.k + 1}/${PASOS.length} · ${PASOS[T.k].pista}` : ""; } };
}
