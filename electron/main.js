const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const log = require("electron-log");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const updatePackage = require("./updatePackage");
const { splitProcessedEnvelope } = require("./processedCacheText");
const { createFileStore } = require("./fileStore");
const { pathToFileURL } = require("url");
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

let mainWindow;

function getAppEntryUrl() {
  if (isDev) return "http://localhost:8080";
  return pathToFileURL(path.join(__dirname, "../dist/index.html")).toString();
}

// Rotas do app (HashRouter) aceitas pra reabrir depois de um crash. Vem do
// próprio main (URL do renderer que caiu) ou do botão da página de
// recuperação — validado do mesmo jeito que os parâmetros de IPC das bases.
function sanitizeRoute(route) {
  return typeof route === "string" && /^\/[a-z0-9-]*$/i.test(route) ? route : "/";
}

function routeFromUrl(url) {
  const hash = typeof url === "string" ? url.split("#")[1] : "";
  return sanitizeRoute(hash ? hash.split("?")[0] : "/");
}

// Último rastro enviado pela Tabela Dinâmica (tamanho da montagem na tela).
// Fica só em memória; vai pro log e pro estado de crash se o renderer cair —
// antes disso o log dizia apenas "oom", sem nenhuma pista de qual montagem.
let lastRendererBreadcrumb = null;

function getCrashStatePath() {
  return path.join(app.getPath("userData"), "crash-state.json");
}

function writeCrashState(state) {
  try {
    fs.writeFileSync(getCrashStatePath(), JSON.stringify(state));
  } catch (err) {
    log.warn("Falha ao gravar estado de crash:", err.message);
  }
}

function rendererRecoveryHtml(details, route) {
  const reason = details?.reason || "unknown";
  const exitCode = details?.exitCode ?? "unknown";
  const fromPivot = route === "/detalhe";
  const fromSlides = route === "/slides";
  const outOfMemory = reason === "oom";
  const lead = fromPivot
    ? `${outOfMemory ? "A Tabela Dinâmica ficou pesada demais para a memória disponível." : "A Tabela Dinâmica parou de responder."} Ao reabrir, ela volta em modo seguro: a última montagem não é recalculada sozinha.`
    : fromSlides
    ? "Os Slides ficaram pesados demais para a memória disponível. Ao reabrir, a esteira volta em modo seguro, com as miniaturas pausadas — seus slides estão salvos."
    : "Isso normalmente acontece quando uma operação fica pesada demais para a memória disponível. O evento foi registrado no log técnico para diagnóstico.";
  // O botão chama o processo principal por IPC (preload). Navegar direto da
  // página data: pra file:// é bloqueado pelo Chromium ("Not allowed to load
  // local resource") — por isso o "Reabrir" antigo nunca funcionava no app
  // instalado (além de ter as aspas do onclick quebradas).
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Omni4 - Recuperação</title>
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
    <div class="eyebrow">Recuperação do aplicativo</div>
    <h1>O Omni4 precisou reiniciar a área visual.</h1>
    <p>${lead}</p>
    <div class="meta">Motivo reportado pelo Electron: <strong>${reason}</strong><br />Código de saída: <strong>${exitCode}</strong></div>
    <button type="button" id="reopen" autofocus>Reabrir Omni4</button>
  </main>
  <script>
    document.getElementById("reopen").addEventListener("click", function () {
      this.disabled = true;
      this.textContent = "Reabrindo…";
      if (window.electronAPI && window.electronAPI.app) window.electronAPI.app.reopen(${JSON.stringify(route)});
    });
  </script>
</body>
</html>`;
}

function showRendererRecovery(details, route) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(rendererRecoveryHtml(details, route))}`);
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
    const url = mainWindow?.webContents?.getURL?.() || "unknown";
    const route = routeFromUrl(url);
    log.error("=== RENDER PROCESS GONE ===");
    log.error("Reason:", payload.reason || "unknown");
    log.error("Exit code:", payload.exitCode ?? "unknown");
    log.error("URL:", url);
    log.error("Timestamp:", new Date().toISOString());
    if (lastRendererBreadcrumb) log.error("Último rastro do renderer:", JSON.stringify(lastRendererBreadcrumb));
    log.error("=== FIM RENDER PROCESS GONE ===");
    if (payload.reason === "clean-exit") return;
    // Lido (e apagado) pelo renderer na próxima abertura — inclusive se a
    // pessoa fechar e abrir o app na mão — pra Tabela Dinâmica abrir em modo
    // seguro em vez de restaurar a mesma montagem que acabou de derrubar tudo.
    writeCrashState({
      reason: payload.reason || "unknown",
      exitCode: payload.exitCode ?? null,
      route,
      at: new Date().toISOString(),
      breadcrumb: lastRendererBreadcrumb,
    });
    lastRendererBreadcrumb = null;
    showRendererRecovery(payload, route);
  });

  // Mostrar quando estiver pronto para evitar flash branco
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Atualização por arquivo. O app não procura versão em nenhum servidor: quem
// atualiza arrasta um pacote assinado na aba Ajustes (ver ./updatePackage.js).
// O caminho do instalador nunca vem do renderer: só o que foi conferido aqui é executado.
let preparedUpdate = null;
let preparingUpdate = false;

