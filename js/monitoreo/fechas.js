/* Fechas y horas: se interpretan con la zona documentada y se muestran en la del centro de México.
   Nunca se fabrica una marca de tiempo: si el dato no viene, se devuelve null y la vista muestra «—». */
import { ZONA_BD, ZONA_MOSTRAR } from "./config.js";

const CON_ZONA = /([zZ]|[+-]\d{2}:?\d{2})$/;
const ISO = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?([zZ]|[+-]\d{2}:?\d{2})?$/;

/** Convierte un texto ISO del backend en Date. Sin zona → se toma como ZONA_BD (UTC). Inválido → null. */
export function aInstante(valor) {
  if (typeof valor !== "string" || !ISO.test(valor.trim())) return null;
  let t = valor.trim().replace(" ", "T");
  if (!CON_ZONA.test(t)) {
    if (ZONA_BD !== "UTC") return null;   // solo está documentado UTC
    t += "Z";
  }
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

const fFecha = new Intl.DateTimeFormat("es-MX", { timeZone: ZONA_MOSTRAR, day: "2-digit", month: "2-digit", year: "numeric" });
const fHora = new Intl.DateTimeFormat("es-MX", { timeZone: ZONA_MOSTRAR, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });

export const fecha = d => (d ? fFecha.format(d) : "—");
export const hora = d => (d ? fHora.format(d) : "—");

/** «hace 5 s», «hace 3 min»… para mensajes de estado (respecto al reloj de este dispositivo). */
export function hace(d) {
  if (!d) return "";
  const s = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  return `hace ${Math.round(s / 3600)} h`;
}
