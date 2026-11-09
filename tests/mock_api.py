"""API SIMULADA solo para probar el frontend en local cuando la API real de AWS no está disponible.

Replica el CONTRATO de vehiculo-iot-api (rutas, X-API-Key, códigos HTTP y eventos WebSocket) pero NO usa RDS ni
reemplaza nada del backend real. Las pruebas hechas con esto NO sustituyen las pruebas contra AWS.

Ejecutar:  python -m uvicorn mock_api:app --port 8765      (desde la carpeta tests/)
Llave de prueba: test-key
"""
import asyncio
from datetime import datetime, timezone

from fastapi import FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

LLAVE = "test-key"
VEHICULO = 1

app = FastAPI(title="Mock API IoT")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

COMANDOS = [
    ("AVANZAR", 1), ("RETROCEDER", 2), ("GIRO_IZQ", 3), ("GIRO_DER", 4), ("CABINA_IZQ", 5), ("CABINA_DER", 6),
    ("PALA_ARRIBA", 7), ("PALA_ABAJO", 8), ("DETENER", 9), ("ENCENDER_APAGAR", 10), ("AUX_1", 11),
]
CATALOGO = [{"id_comando": 100 + i, "id_vehiculo": VEHICULO, "nombre": n, "codigo": c, "descripcion": None, "activo": True}
            for i, (n, c) in enumerate(COMANDOS)]
POR_ID = {c["id_comando"]: c for c in CATALOGO}
DEMOS = [
    {"id_demo": 1, "id_vehiculo": VEHICULO, "nombre": "Zanja corta", "descripcion": "4 movimientos", "activo": True,
     "mov": [("AVANZAR", 350, 100), ("GIRO_IZQ", 350, 100), ("PALA_ABAJO", 350, 100), ("DETENER", 200, 0)]},
    {"id_demo": 2, "id_vehiculo": VEHICULO, "nombre": "Saludo largo", "descripcion": "8 movimientos", "activo": True,
     "mov": [("CABINA_IZQ", 600, 100), ("CABINA_DER", 600, 100)] * 4},
    {"id_demo": 3, "id_vehiculo": VEHICULO, "nombre": "Desactivada", "descripcion": None, "activo": False, "mov": []},
]


class Estado:
    sockets: set[WebSocket] = set()
    posts: list[dict] = []          # orden real de llegada de los POST /movimientos
    health_down = False
    delay_next_ms = 0               # retrasa UNA respuesta (para simular llegadas fuera de orden)
    demo_en_curso: int | None = None
    cancelar = asyncio.Event()
    ultimo: str | None = None


E = Estado()
ahora = lambda: datetime.now(timezone.utc).isoformat()


async def emitir(tipo: str, **datos):
    msg = {"tipo": tipo, "id_vehiculo": VEHICULO, **datos, "timestamp": ahora()}
    for ws in list(E.sockets):
        try:
            await ws.send_json(msg)
        except Exception:
            E.sockets.discard(ws)


def exigir(llave: str | None):
    if not llave:
        raise HTTPException(401, "Falta el header X-API-Key")
    if llave != LLAVE:
        raise HTTPException(403, "X-API-Key inválida")


@app.get("/salud")
def salud():
    if E.health_down:
        raise HTTPException(503, "caído (simulado)")
    return {"estado": "ok"}


@app.get("/vehiculos/{vid}")
def detalle(vid: int):
    if vid != VEHICULO:
        raise HTTPException(404, "Vehículo no encontrado")
    return {"id_vehiculo": VEHICULO, "nombre": "Retroexcavadora (simulada)", "modelo": None, "descripcion": None,
            "microcontrolador": "ESP32", "fecha_registro": ahora(), "activo": True, "comandos": CATALOGO,
            "estado": None, "demos": [], "demo_en_ejecucion": E.demo_en_curso}


@app.get("/vehiculos/{vid}/comandos")
def comandos(vid: int):
    return CATALOGO


@app.get("/vehiculos/{vid}/demos")
def demos(vid: int):
    return [{k: v for k, v in d.items() if k != "mov"} for d in DEMOS]


class MovimientoIn(BaseModel):
    id_vehiculo: int
    id_comando: int | None = None
    codigo: int | None = None
    origen: str = "API"


