import { $ } from './dom.js';
import { anunciar } from './dom.js';

/**
 * Panel de TRES indicadores independientes (texto + icono + color; nunca solo color):
 *   1) WebSocket WSS            2) Servidor AWS · API de 21 servicios            3) Amazon RDS
 */
const TEXTOS = {
  ws: {
    connecting: ['Conectando…', 'bi-arrow-repeat', 'warn'],
    reconnecting: ['Reconectando…', 'bi-arrow-repeat', 'warn'],
    online: ['En línea', 'bi-check-circle-fill', 'ok'],
    offline: ['Desconectado', 'bi-x-circle-fill', 'bad'],
  },
  api: {
    checking: ['Comprobando…', 'bi-arrow-repeat', 'warn'],
    up: ['Disponible', 'bi-check-circle-fill', 'ok'],
    down: ['No disponible', 'bi-x-circle-fill', 'bad'],
  },
  db: {
    unverified: ['Sin verificar', 'bi-question-circle-fill', 'idle'],
    checking: ['Comprobando…', 'bi-arrow-repeat', 'warn'],
    up: ['Disponible', 'bi-check-circle-fill', 'ok'],
    down: ['No disponible', 'bi-x-circle-fill', 'bad'],
  },
};

const NOTAS = {
  ws: 'Conexión de este navegador con el servidor WSS. No indica si el vehículo físico está conectado.',
  api: 'Responde la operación de salud (/salud). No confirma que las 21 operaciones funcionen.',
  db: 'Solo se marca «Disponible» con un diagnóstico seguro del backend; hoy el backend no lo expone.',
};

export class StatusPanel {
  #previo = {};

  constructor() {
    for (const [clave, nota] of Object.entries(NOTAS)) {
      const tarjeta = $(`#st-${clave}`);
      tarjeta.title = nota;
      tarjeta.setAttribute('aria-description', nota);
    }
  }

  set(clave, estado, detalle = '') {
    const [texto, icono, tono] = TEXTOS[clave][estado];
    const tarjeta = $(`#st-${clave}`);
    tarjeta.dataset.state = estado;
    tarjeta.dataset.tone = tono;
    $('[data-role="icon"]', tarjeta).className = `bi ${icono} ${estado === 'connecting' || estado === 'reconnecting' || estado === 'checking' ? 'spin' : ''}`;
    $('[data-role="text"]', tarjeta).textContent = detalle ? `${texto} ${detalle}` : texto;
    if (this.#previo[clave] !== estado) {
      this.#previo[clave] = estado;
      anunciar(`${tarjeta.querySelector('.status-name').textContent}: ${texto}`);
    }
  }
}
