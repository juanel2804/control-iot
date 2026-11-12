# Control IoT · Práctica 4.1 (Implementación de soluciones IoT)

App web de **CONTROL** de la excavadora IoT («Excavadora de Juan»): joysticks de tracción y de cabina/pala, STOP prioritario,
12 botones del catálogo, IA, gestos, Arena y sala de turnos. Es solo frontend (HTML5 + CSS3 + JavaScript, un solo `index.html`) y consume la API
de AWS (FastAPI + Amazon RDS) por **REST (Fetch)** y **WebSocket (WSS)**.

Publicada en GitHub Pages: https://juanel2804.github.io/control-iot/

## Archivos
- `index.html` — la aplicación.
- `arena.js` — pestaña **🕹️ Arena** (solo frontend, mismos comandos y mismo WebSocket).
- `sala.js` — pestaña **🎟️ Sala** (turnos con QR y panel del administrador) y botón **🎬 DEMOS** del control.
- `gamer.css` — diseño «cabina de máquina pesada»: amarillo máquina con franjas de precaución, letra de esténcil y paneles de esquinas cortadas.
- `gamer.js` — pantalla de bienvenida (revisa enlace, API, excavadora y tu acceso antes de «Tomar el mando»), telemetría real bajo el tablero y sonidos.
- `manifest.webmanifest`, `sw.js`, `icono-192.png`, `icono-512.png` — instalable como app.
- `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png` — favicon propio.
- `docs/` — capturas de la app publicada.

## Arena
- **Simulador 3D:** una excavadora virtual con cámara de persecución. En «Simulador» ningún comando sale del teléfono; en «Excavadora real» el gemelo imita a la máquina.
- **Órdenes completas por voz o texto:** «haz un cuadrado», «estrella grande», «triángulo a la izquierda», «repite eso 2 veces». Figuras: cuadrado, triángulo, rectángulo, pentágono, hexágono, círculo, estrella, zigzag, ocho, espiral, escalera, media vuelta, ida y vuelta.
- **Dibuja y la sigue:** trazas una ruta con el dedo y la excavadora la recorre.
- **Modo baile:** con micrófono (detecta los graves de la música) o con metrónomo.
- **Misiones con cronómetro, estrellas y ranking:** Slalom, Estaciónate y Llena el camión. El ranking se guarda en cada teléfono.
- **Calibración:** cuánto tarda un giro de 90° y cuánto dura un lado. Las figuras salen por tiempo porque la excavadora no tiene sensores de posición.

## Sala de turnos (requiere la rama `turnos` del backend)
- El administrador (con llave) abre la sala, elige el tiempo por turno (30/60/90/120 s) y comparte el **QR**. El QR solo lleva un código de 4 letras (`#sala=ABCD`); la llave **no** sale de su teléfono.
- Los invitados escriben su nombre y hacen fila. El servidor da el turno con cronómetro y solo obedece a quien lo tiene; al acabar, manda DETENER.
- El administrador puede pasar al siguiente, dar el turno, sacar, dar +30 s o pausar (en pausa él toma el control). Su STOP siempre pasa.
- Si a un invitado se le corta la red, conserva su lugar unos segundos con la misma «ficha» del teléfono.
- **🎬 DEMOS:** lista las DEMO del vehículo (`GET /vehiculos/{id}/demos`) y las lanza por el WebSocket; el invitado solo en su turno.

## Indicadores (barra superior)
- **WebSocket WSS:** estado real de la sesión del navegador (En línea / Reconectando). No prueba que el vehículo físico esté conectado.
- **API AWS · 21 servicios:** `GET /salud` cada 15 s. Solo prueba que el servicio de salud responde.
- **Amazon RDS:** «Sin verificar»; el backend no expone un diagnóstico seguro de la base.

## Seguridad
La `X-API-Key` **no está en el código**: se escribe en Ajustes (o entra por `#k=<llave>`, que se borra de la URL) y se guarda en el teléfono.

## API
Por defecto usa `https://100-63-187-92.sslip.io`; se puede cambiar con `?api=<URL>`.
