"""Pruebas funcionales del frontend contra la API SIMULADA (tests/mock_api.py).

OJO: demuestran el comportamiento de la interfaz, NO la conectividad con AWS ni con el vehículo físico.
Uso:  python tests/e2e.py        (levanta la página en :8081 y la API simulada en :8765)
"""
import json
import os
import subprocess
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENV_PY = r"C:\websocket_iot\.venv\Scripts\python.exe"
API = "http://127.0.0.1:8765"
WEB = "http://127.0.0.1:8081"
URL = f"{WEB}/index.html?api={API}"
SHOTS = os.path.join(RAIZ, "docs")
resultados = []


def http(metodo, ruta):
    req = urllib.request.Request(API + ruta, method=metodo)
    with urllib.request.urlopen(req, timeout=5) as r:
        return json.loads(r.read() or b"null")


def posts():
    return [p["comando"] for p in http("GET", "/__test/posts")]


def espera(cond, seg=6, paso=0.05):
    fin = time.time() + seg
    while time.time() < fin:
        try:
            if cond():
                return True
        except Exception:
            pass
        time.sleep(paso)
    return False


def check(nombre, ok, detalle=""):
    resultados.append((nombre, bool(ok), detalle))
    print(("  OK  " if ok else " FALLA"), nombre, ("· " + str(detalle)) if detalle and not ok else "")


