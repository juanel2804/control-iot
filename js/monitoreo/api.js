/* Cliente REST de MONITOREO: Fetch + async/await, URL base común, timeout con AbortController,
   validación de JSON y errores con tipo. Solo GET (consultar nunca modifica estados).
   No toca el envío de comandos de CONTROL (ese va por el WebSocket compartido). */
import { API_BASE, TIMEOUT_MS, VEHICULO } from "./config.js";
import * as validar from "./validar.js";

export class ErrorApi extends Error {
  /** tipo: "red" (sin respuesta) · "tiempo" (timeout) · "http" · "rds" (503 del backend) · "contrato" (JSON inválido) · "cancelada" */
  constructor(tipo, mensaje, status = 0) { super(mensaje); this.tipo = tipo; this.status = status; }
}

const MENSAJE_HTTP = { 401: "La API pidió autenticación", 403: "Acceso no autorizado", 404: "El vehículo no existe",
                       422: "Solicitud inválida", 429: "Demasiadas solicitudes", 500: "Error interno del servidor" };

/** GET JSON con timeout. `senal` permite cancelar desde fuera (p. ej. una solicitud más nueva). */
export async function obtenerJSON(ruta, { senal, timeout = TIMEOUT_MS } = {}) {
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(new DOMException("timeout", "TimeoutError")), timeout);
  const alCancelar = () => ctrl.abort(new DOMException("cancelada", "AbortError"));
  senal?.addEventListener("abort", alCancelar, { once: true });
  try {
    let r;
    try {
      r = await fetch(API_BASE + ruta, { signal: ctrl.signal, cache: "no-store", headers: { Accept: "application/json" } });
    } catch (e) {
      if (ctrl.signal.reason?.name === "TimeoutError") throw new ErrorApi("tiempo", `La API no respondió en ${timeout / 1000} s`);
      if (ctrl.signal.aborted) throw new ErrorApi("cancelada", "Solicitud reemplazada por una más nueva");
      throw new ErrorApi("red", "Sin conexión con la API de AWS");
    }
    let cuerpo = null;
    try { cuerpo = await r.json(); } catch { if (r.ok) throw new ErrorApi("contrato", "La API devolvió algo que no es JSON", r.status); }
    if (!r.ok) {
      const detalle = typeof cuerpo?.detail === "string" ? cuerpo.detail : MENSAJE_HTTP[r.status] || `HTTP ${r.status}`;
      // El backend responde 503 cuando no puede hablar con RDS (manejadores OperationalError / InterfaceError)
      throw new ErrorApi(r.status === 503 ? "rds" : "http", detalle, r.status);
    }
    return cuerpo;
  } finally {
    clearTimeout(reloj);
    senal?.removeEventListener("abort", alCancelar);
  }
}

/** GET /vehiculos/{id}/estado → último estado (sp_obtener_estado en RDS) o null. */
export async function obtenerEstado(senal) {
  const json = await obtenerJSON(`/vehiculos/${VEHICULO}/estado`, { senal });
  try { return validar.estado(json, VEHICULO); }
  catch (e) { throw new ErrorApi("contrato", e.message, 200); }
}

/** GET /vehiculos/{id}/historial → máx. 10 movimientos individuales (sp_obtener_historial en RDS). */
export async function obtenerHistorial(senal) {
  const json = await obtenerJSON(`/vehiculos/${VEHICULO}/historial`, { senal });
  try { return validar.historial(json, VEHICULO); }
  catch (e) { throw new ErrorApi("contrato", e.message, 200); }
}
