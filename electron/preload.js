const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Auto-update
  onUpdateStatus: (callback) => {
    const handler = (_, status) => callback(status);
    ipcRenderer.on("update-status", handler);
    return () => ipcRenderer.removeListener("update-status", handler);
  },
  onUpdateAvailable: (callback) => {
    const handler = (_, version) => callback(version);
    ipcRenderer.on("update-available", handler);
    return () => ipcRenderer.removeListener("update-available", handler);
  },
  onUpdateProgress: (callback) => {
    const handler = (_, percent) => callback(percent);
    ipcRenderer.on("update-progress", handler);
    return () => ipcRenderer.removeListener("update-progress", handler);
  },
  onUpdateDownloaded: (callback) => {
    const handler = (_, version) => callback(version);
    ipcRenderer.on("update-downloaded", handler);
    return () => ipcRenderer.removeListener("update-downloaded", handler);
  },
  onUpdateNotAvailable: (callback) => {
    const handler = (_, version) => callback(version);
    ipcRenderer.on("update-not-available", handler);
    return () => ipcRenderer.removeListener("update-not-available", handler);
  },
  onUpdateError: (callback) => {
    const handler = (_, message) => callback(message);
    ipcRenderer.on("update-error", handler);
    return () => ipcRenderer.removeListener("update-error", handler);
  },
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
