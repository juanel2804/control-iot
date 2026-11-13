# Control y Monitoreo IoT · Prácticas 4.1 y 4.2 (Implementación de soluciones IoT)

App web de la excavadora IoT («Excavadora de Juan») con dos vistas en el mismo sitio y el mismo repositorio:

- **CONTROL (4.1):** joysticks de tracción y de cabina/pala, STOP prioritario, 12 botones del catálogo, DEMO, IA, gestos, Arena y sala de turnos.
- **MONITOREO (4.2):** muestra en tiempo real el último movimiento reportado y los **10 movimientos individuales más recientes guardados en Amazon RDS**, con fecha y hora.

Es solo frontend (HTML5 + CSS3 + Bootstrap 5 + JavaScript ES6). Consume la API existente en AWS (FastAPI, 21 servicios REST y Amazon RDS MySQL)
por **REST (Fetch + async/await)** y **WebSocket seguro (WSS)**. No se creó otro backend ni se cambiaron tablas o procedimientos de RDS.

Publicada en GitHub Pages: https://juanel2804.github.io/control-iot/ (botón **Monitoreo** del menú)

## Archivos
- `index.html` — la aplicación: CONTROL (script principal) y el marcado de MONITOREO.
- `js/monitoreo/` — módulos ES6 de MONITOREO (ver «Mapa de módulos»).
- `css/monitoreo.css` — estilos de MONITOREO (Mobile First, misma identidad visual).
- `arena.js` — pestaña **🕹️ Arena** (solo frontend, mismos comandos y mismo WebSocket).
- `sala.js` — pestaña **🎟️ Sala** (turnos con QR y panel del administrador) y botón **🎬 DEMOS** del control.
- `gamer.css` — diseño «cabina de máquina pesada»: amarillo máquina con franjas de precaución, letra de esténcil y paneles de esquinas cortadas.
- `gamer.js` — pantalla de bienvenida, telemetría real bajo el tablero y sonidos.
- `manifest.webmanifest`, `sw.js`, `icono-192.png`, `icono-512.png` — instalable como app.
- `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png` — favicon propio.
- `docs/` — capturas de la app publicada.

## Práctica 4.2 · MONITOREO

### Flujo
```
GitHub Pages (CONTROL + MONITOREO)
   ├─ HTTPS/Fetch ─► FastAPI en EC2 ─► Amazon RDS (sp_obtener_estado, sp_obtener_historial)   ← carga inicial y resincronización
   └─ WSS (una sola conexión, compartida) ◄─ eventos del vehículo                            ← dispara la actualización en vivo
```
1. Al abrir MONITOREO: `GET /vehiculos/{id}/estado` y `GET /vehiculos/{id}/historial` (en paralelo).
2. Llega un evento WSS del mismo vehículo → se actualiza la tarjeta al momento y se **relee el historial por REST**
   (la tabla solo muestra lo que RDS confirmó; nunca se agregan filas desde el navegador).
3. Si el WSS se cae y vuelve → se repite la carga REST para recuperar lo que pasó mientras tanto.

### Contratos reales usados (vehiculo-iot-api)
| Qué | Contrato |
|---|---|
| Último estado | `GET /vehiculos/{id}/estado` → `{id_vehiculo, vehiculo, id_comando, comando, codigo, conectado, fecha_actualizacion}` o `null` |
| Historial | `GET /vehiculos/{id}/historial` → máx. 10 `{id_historial, id_vehiculo, comando, codigo, fecha_hora, origen}`, del más reciente al más antiguo. Los pasos de una DEMO nunca aparecen. |
| Salud API | `GET /salud` → `{"estado":"ok"}` |
| WSS | `wss://100-63-187-92.sslip.io/ws/vehiculos/{id}`. Todos los mensajes llevan `tipo`, `id_vehiculo` y `timestamp` (UTC ISO 8601). |
| Eventos WSS | `estado_inicial` (al conectar, leído de RDS) · `control` (canal rápido; el backend guarda en el historial en segundo plano y solo si cambia el movimiento) · `movimiento` (`POST /movimientos`, se publica **después** del commit) · `demo_inicio` / `demo_movimiento` / `demo_fin` / `demo_cancelada` / `demo_error` · `conexion` · `telemetria` |
| Autenticación | MONITOREO solo hace GET públicos y escucha el WSS: **no necesita la llave**. Mover el vehículo sigue pidiendo `X-API-Key` / `{"tipo":"auth"}` (CONTROL). |
| CORS | El backend permite `GET` y `POST` desde `https://juanel2804.github.io`. |
| Hora | Los `TIMESTAMP` de RDS llegan sin zona y la sesión de RDS está en UTC (respaldo `vehiculo_iot_rds.sql`: `SET TIME_ZONE='+00:00'`). Se muestran en **hora del centro de México**. |