@app.post("/movimientos", status_code=201)
async def movimiento(datos: MovimientoIn, x_api_key: str | None = Header(default=None)):
    exigir(x_api_key)
    if E.delay_next_ms:
        espera, E.delay_next_ms = E.delay_next_ms, 0
        await asyncio.sleep(espera / 1000)
    cmd = POR_ID.get(datos.id_comando)
    if not cmd:
        raise HTTPException(404, "Comando no encontrado")
    E.posts.append({"comando": cmd["nombre"], "origen": datos.origen, "t": ahora()})
    E.ultimo = cmd["nombre"]
    await emitir("movimiento", comando=cmd["nombre"], codigo=cmd["codigo"], id_comando=cmd["id_comando"], origen=datos.origen)
    return {"id_vehiculo": VEHICULO, "id_comando": cmd["id_comando"], "comando": cmd["nombre"], "codigo": cmd["codigo"],
            "origen": datos.origen, "conectado": False, "timestamp": ahora()}


async def correr_demo(demo: dict):
    total = len(demo["mov"])
    E.cancelar.clear()
    await emitir("demo_inicio", id_demo=demo["id_demo"], total_movimientos=total)
    for i, (nombre, dur, pausa) in enumerate(demo["mov"], 1):
        if E.cancelar.is_set():
            break
        await emitir("demo_movimiento", id_demo=demo["id_demo"], orden=i, total_movimientos=total, comando=nombre,
                     codigo=dict(COMANDOS)[nombre], duracion_ms=dur, pausa_ms=pausa)
        try:
            await asyncio.wait_for(E.cancelar.wait(), (dur + pausa) / 1000)
        except asyncio.TimeoutError:
            pass
    if E.cancelar.is_set():
        await emitir("demo_cancelada", id_demo=demo["id_demo"], estado_detenido=True)
    else:
        await emitir("demo_fin", id_demo=demo["id_demo"], total_movimientos=total)
    E.demo_en_curso = None


@app.post("/vehiculos/{vid}/demos/cancelar", status_code=202)
async def cancelar(vid: int, x_api_key: str | None = Header(default=None)):
    exigir(x_api_key)
    if E.demo_en_curso is None:
        raise HTTPException(409, "No hay una DEMO en ejecución")
    E.cancelar.set()
    return {"id_vehiculo": vid, "id_demo": E.demo_en_curso}


@app.post("/vehiculos/{vid}/demos/{did}/iniciar", status_code=202)
async def iniciar(vid: int, did: int, x_api_key: str | None = Header(default=None)):
    exigir(x_api_key)
    demo = next((d for d in DEMOS if d["id_demo"] == did and d["activo"]), None)
    if not demo:
        raise HTTPException(404, "DEMO no encontrada")
    if E.demo_en_curso is not None:
        raise HTTPException(409, "El vehículo ya ejecuta otra DEMO")
    E.demo_en_curso = did
    asyncio.create_task(correr_demo(demo))
    return {"id_vehiculo": vid, "id_demo": did, "total_movimientos": len(demo["mov"])}


@app.websocket("/ws/vehiculos/{vid}")
async def ws_vehiculo(ws: WebSocket, vid: int):
    await ws.accept()
    E.sockets.add(ws)
    await ws.send_json({"tipo": "estado_inicial", "id_vehiculo": vid, "estado": None, "demo_en_ejecucion": E.demo_en_curso,
                        "telemetria": None})
    try:
        while True:
            m = await ws.receive_json()
            if isinstance(m, dict) and m.get("tipo") == "ping":
                await ws.send_json({"tipo": "pong", "p": m.get("p")})
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        E.sockets.discard(ws)


# ---------- Controles SOLO de prueba ----------
@app.post("/__test/reset")
def t_reset():
    E.posts.clear()
    E.health_down = False
    E.delay_next_ms = 0
    return {"ok": True}


@app.get("/__test/posts")
def t_posts():
    return E.posts


@app.post("/__test/health/{down}")
def t_health(down: int):
    E.health_down = bool(down)
    return {"down": E.health_down}


@app.post("/__test/delay/{ms}")
def t_delay(ms: int):
    E.delay_next_ms = ms
    return {"ms": ms}


@app.post("/__test/kick")
async def t_kick():
    n = len(E.sockets)
    for ws in list(E.sockets):
        await ws.close(code=1012)
    E.sockets.clear()
    return {"cerrados": n}
