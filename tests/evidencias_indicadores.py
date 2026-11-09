"""Capturas de los tres indicadores contra la API REAL (solo lectura, sin POST ni llave).

Cada falla se SIMULA en el navegador (no se apaga la EC2):
  - API caída: se bloquea únicamente la ruta /salud  → la sesión WSS sigue en línea (indicadores independientes).
  - Red caída: el navegador pasa a modo sin conexión → WSS y API caen; al volver, WSS se reconecta solo.
Uso: python tests/evidencias_indicadores.py [URL]   (por defecto la página publicada en GitHub Pages)
"""
import os
import sys
import time

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
URL = sys.argv[1] if len(sys.argv) > 1 else "https://juanel2804.github.io/control-iot/"
DOCS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs")
bitacora = []


def esperar(cond, seg=25):
    fin = time.time() + seg
    while time.time() < fin:
        try:
            if cond():
                return True
        except Exception:
            pass
        time.sleep(0.1)
    return False


with sync_playwright() as pw:
    b = pw.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 430, "height": 420}, has_touch=True, is_mobile=True)
    page = ctx.new_page()
    t = lambda k: page.locator(f"#st-{k} [data-role=text]").inner_text().strip().split(" ·")[0]
    estado = lambda: (t("ws"), t("api"), t("db"))

    def foto(nombre, nota):
        ruta = os.path.join(DOCS, nombre)
        page.screenshot(path=ruta)
        bitacora.append((nota, estado(), nombre))
        print(f"  {nota}: WSS={t('ws')} | API={t('api')} | RDS={t('db')}  →  {nombre}")

    reload_ = lambda: page.locator("#btnReload").evaluate("b => { b.hidden = false; b.click(); }")

    page.goto(URL)
    assert esperar(lambda: estado() == ("En línea", "Disponible", "Sin verificar")), estado()
    foto("real-ind-1-normal.png", "Normal")

    page.route("**/salud", lambda r: r.abort())          # solo se bloquea /salud
    reload_()
    assert esperar(lambda: t("api") == "No disponible"), estado()
    assert t("ws") == "En línea", "WSS debe seguir en línea cuando solo cae la API"
    foto("real-ind-2-api-caida.png", "API caída (WSS sigue)")
    page.unroute("**/salud")
    reload_()
    assert esperar(lambda: t("api") == "Disponible"), estado()
    foto("real-ind-3-api-recuperada.png", "API recuperada")

    ctx.set_offline(True)                                 # sin red: cae el WSS y la API
    assert esperar(lambda: t("ws") == "Desconectado"), estado()
    foto("real-ind-4-wss-desconectado.png", "WSS desconectado")
    ctx.set_offline(False)
    visto_reconectando = esperar(lambda: t("ws") == "Reconectando…", 12)
    if visto_reconectando:
        foto("real-ind-5-wss-reconectando.png", "WSS reconectando")
    assert esperar(lambda: t("ws") == "En línea", 25), estado()
    reload_()
    esperar(lambda: t("api") == "Disponible")
    foto("real-ind-6-recuperado.png", "Todo recuperado")
    print("  Se observó «Reconectando…»:", visto_reconectando)
    b.close()
print("OK: capturas en docs/")
