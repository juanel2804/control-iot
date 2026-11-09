"""Verificación SOLO DE LECTURA de la página publicada en GitHub Pages contra la API REAL de AWS.
No usa la X-API-Key y no envía ningún POST, así que NO mueve el vehículo físico ni cambia datos.

Uso: python tests/verificar_publicado.py
"""
import os
import sys
import time

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
URL = "https://juanel2804.github.io/control-iot/"
DOCS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs")
res = []


def check(nombre, ok, detalle=""):
    res.append(bool(ok))
    print(("  OK  " if ok else " FALLA"), nombre, ("· " + str(detalle)) if detalle and not ok else "")


def esperar(cond, seg=20):
    fin = time.time() + seg
    while time.time() < fin:
        try:
            if cond():
                return True
        except Exception:
            pass
        time.sleep(0.15)
    return False


with sync_playwright() as pw:
    b = pw.chromium.launch(channel="msedge", headless=True)
    for nombre, w, h, touch in [("movil", 390, 844, True), ("escritorio", 1440, 900, False)]:
        print(f"\n== Página publicada · {nombre} ({w}x{h}) · API real de AWS ==")
        ctx = b.new_context(viewport={"width": w, "height": h}, has_touch=touch, is_mobile=touch)
        page = ctx.new_page()
        errores, posts, wss = [], [], []
        page.on("pageerror", lambda e: errores.append(str(e)))
        page.on("console", lambda m: errores.append(m.text) if m.type == "error" else None)
        page.on("request", lambda r: posts.append(r.url) if r.method == "POST" else None)
        page.on("websocket", lambda ws: wss.append(ws.url))
        page.goto(URL)
        t = lambda s: page.locator(s).inner_text().strip()
        check("WebSocket real «En línea» (WSS de AWS)", esperar(lambda: t("#st-ws [data-role=text]") == "En línea"), t("#st-ws [data-role=text]"))
        check("API de AWS «Disponible» (/salud)", esperar(lambda: t("#st-api [data-role=text]") == "Disponible"), t("#st-api [data-role=text]"))
        check("RDS «Sin verificar» (no hay diagnóstico en el backend)", t("#st-db [data-role=text]") == "Sin verificar")
        check("Se abrió un WebSocket wss:// (no ws://)", any(u.startswith("wss://100-63-187-92.sslip.io/ws/vehiculos/1") for u in wss), wss)
        check("Nombre del vehículo real cargado", esperar(lambda: "Retroexcavadora IoT" in t("#vehicleName")), t("#vehicleName"))
        check("Catálogo real: 8 botones + joystick con 4 direcciones", esperar(lambda: page.locator("#actionsGrid .action-btn").count() == 8), page.locator("#actionsGrid .action-btn").count())
        check("Las 4 direcciones del joystick tienen comando real", page.locator("[data-dir][data-disabled='true']").count() == 0)
        check("DETENER habilitado (existe en el catálogo)", not page.locator("#btnStop").is_disabled())
        check("DEMO real listada", "Demo principal" in page.locator("#demoSelect").inner_text())
        check("Favicon cargado desde Pages", page.evaluate("fetch(document.querySelector('link[rel=icon]').href).then(r => r.ok)"))
        check("Créditos al pie", "Desarrollado por Juan Elpidio López García" in t("#credits"))
        check("Sin POST enviados (verificación de solo lectura)", posts == [], posts)
        check("Sin errores de JavaScript/CORS en consola", not errores, errores[:3])
        page.screenshot(path=os.path.join(DOCS, f"real-{nombre}.png"), full_page=True)
        ctx.close()
    b.close()

print(f"\nRESUMEN: {sum(res)}/{len(res)} comprobaciones OK")
sys.exit(0 if all(res) else 1)
