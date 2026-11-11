# Control IoT · Práctica 4.1 (Implementación de soluciones IoT)

App web de **CONTROL** de la excavadora IoT («Excavadora de Juan»): joysticks de tracción y de cabina/pala, STOP prioritario,
12 botones del catálogo, IA, gestos y «Ve ahí». Es solo frontend (HTML5 + CSS3 + JavaScript, un solo `index.html`) y consume la API
de AWS (FastAPI + Amazon RDS) por **REST (Fetch)** y **WebSocket (WSS)**.

Publicada en GitHub Pages: https://juanel2804.github.io/control-iot/

## Archivos
- `index.html` — la aplicación.
- `arena.js` — pestaña **🕹️ Arena** (solo frontend, mismos comandos y mismo WebSocket).
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

## Indicadores (barra superior)
- **WebSocket WSS:** estado real de la sesión del navegador (En línea / Reconectando). No prueba que el vehículo físico esté conectado.
- **API AWS · 21 servicios:** `GET /salud` cada 15 s. Solo prueba que el servicio de salud responde.
- **Amazon RDS:** «Sin verificar»; el backend no expone un diagnóstico seguro de la base.

## Seguridad
La `X-API-Key` **no está en el código**: se escribe en Ajustes (o entra por `#k=<llave>`, que se borra de la URL) y se guarda en el teléfono.

## API
Por defecto usa `https://100-63-187-92.sslip.io`; se puede cambiar con `?api=<URL>`.
