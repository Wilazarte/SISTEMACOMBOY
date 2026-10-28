// COMBOY VID ERP: app de escritorio para Windows.
// Abre https://sistemacomboy.vercel.app en pantalla completa. Si no hay
// internet, muestra offline/index.html ("Sin conexión") y reintenta solo.
const { app, BrowserWindow, Menu, shell, net } = require("electron");
const path = require("path");

const APP_URL = "https://sistemacomboy.vercel.app";
const APP_HOST = new URL(APP_URL).host;
const ICON = path.join(__dirname, "build", "icon.png");
const OFFLINE_PAGE = path.join(__dirname, "offline", "index.html");

let win = null;

// Una sola ventana: si se abre el .exe otra vez, enfoca la que ya existe.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(arrancar);
}

app.on("window-all-closed", () => app.quit());

function arrancar() {
  Menu.setApplicationMenu(menuMinimo());

  win = new BrowserWindow({
    title: "COMBOY VID ERP",
    icon: ICON,
    width: 1366,
    height: 768,
    fullscreen: true,
    autoHideMenuBar: true,
    backgroundColor: "#1f3a5f",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.once("ready-to-show", () => win.show());

  // El título lo pone el sistema, no cada página.
  win.on("page-title-updated", (e) => e.preventDefault());

  // Sin red al cargar: página "Sin conexión". -3 (ERR_ABORTED) es una
  // navegación cancelada por la propia app, no un corte de red.
  win.webContents.on("did-fail-load", (_e, code, _desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    if (url && url.startsWith("file:")) return;
    mostrarSinConexion();
  });

  win.webContents.setWindowOpenHandler(abrirVentanaHija);
  win.webContents.on("will-navigate", (e, url) => {
    if (!esDeLaApp(url) && !url.startsWith("file:")) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  if (net.isOnline()) win.loadURL(APP_URL);
  else mostrarSinConexion();
}

function mostrarSinConexion() {
  if (!win || win.isDestroyed()) return;
  win.loadFile(OFFLINE_PAGE, { query: { url: APP_URL } });
}

function esDeLaApp(url) {
  try {
    const u = new URL(url);
    return u.host === APP_HOST || u.host.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

// PDFs (blob:), ventanas de impresión (about:blank) y archivos de Supabase se
// abren dentro de la app; cualquier otro enlace va al navegador del sistema.
function abrirVentanaHija({ url }) {
  const interna =
    url === "" || url === "about:blank" || url.startsWith("blob:") ||
    url.startsWith("data:") || esDeLaApp(url);
  if (!interna) {
    shell.openExternal(url);
    return { action: "deny" };
  }
  return {
    action: "allow",
    overrideBrowserWindowOptions: {
      icon: ICON,
      autoHideMenuBar: true,
      fullscreen: false,
      width: 1100,
      height: 800,
    },
  };
}

function menuMinimo() {
  return Menu.buildFromTemplate([
    {
      label: "Sistema",
      submenu: [
        { label: "Inicio", accelerator: "Alt+Home", click: () => win && win.loadURL(APP_URL) },
        { role: "reload", label: "Recargar" },
        { role: "togglefullscreen", label: "Pantalla completa" },
        { type: "separator" },
        { role: "zoomIn", label: "Acercar" },
        { role: "zoomOut", label: "Alejar" },
        { role: "resetZoom", label: "Tamaño normal" },
        { type: "separator" },
        { role: "quit", label: "Salir" },
      ],
    },
    {
      label: "Editar",
      submenu: [
        { role: "undo", label: "Deshacer" },
        { role: "redo", label: "Rehacer" },
        { type: "separator" },
        { role: "cut", label: "Cortar" },
        { role: "copy", label: "Copiar" },
        { role: "paste", label: "Pegar" },
        { role: "selectAll", label: "Seleccionar todo" },
      ],
    },
  ]);
}
