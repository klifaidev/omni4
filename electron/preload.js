const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Auto-update
  onUpdateAvailable: (callback) => ipcRenderer.on("update-available", (_, version) => callback(version)),
  onUpdateProgress: (callback) => ipcRenderer.on("update-progress", (_, percent) => callback(percent)),
  onUpdateDownloaded: (callback) => ipcRenderer.on("update-downloaded", (_, version) => callback(version)),
  installUpdate: () => ipcRenderer.send("install-update"),
  checkForUpdates: () => ipcRenderer.send("check-for-updates"),
  // Bases locais
  bases: {
    salvar: (tipo, nomeArquivo, conteudoBase64) =>
      ipcRenderer.invoke("bases:save", { tipo, nomeArquivo, conteudoBase64 }),
    carregar: (tipo) =>
      ipcRenderer.invoke("bases:load", { tipo }),
    info: () =>
      ipcRenderer.invoke("bases:info"),
    deletar: (tipo, nomeArquivo) =>
      ipcRenderer.invoke("bases:delete", { tipo, nomeArquivo }),
  },
  // Utilitarios
  isElectron: true,
});
