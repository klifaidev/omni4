const { app, BrowserWindow, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");
const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

// Configurar electron-log
log.transports.file.resolvePath = () => {
  return path.join(app.getPath("userData"), "logs", "main.log");
};
log.transports.file.level = "info";
log.info("=== OMNI4 INICIADO ===");
log.info("=== APP INICIADO. Versão:", app.getVersion(), "===");
log.info("=== isPackaged:", app.isPackaged, "===");
log.info("=== isDev:", isDev, "===");

// Configurar autoUpdater logger
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = "info";

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
  try {
    log.info("=== INICIANDO CHECK FOR UPDATES ===");
    log.info("Versão atual:", app.getVersion());

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.setFeedURL({
      provider: "github",
      owner: "klifaidev",
      repo: "omni4",
      releaseType: "release",
    });

    log.info("Feed URL configurado para klifaidev/omni4");
    autoUpdater.checkForUpdatesAndNotify();
  } catch (err) {
    log.error("=== ERRO NO CHECK FOR UPDATES:", err.message, "===");
  }
}

autoUpdater.on("checking-for-update", () => {
  log.info("=== VERIFICANDO ATUALIZAÇÕES ===");
  mainWindow.webContents.send("update-status", "Verificando atualizações...");
});

autoUpdater.on("update-available", (info) => {
  log.info("=== ATUALIZAÇÃO DISPONÍVEL:", info.version, "===");
  mainWindow.webContents.send("update-available", info.version);
});

autoUpdater.on("update-not-available", (info) => {
  log.info("=== SEM ATUALIZAÇÃO. Versão atual:", info.version, "===");
});

autoUpdater.on("download-progress", (progress) => {
  mainWindow.webContents.send("update-progress", Math.round(progress.percent));
});

autoUpdater.on("update-downloaded", (info) => {
  log.info("Atualização baixada:", info.version);
  mainWindow.webContents.send("update-downloaded", info.version);
});

autoUpdater.on("error", (err) => {
  log.error("=== ERRO NO AUTO-UPDATE:", err.message, "===");
  mainWindow.webContents.send("update-error", err.message);
});

// IPC: instalar atualização ao comando do usuário
ipcMain.on("install-update", () => {
  autoUpdater.quitAndInstall(false, true);
});

// IPC: verificar atualização manualmente
ipcMain.on("check-for-updates", () => {
  if (!isDev) checkForUpdates();
});

// Bases locais: armazenamento de arquivos de dados
function getBasesDir() {
  return path.join(app.getPath("userData"), "bases");
}

