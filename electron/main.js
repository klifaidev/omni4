const { app, BrowserWindow, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");
const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
const AUTO_UPDATE_ENABLED = true;

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

function getAppEntryUrl() {
  if (isDev) return "http://localhost:8080";
  return pathToFileURL(path.join(__dirname, "../dist/index.html")).toString();
}

function rendererRecoveryHtml(details) {
  const reason = details?.reason || "unknown";
  const exitCode = details?.exitCode ?? "unknown";
  const appUrl = getAppEntryUrl();
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Omni4 - Recuperacao</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, Arial, sans-serif; background: #0A0D1C; color: #F8FAFC; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: radial-gradient(circle at top, rgba(59,130,246,.20), transparent 34%), #0A0D1C; }
    main { width: min(560px, calc(100vw - 48px)); border: 1px solid rgba(148,163,184,.28); border-radius: 22px; padding: 28px; background: rgba(15,23,42,.78); box-shadow: 0 24px 80px rgba(0,0,0,.42); }
    .eyebrow { color: #93C5FD; font-size: 12px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; }
    h1 { margin: 10px 0 10px; font-size: 24px; line-height: 1.18; }
    p { margin: 0; color: #CBD5E1; font-size: 14px; line-height: 1.65; }
    .meta { margin-top: 16px; padding: 12px; border-radius: 14px; background: rgba(15,23,42,.74); color: #94A3B8; font-size: 12px; }
    button { margin-top: 22px; height: 42px; border: 0; border-radius: 12px; padding: 0 18px; cursor: pointer; color: #08111F; background: #F8FAFC; font-weight: 700; }
    button:hover { background: #DBEAFE; }
  </style>
</head>
<body>
  <main>
    <div class="eyebrow">Recuperacao do aplicativo</div>
    <h1>O Omni4 precisou reiniciar a area visual.</h1>
    <p>Isso normalmente acontece quando uma operacao fica pesada demais para a memoria disponivel. O evento foi registrado no log tecnico para diagnostico.</p>
    <div class="meta">Motivo reportado pelo Electron: <strong>${reason}</strong><br />Codigo de saida: <strong>${exitCode}</strong></div>
    <button type="button" onclick="window.location.href = ${JSON.stringify(appUrl)}">Reabrir Omni4</button>
  </main>
</body>
</html>`;
}

function showRendererRecovery(details) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(rendererRecoveryHtml(details))}`);
}

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
    mainWindow.loadURL(getAppEntryUrl());
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL(getAppEntryUrl());
  }

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    const payload = details || {};
    log.error("=== RENDER PROCESS GONE ===");
    log.error("Reason:", payload.reason || "unknown");
    log.error("Exit code:", payload.exitCode ?? "unknown");
    log.error("URL:", mainWindow?.webContents?.getURL?.() || "unknown");
    log.error("Timestamp:", new Date().toISOString());
    log.error("=== FIM RENDER PROCESS GONE ===");
    if (payload.reason !== "clean-exit") showRendererRecovery(payload);
  });

  // Mostrar quando estiver pronto para evitar flash branco
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Auto-update
function checkForUpdates() {
  if (!AUTO_UPDATE_ENABLED) {
    log.info("=== AUTO-UPDATE TEMPORARIAMENTE DESATIVADO ===");
    if (mainWindow) mainWindow.webContents.send("update-not-available", app.getVersion());
    return;
  }
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
    if (mainWindow) if (mainWindow) mainWindow.webContents.send("update-error", err.message);
  }
}

autoUpdater.on("checking-for-update", () => {
  log.info("=== VERIFICANDO ATUALIZAÇÕES ===");
  if (mainWindow) mainWindow.webContents.send("update-status", "Verificando atualizações...");
});

autoUpdater.on("update-available", (info) => {
  log.info("=== ATUALIZAÇÃO DISPONÍVEL:", info.version, "===");
  if (mainWindow) mainWindow.webContents.send("update-available", info.version);
});

autoUpdater.on("update-not-available", (info) => {
  log.info("=== SEM ATUALIZAÇÃO. Versão atual:", info.version, "===");
  if (mainWindow) mainWindow.webContents.send("update-not-available", info.version);
});

autoUpdater.on("download-progress", (progress) => {
  if (mainWindow) mainWindow.webContents.send("update-progress", Math.round(progress.percent));
});

autoUpdater.on("update-downloaded", (info) => {
  log.info("Atualização baixada:", info.version);
  if (mainWindow) mainWindow.webContents.send("update-downloaded", info.version);
});

autoUpdater.on("error", (err) => {
  log.error("=== ERRO NO AUTO-UPDATE:", err.message, "===");
  if (mainWindow) mainWindow.webContents.send("update-error", err.message);
});

// IPC: instalar atualização ao comando do usuário
ipcMain.on("install-update", () => {
  if (!AUTO_UPDATE_ENABLED) {
    log.info("Install update ignorado: auto-update temporariamente desativado.");
    if (mainWindow) mainWindow.webContents.send("update-not-available", app.getVersion());
    return;
  }
  autoUpdater.quitAndInstall(false, true);
});

// IPC: verificar atualização manualmente
ipcMain.on("check-for-updates", () => {
  if (!isDev) {
    checkForUpdates();
  } else {
    if (mainWindow) mainWindow.webContents.send("update-not-available", app.getVersion());
  }
});

ipcMain.on("renderer:error", (event, payload = {}) => {
  const senderUrl = event.senderFrame?.url || event.sender?.getURL?.() || "unknown";
  const context = payload.context || {};
  log.error("=== ERRO DE RENDERIZACAO ===");
  log.error("Origem:", payload.source || "unknown");
  log.error("Mensagem:", payload.message || "Sem mensagem");
  log.error("Rota:", context.route || "unknown");
  log.error("URL:", context.href || senderUrl);
  log.error("Timestamp:", payload.timestamp || new Date().toISOString());
  if (payload.componentStack) log.error("Component stack:", payload.componentStack);
  if (payload.stack) log.error("Stack:", payload.stack);
  log.error("=== FIM ERRO DE RENDERIZACAO ===");
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

function getBasesCacheDir() {
  return path.join(app.getPath("userData"), "bases-cache");
}

function ensureBasesCacheDir(tipo) {
  const dir = path.join(getBasesCacheDir(), tipo);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cacheFileName(nomeArquivo, cacheKind) {
  const encoded = Buffer.from(nomeArquivo, "utf8").toString("base64url");
  return `${cacheKind}-${encoded}.json`;
}

function cacheDirName(nomeArquivo, cacheKind) {
  const encoded = Buffer.from(nomeArquivo, "utf8").toString("base64url");
  return `${cacheKind}-${encoded}`;
}

function getBaseFilePath(tipo, nomeArquivo) {
  return path.join(getBasesDir(), tipo, nomeArquivo);
}

function getBaseSignature(tipo, nomeArquivo) {
  const caminho = getBaseFilePath(tipo, nomeArquivo);
  if (!fs.existsSync(caminho)) return null;
  const stats = fs.statSync(caminho);
  return {
    nomeArquivo,
    tamanho: stats.size,
    ultimaModificacao: stats.mtime.toISOString(),
  };
}

function getProcessedCachePath(tipo, nomeArquivo, cacheKind) {
  return path.join(getBasesCacheDir(), tipo, cacheFileName(nomeArquivo, cacheKind));
}

function getProcessedChunkDir(tipo, nomeArquivo, cacheKind) {
  return path.join(getBasesCacheDir(), tipo, cacheDirName(nomeArquivo, cacheKind));
}

function getProcessedChunkTempDir(tipo, nomeArquivo, cacheKind) {
  return `${getProcessedChunkDir(tipo, nomeArquivo, cacheKind)}.tmp`;
}

function removePathIfExists(targetPath) {
  if (!fs.existsSync(targetPath)) return;
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function deleteProcessedCache(tipo, nomeArquivo) {
  const cacheDir = path.join(getBasesCacheDir(), tipo);
  if (!fs.existsSync(cacheDir)) return;
  if (!nomeArquivo) {
    for (const f of fs.readdirSync(cacheDir)) removePathIfExists(path.join(cacheDir, f));
    return;
  }
  const encoded = Buffer.from(nomeArquivo, "utf8").toString("base64url");
  const suffix = `-${encoded}.json`;
  const dirSuffix = `-${encoded}`;
  for (const f of fs.readdirSync(cacheDir)) {
    if (f.endsWith(suffix) || f.endsWith(dirSuffix) || f.endsWith(`${dirSuffix}.tmp`)) {
      removePathIfExists(path.join(cacheDir, f));
    }
  }
}

function isSignatureMatch(cacheSignature, signature) {
  return (
    cacheSignature?.nomeArquivo === signature.nomeArquivo &&
    cacheSignature?.tamanho === signature.tamanho &&
    cacheSignature?.ultimaModificacao === signature.ultimaModificacao
  );
}

function readChunkManifest(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
}

function writeChunkManifest(dir, manifest) {
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
}

ipcMain.handle("bases:save", async (event, { tipo, nomeArquivo, conteudoBase64 }) => {
  try {
    const dir = ensureBasesDir();
    const subDir = path.join(dir, tipo);
    if (!fs.existsSync(subDir)) fs.mkdirSync(subDir, { recursive: true });
    const destino = path.join(subDir, nomeArquivo);
    fs.writeFileSync(destino, Buffer.from(conteudoBase64, "base64"));
    deleteProcessedCache(tipo, nomeArquivo);
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
    const arquivos = fs.readdirSync(subDir).sort((a, b) => {
      const aTime = fs.statSync(path.join(subDir, a)).mtime.getTime();
      const bTime = fs.statSync(path.join(subDir, b)).mtime.getTime();
      return aTime - bTime;
    });
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

ipcMain.handle("bases:load-file", async (event, { tipo, nomeArquivo }) => {
  try {
    const caminho = getBaseFilePath(tipo, nomeArquivo);
    if (!fs.existsSync(caminho)) return { ok: false, motivo: "nenhum_arquivo" };
    const stats = fs.statSync(caminho);
    return {
      ok: true,
      arquivo: {
        nomeArquivo,
        conteudoBase64: fs.readFileSync(caminho).toString("base64"),
        tamanho: stats.size,
        ultimaModificacao: stats.mtime.toISOString(),
      },
    };
  } catch (err) {
    log.error("Erro ao carregar arquivo de base:", err);
    return { ok: false, motivo: "erro", erro: err.message };
  }
});

ipcMain.handle("bases:processed-load", async (event, { tipo, nomeArquivo, cacheKind, version }) => {
  try {
    const signature = getBaseSignature(tipo, nomeArquivo);
    if (!signature) return { ok: true, hit: false, motivo: "arquivo_ausente" };
    const cachePath = getProcessedCachePath(tipo, nomeArquivo, cacheKind);
    if (!fs.existsSync(cachePath)) return { ok: true, hit: false, motivo: "cache_ausente" };
    const envelope = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    const cacheSignature = envelope?.signature;
    const valid =
      envelope?.version === version &&
      envelope?.cacheKind === cacheKind &&
      isSignatureMatch(cacheSignature, signature) &&
      envelope?.payload;
    if (!valid) return { ok: true, hit: false, motivo: "cache_invalido" };
    return { ok: true, hit: true, payload: envelope.payload };
  } catch (err) {
    log.warn("Cache processado invalido, sera reprocessado:", tipo, nomeArquivo, err.message);
    return { ok: true, hit: false, motivo: "cache_corrompido" };
  }
});

ipcMain.handle("bases:processed-chunked-meta", async (event, { tipo, nomeArquivo, cacheKind, version }) => {
  try {
    const signature = getBaseSignature(tipo, nomeArquivo);
    if (!signature) return { ok: true, hit: false, motivo: "arquivo_ausente" };
    const chunkDir = getProcessedChunkDir(tipo, nomeArquivo, cacheKind);
    if (!fs.existsSync(chunkDir)) return { ok: true, hit: false, motivo: "cache_ausente" };
    const manifest = readChunkManifest(chunkDir);
    const valid =
      manifest?.version === version &&
      manifest?.cacheKind === cacheKind &&
      manifest?.complete === true &&
      isSignatureMatch(manifest?.signature, signature) &&
      manifest?.header &&
      Number.isInteger(manifest?.chunks);
    if (!valid) return { ok: true, hit: false, motivo: "cache_invalido" };
    return { ok: true, hit: true, manifest };
  } catch (err) {
    log.warn("Manifesto de cache processado invalido:", tipo, nomeArquivo, err.message);
    return { ok: true, hit: false, motivo: "cache_corrompido" };
  }
});

ipcMain.handle("bases:processed-chunked-load", async (event, { tipo, nomeArquivo, cacheKind, index }) => {
  try {
    const chunkDir = getProcessedChunkDir(tipo, nomeArquivo, cacheKind);
    const chunkPath = path.join(chunkDir, "chunks", `chunk-${String(index).padStart(5, "0")}.json`);
    if (!fs.existsSync(chunkPath)) return { ok: false, erro: "chunk_ausente" };
    return { ok: true, rows: JSON.parse(fs.readFileSync(chunkPath, "utf8")) };
  } catch (err) {
    log.warn("Erro ao carregar chunk de cache processado:", tipo, nomeArquivo, err.message);
    return { ok: false, erro: err.message };
  }
});

ipcMain.handle("bases:processed-save", async (event, { tipo, nomeArquivo, cacheKind, version, payload }) => {
  try {
    const signature = getBaseSignature(tipo, nomeArquivo);
    if (!signature) return { ok: false, erro: "arquivo_base_ausente" };
    const cacheDir = ensureBasesCacheDir(tipo);
    const destino = path.join(cacheDir, cacheFileName(nomeArquivo, cacheKind));
    const temp = `${destino}.tmp`;
    fs.writeFileSync(temp, JSON.stringify({
      version,
      cacheKind,
      signature,
      savedAt: new Date().toISOString(),
      payload,
    }));
    fs.renameSync(temp, destino);
    return { ok: true };
  } catch (err) {
    const rowCount = Array.isArray(payload?.rows) ? payload.rows.length : "desconhecido";
    log.warn("Erro ao salvar cache processado monolitico:", tipo, nomeArquivo, `rows=${rowCount}`, err.message);
    return { ok: false, erro: err.message };
  }
});

ipcMain.handle("bases:processed-chunked-start", async (event, { tipo, nomeArquivo, cacheKind, version, header, totalRows, chunkSize }) => {
  try {
    const signature = getBaseSignature(tipo, nomeArquivo);
    if (!signature) return { ok: false, erro: "arquivo_base_ausente" };
    ensureBasesCacheDir(tipo);
    const tempDir = getProcessedChunkTempDir(tipo, nomeArquivo, cacheKind);
    removePathIfExists(tempDir);
    fs.mkdirSync(path.join(tempDir, "chunks"), { recursive: true });
    writeChunkManifest(tempDir, {
      version,
      cacheKind,
      signature,
      savedAt: new Date().toISOString(),
      header,
      totalRows,
      chunkSize,
      chunks: 0,
      complete: false,
    });
    return { ok: true };
  } catch (err) {
    log.warn("Erro ao iniciar cache processado em chunks:", tipo, nomeArquivo, err.message);
    return { ok: false, erro: err.message };
  }
});

ipcMain.handle("bases:processed-chunked-save", async (event, { tipo, nomeArquivo, cacheKind, index, rows }) => {
  try {
    const tempDir = getProcessedChunkTempDir(tipo, nomeArquivo, cacheKind);
    if (!fs.existsSync(tempDir)) return { ok: false, erro: "cache_temp_ausente" };
    const chunkPath = path.join(tempDir, "chunks", `chunk-${String(index).padStart(5, "0")}.json`);
    fs.writeFileSync(chunkPath, JSON.stringify(rows));
    return { ok: true };
  } catch (err) {
    const rowCount = Array.isArray(rows) ? rows.length : "desconhecido";
    log.warn("Erro ao salvar chunk de cache processado:", tipo, nomeArquivo, `index=${index}`, `rows=${rowCount}`, err.message);
    return { ok: false, erro: err.message };
  }
});

ipcMain.handle("bases:processed-chunked-finish", async (event, { tipo, nomeArquivo, cacheKind, chunks }) => {
  try {
    const tempDir = getProcessedChunkTempDir(tipo, nomeArquivo, cacheKind);
    if (!fs.existsSync(tempDir)) return { ok: false, erro: "cache_temp_ausente" };
    const manifest = readChunkManifest(tempDir);
    manifest.chunks = chunks;
    manifest.complete = true;
    manifest.savedAt = new Date().toISOString();
    writeChunkManifest(tempDir, manifest);
    const finalDir = getProcessedChunkDir(tipo, nomeArquivo, cacheKind);
    removePathIfExists(finalDir);
    fs.renameSync(tempDir, finalDir);
    return { ok: true };
  } catch (err) {
    log.warn("Erro ao finalizar cache processado em chunks:", tipo, nomeArquivo, err.message);
    return { ok: false, erro: err.message };
  }
});

ipcMain.handle("bases:info", async () => {
  try {
    const dir = getBasesDir();
    if (!fs.existsSync(dir)) return { ok: true, bases: {} };
    const bases = {};
    for (const tipo of ["ke30", "budget", "forecast", "rolling", "demanda", "deparaInovacao", "personalizado"]) {
      const subDir = path.join(dir, tipo);
      if (!fs.existsSync(subDir)) continue;
      const arquivos = fs.readdirSync(subDir).sort((a, b) => {
        const aTime = fs.statSync(path.join(subDir, a)).mtime.getTime();
        const bTime = fs.statSync(path.join(subDir, b)).mtime.getTime();
        return aTime - bTime;
      });
      if (arquivos.length > 0) {
        const stats = arquivos.map(f => fs.statSync(path.join(subDir, f)));
        const detalhes = arquivos.map((f, idx) => ({
          nomeArquivo: f,
          tamanho: stats[idx].size,
          ultimaModificacao: stats[idx].mtime.toISOString(),
        }));
        bases[tipo] = {
          quantidade: arquivos.length,
          nomeArquivo: arquivos[arquivos.length - 1],
          nomeArquivos: arquivos,
          arquivos: detalhes,
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
      deleteProcessedCache(tipo, nomeArquivo);
    } else {
      for (const f of fs.readdirSync(subDir)) {
        fs.unlinkSync(path.join(subDir, f));
      }
      deleteProcessedCache(tipo);
    }
    log.info("Base deletada:", tipo, nomeArquivo ?? "(todos)");
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
});

ipcMain.handle("bases:processed-invalidate", async (event, { tipo } = {}) => {
  try {
    if (tipo) {
      deleteProcessedCache(tipo);
    } else if (fs.existsSync(getBasesCacheDir())) {
      for (const dir of fs.readdirSync(getBasesCacheDir())) deleteProcessedCache(dir);
    }
    log.info("Cache processado invalidado:", tipo ?? "(todos)");
    return { ok: true };
  } catch (err) {
    log.error("Erro ao invalidar cache processado:", err);
    return { ok: false, erro: err.message };
  }
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
