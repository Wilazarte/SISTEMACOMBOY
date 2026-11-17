// Puente mínimo entre la web del ERP y la app de escritorio.
// Solo expone "Recordar contraseña": la web nunca ve el archivo ni la clave de cifrado,
// y main.js solo responde si la página es la del ERP.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("comboyEscritorio", {
  credenciales: {
    disponible: () => ipcRenderer.invoke("cred:disponible"),
    leer: (clave) => ipcRenderer.invoke("cred:leer", String(clave)),
    guardar: (clave, usuario, pass) => ipcRenderer.invoke("cred:guardar", String(clave), String(usuario), String(pass)),
    borrar: (clave) => ipcRenderer.invoke("cred:borrar", String(clave)),
  },
});
