import { CONFIG } from './config.js';
import { friendly } from './core/errors.js';
import { ApiClient } from './services/api-client.js';
import { WsClient } from './services/ws-client.js';
import { HealthMonitor } from './services/health.js';
import { parseComandos, buildCatalog, etiqueta, DIRECCIONES } from './domain/commands.js';
import { CommandController } from './domain/controller.js';
import { DemoManager } from './domain/demos.js';
import { $, el, icono } from './ui/dom.js';
import { KeyStore, initKeyDialog } from './ui/auth.js';
import { StatusPanel } from './ui/status-panel.js';
import { ActivityLog } from './ui/log.js';
import { Joystick } from './ui/joystick.js';
import { ActionButtons, PhaseFeedback, DemoView } from './ui/controls.js';

/* ---------- Composición ---------- */
const llaves = new KeyStore();
const api = new ApiClient({ baseUrl: CONFIG.apiBase, getKey: llaves.get, timeoutMs: CONFIG.timing.httpTimeoutMs });
const bitacora = new ActivityLog();
const panel = new StatusPanel();
let catalogo = null;

const controller = new CommandController({ api, config: CONFIG, getCatalog: () => catalogo });
const ws = new WsClient({ url: CONFIG.wsBase + CONFIG.paths.ws(CONFIG.vehicleId), timing: CONFIG.timing });
const salud = new HealthMonitor({ client: api, config: CONFIG });
const demos = new DemoManager({ api, config: CONFIG, controller, wsOnline: () => ws.isOnline });

const joystick = new Joystick();
const acciones = new ActionButtons(controller);
const fases = new PhaseFeedback();
new DemoView(demos);
const dialogo = initKeyDialog(llaves);

/* ---------- Avisos ---------- */
function avisar(texto, tono = 'info') {
  const t = el('div', { class: `toast-item toast-${tono}`, role: tono === 'error' ? 'alert' : 'status' }, icono(tono === 'error' ? 'bi-exclamation-triangle-fill' : 'bi-info-circle-fill'), el('span', {}, texto));
  $('#toasts').append(t);
  setTimeout(() => t.remove(), 5000);
  bitacora.add(tono === 'error' ? 'error' : 'info', texto);
}

/* ---------- Indicadores ---------- */
panel.set('ws', 'connecting');
panel.set('api', 'checking');
panel.set('db', salud.db);

ws.on('state', ({ state, code }) => {
  panel.set('ws', state);
  bitacora.add('ws', { online: 'WSS abierto con el servidor', offline: `WSS cerrado${code ? ` (código ${code})` : ''}`, connecting: 'Conectando WSS…', reconnecting: 'Reintentando WSS…' }[state]);
});
ws.on('retry', ({ inMs }) => panel.set('ws', 'offline', `· reintento en ${Math.max(1, Math.round(inMs / 1000))} s`));

salud.on('change', ({ api: a, db }) => {
  panel.set('api', a);
  panel.set('db', db);
  bitacora.add('api', a === 'up' ? 'API de AWS disponible (/salud)' : 'API de AWS no disponible');
  if (a === 'up' && !datosCargados) cargarDatos();
});

/* ---------- Eventos WebSocket → dominio e interfaz ---------- */
const DESCRIBIR = {
  estado_inicial: (m) => `estado inicial · último comando: ${m.estado?.comando ?? 'ninguno'}`,
  movimiento: (m) => `movimiento ${m.comando} (origen ${m.origen})`,
  control: (m) => `control ${m.comando} (origen ${m.origen})`,
  demo_inicio: (m) => `demo_inicio · DEMO ${m.id_demo} · ${m.total_movimientos} movimientos`,
  demo_movimiento: (m) => `demo_movimiento ${m.orden}/${m.total_movimientos} · ${m.comando}`,
  demo_fin: (m) => `demo_fin · DEMO ${m.id_demo}`,
  demo_cancelada: (m) => `demo_cancelada · DEMO ${m.id_demo}`,
  demo_error: (m) => `demo_error · DEMO ${m.id_demo}`,
  error: (m) => `error del servidor: ${String(m.detalle ?? '').slice(0, 80)}`,
};
ws.on('message', (m) => {
  controller.onWsEvent(m);
  demos.onWsEvent(m);
  const d = DESCRIBIR[m.tipo];
  if (d) bitacora.add('evento', String(d(m)).slice(0, 140));
  if (m.tipo === 'estado_inicial') $('#lastState').textContent = m.estado?.comando ? etiqueta(m.estado.comando) : 'sin registro';
  if (m.tipo === 'movimiento' && m.origen !== CONFIG.origin) $('#lastState').textContent = etiqueta(m.comando ?? '—');
});