function getPendingUpdateDir() {
  return path.join(app.getPath("userData"), "update-pending");
}

function discardPreparedUpdate() {
  preparedUpdate = null;
  fs.rmSync(getPendingUpdateDir(), { recursive: true, force: true });
}

async function prepareUpdate(event, filePath) {
  if (typeof filePath !== "string" || path.extname(filePath).toLowerCase() !== updatePackage.EXTENSION) {
    return { ok: false, erro: "nao_e_pacote", currentVersion: app.getVersion() };
  }
  if (preparingUpdate) return { ok: false, erro: "ocupado", currentVersion: app.getVersion() };
  preparingUpdate = true;
  try {
    discardPreparedUpdate();
    const currentVersion = app.getVersion();
    const inspected = updatePackage.inspectPackage(filePath, {
      publicKeyPem: fs.readFileSync(path.join(__dirname, "update-public-key.pem"), "utf8"),
      currentVersion,
    });
    log.info("Pacote de atualização:", path.basename(filePath), inspected.ok ? inspected.manifest.version : inspected.erro);
    if (!inspected.ok) return { ...inspected, currentVersion };

    const { version, sha512 } = inspected.manifest;
    fs.mkdirSync(getPendingUpdateDir(), { recursive: true });
    const installerPath = path.join(getPendingUpdateDir(), `OMNI4-Setup-${version}.exe`);
    let lastPercent = -1;
    const extracted = await updatePackage.extractInstaller(filePath, inspected, installerPath, (fraction) => {
      const percent = Math.floor(fraction * 100);
      if (percent === lastPercent || event.sender.isDestroyed()) return;
      lastPercent = percent;
      event.sender.send("update-file:progress", percent);
    });
    if (!extracted.ok) {
      log.error("Pacote de atualização recusado na extração:", extracted.erro);
      return { ...extracted, currentVersion };
    }
    preparedUpdate = { installerPath, version, sha512 };
    return { ok: true, version, currentVersion };
  } catch (err) {
    log.error("Erro ao preparar atualização:", err.message);
    return { ok: false, erro: "nao_lido", currentVersion: app.getVersion() };
  } finally {
    preparingUpdate = false;
  }
}

