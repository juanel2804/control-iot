/* =========================================================================
   Excavadora XR · órdenes habladas
   Mismas reglas que la voz de index.html: órdenes cortas van directo; frases largas o rutinas
   van al copiloto (Claude en la API) y, si no está, a las rutinas integradas.
   ========================================================================= */
import { API_BASE, vehiculo, llave, ETIQUETA, alto, pulso, mantener, ejecutarPlan, simulando, estado, espEnLinea } from "./enlace.js";

const sinAcentos = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const INTERRUPTOR = "ENCENDER_APAGAR", PULSO_INTERRUPTOR = 400;
const NUM = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12 };

export function interpretar(frase) {
  const limpio = sinAcentos(frase.toLowerCase()).replace(/[!¡?¿]|(?<!\d)[.,]|[.,](?!\d)/g, " ").trim();
  const continuo = /\b(sin parar|continuo|sigue)\b/.test(limpio);
  const t = " " + limpio.replace(/\bsin parar\b/g, " ") + " ", hay = re => re.test(t);
  if (hay(/\b(alto|parate|parale|detente|deten|detener|stop|frena|quieto)\b/) || /^(para|parar|ya)$/.test(limpio)) return { c: "DETENER" };
  let c = null;
  const aux = t.match(/\b(auxiliar|aux)\s+(1|2|3|uno|dos|tres)\b/);
  const izq = hay(/\bizquierda\b/), der = hay(/\bderecha\b/);
  if (hay(/\b(prende|prender|enciende|encender|apaga|apagar)\b/)) return { c: INTERRUPTOR, ms: PULSO_INTERRUPTOR };
  if (aux) c = `AUX_${NUM[aux[2]] || aux[2]}`;
  else if (hay(/\b(sube|subir|subela|levanta|arriba)\b/)) c = "PALA_ARRIBA";
  else if (hay(/\b(baja|bajar|bajala|abajo)\b/)) c = "PALA_ABAJO";
  else if (hay(/\b(cabina|torre|rota|rotar|voltea)\b/) && (izq || der)) c = izq ? "ROTACION_IZQUIERDA" : "ROTACION_DERECHA";
  else if (izq) c = "GIRO_IZQUIERDA"; else if (der) c = "GIRO_DERECHA";
  else if (hay(/\b(atras|retrocede|reversa|regresa)\b/)) c = "RETROCEDER";
  else if (hay(/\b(avanza|avanzar|adelante|camina)\b/)) c = "AVANZAR";
  if (!c) return null;
  let ms = 1000;
  if (continuo) ms = 0; else if (hay(/\bmedio segundo\b/)) ms = 500;
  else { const m = t.match(/(\d+(?:[.,]\d+)?|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s*(segundos?|seg)\b/);
         if (m) ms = Math.min(10, NUM[m[1]] || parseFloat(m[1].replace(",", "."))) * 1000; }
  return { c, ms };
}

const P = (c, ms) => ({ comando: c, duracion_ms: ms });
const RUTINAS = [
  [/zanja|excava|cava/, "Zanja: bajo la pala, avanzo, la subo y regreso.", () => [P("PALA_ABAJO", 900), P("AVANZAR", 1500), P("PALA_ARRIBA", 900), P("RETROCEDER", 1500)]],
  [/recoge|carga|levanta tierra/, "Recojo: bajo la pala, avanzo poquito y la subo.", () => [P("PALA_ABAJO", 900), P("AVANZAR", 800), P("PALA_ARRIBA", 1100)]],
  [/descarga|tira|vacia|suelta/, "Descargo y regreso la cabina.", t => { const izq = /izquierda/.test(t);
     return [P(izq ? "ROTACION_IZQUIERDA" : "ROTACION_DERECHA", 1500), P("PALA_ABAJO", 900), P("PALA_ARRIBA", 900), P(izq ? "ROTACION_DERECHA" : "ROTACION_IZQUIERDA", 1500)]; }],
  [/saluda|hola/, "¡Hola! Saludo con la pala.", () => [P("PALA_ARRIBA", 400), P("PALA_ABAJO", 400), P("PALA_ARRIBA", 400), P("PALA_ABAJO", 400)]],
  [/baila|fiesta/, "A bailar.", () => [P("GIRO_IZQUIERDA", 500), P("GIRO_DERECHA", 500), P("GIRO_IZQUIERDA", 500), P("GIRO_DERECHA", 500), P("PALA_ARRIBA", 400), P("PALA_ABAJO", 400)]],
  [/vuelta|360|completa/, "Vuelta completa de la cabina.", t => [P(/izquierda/.test(t) ? "ROTACION_IZQUIERDA" : "ROTACION_DERECHA", 4000)]],
  [/estaciona|regresa a casa/, "Me estaciono: reversa.", () => [P("RETROCEDER", 1500)]],
];
function planLocal(texto) {
  const t = sinAcentos(texto.toLowerCase());
  for (const [re, txt, f] of RUTINAS) if (re.test(t)) return { explicacion: txt, pasos: f(t) };
  const pasos = [];
  for (const parte of t.split(/\s*(?:,|;|\by luego\b|\bluego\b|\by despues\b|\bdespues\b|\by\b)\s*/).filter(Boolean)) {
    const o = interpretar(parte); if (o && o.c !== "DETENER") pasos.push(P(o.c, o.ms || 1000));
  }
  return { explicacion: pasos.length ? "Entendí estos pasos" : "No entendí", pasos };
}

let copilotoNube = null;
async function hayCopiloto() {
  if (copilotoNube !== null) return copilotoNube;
  try { copilotoNube = (await (await fetch(`${API_BASE}/vehiculos/${vehiculo}/copiloto`, { signal: AbortSignal.timeout(5000) })).json()).disponible === true; }
  catch { copilotoNube = false; }
  return copilotoNube;
}

/* ---------------- lo que dice KAI ---------------- */
const DICHO = { AVANZAR: "Avanzando", RETROCEDER: "En reversa", GIRO_IZQUIERDA: "Girando a la izquierda", GIRO_DERECHA: "Girando a la derecha",
  ROTACION_IZQUIERDA: "Rotando la cabina a la izquierda", ROTACION_DERECHA: "Rotando la cabina a la derecha", PALA_ARRIBA: "Subiendo la pala",
  PALA_ABAJO: "Bajando la pala", ENCENDER_APAGAR: "Botón de encendido", AUX_1: "Auxiliar uno", AUX_2: "Auxiliar dos", AUX_3: "Auxiliar tres" };
const segundos = ms => ms === 500 ? "medio segundo" : ms === 1000 ? "un segundo" : `${ms / 1000} segundos`;

/** Frase de estado del sistema (para "¿cómo está la conexión?" y la bienvenida). */
export function reporteEstado() {
  const st = estado;
  if (simulando()) return st.ws === "en_linea" && !llave() ? "Estoy en modo simulador porque falta tu llave de control. Solo se mueve el gemelo."
    : "Estoy en modo simulador: no tengo enlace con la nube, así que solo se mueve el gemelo.";
  const esp = espEnLinea() ? `La excavadora está conectada con señal de ${Math.abs(st.esp.rssi ?? 0)} decibeles negativos` : "No recibo señal del ESP32 de la excavadora";
  return `Enlace con AWS en línea${st.ping != null ? `, latencia de ${st.ping} milisegundos` : ""}. ${esp}.`;
}
export function bienvenida() {
  const h = new Date().getHours(), saludo = h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
  return `${saludo}, Juan. Bienvenido a bordo. ${reporteEstado()} Mantén los dos grips para manejar, o tócame y dime qué hacer.`;
}

/** Procesa una frase. Regresa { sub: texto para el HUD, dicho: lo que KAI responde en voz }. */
export async function procesarFrase(texto) {
  texto = (texto || "").trim();
  if (!texto) return { sub: "No escuché nada", dicho: "No te escuché. ¿Me lo repites?" };
  const o = interpretar(texto);
  if (o && o.c === "DETENER") { alto(); return { sub: `“${texto}” → ALTO`, dicho: "Alto total." }; }
  const t = sinAcentos(texto.toLowerCase());
  // conversación: estado, presentación y cortesía (no mueven nada)
  if (!o && /\b(estado|conexion|conectad|señal|senal|como esta|como vas|reporte|sistemas)\b/.test(t)) return { sub: `“${texto}” → estado`, dicho: reporteEstado() };
  if (/\b(quien eres|como te llamas|presentate|que puedes hacer|ayuda)\b/.test(t))
    return { sub: `“${texto}”`, dicho: "Soy KAI, el asistente de esta excavadora. Puedo moverla por ti: dime avanza dos segundos, sube la pala, haz una zanja o alto. También te reporto el estado de la conexión." };
  if (/^(gracias|muchas gracias|gracias kai)\b/.test(t)) return { sub: `“${texto}”`, dicho: "Para servirte." };
  const corta = o && texto.split(/\s+/).length <= 6 && !/\b(y|luego|despues)\b/.test(t) && !RUTINAS.some(([re]) => re.test(t));
  if (corta) {
    if (o.ms === 0) { mantener(o.c, "voz", 20000); return { sub: `“${texto}” → ${ETIQUETA[o.c]} (hasta “alto”)`, dicho: `${DICHO[o.c]} sin parar. Dime alto cuando quieras.` }; }
    pulso(o.c, o.ms, "voz");
    return { sub: `“${texto}” → ${ETIQUETA[o.c]} ${o.ms / 1000} s`, dicho: o.c.startsWith("AUX") || o.c === "ENCENDER_APAGAR" ? `${DICHO[o.c]}.` : `${DICHO[o.c]} ${segundos(o.ms)}.` };
  }
  let r = null, quien = "RUTINAS";
  if (!simulando() && llave() && await hayCopiloto()) {
    try {
      const resp = await fetch(`${API_BASE}/vehiculos/${vehiculo}/copiloto`, { method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": llave() }, body: JSON.stringify({ texto }) });
      if (resp.ok) { r = await resp.json(); quien = "CLAUDE"; }
    } catch {}
  }
  if (!r) r = planLocal(texto);
  if (!r.pasos?.length) return { sub: `“${texto}” → no entendí`, dicho: "No entendí la orden. Prueba con algo como: avanza dos segundos y sube la pala." };
  ejecutarPlan(r.pasos);
  return { sub: `“${texto}” → ${quien}: ${r.explicacion} (${r.pasos.length} pasos)`,
    dicho: `Entendido. ${r.explicacion.replace(/[.:]$/, "")}. Son ${r.pasos.length} pasos; di alto para cancelar.` };
}