function ensureBasesDir() {
  const dir = getBasesDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

ipcMain.handle("bases:save", async (event, { tipo, nomeArquivo, conteudoBase64 }) => {
  try {
    const dir = ensureBasesDir();
    const subDir = path.join(dir, tipo);
    if (!fs.existsSync(subDir)) fs.mkdirSync(subDir, { recursive: true });
    const destino = path.join(subDir, nomeArquivo);
    fs.writeFileSync(destino, Buffer.from(conteudoBase64, "base64"));
    log.info("Base salva:", destino);
    return { ok: true, caminho: destino };
  } catch (err) {
    log.error("Erro ao salvar base:", err);
    return { ok: false, erro: err.message };
  }
});

ipcMain.handle("bases:load", async (event, { tipo }) => {
  try {
    const subDir = path.join(getBasesDir(), tipo);
    if (!fs.existsSync(subDir)) return { ok: false, motivo: "nenhum_arquivo" };
    const arquivos = fs.readdirSync(subDir);
    if (arquivos.length === 0) return { ok: false, motivo: "nenhum_arquivo" };
    const resultado = arquivos.map(nomeArquivo => {
      const caminho = path.join(subDir, nomeArquivo);
      const stats = fs.statSync(caminho);
      return {
        nomeArquivo,
        conteudoBase64: fs.readFileSync(caminho).toString("base64"),
        tamanho: stats.size,
        ultimaModificacao: stats.mtime.toISOString(),
      };
    });
    log.info(`Carregados ${resultado.length} arquivos de ${tipo}`);
    return { ok: true, arquivos: resultado };
  } catch (err) {
    log.error("Erro ao carregar bases:", err);
    return { ok: false, motivo: "erro", erro: err.message };
  }
});

ipcMain.handle("bases:info", async () => {
  try {
    const dir = getBasesDir();
    if (!fs.existsSync(dir)) return { ok: true, bases: {} };
    const bases = {};
    for (const tipo of ["ke30", "budget", "demanda"]) {
      const subDir = path.join(dir, tipo);
      if (!fs.existsSync(subDir)) continue;
      const arquivos = fs.readdirSync(subDir);
      if (arquivos.length > 0) {
        const stats = arquivos.map(f => fs.statSync(path.join(subDir, f)));
        bases[tipo] = {
          quantidade: arquivos.length,
          nomeArquivos: arquivos,
          tamanhoTotal: stats.reduce((s, st) => s + st.size, 0),
          ultimaModificacao: new Date(Math.max(...stats.map(st => st.mtime.getTime()))).toISOString(),
        };
      }
    }
    return { ok: true, bases };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
});

ipcMain.handle("bases:delete", async (event, { tipo, nomeArquivo }) => {
  try {
    const subDir = path.join(getBasesDir(), tipo);
    if (!fs.existsSync(subDir)) return { ok: true };
    if (nomeArquivo) {
      const caminho = path.join(subDir, nomeArquivo);
      if (fs.existsSync(caminho)) fs.unlinkSync(caminho);
    } else {
      for (const f of fs.readdirSync(subDir)) {
        fs.unlinkSync(path.join(subDir, f));
      }
    }
    log.info("Base deletada:", tipo, nomeArquivo ?? "(todos)");
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
});

// IA local embutida ---------------------------------------------------------
function getAiRuntimeDir() {
  if (app.isPackaged) return path.join(process.resourcesPath, "ai-runtime");
  return path.join(__dirname, "..", "ai-runtime");
}

function readAiManifest() {
  const runtimeDir = getAiRuntimeDir();
  const manifestPath = path.join(runtimeDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    return { ok: false, runtimeDir, reason: "manifest_not_found" };
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const binaryName = process.platform === "win32"
      ? manifest.binaryWin
      : process.platform === "darwin"
        ? manifest.binaryMac
        : manifest.binaryLinux;
    const binaryPath = binaryName ? path.join(runtimeDir, binaryName) : "";
    const modelPath = manifest.model ? path.join(runtimeDir, manifest.model) : "";

    if (!binaryPath || !fs.existsSync(binaryPath)) {
      return { ok: false, runtimeDir, manifest, reason: "binary_not_found" };
    }
    if (!modelPath || !fs.existsSync(modelPath)) {
      return { ok: false, runtimeDir, manifest, reason: "model_not_found" };
    }

    return { ok: true, runtimeDir, manifest, binaryPath, modelPath };
  } catch (err) {
    return { ok: false, runtimeDir, reason: "invalid_manifest", error: err.message };
  }
}

ipcMain.handle("ai:info", async () => {
  const resolved = readAiManifest();
  if (!resolved.ok) {
    return {
      ok: false,
      available: false,
      reason: resolved.reason,
      runtimeDir: resolved.runtimeDir,
      error: resolved.error,
    };
  }
  const modelStats = fs.statSync(resolved.modelPath);
  return {
    ok: true,
    available: true,
    engine: resolved.manifest.engine ?? "llama.cpp",
    modelName: resolved.manifest.modelName ?? path.basename(resolved.modelPath),
    modelBytes: modelStats.size,
  };
});

ipcMain.handle("ai:generate", async (event, { prompt }) => {
  const resolved = readAiManifest();
  if (!resolved.ok) {
    return { ok: false, available: false, reason: resolved.reason, error: resolved.error };
  }

  const started = Date.now();
  const promptPath = path.join(os.tmpdir(), `omni4-ai-${Date.now()}.txt`);
  fs.writeFileSync(promptPath, prompt ?? "", "utf8");

  const argsTemplate = Array.isArray(resolved.manifest.args)
    ? resolved.manifest.args
    : ["-m", "{model}", "-f", "{promptFile}", "-n", "700", "--temp", "0.2", "--ctx-size", "8192", "--no-display-prompt"];
  const args = argsTemplate.map((arg) =>
    String(arg)
      .replaceAll("{model}", resolved.modelPath)
      .replaceAll("{promptFile}", promptPath)
  );

  return await new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(resolved.binaryPath, args, {
      cwd: resolved.runtimeDir,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timeout = setTimeout(() => {
      child.kill();
      resolve({
        ok: false,
        available: true,
        reason: "timeout",
        error: "A IA embutida demorou demais para responder.",
      });
    }, Number(resolved.manifest.timeoutMs ?? 90000));

    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", (err) => {
      clearTimeout(timeout);
      try { fs.unlinkSync(promptPath); } catch {}
      resolve({ ok: false, available: true, reason: "spawn_error", error: err.message });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      try { fs.unlinkSync(promptPath); } catch {}
      if (code !== 0 && !stdout.trim()) {
        resolve({ ok: false, available: true, reason: "runtime_error", error: stderr || `Processo finalizado com codigo ${code}` });
        return;
      }
      resolve({
        ok: true,
        available: true,
        text: stdout.trim(),
        elapsedMs: Date.now() - started,
        modelName: resolved.manifest.modelName ?? path.basename(resolved.modelPath),
        stderr: stderr.trim(),
      });
    });
  });
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
