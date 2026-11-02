const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Atualização por arquivo
  updates: {
    info: () => ipcRenderer.invoke("update-file:info"),
    prepare: (file) => ipcRenderer.invoke("update-file:prepare", { filePath: webUtils.getPathForFile(file) }),
    choose: () => ipcRenderer.invoke("update-file:choose"),
    discard: () => ipcRenderer.invoke("update-file:discard"),
    install: () => ipcRenderer.invoke("update-file:install"),
    onProgress: (callback) => {
      const handler = (_, percent) => callback(percent);
      ipcRenderer.on("update-file:progress", handler);
      return () => ipcRenderer.removeListener("update-file:progress", handler);
    },
  },
  reportRendererError: (payload) => ipcRenderer.send("renderer:error", payload),
  // Recuperação de crash
  app: {
    reopen: (route) => ipcRenderer.send("app:reopen", { route }),
    consumeCrashState: () => ipcRenderer.invoke("app:consume-crash-state"),
    breadcrumb: (payload) => ipcRenderer.send("renderer:breadcrumb", payload),
  },
  // Bases locais
  bases: {
    salvar: (tipo, nomeArquivo, conteudoBase64) =>
      ipcRenderer.invoke("bases:save", { tipo, nomeArquivo, conteudoBase64 }),
    carregar: (tipo) =>
      ipcRenderer.invoke("bases:load", { tipo }),
    carregarArquivo: (tipo, nomeArquivo) =>
      ipcRenderer.invoke("bases:load-file", { tipo, nomeArquivo }),
    carregarProcessado: (tipo, nomeArquivo, cacheKind, version) =>
      ipcRenderer.invoke("bases:processed-load", { tipo, nomeArquivo, cacheKind, version }),
    salvarProcessado: (tipo, nomeArquivo, cacheKind, version, payload) =>
      ipcRenderer.invoke("bases:processed-save", { tipo, nomeArquivo, cacheKind, version, payload }),
    carregarProcessadoManifesto: (tipo, nomeArquivo, cacheKind, version) =>
      ipcRenderer.invoke("bases:processed-chunked-meta", { tipo, nomeArquivo, cacheKind, version }),
    carregarProcessadoChunk: (tipo, nomeArquivo, cacheKind, index) =>
      ipcRenderer.invoke("bases:processed-chunked-load", { tipo, nomeArquivo, cacheKind, index }),
    iniciarProcessadoEmChunks: (tipo, nomeArquivo, cacheKind, version, header, totalRows, chunkSize) =>
      ipcRenderer.invoke("bases:processed-chunked-start", { tipo, nomeArquivo, cacheKind, version, header, totalRows, chunkSize }),
    salvarProcessadoChunk: (tipo, nomeArquivo, cacheKind, index, rows) =>
      ipcRenderer.invoke("bases:processed-chunked-save", { tipo, nomeArquivo, cacheKind, index, rows }),
    finalizarProcessadoEmChunks: (tipo, nomeArquivo, cacheKind, chunks) =>
      ipcRenderer.invoke("bases:processed-chunked-finish", { tipo, nomeArquivo, cacheKind, chunks }),
    info: () =>
      ipcRenderer.invoke("bases:info"),
    deletar: (tipo, nomeArquivo) =>
      ipcRenderer.invoke("bases:delete", { tipo, nomeArquivo }),
    invalidarProcessado: (tipo) =>
      ipcRenderer.invoke("bases:processed-invalidate", { tipo }),
  },
  // Esteira de Slides — armazenamento em arquivo (sem o teto do localStorage)
  slidesFlow: {
    ler: (key) => ipcRenderer.invoke("slidesFlow:read", { key }),
    salvar: (key, value) => ipcRenderer.invoke("slidesFlow:write", { key, value }),
    remover: (key) => ipcRenderer.invoke("slidesFlow:remove", { key }),
    ultimoBackup: (key) => ipcRenderer.invoke("slidesFlow:latest-backup", { key }),
  },
  // Atividades — armazenamento em arquivo com backups (mesma forma da esteira)
  kanban: {
    ler: (key) => ipcRenderer.invoke("kanban:read", { key }),
    salvar: (key, value) => ipcRenderer.invoke("kanban:write", { key, value }),
    remover: (key) => ipcRenderer.invoke("kanban:remove", { key }),
    ultimoBackup: (key) => ipcRenderer.invoke("kanban:latest-backup", { key }),
  },
  // Utilitarios
  isElectron: true,
});
