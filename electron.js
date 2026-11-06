const { app, BrowserWindow } = require('electron');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    frame: true,
    autoHideMenuBar: false,
    fullscreen: false,
    kiosk: false,
    fullscreenable: false,
    maximizable: true,
    minimizable: true,
    closable: true,
    title: "COMBOY VID"
  });
  win.setMenu(null);
  win.maximize();
  win.setFullScreen(false);
  win.loadURL('https://sistemacomboy.vercel.app');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});