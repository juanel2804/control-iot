/* Cliente WSS de MONITOREO: NO abre otro WebSocket. Escucha el que ya mantiene CONTROL (index.html → conectar()),
   que avisa por window.IOT.canal: "abriendo", "abierto" {reconexion}, "cerrado" {codigo, espera}, "mensaje" (JSON).
   Los listeners se registran una sola vez al cargar el módulo, así cambiar de pestaña no los duplica. */
import { CANAL, VEHICULO, estadoWS } from "./config.js";
import * as validar from "./validar.js";

const oyentes = { evento: new Set(), abierto: new Set(), cerrado: new Set(), abriendo: new Set() };
export const al = (tipo, fn) => { oyentes[tipo].add(fn); return () => oyentes[tipo].delete(fn); };
const emitir = (tipo, dato) => oyentes[tipo].forEach(fn => { try { fn(dato); } catch (e) { console.error("[monitoreo]", e); } });

/** "abierto" | "conectando" | "cerrado" según el readyState REAL del WebSocket compartido. */
export function estado() {
  const r = estadoWS();
  return r === 1 ? "abierto" : r === 0 ? "conectando" : "cerrado";
}

CANAL.addEventListener("abriendo", e => emitir("abriendo", e.detail));
CANAL.addEventListener("abierto", e => emitir("abierto", e.detail));
CANAL.addEventListener("cerrado", e => emitir("cerrado", e.detail));
CANAL.addEventListener("mensaje", e => {
  const ev = validar.evento(e.detail, VEHICULO);   // filtra otros vehículos, tipos ajenos y payloads mal formados
  if (ev) emitir("evento", ev);
});
