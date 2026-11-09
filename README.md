# Control IoT · Práctica 4.1 (Implementación de soluciones IoT)

Aplicación web de **CONTROL** de un vehículo IoT: joystick virtual, botones de movimiento, DETENER prioritario y
ejecución/cancelación de DEMO. Es solo frontend (HTML5 + CSS3 + Bootstrap 5 + JavaScript ES6 modular) y consume la
API que ya está en AWS (FastAPI + Amazon RDS, prácticas 2.5/2.6) por **REST (Fetch + async/await)** y **WebSocket (WSS)**.

```
GitHub Pages (este repo)  ──Fetch/HTTPS──▶  API REST en AWS (FastAPI, 21 servicios)  ──▶  Amazon RDS
        │                                             │
        └────────── WebSocket (WSS) ◀── eventos ──────┘      (el ESP32 aún NO se conecta en esta etapa)
```

No se modificó ni se duplicó el backend: no hay endpoints, tablas ni procedimientos nuevos.

## Estructura

```
index.html                 página única (HTML semántico, Mobile First)
css/styles.css             estilos (variables, joystick, paneles, responsivo)
favicon.svg · favicon-32.png · apple-touch-icon.png   favicon propio (joystick + señal)
js/
  config.js                URL base, rutas del Swagger, tiempos. Sin secretos
  main.js                  composición: conecta servicios, dominio e interfaz
  core/    emitter.js · errors.js            eventos y errores/mensajes seguros
  services/ api-client.js · ws-client.js · health.js    Fetch, WSS con reconexión, salud API/RDS
  domain/  commands.js · controller.js · demos.js       catálogo, coordinador de comandos, DEMO
  ui/      dom.js · joystick.js · controls.js · status-panel.js · log.js · auth.js
tests/     mock_api.py (API simulada) · e2e.py (pruebas funcionales con Playwright)
docs/      capturas de las pruebas locales y guía de pruebas
```

## Cómo se usa

- **Joystick** (mouse o táctil, Pointer Events): arriba/abajo/izquierda/derecha → comandos del catálogo. Soltar = DETENER.
  Con teclado: flechas para mover, `Espacio` o `Esc` para detener.
- **Botones**: se generan con los comandos del catálogo que no usa el joystick. Modo «mantener» (soltar = DETENER) o «toque».
- **DETENER**: siempre disponible; con una DEMO en curso, cancela la DEMO.
- **DEMO**: se listan las activas, se inician y se cancelan. No se crean ni editan aquí (eso es Administración).
- **Llave de acceso**: la API exige `X-API-Key` para mover y controlar DEMO. Se escribe en el cuadro «Llave de acceso» (o entra por
  `…/#k=<llave>`, que se borra de la URL). Se guarda solo en `sessionStorage` (o `localStorage` si se marca «Recordar»). **Nunca va en el código.**

## Contrato de la API que se usa (tomado de Swagger/código de la 2.5, no inventado)

| Uso | Método y ruta | Auth |
|---|---|---|
| Salud de la API | `GET /salud` → `{"estado":"ok"}` | no |
| Vehículo | `GET /vehiculos/{id}` | no |
| Catálogo | `GET /vehiculos/{id}/comandos` | no |
| DEMO del vehículo | `GET /vehiculos/{id}/demos` | no |
| Movimiento | `POST /movimientos` `{id_vehiculo, id_comando, origen}` → 201 | `X-API-Key` |
| Iniciar DEMO | `POST /vehiculos/{id}/demos/{id_demo}/iniciar` → 202 | `X-API-Key` |
| Cancelar DEMO | `POST /vehiculos/{id}/demos/cancelar` → 202 | `X-API-Key` |
| WebSocket | `wss://<host>/ws/vehiculos/{id}` | no (solo escuchar) |

Eventos WSS usados: `estado_inicial`, `movimiento`, `demo_inicio`, `demo_movimiento`, `demo_fin`, `demo_cancelada`, `demo_error`, `pong`.

