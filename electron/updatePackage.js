// Pacote de atualização (.omni4update): o instalador do app acompanhado de uma
// assinatura. A atualização chega por arquivo (Teams, pasta da empresa), então é
// a assinatura, e não o canal, que garante que veio de quem publica o app.
//
// Formato, nesta ordem:
//   "OMNI4UP1" | uint32 tamanho do manifesto | manifesto (JSON) |
//   uint32 tamanho da assinatura | assinatura Ed25519 do manifesto | instalador
//
// O manifesto carrega o SHA-512 do instalador, então assinar o manifesto cobre
// o arquivo inteiro. Sem dependência do Electron: também é usado pelo script
// que gera o pacote e pelos testes.
const crypto = require("crypto");
const fs = require("fs");
const { pipeline } = require("stream/promises");
const { Transform } = require("stream");

const MAGIC = Buffer.from("OMNI4UP1", "ascii");
const PRODUCT = "omni4";
const EXTENSION = ".omni4update";
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_SIGNATURE_BYTES = 1024;

function parseVersion(version) {
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) return null;
  return version.split(".").map(Number);
}

/** Negativo se a < b, zero se iguais, positivo se a > b. */
function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) throw new Error("versao_invalida");
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function hashFile(filePath, start = 0) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha512");
    fs.createReadStream(filePath, { start })
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

/** Gera o pacote. A chave privada só é usada aqui, no computador de quem publica. */
async function writePackage({ installerPath, outPath, version, privateKeyPem, createdAt = new Date().toISOString() }) {
  if (!parseVersion(version)) throw new Error(`Versão inválida: ${version}`);
  const size = fs.statSync(installerPath).size;
  const manifestBytes = Buffer.from(JSON.stringify({
    product: PRODUCT,
    version,
    size,
    sha512: await hashFile(installerPath),
    createdAt,
  }), "utf8");
  const signature = crypto.sign(null, manifestBytes, privateKeyPem);

  const tempPath = `${outPath}.tmp`;
  const out = fs.createWriteStream(tempPath);
  out.write(Buffer.concat([MAGIC, uint32(manifestBytes.length), manifestBytes, uint32(signature.length), signature]));
  await pipeline(fs.createReadStream(installerPath), out);
  fs.renameSync(tempPath, outPath);
}

/** Lê o cabeçalho sem carregar o instalador na memória. Devolve null se não for um pacote. */
function readHeader(filePath) {
  const fd = fs.openSync(filePath, "r");
  try {
    const fileSize = fs.fstatSync(fd).size;
    const read = (length, position) => {
      if (position + length > fileSize) return null;
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, position);
      return buffer;
    };

    const magic = read(MAGIC.length, 0);
    if (!magic || !magic.equals(MAGIC)) return null;
    let position = MAGIC.length;

    const manifestLength = read(4, position)?.readUInt32LE();
    if (!manifestLength || manifestLength > MAX_MANIFEST_BYTES) return null;
    position += 4;
    const manifestBytes = read(manifestLength, position);
    if (!manifestBytes) return null;
    position += manifestLength;

    const signatureLength = read(4, position)?.readUInt32LE();
    if (!signatureLength || signatureLength > MAX_SIGNATURE_BYTES) return null;
    position += 4;
    const signature = read(signatureLength, position);
    if (!signature) return null;
    position += signatureLength;

    return { manifestBytes, signature, payloadOffset: position, fileSize };
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Confere o pacote sem tocar no instalador: é dele, foi assinado por quem publica
 * o app e é mais novo que a versão atual. Em erro devolve `{ ok: false, erro }`,
 * e o código vira mensagem na tela.
 */
function inspectPackage(filePath, { publicKeyPem, currentVersion }) {
  let header;
  try {
    header = readHeader(filePath);
  } catch {
    return { ok: false, erro: "nao_lido" };
  }
  if (!header) return { ok: false, erro: "nao_e_pacote" };

  let valid = false;
  try {
    valid = crypto.verify(null, header.manifestBytes, publicKeyPem, header.signature);
  } catch {
    valid = false;
  }
  // Nada do manifesto é considerado antes de a assinatura ser aceita.
  if (!valid) return { ok: false, erro: "assinatura" };

  let manifest;
  try {
    manifest = JSON.parse(header.manifestBytes.toString("utf8"));
  } catch {
    return { ok: false, erro: "nao_e_pacote" };
  }
  if (manifest.product !== PRODUCT || !parseVersion(manifest.version)) return { ok: false, erro: "nao_e_pacote" };
  if (header.fileSize - header.payloadOffset !== manifest.size) return { ok: false, erro: "integridade" };

  const comparison = compareVersions(manifest.version, currentVersion);
  if (comparison === 0) return { ok: false, erro: "mesma_versao", version: manifest.version };
  if (comparison < 0) return { ok: false, erro: "versao_antiga", version: manifest.version };

  return { ok: true, manifest, payloadOffset: header.payloadOffset };
}

/** Copia o instalador para fora do pacote conferindo o SHA-512. Se não bater, nada fica no disco. */
async function extractInstaller(filePath, { manifest, payloadOffset }, destPath, onProgress) {
  const tempPath = `${destPath}.tmp`;
  const hash = crypto.createHash("sha512");
  let written = 0;
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      written += chunk.length;
      onProgress?.(manifest.size ? written / manifest.size : 1);
      callback(null, chunk);
    },
  });
  try {
    await pipeline(fs.createReadStream(filePath, { start: payloadOffset }), meter, fs.createWriteStream(tempPath));
    if (written !== manifest.size || hash.digest("hex") !== manifest.sha512) {
      fs.rmSync(tempPath, { force: true });
      return { ok: false, erro: "integridade" };
    }
    fs.renameSync(tempPath, destPath);
    return { ok: true };
  } catch (err) {
    fs.rmSync(tempPath, { force: true });
    throw err;
  }
}

module.exports = { EXTENSION, compareVersions, hashFile, writePackage, inspectPackage, extractInstaller };