/* ---------- Coordinador de comandos ---------- */
const registrados = new Set(); // evita repetir la misma fase en la bitácora
const unaVez = (clave) => !registrados.has(clave) && registrados.add(clave);
controller.on('attempt', (a) => {
  fases.onAttempt(a);
  acciones.onAttempt(a);
  const etiquetaIntento = `${a.command.name}${a.reassure ? ' (reaseguro)' : a.priority ? ' (prioridad)' : ''}`;
  if (unaVez(`${a.id}:req`)) bitacora.add('rest', `POST /movimientos ${etiquetaIntento}`);
  if (a.acceptedAt && unaVez(`${a.id}:acc`)) bitacora.add('rest', `Aceptado por la API: ${a.command.name}${a.superseded ? ' (respuesta tardía)' : ''}`);
  if (a.eventAt && unaVez(`${a.id}:evt`)) bitacora.add('evento', `Evento WebSocket correlacionado: ${a.command.name}`);
});
controller.on('active', ({ command }) => {
  acciones.onActive(command);
  $('#directionLabel').textContent = command ? etiqueta(command.name) : 'Detenido';
  $('#joystick').dataset.motion = command ? 'moving' : 'stopped';
});
controller.on('rejected', ({ reason }) => avisar(reason, 'error'));
controller.on('error', ({ message }) => avisar(message, 'error'));
controller.on('auth-required', () => dialogo.open());

/* ---------- Joystick y botones ---------- */
// Cruzar la zona neutral NO manda DETENER al instante (evita golpear la API al pasar de un lado al otro);
// si el joystick se queda en el centro más de NEUTRAL_MS, se detiene. Soltarlo detiene SIEMPRE de inmediato.
const NEUTRAL_MS = 120;
let temporizadorNeutral = null;
joystick.on('direction', ({ direction }) => {
  clearTimeout(temporizadorNeutral);
  if (direction) controller.request(catalogo?.joystick[direction]);
  else temporizadorNeutral = setTimeout(() => controller.stop(), NEUTRAL_MS);
});
joystick.on('release', () => {
  clearTimeout(temporizadorNeutral);
  controller.stop();
});

/** DETENER: prioridad absoluta, incluso con una DEMO o una solicitud pendiente. */
function detenerTodo() {
  if (demos.busy) demos.cancel();
  else controller.stop();
}
const btnStop = $('#btnStop');
btnStop.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  detenerTodo();
});
btnStop.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
    e.preventDefault();
    detenerTodo();
  }
});
document.addEventListener('keydown', (e) => e.key === 'Escape' && !$('#keyDialog').open && detenerTodo());

/* ---------- DEMO ---------- */
demos.on('status', ({ status, result }) => {
  const ocupado = status !== 'idle';
  $('#joystick').dataset.locked = String(ocupado);
  acciones.setBlocked(ocupado);
  if (status === 'starting') bitacora.add('rest', 'POST …/demos/{id}/iniciar');
  if (status === 'idle' && result) bitacora.add('demo', `DEMO ${result}`);
});
demos.on('error', ({ message }) => avisar(message, 'error'));
demos.on('auth-required', () => dialogo.open());

/* ---------- Carga inicial (GET) ---------- */
let datosCargados = false;
let cargando = false;
async function cargarDatos() {
  if (cargando) return;
  cargando = true;
  $('#loadError').hidden = true;
  $('#btnReload').disabled = true;
  const id = CONFIG.vehicleId;
  const [vehiculo, comandos, listaDemos] = await Promise.allSettled([
    api.get(CONFIG.paths.vehiculo(id)),
    api.get(CONFIG.paths.comandos(id)),
    demos.load(),
  ]);
  if (vehiculo.status === 'fulfilled' && typeof vehiculo.value?.vehiculo?.nombre === 'string') {
    $('#vehicleName').textContent = vehiculo.value.vehiculo.nombre;
  } else if (vehiculo.status === 'fulfilled' && typeof vehiculo.value?.nombre === 'string') {
    $('#vehicleName').textContent = vehiculo.value.nombre;
  }
  if (comandos.status === 'fulfilled') {
    try {
      catalogo = buildCatalog(parseComandos(comandos.value));
      joystick.setAvailable(Object.fromEntries(DIRECCIONES.map((d) => [d, Boolean(catalogo.joystick[d])])));
      acciones.render(catalogo.others);
      $('#btnStop').disabled = !catalogo.joystick.stop;
      datosCargados = true;
      bitacora.add('rest', `Catálogo cargado: ${catalogo.all.length} comandos`);
      const sinMapa = DIRECCIONES.filter((d) => !catalogo.joystick[d]);
      if (sinMapa.length) avisar(`El catálogo no tiene comando para: ${sinMapa.join(', ')}.`, 'error');
    } catch (err) {
      avisar('El catálogo de comandos recibido no es válido.', 'error');
    }
  } else {
    avisar(`No se pudo cargar el catálogo: ${friendly(comandos.reason)}`, 'error');
  }
  if (listaDemos.status === 'rejected') avisar(`No se pudieron cargar las DEMO: ${friendly(listaDemos.reason)}`, 'error');
  $('#loadError').hidden = datosCargados;
  $('#btnReload').disabled = false;
  cargando = false;
}
$('#btnReload').addEventListener('click', () => {
  salud.checkNow();
  ws.reconnectNow();
  cargarDatos();
});

/* ---------- Seguridad: si la pestaña se oculta con algo en movimiento, DETENER ---------- */
const alOcultar = () => controller.active && controller.stop();
document.addEventListener('visibilitychange', () => document.hidden && alOcultar());
window.addEventListener('pagehide', alOcultar);

/* ---------- Arranque ---------- */
$('#credits').textContent = CONFIG.credits;
$('#holdMode').checked = true;
ws.start();
salud.start();
cargarDatos();
if (!llaves.hasKey) bitacora.add('info', 'Falta la llave de acceso: se pedirá al enviar el primer comando.');