### Impedimento documentado: no existe diagnóstico de RDS
El backend expone `/salud` (la API está arriba) pero **no** una ruta que compruebe la base de datos. Siguiendo la práctica, **no se inventó una**
y el indicador «Amazon RDS» queda en **«Sin verificar»**. Si el docente autoriza agregar un diagnóstico seguro, basta poner su ruta en
`CONFIG.paths.dbHealth` (`js/config.js`) y el indicador pasa a Disponible/No disponible sin tocar nada más.

## Reglas de control (js/domain/controller.js)

1. Solo se envía cuando **cambia el comando efectivo** (no hay un POST por píxel ni por fotograma).
2. Una solicitud normal en vuelo; el último comando deseado se envía al terminar. Máximo 10 movimientos por segundo.
3. **DETENER es prioritaria**: no espera a la cola, descarta lo pendiente y, si había otra solicitud en vuelo, se **reasegura** al terminar
   (por si el POST anterior llega al servidor después). Una respuesta tardía **no** reactiva el movimiento en pantalla.
4. Con una DEMO en ejecución no se aceptan movimientos; no se pueden iniciar dos DEMO.
5. Fases visibles de cada acción: **Solicitado → Aceptado por la API → Evento WebSocket recibido**. Ninguna significa que el vehículo
   físico se movió: en esta etapa no hay microcontrolador conectado.
6. Si la pestaña se oculta con un movimiento activo, se envía DETENER.

## Los tres indicadores (independientes)

| Indicador | Qué comprueba realmente | Estados |
|---|---|---|
| **WebSocket WSS** | Sesión WSS real de este navegador (apertura, error, cierre, reconexión con espera creciente y latido ping/pong) | En línea · Conectando/Reconectando · Desconectado |
| **Servidor AWS · API de 21 servicios** | `GET /salud` cada 15 s con timeout de 5 s. **No** prueba las 21 operaciones | Disponible · Comprobando · No disponible |
| **Amazon RDS** | Solo con un diagnóstico seguro del backend (hoy no existe) | Disponible · No disponible · **Sin verificar** |

«WebSocket en línea» **no** significa que el vehículo esté conectado; la presencia del ESP32 requerirá un latido propio del dispositivo.

## Ejecutar en local

```bash
python -m http.server 8080          # desde esta carpeta
# abrir http://localhost:8080/
```
Usa la API pública configurada en `js/config.js`. Para probar sin AWS, en otra terminal:
```bash
cd tests && python -m uvicorn mock_api:app --port 8765     # API simulada (llave: test-key)
# abrir http://localhost:8080/?api=http://127.0.0.1:8765#k=test-key
```
`?api=` solo se acepta cuando la página corre en `localhost` y apunta a un host de loopback.

## Pruebas

`python tests/e2e.py` (Playwright + Edge) levanta la página y la **API simulada** y comprueba: indicadores y su independencia, joystick,
cambio de dirección, ráfagas, botones, teclado, DEMO (inicio, bloqueo, fin, cancelación, sin doble DEMO), DETENER ante respuestas fuera de
orden, caída/recuperación de WSS y API, llave faltante o inválida, y responsividad (móvil vertical/horizontal, tableta, escritorio).

> Esas pruebas usan una **simulación** del contrato; **no sustituyen** las pruebas contra AWS ni la verificación independiente del
> WebSocket. Ver `docs/GUIA-PRUEBAS.md` para las pruebas A–E con Postman/Thunder Client.

## Seguridad

- Sin claves de AWS, credenciales de RDS ni tokens en el repositorio; la `X-API-Key` la escribe el usuario.
- HTTPS y WSS únicamente (sin contenido mixto). CORS lo configura el backend (`CORS_ORIGINS` con `https://juanel2804.github.io`); CORS no es autenticación.
- Todo dato remoto se pinta con `textContent` (no `innerHTML`); las respuestas se validan antes de usarse.
- Errores amigables: no se muestran trazas ni detalles internos (el `detail` de la API se recorta a 160 caracteres).

## Publicación (GitHub Pages)

Rama `main`, carpeta raíz. Todas las rutas son relativas, así que funciona en una subruta (`/control-iot/`). Archivo `.nojekyll` incluido.

## Limitaciones de esta etapa

Sin ESP8266/ESP32, sin monitoreo, sin administración y sin Vercel. Bootstrap y Bootstrap Icons se cargan desde jsDelivr (versión fija).
