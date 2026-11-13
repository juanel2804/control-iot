/* Los TRES indicadores independientes (los mismos de la barra superior, visibles en CONTROL y MONITOREO):
   1) WebSocket WSS  → lo pinta index.html con el readyState real (En línea / Conectando-Reconectando / Desconectado).
   2) API AWS        → lo pinta index.html con GET /salud cada 15 s (Disponible / Comprobando / No disponible).
   3) Amazon RDS     → lo pinta ESTE módulo, solo con respuestas reales del backend a consultas que ejecutan
                        Stored Procedures en RDS: 200 → Disponible · 503 «RDS no disponible» → No disponible ·
                        sin respuesta del backend → Sin verificar (una caída de red no prueba que RDS esté caído).
   Este módulo además copia los tres estados al panel «Conectividad» de MONITOREO (texto + icono + color). */
import { hora } from "./fechas.js";

const $ = id => document.getElementById(id);
const rds = { estado: "sin", detalle: "Aún no se consulta RDS.", cuando: null };

/** Registra el resultado de una consulta REST respaldada por RDS. */
export function resultadoRds(ok, error) {
  if (ok) Object.assign(rds, { estado: "ok", detalle: "El backend ejecutó sp_obtener_estado / sp_obtener_historial en RDS", cuando: new Date() });
  else if (error?.tipo === "rds") Object.assign(rds, { estado: "mal", detalle: `El backend respondió 503: ${error.message}`, cuando: new Date() });
  else Object.assign(rds, { estado: "sin", detalle: "No hubo respuesta del backend: no se puede saber si RDS está disponible", cuando: new Date() });
  pintarLedRds();
}
/** El WebSocket se cerró con 1013 tras el mensaje de error: el backend no pudo leer el estado en RDS. */
export function rdsCaidoPorWss(detalle) {
  Object.assign(rds, { estado: "mal", detalle: `El WSS informó: ${detalle}`, cuando: new Date() });
  pintarLedRds();
}

function pintarLedRds() {
  const l = $("ledRds"); if (!l) return;
  const txt = { ok: "RDS · Disponible", mal: "RDS · No disponible", sin: "RDS · Sin verificar" }[rds.estado];
  l.className = "led" + (rds.estado === "ok" ? " ok" : rds.estado === "mal" ? " mal" : "");
  l.lastChild.textContent = txt;
  l.title = rds.detalle + (rds.cuando ? ` (${hora(rds.cuando)})` : "");
  copiar();
}

// ---------- panel de MONITOREO: refleja los LED de la barra (fuente única) ----------
const IND = { ws: "ledEnlace", api: "ledApi", rds: "ledRds" };
function copiar() {
  for (const [clave, idLed] of Object.entries(IND)) {
    const led = $(idLed), li = document.querySelector(`#vMonitoreo [data-ind="${clave}"]`);
    if (!led || !li) continue;
    const texto = (led.lastChild?.textContent || "").split("·").slice(-1)[0].trim() || "—";
    const nivel = led.classList.contains("ok") ? "ok" : led.classList.contains("mal") ? "mal" : "espera";
    li.dataset.nivel = nivel;
    li.querySelector(".mon-ind-est").textContent = { ok: "✔ ", mal: "✖ ", espera: "… " }[nivel] + texto;
    if (clave === "rds") li.querySelector(".mon-ind-det").textContent = rds.detalle + (rds.cuando ? ` · ${hora(rds.cuando)}` : "");
    if (clave === "ws") li.querySelector(".mon-ind-det").textContent = "Sesión de este navegador con wss://…/ws/vehiculos/{id}; se reconecta sola con espera progresiva.";
  }
}

export function iniciar() {
  const obs = new MutationObserver(copiar);
  Object.values(IND).forEach(id => { const l = $(id); if (l) obs.observe(l, { attributes: true, childList: true, characterData: true, subtree: true }); });
  pintarLedRds();
}