### Mapa de módulos (`js/monitoreo/`)
| Módulo | Responsabilidad |
|---|---|
| `config.js` | Configuración común con CONTROL (`window.IOT`: URL de la API, vehículo y WebSocket compartido). Sin secretos. |
| `fechas.js` | Interpreta ISO (sin zona → UTC) y da formato de fecha y hora. Nunca inventa una fecha. |
| `validar.js` | Valida esquemas REST/WSS, descarta otros vehículos, payloads mal formados y duplicados (`id_historial`). |
| `api.js` | Cliente REST: Fetch + async/await, timeout con AbortController y errores tipados (red, tiempo, HTTP, RDS 503, contrato). |
| `canal.js` | Cliente WSS: **no abre otra conexión**, escucha la de CONTROL (eventos `abriendo` / `abierto` / `cerrado` / `mensaje`). |
| `conectividad.js` | Indicador de RDS y panel con los tres indicadores. |
| `ultimo.js` | Tarjeta del último movimiento: orden por versión de eventos y timestamps; una respuesta REST vieja no pisa un evento más nuevo. |
| `historial.js` | Tabla de máx. 10 filas: ordena por `fecha_hora` e `id_historial`, reutiliza filas por id y resalta las nuevas. |
| `eventos.js` | Bitácora en pantalla de los eventos WSS, para compararlos con el cliente externo. |
| `sincronizador.js` | Una sincronización REST a la vez (las peticiones se agrupan), debounce tras eventos y un reintento acotado. Sin polling. |
| `app.js` | Arranque y orquestación: vista visible, reconexión y reglas de DEMO. |

En `index.html` solo se agregaron el botón **Monitoreo**, la sección `#vMonitoreo` y el canal compartido del WebSocket en `conectar()`
(con reconexión progresiva: 1 s, 2 s, 4 s y luego cada 8 s). La lógica de comandos de CONTROL no cambió.

### Reglas que respeta
- **Evento ≠ registro ≠ ejecución:** la tarjeta indica qué está comprobado («Publicado por WSS», «Leído de RDS», «En historial RDS · ID n») y siempre dice «Ejecución física: sin confirmar».
- **DEMO:** sus pasos se ven en la tarjeta como evento, pero no se agregan a la tabla. Al terminar o cancelar, se relee el estado final de RDS.
- **Sin polling del historial:** solo se consulta al abrir la vista, tras un evento, al reconectar o con «Resincronizar». Con la vista cerrada, la consulta queda pendiente para cuando se vuelve.
- **Seguridad:** todo se pinta con `textContent` (sin `innerHTML` con datos externos), se validan vehículo y esquema, y no hay llaves ni credenciales en el código.

### Probar
1. Abre la página → **Monitoreo**. En DevTools › Network deben aparecer `GET …/estado` y `GET …/historial` (carga inicial).
2. En otra pestaña (o en el celular) abre **Control** y mueve AVANZAR, GIRO DERECHA y STOP: MONITOREO cambia sin recargar y la tabla muestra las filas nuevas con su ID de RDS.
3. Cliente externo (Postman › WebSocket o Thunder Client) conectado a `wss://100-63-187-92.sslip.io/ws/vehiculos/1`: recibe los mismos eventos.
4. Manda más de 10 movimientos: la tabla queda en 10, ordenada y sin duplicados.
5. Corta la red (o reinicia la API) y vuelve: el WSS pasa a «Reconectando» y luego a «En línea», y la tabla se recupera por REST.
6. Lanza una DEMO: la tarjeta muestra «DEMO #n · paso x/y», pero la tabla no cambia.

