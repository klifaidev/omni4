// Armazenamento em arquivo com escrita atômica e backups, para dados do app que
// não podem se perder (hoje: as Atividades). Fica fora do main.js para poder ser
// testado de verdade, com um diretório temporário.
//
// Garantias:
//  - escrita atômica: grava num arquivo temporário (com fsync) e só então
//    troca pelo definitivo — uma queda no meio nunca deixa o arquivo pela metade;
//  - antes de sobrescrever, o conteúdo anterior vira backup: uma cópia por
//    rodízio (no máximo uma a cada `backupMinIntervalMs`, `backupCount` cópias)
//    e um instantâneo por dia (`dailyKeep` dias), para um engano percebido
//    tarde ainda ter de onde voltar;
//  - um arquivo principal ilegível NUNCA entra no rodízio (não empurra os
//    backups bons para fora): vai para o lado como `.corrupt-<hora>`;
//  - o backup devolvido é sempre o mais recente que ainda é legível.
"use strict";

const SAFE_KEY = /^[A-Za-z0-9_.-]+$/;

/** Chave vinda da tela: nunca deixa um separador de caminho ou ".." chegar ao path.join. */
function isSafeStoreKey(key) {
  return typeof key === "string" && key.length > 0 && key.length <= 200
    && SAFE_KEY.test(key) && !key.includes("..");
}

function defaultIsValid(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed !== null && typeof parsed === "object";
  } catch {
    return false;
  }
}

