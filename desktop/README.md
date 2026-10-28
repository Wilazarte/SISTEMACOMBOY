# COMBOY VID ERP: app de escritorio (Windows)

Envoltorio Electron que abre https://sistemacomboy.vercel.app en pantalla
completa. No toca el proyecto Next.js ni el despliegue de Vercel: cada vez que
se publica algo en Vercel, la app de escritorio lo muestra sin recompilar.

- **Pantalla completa** al abrir. `F11` la activa o desactiva.
- **Menú mínimo** (Sistema / Editar), oculto; aparece con la tecla `Alt`.
- **Sin conexión**: si no hay internet se muestra una pantalla propia con el
  botón *Reintentar*, y vuelve sola al sistema cuando regresa la red.
- La sesión (usuario logueado) se guarda entre aperturas.
- PDFs e impresiones se abren en ventanas de la app; los enlaces externos, en
  el navegador del sistema.

## Archivos

| Archivo | Qué es |
| --- | --- |
| `main.js` | Proceso principal de Electron (ventana, menú, modo sin conexión) |
| `offline/index.html` | Pantalla "Sin conexión" |
| `package.json` | Dependencias y configuración de electron-builder |
| `build/icon.ico`, `build/icon.png` | Icono (emblema COMBOY VID) |
| `build/poner-icono.js` | Pone icono y versión en el `.exe` sin necesitar wine |

## Compilar en Windows

Requiere Node.js 20 o superior.

```bat
cd C:\Users\User\Desktop\SISTEMACOMBOY\desktop
npm install
npm start            :: probar sin compilar
npm run dist         :: genera instalador y portable en desktop\dist\
```

- `dist\COMBOY-VID-ERP-Instalador-1.0.0.exe`: instala y crea accesos directos
  en el escritorio y el menú Inicio.
- `dist\COMBOY-VID-ERP-Portable-1.0.0.exe`: se ejecuta sin instalar.

También se compila sola en GitHub Actions ("App de escritorio Windows") cada
vez que cambia `desktop/` en `main`; el `.exe` queda en los artefactos de la
ejecución.

Al no estar firmado digitalmente, Windows SmartScreen puede avisar la primera
vez: *Más información → Ejecutar de todas formas*.
