"""Genera los íconos de la app Android (Capacitor) y del programa de PC
(Electron en desktop/ y Tauri en src-tauri/) desde una sola imagen.

Uso: python3 scripts/generar-iconos-app.py ruta/a/imagen.png
La web y el ERP NO usan estos archivos (siguen con public/logo*.png).
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

RAIZ = Path(__file__).resolve().parent.parent
FONDO = (240, 240, 240, 255)  # gris claro del logo original
M = 1024  # tamaño maestro


def recortar_logo(ruta):
    im = Image.open(ruta).convert("RGB")
    a = np.asarray(im).astype(int)
    h, w, _ = a.shape
    # contenido = píxeles que se alejan del gris de fondo (ignora bordes blancos)
    y0, y1, x0, x1 = int(h * .16), int(h * .97), int(w * .07), int(w * .95)
    sub = a[y0:y1, x0:x1]
    m = np.abs(sub - 241).max(axis=2) > 40
    ys, xs = np.where(m)
    caja = (xs.min() + x0, ys.min() + y0, xs.max() + x0 + 1, ys.max() + y0 + 1)
    logo = im.crop(caja).convert("RGBA")
    # funde el gris del recorte con el fondo exacto
    arr = np.asarray(logo).copy()
    cerca = np.abs(arr[..., :3].astype(int) - 241).max(axis=2) <= 6
    arr[cerca] = FONDO
    return Image.fromarray(arr)


def lienzo(logo, lado, ancho_logo, forma="redondeado", transparente=False):
    """Logo centrado en un cuadrado; forma: redondeado | circulo | cuadrado."""
    esc = 4
    L = lado * esc
    base = Image.new("RGBA", (L, L), (0, 0, 0, 0) if transparente else FONDO)
    lw = int(L * ancho_logo)
    lh = int(logo.height * lw / logo.width)
    lg = logo.resize((lw, lh), Image.LANCZOS)
    base.alpha_composite(lg, ((L - lw) // 2, (L - lh) // 2))
    if forma != "cuadrado" and not transparente:
        mask = Image.new("L", (L, L), 0)
        d = ImageDraw.Draw(mask)
        if forma == "circulo":
            d.ellipse((0, 0, L - 1, L - 1), fill=255)
        else:
            d.rounded_rectangle((0, 0, L - 1, L - 1), radius=int(L * .2), fill=255)
        base.putalpha(mask)
    return base.resize((lado, lado), Image.LANCZOS)


def main():
    logo = recortar_logo(sys.argv[1])
    icono = lambda n: lienzo(logo, n, .84)

    # --- Electron (desktop/build) ---
    icono(512).save(RAIZ / "desktop/build/icon.png")
    icono(256).save(RAIZ / "desktop/build/icon.ico",
                    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

    # --- Tauri (src-tauri/icons) ---
    t = RAIZ / "src-tauri/icons"
    for nombre, n in [("32x32.png", 32), ("128x128.png", 128), ("128x128@2x.png", 256),
                      ("icon.png", 512), ("StoreLogo.png", 50),
                      ("Square30x30Logo.png", 30), ("Square44x44Logo.png", 44),
                      ("Square71x71Logo.png", 71), ("Square89x89Logo.png", 89),
                      ("Square107x107Logo.png", 107), ("Square142x142Logo.png", 142),
                      ("Square150x150Logo.png", 150), ("Square284x284Logo.png", 284),
                      ("Square310x310Logo.png", 310)]:
        icono(n).save(t / nombre)
    icono(256).save(t / "icon.ico",
                    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    icono(1024).save(t / "icon.icns")

    # --- Android (Capacitor) ---
    res = RAIZ / "android/app/src/main/res"
    for carpeta, n in [("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192)]:
        d = res / f"mipmap-{carpeta}"
        lienzo(logo, n, .84).save(d / "ic_launcher.png")
        lienzo(logo, n, .80, "circulo").save(d / "ic_launcher_round.png")
        # ícono adaptativo: primer plano 108dp, zona segura 66dp (61%)
        f = int(n * 108 / 48)
        lienzo(logo, f, .60, transparente=True).save(d / "ic_launcher_foreground.png")
    print("Íconos generados.")


if __name__ == "__main__":
    main()