function localDateStamp(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * @param {object} options
 * @param {typeof import("fs")} options.fs
 * @param {typeof import("path")} options.path
 * @param {() => string} options.getDir  pasta dos arquivos (resolvida na hora de usar)
 * @param {number} [options.backupCount]
 * @param {number} [options.backupMinIntervalMs]
 * @param {number} [options.dailyKeep]
 * @param {number} [options.corruptKeep]
 * @param {number} [options.maxBytes]
 * @param {(text: string) => boolean} [options.isValid]
 * @param {() => number} [options.now]
 * @param {{ warn: Function, error: Function }} [options.log]
 */
function createFileStore(options) {
  const {
    fs,
    path,
    getDir,
    backupCount = 6,
    backupMinIntervalMs = 5 * 60 * 1000,
    dailyKeep = 14,
    corruptKeep = 3,
    maxBytes = 64 * 1024 * 1024,
    isValid = defaultIsValid,
    now = Date.now,
    log = console,
  } = options;

  const lastBackupAt = new Map();

  const filePath = (key) => path.join(getDir(), `${key}.json`);

  function ensureDir() {
    const dir = getDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  function readIfExists(p) {
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
  }

  function pruneByName(prefixDir, startsWith, keep) {
    const names = fs.readdirSync(prefixDir).filter((n) => n.startsWith(startsWith)).sort().reverse();
    for (const name of names.slice(keep)) {
      try { fs.unlinkSync(path.join(prefixDir, name)); } catch (err) { log.warn("Falha ao apagar backup antigo:", name, err.message); }
    }
  }

  function setAsideCorrupt(destino) {
    const aside = `${destino}.corrupt-${String(now()).padStart(15, "0")}`;
    try {
      fs.renameSync(destino, aside);
      pruneByName(path.dirname(destino), `${path.basename(destino)}.corrupt-`, corruptKeep);
    } catch (err) {
      log.warn("Falha ao separar arquivo ilegível:", destino, err.message);
    }
  }

  function snapshotDaily(destino) {
    if (dailyKeep <= 0) return;
    const snap = `${destino}.daily-${localDateStamp(now())}`;
    if (fs.existsSync(snap)) return;
    try {
      fs.copyFileSync(destino, snap);
      pruneByName(path.dirname(destino), `${path.basename(destino)}.daily-`, dailyKeep);
    } catch (err) {
      log.warn("Falha ao criar instantâneo diário:", snap, err.message);
    }
  }

  function rotate(destino) {
    const t = now();
    const last = lastBackupAt.get(destino) ?? 0;
    if (t - last < backupMinIntervalMs && fs.existsSync(`${destino}.bak1`)) return;
    lastBackupAt.set(destino, t);
    for (let i = backupCount; i >= 2; i -= 1) {
      const src = `${destino}.bak${i - 1}`;
      if (fs.existsSync(src)) {
        try { fs.copyFileSync(src, `${destino}.bak${i}`); } catch (err) { log.warn("Falha ao rotacionar backup:", i, err.message); }
      }
    }
    try { fs.copyFileSync(destino, `${destino}.bak1`); } catch (err) { log.warn("Falha ao criar backup:", err.message); }
  }

  /** Preserva o que está no arquivo principal antes de ele ser sobrescrito. */
  function preserveBeforeOverwrite(destino) {
    if (!fs.existsSync(destino)) return;
    const current = readIfExists(destino);
    if (current === null || current.trim() === "") return;
    if (!isValid(current)) {
      setAsideCorrupt(destino);
      return;
    }
    snapshotDaily(destino);
    rotate(destino);
  }

  function read(key) {
    if (!isSafeStoreKey(key)) return { ok: false, erro: "parametro_invalido" };
    try {
      return { ok: true, value: readIfExists(filePath(key)) };
    } catch (err) {
      log.error("Erro ao ler arquivo:", key, err.message);
      return { ok: false, erro: err.message };
    }
  }

  function write(key, value) {
    if (!isSafeStoreKey(key) || typeof value !== "string") return { ok: false, erro: "parametro_invalido" };
    if (value.length > maxBytes) return { ok: false, erro: "valor_grande_demais" };
    try {
      ensureDir();
      const destino = filePath(key);
      // Nada a fazer se o arquivo já tem exatamente isto (não gasta backup).
      if (fs.existsSync(destino) && readIfExists(destino) === value) return { ok: true };
      preserveBeforeOverwrite(destino);
      const temp = `${destino}.tmp`;
      const fd = fs.openSync(temp, "w");
      try {
        fs.writeSync(fd, value);
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(temp, destino);
      return { ok: true };
    } catch (err) {
      log.error("Erro ao salvar arquivo:", key, `bytes=${value.length}`, err.message);
      return { ok: false, erro: err.message };
    }
  }

  function remove(key) {
    if (!isSafeStoreKey(key)) return { ok: false, erro: "parametro_invalido" };
    try {
      const p = filePath(key);
      if (fs.existsSync(p)) fs.unlinkSync(p);
      return { ok: true };
    } catch (err) {
      log.error("Erro ao remover arquivo:", key, err.message);
      return { ok: false, erro: err.message };
    }
  }

  /** Backup legível mais recente: rodízio (do mais novo) e depois os diários (do mais novo). */
  function latestBackup(key) {
    if (!isSafeStoreKey(key)) return { ok: false, erro: "parametro_invalido" };
    try {
      const base = filePath(key);
      const candidates = [];
      for (let i = 1; i <= backupCount; i += 1) candidates.push(`${base}.bak${i}`);
      const dir = getDir();
      if (fs.existsSync(dir)) {
        const prefix = `${path.basename(base)}.daily-`;
        const dailies = fs.readdirSync(dir).filter((n) => n.startsWith(prefix)).sort().reverse();
        for (const name of dailies) candidates.push(path.join(dir, name));
      }
      for (const candidate of candidates) {
        const text = readIfExists(candidate);
        if (text !== null && text.trim() !== "" && isValid(text)) return { ok: true, value: text };
      }
      return { ok: true, value: null };
    } catch (err) {
      log.error("Erro ao ler backup:", key, err.message);
      return { ok: false, erro: err.message };
    }
  }

  return { read, write, remove, latestBackup };
}

module.exports = { createFileStore, isSafeStoreKey };