def levantar():
    web = subprocess.Popen([sys.executable, "-m", "http.server", "8081", "--bind", "127.0.0.1"], cwd=RAIZ,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    api = subprocess.Popen([VENV_PY, "-m", "uvicorn", "mock_api:app", "--port", "8765", "--log-level", "warning"],
                           cwd=os.path.join(RAIZ, "tests"), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if not espera(lambda: http("GET", "/salud")["estado"] == "ok", 15):
        raise RuntimeError("la API simulada no arrancó")
    return web, api


def centro(page):
    page.locator("#joystick").scroll_into_view_if_needed()
    c = page.locator("#joystick").bounding_box()
    return c["x"] + c["width"] / 2, c["y"] + c["height"] / 2, c["width"] / 2


def arrastrar(page, dx, dy, pasos=12, soltar=True):
    cx, cy, r = centro(page)
    page.mouse.move(cx, cy)
    page.mouse.down()
    page.mouse.move(cx + dx * r * 0.5, cy + dy * r * 0.5, steps=pasos)
    if soltar:
        page.mouse.up()


def texto(page, sel):
    return page.locator(sel).inner_text().strip()


def abrir(browser, hash_="#k=test-key", ancho=390, alto=844, touch=False):
    ctx = browser.new_context(viewport={"width": ancho, "height": alto}, has_touch=touch, is_mobile=touch)
    page = ctx.new_page()
    errores = []
    page.on("pageerror", lambda e: errores.append(str(e)))
    page.on("console", lambda m: errores.append(m.text) if m.type == "error" and "favicon" not in m.text and "status of 503" not in m.text else None)
    http("POST", "/__test/reset")
    page.goto(URL + hash_)
    page.wait_for_selector("#actionsGrid .action-btn", timeout=10000)
    return ctx, page, errores


def principal(pw):
    browser = pw.chromium.launch(channel="msedge", headless=True)
    print("\n== A. Carga, indicadores, favicon y créditos ==")
    ctx, page, errores = abrir(browser)
    check("WebSocket «En línea»", espera(lambda: texto(page, "#st-ws [data-role=text]") == "En línea"))
    check("API AWS «Disponible»", espera(lambda: texto(page, "#st-api [data-role=text]") == "Disponible"))
    check("RDS «Sin verificar» (el backend no expone diagnóstico)", texto(page, "#st-db [data-role=text]") == "Sin verificar")
    check("Nombre del vehículo cargado desde la API", "Retroexcavadora" in texto(page, "#vehicleName"))
    n = page.locator("#actionsGrid .action-btn").count()
    check("Botones = comandos del catálogo que no son del joystick (6)", n == 6, n)
    check("Hay favicon SVG y PNG enlazados", page.locator("link[rel=icon]").count() >= 2)
    check("Créditos visibles al pie", "Desarrollado por" in texto(page, "#credits"))
    check("Llave #k= retirada de la URL", "#k=" not in page.url and "test-key" not in page.url)
    opts = page.locator("#demoSelect option").all_inner_texts()
    check("Solo DEMO activas en el selector (2)", len(opts) == 2, opts)
    page.screenshot(path=os.path.join(SHOTS, "01-inicio-movil.png"))

    print("\n== B. Joystick: movimiento individual, cambio de dirección y DETENER ==")
    arrastrar(page, 0, -1)
    check("AVANZAR → DETENER al soltar", espera(lambda: posts() == ["AVANZAR", "DETENER"]), posts())
    check("Fase «evento WebSocket» correlacionada con la acción", espera(lambda: page.locator("#phases [data-step='3']").get_attribute("data-done") == "true"))
    http("POST", "/__test/reset")
    arrastrar(page, 0, -1, soltar=False)
    time.sleep(0.35)
    cx, cy, r = centro(page)
    page.mouse.move(cx - r * 0.5, cy, steps=10)
    time.sleep(0.35)
    page.mouse.up()
    check("Cambio de dirección: AVANZAR, GIRO_IZQ, DETENER", espera(lambda: posts() == ["AVANZAR", "GIRO_IZQ", "DETENER"]), posts())
    time.sleep(0.4)

    http("POST", "/__test/reset")
    cx, cy, r = centro(page)
    page.mouse.move(cx, cy)
    page.mouse.down()
    t0 = time.time()
    for i in range(40):  # ráfaga: alterna arriba/abajo sin esperar
        page.mouse.move(cx, cy + (-0.5 if i % 2 else 0.5) * r, steps=2)
    dur = time.time() - t0
    page.mouse.up()
    time.sleep(1.2)
    p = posts()
    check("Ráfaga de 40 cambios: ≤ 10 movimientos/s (+ sus DETENER prioritarios)", len(p) <= dur * 12 + 6, f"{len(p)} POST en {dur:.1f} s")
    http("POST", "/__test/reset")
    cx, cy, r = centro(page)
    page.mouse.move(cx, cy); page.mouse.down()
    page.mouse.move(cx, cy - r * 0.5, steps=120)  # 120 eventos de puntero en la MISMA dirección
    page.mouse.up(); time.sleep(0.6)
    check("120 movimientos de puntero en una dirección = 1 solo AVANZAR (+DETENER)", posts() == ["AVANZAR", "DETENER"], posts())
    http("POST", "/__test/reset")
    cx, cy, r = centro(page)
    page.mouse.move(cx, cy); page.mouse.down()
    for i in range(40):
        page.mouse.move(cx, cy + (-0.5 if i % 2 else 0.5) * r, steps=2)
    page.mouse.up(); time.sleep(1.2)
    p = posts()
    check("La ráfaga termina en DETENER", p and p[-1] == "DETENER", p[-3:])
    check("Sin comandos consecutivos duplicados (salvo reaseguro)", all(a != b for a, b in zip(p, p[1:]) if a != "DETENER"), p)

    print("\n== C. Botones y teclado ==")
    http("POST", "/__test/reset")
    b = page.locator("#actionsGrid .action-btn", has_text="Pala arriba")
    b.scroll_into_view_if_needed()
    bb = b.bounding_box()
    page.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2)
    page.mouse.down(); time.sleep(0.4); page.mouse.up()
    check("Botón (modo mantener): PALA_ARRIBA y DETENER al soltar", espera(lambda: posts() == ["PALA_ARRIBA", "DETENER"]), posts())
    http("POST", "/__test/reset")
    page.locator("#holdMode").uncheck()
    page.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2)
    page.mouse.down(); time.sleep(0.3); page.mouse.up(); time.sleep(0.5)
    check("Modo toque: soltar NO envía DETENER", posts() == ["PALA_ARRIBA"], posts())
    page.locator("#btnStop").click()
    check("Botón DETENER", espera(lambda: posts() == ["PALA_ARRIBA", "DETENER"]), posts())
    page.locator("#holdMode").check()
    http("POST", "/__test/reset")
    page.locator("#joystick").focus()
    page.keyboard.down("ArrowUp"); time.sleep(0.4); page.keyboard.up("ArrowUp")
    check("Teclado: flecha arriba → AVANZAR, soltar → DETENER", espera(lambda: posts() == ["AVANZAR", "DETENER"]), posts())

    print("\n== D. DEMO ==")
    http("POST", "/__test/reset")
    page.locator("#btnDemoStart").click()
    check("DEMO en ejecución con progreso", espera(lambda: "En ejecución" in texto(page, "#demoStatus")))
    check("Joystick bloqueado y botón Iniciar deshabilitado (no hay 2 DEMO)", page.locator("#joystick").get_attribute("data-locked") == "true" and page.locator("#btnDemoStart").is_disabled())
    check("Botones de movimiento bloqueados durante la DEMO", page.locator("#actionsGrid .action-btn").first.is_disabled())
    check("DEMO termina («Finalizada») y desbloquea", espera(lambda: "Finalizada" in texto(page, "#demoStatus"), 8) and page.locator("#joystick").get_attribute("data-locked") == "false")
    check("Los movimientos de DEMO no se mandan por POST /movimientos", posts() == [], posts())
    page.locator("#demoSelect").select_option(label="Saludo largo")
    page.locator("#btnDemoStart").click()
    espera(lambda: "En ejecución" in texto(page, "#demoStatus"))
    page.locator("#btnDemoCancel").click()
    check("Cancelar DEMO → «Cancelada» y se desbloquea", espera(lambda: "Cancelada" in texto(page, "#demoStatus"), 5) and page.locator("#joystick").get_attribute("data-locked") == "false")
    page.screenshot(path=os.path.join(SHOTS, "02-demo.png"))

    print("\n== E. DETENER con prioridad ante respuestas fuera de orden ==")
    http("POST", "/__test/reset")
    http("POST", "/__test/delay/1200")  # el PRIMER POST llegará 1.2 s tarde
    cx, cy, r = centro(page)
    page.mouse.move(cx, cy); page.mouse.down(); page.mouse.move(cx, cy - r * 0.5, steps=8)
    time.sleep(0.15)
    page.mouse.up()
    check("DETENER sale sin esperar a la solicitud en vuelo", espera(lambda: posts()[:1] == ["DETENER"], 3), posts())
    check("Se reasegura DETENER al llegar el AVANZAR tardío", espera(lambda: posts() == ["DETENER", "AVANZAR", "DETENER"], 5), posts())
    check("La interfaz queda en «Detenido» (la respuesta tardía no la reactiva)", texto(page, "#directionLabel") == "Detenido")

    print("\n== F. Indicadores: caída y recuperación ==")
    http("POST", "/__test/kick")
    vistos = []
    fin = time.time() + 8
    while time.time() < fin:
        t = texto(page, "#st-ws [data-role=text]")
        if not vistos or vistos[-1] != t.split(" ·")[0]:
            vistos.append(t.split(" ·")[0])
        if t == "En línea" and len(vistos) > 1:
            break
        time.sleep(0.05)
    check("WSS: En línea → Desconectado → Reconectando → En línea", "Desconectado" in vistos and vistos[-1] == "En línea", vistos)
    check("Al caer WSS, la API sigue «Disponible» (indicadores independientes)", texto(page, "#st-api [data-role=text]") == "Disponible")
    http("POST", "/__test/health/1")
    page.locator("#btnReload").evaluate("b => { b.hidden = false; b.click(); }")
    check("API caída → «No disponible»", espera(lambda: texto(page, "#st-api [data-role=text]") == "No disponible"))
    check("Con la API caída, RDS no se marca (queda «Sin verificar»)", texto(page, "#st-db [data-role=text]") == "Sin verificar")
    check("Con la API caída, WSS sigue «En línea»", texto(page, "#st-ws [data-role=text]") == "En línea")
    page.screenshot(path=os.path.join(SHOTS, "03-api-caida.png"))
    http("POST", "/__test/health/0")
    page.locator("#btnReload").evaluate("b => { b.hidden = false; b.click(); }")
    check("API recuperada → «Disponible»", espera(lambda: texto(page, "#st-api [data-role=text]") == "Disponible"))
    check("Sin errores de JavaScript en consola", not errores, errores[:3])
    ctx.close()

    print("\n== G. Llave: sin llave se pide y no se guarda en el código ==")
    ctx, page, _ = abrir(browser, hash_="")
    arrastrar(page, 0, -1)
    check("Sin llave: se abre el cuadro de llave", espera(lambda: page.evaluate("document.querySelector('#keyDialog').open")))
    check("Sin llave no se envía ningún POST", posts() == [], posts())
    page.fill("#keyInput", "test-key")
    page.click("#keyForm button[type=submit]")
    arrastrar(page, 0, -1)
    check("Con la llave escrita en el cuadro se envía", espera(lambda: posts() == ["AVANZAR", "DETENER"]), posts())
    ctx.close()
    ctx, page, _ = abrir(browser, hash_="")
    page.click("#btnKey"); page.fill("#keyInput", "llave-incorrecta"); page.click("#keyForm button[type=submit]")
    arrastrar(page, 0, -1)
    check("Llave inválida → mensaje claro, sin movimiento", espera(lambda: "no es válida" in texto(page, "#toasts")) and posts() == [], posts())
    ctx.close()

    print("\n== H. Responsividad (sin desborde, créditos al final, objetivos táctiles) ==")
    for nombre, w, h, touch in [("movil-vertical", 390, 844, True), ("movil-horizontal", 844, 390, True), ("tableta", 820, 1180, True), ("escritorio", 1440, 900, False)]:
        ctx, page, _ = abrir(browser, ancho=w, alto=h, touch=touch)
        espera(lambda: texto(page, "#st-ws [data-role=text]") == "En línea")
        sin_desborde = page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")
        pie_abajo = page.evaluate("""() => { const f = document.querySelector('.app-footer').getBoundingClientRect(); const j = document.querySelector('#actionsGrid').getBoundingClientRect(); return f.top >= j.bottom - 1; }""")
        chicos = page.evaluate("""() => [...document.querySelectorAll('button, .action-btn, select')].filter(e => e.offsetParent && (e.getBoundingClientRect().height < 40 || e.getBoundingClientRect().width < 40)).map(e => e.textContent.trim().slice(0,20))""")
        check(f"{nombre} ({w}x{h}): sin desplazamiento horizontal", sin_desborde)
        check(f"{nombre}: créditos al final, sin tapar controles", pie_abajo)
        check(f"{nombre}: objetivos táctiles ≥ 40 px", not chicos, chicos)
        page.screenshot(path=os.path.join(SHOTS, f"10-{nombre}.png"), full_page=(nombre != "movil-horizontal"))
        ctx.close()
    # DETENER y el joystick deben verse SIN desplazarse en celulares en horizontal (operación con una mano)
    for w, h in [(844, 390), (740, 360), (667, 375)]:
        ctx, page, _ = abrir(browser, ancho=w, alto=h, touch=True)
        caja = page.locator("#btnStop").bounding_box()
        joy = page.locator("#joystick").bounding_box()
        check(f"horizontal {w}x{h}: DETENER visible sin hacer scroll", caja["y"] + caja["height"] <= h, f"fondo={caja['y'] + caja['height']:.0f}")
        check(f"horizontal {w}x{h}: joystick ≥ 120 px y visible", joy["width"] >= 120 and joy["y"] + joy["height"] <= h, f"{joy['width']:.0f}px")
        if (w, h) == (844, 390):
            page.screenshot(path=os.path.join(SHOTS, "10-movil-horizontal.png"))
        ctx.close()
    browser.close()


if __name__ == "__main__":
    os.makedirs(SHOTS, exist_ok=True)
    web, api = levantar()
    try:
        with sync_playwright() as pw:
            principal(pw)
    finally:
        web.terminate()
        api.terminate()
    fallas = [r for r in resultados if not r[1]]
    print(f"\nRESUMEN: {len(resultados) - len(fallas)}/{len(resultados)} pruebas OK")
    for n, _, d in fallas:
        print("  FALLÓ:", n, d)
    sys.exit(1 if fallas else 0)
