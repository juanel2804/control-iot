/* =========================================================================
   Excavadora XR · micrófono "presiona para hablar" (botón B o el botón VOZ de la consola)
   El navegador del Quest no trae reconocimiento de voz: se graba un audio corto y la API
   (POST /vehiculos/{id}/voz) lo transcribe con OpenAI. La llave de OpenAI vive solo en la EC2.
   En la compu (Chrome/Edge) sin servicio de voz, se usa el reconocimiento del navegador.
   ========================================================================= */
import { API_BASE, vehiculo, llave, aviso } from "./enlace.js";

const Reconocedor = window.SpeechRecognition || window.webkitSpeechRecognition;
const MAX_MS = 8000;
let flujo = null, grabadora = null, trozos = [], t0 = 0, tope = null, rec = null, textoRec = "";
let servicio = null;        // "nube" | "navegador" | "ninguno"

export const voz = { estado: "lista", texto: "" };   // lista | escuchando | pensando

export async function revisarServicio() {
  try { if ((await (await fetch(`${API_BASE}/vehiculos/${vehiculo}/voz`, { signal: AbortSignal.timeout(5000) })).json()).disponible) return (servicio = "nube"); } catch {}
  return (servicio = Reconocedor ? "navegador" : "ninguno");
}
export const servicioVoz = () => servicio;
export const flujoMicro = () => (flujo && flujo.active ? flujo : null);

/** Pide el micrófono (mejor desde la página 2D, antes de entrar a VR). */
export async function prepararMicro() {
  if (flujo && flujo.active) return true;
  try { flujo = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); return true; }
  catch { return false; }
}

export async function empezar() {
  if (voz.estado !== "lista") return false;
  if (servicio === null) await revisarServicio();
  if (servicio === "navegador") {
    textoRec = ""; rec = new Reconocedor(); rec.lang = "es-MX"; rec.interimResults = false; rec.continuous = true;
    rec.onresult = e => { textoRec = [...e.results].map(r => r[0].transcript).join(" "); };
    try { rec.start(); } catch { return false; }
    voz.estado = "escuchando"; tope = setTimeout(() => rec && rec.stop(), MAX_MS); return true;
  }
  if (servicio !== "nube") { aviso("Voz no disponible: falta OPENAI_API_KEY en la API"); return false; }
  if (!llave()) { aviso("La voz necesita tu llave de control"); return false; }
  if (!await prepararMicro()) { aviso("Permite el micrófono en la página antes de entrar"); return false; }
  const tipo = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find(t => window.MediaRecorder?.isTypeSupported?.(t));
  try { grabadora = new MediaRecorder(flujo, tipo ? { mimeType: tipo } : undefined); } catch { aviso("No se pudo grabar audio"); return false; }
  trozos = []; grabadora.ondataavailable = e => { if (e.data.size) trozos.push(e.data); };
  grabadora.start(); t0 = performance.now(); voz.estado = "escuchando";
  tope = setTimeout(() => { if (grabadora?.state === "recording") grabadora.stop(); }, MAX_MS);
  return true;
}

/** Termina de escuchar y regresa el texto (o null). */
export async function terminar() {
  clearTimeout(tope);
  if (voz.estado !== "escuchando") return null;
  voz.estado = "pensando";
  try {
    if (servicio === "navegador") {
      await new Promise(r => { rec.onend = r; try { rec.stop(); } catch { r(); } setTimeout(r, 1500); });
      rec = null; return textoRec.trim() || null;
    }
    const g = grabadora; grabadora = null;
    if (g.state === "recording") await new Promise(r => { g.onstop = r; g.stop(); });
    if (performance.now() - t0 < 350 || !trozos.length) return null;      // fue un toque, no una orden
    const blob = new Blob(trozos, { type: (g.mimeType || "audio/webm").split(";")[0] });
    const r = await fetch(`${API_BASE}/vehiculos/${vehiculo}/voz`, { method: "POST",
      headers: { "Content-Type": blob.type, "X-API-Key": llave() }, body: blob });
    if (!r.ok) { aviso(r.status === 503 ? "Voz no configurada en la API" : `Voz: error ${r.status}`); return null; }
    return (await r.json()).texto || null;
  } catch { aviso("No se pudo transcribir"); return null; }
  finally { voz.estado = "lista"; }
}
