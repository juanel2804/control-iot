# Guía de pruebas contra AWS (A–E) con cliente WebSocket independiente

Estas pruebas son las que se muestran en las evidencias. Se hacen con la **página publicada** en GitHub Pages (HTTPS) y la API real en AWS.
Necesitas la EC2 encendida (laboratorio de AWS Academy activo), la `X-API-Key` y Postman, Thunder Client o una extensión WebSocket de Chrome.

## Preparación
1. Comprueba que la API responde: `https://100-63-187-92.sslip.io/salud` → `{"estado":"ok"}` y `/docs` carga.
2. Abre el cliente WebSocket **independiente** en `wss://100-63-187-92.sslip.io/ws/vehiculos/1` y conéctalo. Debe llegar `estado_inicial`.
   - Esta es **otra** conexión distinta de la que mantiene la página. Muéstrala por separado en las capturas.
3. Abre la página publicada (en el teléfono y en la computadora) y escribe la llave en «Llave de acceso».

## Prueba A · movimiento individual
Presiona **AVANZAR** (arrastra el joystick hacia arriba). Verifica en la página «Aceptado por la API» y en el cliente externo un evento
`{"tipo":"movimiento","comando":"AVANZAR","origen":"WEB-CONTROL",…}` con el mismo vehículo y comando.

## Prueba B · cambio de dirección y DETENER
Mantén arriba, pasa a otra dirección y suelta. En el cliente externo deben verse los eventos en ese orden y **sin duplicados** por el arrastre;
el último es `DETENER`.

## Prueba C · DEMO
Elige una DEMO, **Iniciar**. En el cliente externo: `demo_inicio` → `demo_movimiento` (N veces, en orden) → `demo_fin`. Repite y pulsa **Cancelar**
para ver `demo_cancelada`. Los movimientos de la DEMO **no** aparecen en `GET /vehiculos/1/historial`.

## Prueba D · indicadores y recuperación
- WebSocket: cierra la sesión (o apaga el Wi‑Fi unos segundos) y observa En línea → Desconectado → Reconectando → En línea.
- API: con la EC2 detenida, «Servidor AWS» pasa a No disponible; al reanudarla vuelve a Disponible (WSS cambia por separado).
- RDS: permanece **«Sin verificar»** (el backend no expone diagnóstico seguro; ver README).

## Prueba E · responsividad
Captura la página publicada en móvil vertical, móvil horizontal y escritorio (joystick, botones, DEMO y créditos al pie). Muestra el favicon en la pestaña.

## Qué NO afirmar
Un evento WebSocket confirma que el backend lo **publicó**, no que los motores se movieron. «WebSocket en línea» es la conexión del navegador,
no la presencia del vehículo.
