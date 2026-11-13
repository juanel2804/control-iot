/* Sincronización REST (carga inicial, después de un evento WSS, al reconectar y al volver a MONITOREO).
   · Una sola sincronización a la vez: si llega otra petición mientras hay una en vuelo, se hace UNA más al terminar
     (no hay fetch simultáneos ni ráfagas: 20 eventos seguidos = como mucho 2 consultas).
   · Cada ronda lleva un número de generación y la versión de eventos WSS del momento en que salió: una respuesta
     atrasada nunca pisa información más nueva.
   · No hay polling del historial: solo se consulta cuando algo lo justifica. */
import * as api from "./api.js";
import { resultadoRds } from "./conectividad.js";
import { hora } from "./fechas.js";
import * as historial from "./historial.js";
import * as ultimo from "./ultimo.js";

const $ = id => document.getElementById(id);
let generacion = 0, enVuelo = null, otraVez = null, temporizador = null;
let alNombre = () => {};
export const alRecibirNombre = fn => { alNombre = fn; };

function estadoTexto(texto, nivel = "") {
  const p = $("monSync"); p.textContent = texto; p.dataset.nivel = nivel;
}

async function ronda(motivo) {
  const gen = ++generacion;
  const versionAlPedir = ultimo.version();
  estadoTexto(`Sincronizando con la API (${motivo})…`, "espera");
  const [rEst, rHist] = await Promise.allSettled([api.obtenerEstado(), api.obtenerHistorial()]);
  if (gen !== generacion) return { nuevos: [], descartada: true };      // llegó tarde: hay una ronda más nueva

  const errores = [rEst, rHist].filter(r => r.status === "rejected").map(r => r.reason);
  resultadoRds(rEst.status === "fulfilled" || rHist.status === "fulfilled", errores[0]);

  if (rEst.status === "fulfilled") {
    if (rEst.value?.vehiculo) alNombre(rEst.value.vehiculo);
    ultimo.desdeRds(rEst.value, { versionAlPedir, fuente: "REST · GET /estado (RDS)" });
  }
  let nuevos = [];
  if (rHist.status === "fulfilled") {
    nuevos = historial.aplicar(rHist.value);
    ultimo.confirmarConHistorial(rHist.value);
  } else {
    historial.error(textoError(rHist.reason, "No se pudo cargar el historial"));
  }

  if (!errores.length) estadoTexto(`Sincronizado con RDS a las ${hora(new Date())} · ${motivo}${nuevos.length ? ` · ${nuevos.length} registro(s) nuevo(s)` : ""}`, "ok");
  else estadoTexto(`${textoError(errores[0], "Error")} · ${hora(new Date())}. Se muestra el último dato confirmado.`, "mal");
  return { nuevos, errores };
}

export function textoError(e, base) {
  if (!(e instanceof api.ErrorApi)) return base;
  return { red: "Sin conexión con la API de AWS", tiempo: e.message, rds: `RDS no disponible (${e.message})`,
           contrato: `Respuesta inesperada de la API: ${e.message}`, http: `${base}: ${e.message}` }[e.tipo] || base;
}

/** Sincroniza ya (o en cuanto termine la ronda en curso). */
export function sincronizar(motivo) {
  if (enVuelo) {
    otraVez = motivo;                     // se agrupa: solo una ronda extra por muchas peticiones
    return enVuelo;
  }
  enVuelo = ronda(motivo).finally(() => {
    enVuelo = null;
    if (otraVez) { const m = otraVez; otraVez = null; sincronizar(m); }
  });
  return enVuelo;
}

/** Sincroniza después de `espera` ms; si llegan más eventos, se reinicia la espera (debounce). */
export function programar(motivo, espera, { reintento = 0, esperaReintento = 2000 } = {}) {
  clearTimeout(temporizador);
  const ultimoId = historial.masReciente()?.id ?? 0;
  temporizador = setTimeout(async () => {
    const r = await sincronizar(motivo);
    // el canal rápido guarda en RDS en segundo plano: si aún no aparece, se relee UNA vez más (actualización acotada)
    const hayNuevo = (historial.masReciente()?.id ?? 0) !== ultimoId;
    if (!hayNuevo && reintento > 0 && !r?.errores?.length) programar(motivo + " · reintento", esperaReintento, { reintento: reintento - 1 });
  }, espera);
}