ipcMain.handle("update-file:info", () => ({ version: app.getVersion() }));
ipcMain.handle("update-file:prepare", (event, { filePath } = {}) => prepareUpdate(event, filePath));
ipcMain.handle("update-file:choose", async (event) => {
  const options = {
    title: "Escolher arquivo de atualização",
    properties: ["openFile"],
    filters: [{ name: "Atualização do OMNI4", extensions: [updatePackage.EXTENSION.slice(1)] }],
  };
  const window = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
  if (canceled || !filePaths[0]) return { ok: false, erro: "cancelado" };
  return prepareUpdate(event, filePaths[0]);
});
ipcMain.handle("update-file:discard", () => {
  discardPreparedUpdate();
  return { ok: true };
});
ipcMain.handle("update-file:install", async () => {
  if (!preparedUpdate) return { ok: false, erro: "nao_preparado" };
  const { installerPath, version, sha512 } = preparedUpdate;
  try {
    // Confere de novo: o arquivo pode ter sido trocado enquanto a tela esperava a confirmação.
    if ((await updatePackage.hashFile(installerPath)) !== sha512) {
      discardPreparedUpdate();
      return { ok: false, erro: "integridade" };
    }
    // Mesmos argumentos que o atualizador automático usava: janela de progresso
    // do instalador e o app reabre sozinho no fim.
    await new Promise((resolve, reject) => {
      const child = spawn(installerPath, ["--updated", "--force-run"], { detached: true, stdio: "ignore" });
      child.once("error", reject);
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    });
  } catch (err) {
    log.error("Instalador não iniciou:", err.code, err.message);
    return { ok: false, erro: "instalador_bloqueado" };
  }
  log.info("=== INSTALANDO VERSÃO", version, "===");
  setImmediate(() => app.quit());
  return { ok: true };
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

ipcMain.on("renderer:breadcrumb", (_event, payload) => {
  try {
    const json = JSON.stringify(payload ?? null);
    // Rastro é um objeto pequeno de contagens; qualquer coisa grande é descartada.
    lastRendererBreadcrumb = json && json.length <= 2000 ? JSON.parse(json) : null;
  } catch {
    lastRendererBreadcrumb = null;
  }
});

// Estado do último crash (gravado no render-process-gone). Consumido uma vez:
// quem lê apaga, pra o modo seguro não reaparecer em toda abertura.
ipcMain.handle("app:consume-crash-state", async () => {
  const filePath = getCrashStatePath();
  try {
    if (!fs.existsSync(filePath)) return null;
    const state = JSON.parse(fs.readFileSync(filePath, "utf8"));
    fs.unlinkSync(filePath);
    return state && typeof state === "object" ? state : null;
  } catch (err) {
    log.warn("Estado de crash ilegível, descartado:", err.message);
    try { fs.unlinkSync(filePath); } catch { /* já não existe */ }
    return null;
  }
});

// Botão "Reabrir Omni4" da página de recuperação. Carregar a URL do app a
// partir do processo principal não sofre o bloqueio data: → file:// que a
// navegação feita pela própria página sofria.
ipcMain.on("app:reopen", (_event, payload) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const route = sanitizeRoute(payload?.route);
  log.info("Reabrindo o app após recuperação, rota:", route);
  mainWindow.loadURL(`${getAppEntryUrl()}#${route}`);
});

// Bases locais: armazenamento de arquivos de dados
//
// Seguranca: todo handler abaixo recebe tipo/nomeArquivo/cacheKind vindos do
// renderer via IPC. O renderer roda com contextIsolation e sem nodeIntegration,
// mas isso NAO significa que o processo principal deva confiar cegamente nesses
// valores — a tipagem TypeScript do lado do renderer (TipoBase, cacheKind
// tipado) nao e imposta em tempo de execucao, e qualquer script que consiga
// rodar no renderer (hoje nao ha nenhum vetor conhecido, mas uma dependencia
// comprometida ou uma falha futura de renderizacao poderiam abrir um) tem
// acesso direto a window.electronAPI.bases.*/slidesFlow.* com QUALQUER string.
// Sem validacao aqui, um valor como tipo="../../../../Users/<user>/Documents"
// faz path.join escapar do diretorio esperado e ler/escrever/apagar qualquer
// arquivo que o usuario do SO tenha permissao de acessar — inclusive fora da
// pasta de dados do app. Por isso tipo/cacheKind sao validados contra uma
// lista fechada de valores conhecidos, e nomeArquivo/key sao validados para
// aceitar apenas um nome de arquivo simples (sem separador de caminho, sem
// "..", nunca um caminho absoluto).
const VALID_BASE_TIPOS = new Set(["ke30", "budget", "deparaInovacao", "personalizado", "ruptura"]);
const VALID_CACHE_KINDS = new Set(["ke30-parsed-csv", "budget-parsed-xlsx", "ruptura-model"]);

function isSafeTipo(tipo) {
  return typeof tipo === "string" && VALID_BASE_TIPOS.has(tipo);
}

function isSafeCacheKind(cacheKind) {
  return typeof cacheKind === "string" && VALID_CACHE_KINDS.has(cacheKind);
}

function isSafeFileName(nomeArquivo) {
  if (typeof nomeArquivo !== "string" || nomeArquivo.length === 0 || nomeArquivo.length > 260) return false;
  if (nomeArquivo.includes("\0")) return false;
  if (path.isAbsolute(nomeArquivo)) return false;
  if (nomeArquivo.replace(/\\/g, "/").includes("/")) return false;
  if (nomeArquivo === "." || nomeArquivo === "..") return false;
  return path.basename(nomeArquivo) === nomeArquivo;
}

function isSafeChunkIndex(index) {
  return Number.isInteger(index) && index >= 0 && index < 1_000_000;
}

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
  if (!isSafeTipo(tipo) || !isSafeFileName(nomeArquivo)) return { ok: false, erro: "parametro_invalido" };
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
  if (!isSafeTipo(tipo)) return { ok: false, motivo: "erro", erro: "parametro_invalido" };
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
  if (!isSafeTipo(tipo) || !isSafeFileName(nomeArquivo)) return { ok: false, motivo: "erro", erro: "parametro_invalido" };
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
  if (!isSafeTipo(tipo) || !isSafeFileName(nomeArquivo) || !isSafeCacheKind(cacheKind)) {
    return { ok: true, hit: false, motivo: "cache_invalido" };
  }
  try {
    const signature = getBaseSignature(tipo, nomeArquivo);
    if (!signature) return { ok: true, hit: false, motivo: "arquivo_ausente" };
    const cachePath = getProcessedCachePath(tipo, nomeArquivo, cacheKind);
    if (!fs.existsSync(cachePath)) return { ok: true, hit: false, motivo: "cache_ausente" };
    // Leitura assíncrona e só do cabeçalho: o payload vai como texto para a
    // tela (ver processedCacheText.js). O main não fica travado montando
    // dezenas de MB de objetos, e o IPC não clona objeto por objeto.
    const envelope = splitProcessedEnvelope(await fs.promises.readFile(cachePath, "utf8"));
    const header = envelope?.header;
    const valid =
      header?.version === version &&
      header?.cacheKind === cacheKind &&
      isSignatureMatch(header?.signature, signature);
    if (!valid) return { ok: true, hit: false, motivo: "cache_invalido" };
    return { ok: true, hit: true, payloadText: envelope.payloadText };
  } catch (err) {
    log.warn("Cache processado invalido, sera reprocessado:", tipo, nomeArquivo, err.message);
    return { ok: true, hit: false, motivo: "cache_corrompido" };
  }
});