## Pantalla de la expo (`expo.html`)
Liga aparte para la tablet o el proyector: https://juanel2804.github.io/control-iot/expo.html (no está en el menú).
- **Izquierda:** sala de turnos para el público. Se elige el tiempo por turno (30/60/90/120 s) y aparecen el QR grande y el código, quién maneja con su cronómetro y la fila.
  Botones: pausar/reanudar, siguiente, +30 s, sacar de la fila y cerrar (doble toque). La tablet entra como administrador con la llave guardada en ese dispositivo; el QR solo lleva `#sala=CÓDIGO`.
- **Derecha, «Así viaja cada orden»:** diagrama Celular → AWS EC2 → Amazon RDS / ESP32 → motores, animado **solo con eventos reales** del WebSocket.
  Muestra quién mandó la orden, el `INSERT` en RDS con el ID real del historial, los pasos de DEMO («estado ✓ · historial ✗») y la señal del ESP32.
  Si el ESP32 no reporta telemetría, la orden se marca «sin señal: no llegó» en lugar de fingir el movimiento.
- **Indicadores:** WSS, API AWS, RDS y ESP32 (telemetría de los últimos 12 s).
- Archivos: `expo.html`, `css/expo.css`, `js/expo/expo.js` (sala, WSS e historial) y `js/expo/diagrama.js` (animación SVG). Reutiliza `js/monitoreo/api.js`, `config.js` y `fechas.js`.

## Administración (Ajustes, solo con la llave)
Usa los servicios REST que ya existen (sin cambios en el backend):
- **Vehículos:** listar, crear, editar (incluye activo/inactivo) y eliminar.
- **Comandos** del catálogo de cada vehículo: crear, editar y eliminar.
- **DEMOs:** crear, editar y eliminar; agregar, editar y quitar pasos (comando, orden, duración y pausa); ejecutar y cancelar.
- Eliminar pide doble toque. Los invitados (sin llave) no ven esta sección. Archivos: `js/admin/admin.js` y `css/admin.css`.
- Usuarios y permisos: la base no tiene tabla de usuarios. Los roles son administrador (con llave) e invitado (QR con turno, controlado por el servidor).

## Indicadores (barra superior, visibles en todas las vistas)
- **WebSocket WSS:** estado real de la sesión del navegador (En línea / Conectando-Reconectando / Desconectado). No prueba que el vehículo físico esté conectado.
- **API AWS · 21 servicios:** `GET /salud` cada 15 s, con 5 s de espera máxima (Comprobando / Disponible / No disponible). Solo prueba que el servicio de salud responde, no las 21 operaciones.
- **Amazon RDS:** se marca con la respuesta real del backend a consultas que ejecutan Stored Procedures en RDS (`/estado`, `/historial`):
  200 → **Disponible**; 503 «La base de datos en RDS no está disponible» → **No disponible**; sin respuesta del backend → **Sin verificar**.
  El backend no tiene un endpoint de diagnóstico propio; agregarlo cambiaría el backend y necesitaría autorización docente.

## Arena
- **Simulador 3D:** una excavadora virtual con cámara de persecución. En «Simulador» ningún comando sale del teléfono; en «Excavadora real» el gemelo imita a la máquina.
- **Órdenes completas por voz o texto:** «haz un cuadrado», «estrella grande», «repite eso 2 veces».
- **Dibuja y la sigue**, **modo baile**, **misiones con cronómetro y ranking** (el ranking se guarda en cada teléfono).
- **Calibración:** cuánto tarda un giro de 90° y cuánto dura un lado.

## Sala de turnos
- El administrador (con llave) abre la sala, elige el tiempo por turno (30/60/90/120 s) y comparte el **QR**. El QR solo lleva un código de 4 letras; la llave **no** sale de su teléfono.
- Los invitados escriben su nombre y hacen fila. El servidor da el turno con cronómetro y solo obedece a quien lo tiene; al acabar, manda DETENER.
- **🎬 DEMOS:** lista las DEMO del vehículo (`GET /vehiculos/{id}/demos`) y las lanza por el WebSocket.

## Seguridad
La `X-API-Key` **no está en el código**: se escribe en Ajustes (o entra por `#k=<llave>`, que se borra de la URL) y se guarda en el teléfono.
MONITOREO no la usa. El navegador nunca se conecta a RDS: todo pasa por la API.

## API
Por defecto usa `https://100-63-187-92.sslip.io`; se puede cambiar con `?api=<URL>`. El vehículo se elige con `?v=<id>` (1 por defecto).
