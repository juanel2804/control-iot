/* MONITOREO (práctica 4.2) — punto de entrada.
   Flujo: al abrir la vista → REST (GET /estado + GET /historial) · en vivo → eventos del WSS compartido
   actualizan la tarjeta y DISPARAN la resincronización del historial · al reconectar → REST de nuevo.
   Módulos: config · fechas · validar · api (REST) · canal (WSS compartido) · conectividad (indicadores) ·
            ultimo (tarjeta) · historial (tabla) · eventos (bitácora) · sincronizador (REST + orden). */
import * as api from "./api.js";
import * as canal from "./canal.js";
import { ESPERA_SYNC_MS, NUBE, RDS_CADA_MS, VEHICULO } from "./config.js";
import * as conectividad from "./conectividad.js";
import * as eventos from "./eventos.js";
import * as sync from "./sincronizador.js";
import * as ultimo from "./ultimo.js";

const $ = id => document.getElementById(id);
const seccion = $("vMonitoreo");
let yaCargo = false, pendiente = false;
const visible = () => !seccion.hidden && document.visibilityState === "visible";

function iniciar() {
  if (!NUBE) return;   // servida por el ESP32 sin internet: no hay API ni RDS (el botón de la vista ya está oculto)
  conectividad.iniciar();
  $("monIdVehiculo").textContent = `ID ${VEHICULO}`;
  sync.alRecibirNombre(n => ($("monVehiculo").textContent = n));
  $("monActualizar").addEventListener("click", () => sync.sincronizar("resincronización manual"));

  // Vista: la navegación de index.html (y la de sala.js) solo cambia el atributo hidden de las secciones
  new MutationObserver(alCambiarVista).observe(seccion, { attributes: true, attributeFilter: ["hidden"] });
  document.addEventListener("visibilitychange", () => { if (visible() && pendiente) refrescar("pestaña visible de nuevo"); });

  canal.al("evento", alEvento);
  canal.al("abierto", ({ reconexion }) => {
    eventos.local(reconexion ? "WSS reconectado" : "WSS en línea");
    if (reconexion) refrescar("reconexión WSS");      // se recupera lo que pasó mientras estuvo caído
    else ultimo.marcarDesactualizado(false);
  });
  canal.al("cerrado", ({ codigo, espera }) => {
    eventos.local(`WSS cerrado (código ${codigo}); reintento en ${Math.round(espera / 1000)} s`);
    ultimo.marcarDesactualizado(true);
    $("monSync").textContent = "WebSocket desconectado: se muestra el último dato conocido. Reconectando…";
    $("monSync").dataset.nivel = "mal";
  });

  // Diagnóstico de RDS con frecuencia moderada (los tres indicadores también se ven en CONTROL)
  diagnosticoRds();
  setInterval(() => { if (document.visibilityState === "visible") diagnosticoRds(); }, RDS_CADA_MS);
  if (!seccion.hidden) alCambiarVista();
}

async function diagnosticoRds() {
  if (visible()) return;   // con MONITOREO abierto, cada sincronización ya hace este diagnóstico
  try { await api.obtenerEstado(); conectividad.resultadoRds(true); }
  catch (e) { conectividad.resultadoRds(false, e); }
}

function refrescar(motivo) {
  if (visible()) { pendiente = false; sync.sincronizar(motivo); }
  else pendiente = true;    // se hace al volver a MONITOREO
}

function alCambiarVista() {
  if (seccion.hidden) return;
  pendiente = false;
  sync.sincronizar(yaCargo ? "al volver a MONITOREO" : "carga inicial");
  yaCargo = true;
}

function alEvento(ev) {
  let nota = "";
  switch (ev.tipo) {
    case "estado_inicial":
      // lo manda el servidor al (re)conectar, leído de RDS en ese momento
      ultimo.desdeRds(ev.estado, { versionAlPedir: ultimo.version(), fuente: "WSS · estado_inicial (RDS)" });
      ultimo.demoEnCurso(ev.demo);
      if (ev.estado?.vehiculo) $("monVehiculo").textContent = ev.estado.vehiculo;
      break;
    case "control":
      // canal rápido: el backend lo guarda en el historial en segundo plano y solo si cambia el movimiento
      if (ultimo.desdeEvento(ev) && !ultimo.enDemo()) {
        nota = "se relee el historial";
        if (visible()) sync.programar("evento WSS control", ESPERA_SYNC_MS.control, { reintento: 1, esperaReintento: ESPERA_SYNC_MS.reintento });
        else pendiente = true;
      }
      break;
    case "movimiento":
      // POST /movimientos: se publica DESPUÉS del commit en RDS
      ultimo.desdeEvento(ev);
      nota = "se relee el historial";
      if (visible()) sync.programar("evento WSS movimiento", ESPERA_SYNC_MS.movimiento, { reintento: 1, esperaReintento: ESPERA_SYNC_MS.reintento });
      else pendiente = true;
      break;
    case "demo_movimiento":
      ultimo.desdeEvento(ev);
      nota = "paso de DEMO: no va al historial";
      break;
    case "demo_fin": case "demo_cancelada": case "demo_error":
      ultimo.desdeEvento(ev);
      nota = "se relee estado e historial";
      if (visible()) sync.programar("fin de DEMO", ESPERA_SYNC_MS.fin_demo); else pendiente = true;
      break;
    case "error":
      if (/RDS|base de datos/i.test(ev.detalle)) conectividad.rdsCaidoPorWss(ev.detalle);
      break;
    default:
      ultimo.desdeEvento(ev);
  }
  eventos.registrar(ev, nota);
}

iniciar();
