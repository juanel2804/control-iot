/* =========================================================================
   Excavadora XR · órdenes habladas
   Mismas reglas que la voz de index.html: órdenes cortas van directo; frases largas o rutinas
   van al copiloto (Claude en la API) y, si no está, a las rutinas integradas.
   ========================================================================= */
import { API_BASE, vehiculo, llave, ETIQUETA, alto, pulso, mantener, ejecutarPlan, simulando } from "./enlace.js";

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

/** Procesa una frase y regresa el texto que se muestra en el HUD. */
export async function procesarFrase(texto) {
  texto = (texto || "").trim();
  if (!texto) return "No escuché nada";
  const o = interpretar(texto);
  if (o && o.c === "DETENER") { alto(); return `“${texto}” → ALTO`; }
  const t = sinAcentos(texto.toLowerCase());
  const corta = o && texto.split(/\s+/).length <= 6 && !/\b(y|luego|despues)\b/.test(t) && !RUTINAS.some(([re]) => re.test(t));
  if (corta) {
    if (o.ms === 0) { mantener(o.c, "voz", 20000); return `“${texto}” → ${ETIQUETA[o.c]} (hasta “alto”)`; }
    pulso(o.c, o.ms, "voz"); return `“${texto}” → ${ETIQUETA[o.c]} ${o.ms / 1000} s`;
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
  if (!r.pasos?.length) return `“${texto}” → no entendí`;
  ejecutarPlan(r.pasos);
  return `“${texto}” → ${quien}: ${r.explicacion} (${r.pasos.length} pasos)`;
}
