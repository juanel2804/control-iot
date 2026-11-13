/* Validación de datos externos (REST y WSS se tratan como NO confiables).
   Contratos reales de vehiculo-iot-api (app/schemas.py y app/routers/ws.py):
     GET /vehiculos/{id}/estado     → EstadoOut | null
         { id_vehiculo, vehiculo, id_comando?, comando?, codigo?, conectado, fecha_actualizacion? }
     GET /vehiculos/{id}/historial  → HistorialOut[] (máx. 10, del más reciente al más antiguo)
         { id_historial, id_vehiculo, comando?, codigo?, fecha_hora?, origen }
     WSS /ws/vehiculos/{id}         → { tipo, id_vehiculo, …, timestamp (UTC ISO) } */
import { aInstante } from "./fechas.js";

const entero = v => Number.isInteger(v) && v > 0;
const texto = (v, max = 120) => typeof v === "string" && v.length > 0 && v.length <= max;
const textoOpc = (v, max = 120) => v == null || texto(v, max);
const codigoOpc = v => v == null || (Number.isInteger(v) && v >= 0 && v <= 65535);

/** Estado del vehículo (o null si todavía no tiene). Devuelve un objeto limpio o lanza Error. */
export function estado(json, idVehiculo) {
  if (json === null) return null;
  if (typeof json !== "object" || Array.isArray(json)) throw new Error("El estado no es un objeto");
  if (json.id_vehiculo !== idVehiculo) throw new Error("El estado es de otro vehículo");
  // En REST «conectado» es booleano; en estado_inicial del WSS llega crudo del SP (TINYINT 0/1)
  const conectadoOk = typeof json.conectado === "boolean" || json.conectado === 0 || json.conectado === 1;
  if (!textoOpc(json.vehiculo, 80) || !textoOpc(json.comando, 60) || !codigoOpc(json.codigo) || !conectadoOk)
    throw new Error("El estado no cumple el contrato EstadoOut");
  return {
    idVehiculo: json.id_vehiculo,
    vehiculo: json.vehiculo ?? null,
    idComando: entero(json.id_comando) ? json.id_comando : null,
    comando: json.comando ?? null,
    codigo: json.codigo ?? null,
    conectado: Boolean(json.conectado),
    instante: aInstante(json.fecha_actualizacion),
  };
}

/** Historial: solo filas válidas del mismo vehículo, sin duplicados (por id_historial). */
export function historial(json, idVehiculo) {
  if (!Array.isArray(json)) throw new Error("El historial no es una lista");
  const vistos = new Set(), filas = [];
  for (const f of json) {
    if (!f || typeof f !== "object" || !entero(f.id_historial) || f.id_vehiculo !== idVehiculo) continue;
    if (!textoOpc(f.comando, 60) || !codigoOpc(f.codigo) || !texto(f.origen, 30)) continue;
    if (vistos.has(f.id_historial)) continue;
    vistos.add(f.id_historial);
    filas.push({ id: f.id_historial, comando: f.comando ?? "(comando eliminado)", codigo: f.codigo ?? null,
                 origen: f.origen, instante: aInstante(f.fecha_hora) });
  }
  return filas;
}

const TIPOS = new Set(["estado_inicial", "movimiento", "control", "conexion", "telemetria",
                       "demo_inicio", "demo_movimiento", "demo_fin", "demo_cancelada", "demo_error", "error"]);

/** Evento WSS del vehículo monitoreado. Devuelve null si no aplica (otro vehículo, tipo ajeno o mal formado). */
export function evento(m, idVehiculo) {
  if (!m || typeof m !== "object" || !TIPOS.has(m.tipo)) return null;
  if (m.id_vehiculo !== idVehiculo) return null;                // eventos de otros vehículos (o sin vehículo) se ignoran
  const ev = { tipo: m.tipo, instante: aInstante(m.timestamp), crudo: m };
  switch (m.tipo) {
    case "movimiento":
      if (!texto(m.comando, 60) || !codigoOpc(m.codigo)) return null;
      return { ...ev, comando: m.comando, codigo: m.codigo ?? null, origen: texto(m.origen, 30) ? m.origen : null };
    case "control": {
      if (!texto(m.comando, 60)) return null;
      const ms = Number.isInteger(m.ms) && m.ms >= 0 ? m.ms : 0;
      return { ...ev, comando: m.comando, ms, origen: texto(m.origen, 30) ? m.origen : null };
    }
    case "demo_movimiento":
      if (!texto(m.comando, 60) || !entero(m.id_demo) || !Number.isInteger(m.orden)) return null;
      return { ...ev, comando: m.comando, codigo: m.codigo ?? null, idDemo: m.id_demo, orden: m.orden,
               total: Number.isInteger(m.total_movimientos) ? m.total_movimientos : null,
               duracion: Number.isInteger(m.duracion_ms) ? m.duracion_ms : null };
    case "demo_inicio": case "demo_fin": case "demo_cancelada": case "demo_error":
      if (!entero(m.id_demo)) return null;
      return { ...ev, idDemo: m.id_demo, total: Number.isInteger(m.total_movimientos) ? m.total_movimientos : null };
    case "conexion":
      return typeof m.conectado === "boolean" ? { ...ev, conectado: m.conectado } : null;
    case "estado_inicial":
      try { return { ...ev, estado: estado(m.estado ?? null, idVehiculo), demo: entero(m.demo_en_ejecucion) ? m.demo_en_ejecucion : null }; }
      catch { return null; }
    case "error":
      return { ...ev, detalle: texto(m.detalle, 300) ? m.detalle : "Error del servidor" };
    default:
      return ev;   // telemetria: solo se registra
  }
}