ipcMain.handle("bases:processed-chunked-meta", async (event, { tipo, nomeArquivo, cacheKind, version }) => {
  if (!isSafeTipo(tipo) || !isSafeFileName(nomeArquivo) || !isSafeCacheKind(cacheKind)) {
    return { ok: true, hit: false, motivo: "cache_invalido" };
  }
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
  if (!isSafeTipo(tipo) || !isSafeFileName(nomeArquivo) || !isSafeCacheKind(cacheKind) || !isSafeChunkIndex(index)) {
    return { ok: false, erro: "parametro_invalido" };
  }
  try {
    const chunkDir = getProcessedChunkDir(tipo, nomeArquivo, cacheKind);
    const chunkPath = path.join(chunkDir, "chunks", `chunk-${String(index).padStart(5, "0")}.json`);
    if (!fs.existsSync(chunkPath)) return { ok: false, erro: "chunk_ausente" };
    // Mesmo motivo do bases:processed-load: texto em vez de objetos.
    return { ok: true, rowsText: await fs.promises.readFile(chunkPath, "utf8") };
  } catch (err) {
    log.warn("Erro ao carregar chunk de cache processado:", tipo, nomeArquivo, err.message);
    return { ok: false, erro: err.message };
  }
});

ipcMain.handle("bases:processed-save", async (event, { tipo, nomeArquivo, cacheKind, version, payload }) => {
  if (!isSafeTipo(tipo) || !isSafeFileName(nomeArquivo) || !isSafeCacheKind(cacheKind)) {
    return { ok: false, erro: "parametro_invalido" };
  }
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
  if (!isSafeTipo(tipo) || !isSafeFileName(nomeArquivo) || !isSafeCacheKind(cacheKind)) {
    return { ok: false, erro: "parametro_invalido" };
  }
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
  if (!isSafeTipo(tipo) || !isSafeFileName(nomeArquivo) || !isSafeCacheKind(cacheKind) || !isSafeChunkIndex(index)) {
    return { ok: false, erro: "parametro_invalido" };
  }
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
  if (!isSafeTipo(tipo) || !isSafeFileName(nomeArquivo) || !isSafeCacheKind(cacheKind)) {
    return { ok: false, erro: "parametro_invalido" };
  }
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
    for (const tipo of ["ke30", "budget", "deparaInovacao", "personalizado", "ruptura"]) {
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
  if (!isSafeTipo(tipo) || (nomeArquivo != null && !isSafeFileName(nomeArquivo))) {
    return { ok: false, erro: "parametro_invalido" };
  }
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
  if (tipo != null && !isSafeTipo(tipo)) return { ok: false, erro: "parametro_invalido" };
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

// Esteira de Slides (pricing.slidesFlow.v1): armazenamento em arquivo, sem o
// teto de ~10MB do localStorage do Chromium. O renderer grava aqui via IPC em
// vez de localStorage — ver src/store/slidesFlow.ts. Escrita atomica (arquivo
// temporario + rename) e backups rotativos em arquivos separados, baratos
// porque nao competem com a mesma cota do dado principal.
const SLIDES_FLOW_BACKUP_COUNT = 5;

// Mesmo raciocinio de seguranca da secao de bases locais acima: key vem do
// renderer sem nenhuma garantia de que seja de fato "pricing.slidesFlow.v1"
// (unico valor usado hoje) — validamos o formato para nunca deixar um
// separador de caminho ou ".." chegar em path.join.
function isSafeSlidesFlowKey(key) {
  return typeof key === "string" && key.length > 0 && key.length <= 200
    && /^[A-Za-z0-9_.-]+$/.test(key) && !key.includes("..");
}

function getSlidesFlowDir() {
  return path.join(app.getPath("userData"), "slides-flow");
}

function ensureSlidesFlowDir() {
  const dir = getSlidesFlowDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getSlidesFlowFilePath(key) {
  return path.join(getSlidesFlowDir(), `${key}.json`);
}

// Backups da esteira: no máximo uma rotação a cada 3 minutos por arquivo.
// Antes cada gravação copiava os 5 backups — com esteira de 36 MB eram 180 MB
// de disco a cada alteração.
const SLIDES_FLOW_BACKUP_MIN_INTERVAL_MS = 3 * 60 * 1000;
const lastSlidesFlowBackupAt = new Map();

function rotateSlidesFlowBackups(destino) {
  const now = Date.now();
  const last = lastSlidesFlowBackupAt.get(destino) ?? 0;
  if (now - last < SLIDES_FLOW_BACKUP_MIN_INTERVAL_MS && fs.existsSync(`${destino}.bak1`)) return;
  lastSlidesFlowBackupAt.set(destino, now);
  for (let i = SLIDES_FLOW_BACKUP_COUNT; i >= 2; i -= 1) {
    const src = `${destino}.bak${i - 1}`;
    const dst = `${destino}.bak${i}`;
    if (fs.existsSync(src)) {
      try { fs.copyFileSync(src, dst); } catch (err) { log.warn("Falha ao rotacionar backup da esteira:", dst, err.message); }
    }
  }
  if (fs.existsSync(destino)) {
    try { fs.copyFileSync(destino, `${destino}.bak1`); } catch (err) { log.warn("Falha ao criar backup da esteira:", err.message); }
  }
}

ipcMain.handle("slidesFlow:read", async (event, { key }) => {
  if (!isSafeSlidesFlowKey(key)) return { ok: false, erro: "parametro_invalido" };
  try {
    const filePath = getSlidesFlowFilePath(key);
    if (!fs.existsSync(filePath)) return { ok: true, value: null };
    const value = fs.readFileSync(filePath, "utf8");
    return { ok: true, value };
  } catch (err) {
    log.error("Erro ao ler esteira de slides:", key, err.message);
    return { ok: false, erro: err.message };
  }
});

ipcMain.handle("slidesFlow:write", async (event, { key, value }) => {
  if (!isSafeSlidesFlowKey(key) || typeof value !== "string") return { ok: false, erro: "parametro_invalido" };
  try {
    ensureSlidesFlowDir();
    const destino = getSlidesFlowFilePath(key);
    rotateSlidesFlowBackups(destino);
    const temp = `${destino}.tmp`;
    fs.writeFileSync(temp, value);
    fs.renameSync(temp, destino);
    return { ok: true };
  } catch (err) {
    log.error("Erro ao salvar esteira de slides:", key, `bytes=${value?.length ?? "desconhecido"}`, err.message);
    return { ok: false, erro: err.message };
  }
});

ipcMain.handle("slidesFlow:remove", async (event, { key }) => {
  if (!isSafeSlidesFlowKey(key)) return { ok: false, erro: "parametro_invalido" };
  try {
    const filePath = getSlidesFlowFilePath(key);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return { ok: true };
  } catch (err) {
    log.error("Erro ao remover esteira de slides:", key, err.message);
    return { ok: false, erro: err.message };
  }
});

ipcMain.handle("slidesFlow:latest-backup", async (event, { key }) => {
  if (!isSafeSlidesFlowKey(key)) return { ok: false, erro: "parametro_invalido" };
  try {
    for (let i = 1; i <= SLIDES_FLOW_BACKUP_COUNT; i += 1) {
      const backupPath = `${getSlidesFlowFilePath(key)}.bak${i}`;
      if (fs.existsSync(backupPath)) {
        return { ok: true, value: fs.readFileSync(backupPath, "utf8") };
      }
    }
    return { ok: true, value: null };
  } catch (err) {
    log.error("Erro ao ler backup da esteira de slides:", key, err.message);
    return { ok: false, erro: err.message };
  }
});

// Atividades (harald.kanban.v1): mesmo tipo de proteção da esteira — arquivo no
// disco (sem a cota do localStorage), escrita atômica com fsync, backups em
// rodízio e um instantâneo por dia. A lógica mora em ./fileStore.js (testada).
// Só a chave exata abaixo é aceita: nada vindo da tela escolhe o nome do arquivo.
const KANBAN_KEYS = new Set(["harald.kanban.v1"]);
const kanbanStore = createFileStore({
  fs,
  path,
  getDir: () => path.join(app.getPath("userData"), "kanban"),
  backupCount: 6,
  backupMinIntervalMs: 2 * 60 * 1000,
  dailyKeep: 14,
  log,
});

ipcMain.handle("kanban:read", async (event, { key } = {}) =>
  KANBAN_KEYS.has(key) ? kanbanStore.read(key) : { ok: false, erro: "parametro_invalido" });
ipcMain.handle("kanban:write", async (event, { key, value } = {}) =>
  KANBAN_KEYS.has(key) ? kanbanStore.write(key, value) : { ok: false, erro: "parametro_invalido" });
ipcMain.handle("kanban:remove", async (event, { key } = {}) =>
  KANBAN_KEYS.has(key) ? kanbanStore.remove(key) : { ok: false, erro: "parametro_invalido" });
ipcMain.handle("kanban:latest-backup", async (event, { key } = {}) =>
  KANBAN_KEYS.has(key) ? kanbanStore.latestBackup(key) : { ok: false, erro: "parametro_invalido" });

app.whenReady().then(() => {
  // O instalador da atualização anterior já cumpriu o papel, mas ainda pode estar
  // terminando de sair quando reabre o app: daí as novas tentativas.
  fs.rm(getPendingUpdateDir(), { recursive: true, force: true, maxRetries: 10, retryDelay: 1000 }, () => undefined);
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Segurança: bloquear navegação para URLs externas
app.on("web-contents-created", (event, contents) => {
  contents.on("will-navigate", (event, url) => {
    // Arquivo solto fora de uma área de arrastar também navega: sairia do app.
    const isAppPage = url.split("#")[0].toLowerCase() === getAppEntryUrl().toLowerCase();
    if (!isAppPage && !url.startsWith("http://localhost")) {
      event.preventDefault();
    }
  });
});
