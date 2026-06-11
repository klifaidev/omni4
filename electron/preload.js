const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Auto-update
  onUpdateAvailable: (callback) => ipcRenderer.on("update-available", (_, version) => callback(version)),
  onUpdateProgress: (callback) => ipcRenderer.on("update-progress", (_, percent) => callback(percent)),
  onUpdateDownloaded: (callback) => ipcRenderer.on("update-downloaded", (_, version) => callback(version)),
  installUpdate: () => ipcRenderer.send("install-update"),
  checkForUpdates: () => ipcRenderer.send("check-for-updates"),
  // Utilitários
  isElectron: true,
});
