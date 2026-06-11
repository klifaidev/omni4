const { app, BrowserWindow, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");
const path = require("path");
const fs = require("fs");
const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

// Configurar logs
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = "info";
log.info("App iniciando. Versão:", app.getVersion());

let mainWindow;

function createWindow() {
  const iconPath = path.join(__dirname, "assets", "icon.ico");
  const windowOptions = {
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0A0D1C",
    show: false,
  };

  // Adiciona ícone apenas se o arquivo existir
  if (fs.existsSync(iconPath)) {
    windowOptions.icon = iconPath;
  }

  mainWindow = new BrowserWindow(windowOptions);

  // Carregar o app
  if (isDev) {
    // Porta 8080 conforme vite.config.ts
    mainWindow.loadURL("http://localhost:8080");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  // Mostrar quando estiver pronto para evitar flash branco
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    if (!isDev) {
      checkForUpdates();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Auto-update
function checkForUpdates() {
  autoUpdater.checkForUpdatesAndNotify();
}

autoUpdater.on("checking-for-update", () => {
  log.info("Verificando atualizações...");
});

autoUpdater.on("update-available", (info) => {
  log.info("Atualização disponível:", info.version);
  mainWindow.webContents.send("update-available", info.version);
});

autoUpdater.on("update-not-available", () => {
  log.info("App já está na versão mais recente.");
});

autoUpdater.on("download-progress", (progress) => {
  mainWindow.webContents.send("update-progress", Math.round(progress.percent));
});

autoUpdater.on("update-downloaded", (info) => {
  log.info("Atualização baixada:", info.version);
  mainWindow.webContents.send("update-downloaded", info.version);
});

autoUpdater.on("error", (err) => {
  log.error("Erro no auto-update:", err);
});

// IPC: instalar atualização ao comando do usuário
ipcMain.on("install-update", () => {
  autoUpdater.quitAndInstall(false, true);
});

// IPC: verificar atualização manualmente
ipcMain.on("check-for-updates", () => {
  if (!isDev) checkForUpdates();
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Segurança: bloquear navegação para URLs externas
app.on("web-contents-created", (event, contents) => {
  contents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file://") && !url.startsWith("http://localhost")) {
      event.preventDefault();
    }
  });
});
