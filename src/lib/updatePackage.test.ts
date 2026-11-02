// Testa o pacote de atualização (electron/updatePackage.js): o que o app aceita
// instalar e, principalmente, o que ele recusa.
import { createRequire } from "node:module";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { writePackage, inspectPackage, extractInstaller, compareVersions } = require("../../electron/updatePackage.js") as {
  writePackage: (o: { installerPath: string; outPath: string; version: string; privateKeyPem: string }) => Promise<void>;
  inspectPackage: (path: string, o: { publicKeyPem: string; currentVersion: string }) => InspectResult;
  extractInstaller: (path: string, r: InspectResult, dest: string, onProgress?: (f: number) => void) => Promise<{ ok: boolean; erro?: string }>;
  compareVersions: (a: string, b: string) => number;
};
type InspectResult = { ok: boolean; erro?: string; version?: string; manifest?: { version: string; size: number }; payloadOffset?: number };

function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }) as string,
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }) as string,
  };
}

describe("pacote de atualização", () => {
  const keys = keyPair();
  const installerBytes = Buffer.from("conteudo do instalador ".repeat(5000));
  let dir: string;
  let pkg: string;
  let installer: string;

  const inspect = (path = pkg, currentVersion = "1.66.0", publicKeyPem = keys.publicKeyPem) =>
    inspectPackage(path, { publicKeyPem, currentVersion });

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "omni4-pkg-"));
    pkg = join(dir, "a.omni4update");
    installer = join(dir, "setup.exe");
    writeFileSync(installer, installerBytes);
    await writePackage({ installerPath: installer, outPath: pkg, version: "1.67.0", privateKeyPem: keys.privateKeyPem });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("aceita o pacote assinado e entrega o instalador idêntico", async () => {
    const result = inspect();
    expect(result.ok).toBe(true);
    expect(result.manifest?.version).toBe("1.67.0");

    const dest = join(dir, "saida.exe");
    const fractions: number[] = [];
    expect(await extractInstaller(pkg, result, dest, (f) => fractions.push(f))).toEqual({ ok: true });
    expect(readFileSync(dest).equals(installerBytes)).toBe(true);
    expect(fractions.at(-1)).toBe(1);
  });

  it("recusa pacote assinado por outra chave", async () => {
    const other = keyPair();
    await writePackage({ installerPath: installer, outPath: pkg, version: "1.67.0", privateKeyPem: other.privateKeyPem });
    expect(inspect()).toEqual({ ok: false, erro: "assinatura" });
  });

  it("recusa manifesto alterado depois de assinado (versão trocada)", () => {
    const bytes = readFileSync(pkg);
    const at = bytes.indexOf(Buffer.from("1.67.0"));
    bytes.write("9.67.0", at);
    writeFileSync(pkg, bytes);
    expect(inspect()).toEqual({ ok: false, erro: "assinatura" });
  });

  it("instalador trocado dentro do pacote: extrai nada", async () => {
    const bytes = readFileSync(pkg);
    bytes[bytes.length - 10] ^= 0xff;
    writeFileSync(pkg, bytes);
    // Mesmo tamanho: passa pelo cabeçalho e é pego no SHA-512.
    const dest = join(dir, "saida.exe");
    expect(await extractInstaller(pkg, inspect(), dest)).toEqual({ ok: false, erro: "integridade" });
    expect(existsSync(dest)).toBe(false);
    expect(existsSync(`${dest}.tmp`)).toBe(false);
  });

  it("arquivo cortado no envio é recusado", () => {
    const bytes = readFileSync(pkg);
    writeFileSync(pkg, bytes.subarray(0, bytes.length - 100));
    expect(inspect()).toEqual({ ok: false, erro: "integridade" });
  });

  it("recusa versão igual ou mais antiga que a atual", () => {
    expect(inspect(pkg, "1.67.0")).toEqual({ ok: false, erro: "mesma_versao", version: "1.67.0" });
    expect(inspect(pkg, "1.100.0")).toEqual({ ok: false, erro: "versao_antiga", version: "1.67.0" });
  });

  it("recusa o que não é pacote: .exe renomeado, vazio, cortado no cabeçalho, tamanho absurdo", () => {
    const fake = join(dir, "falso.omni4update");
    writeFileSync(fake, Buffer.from("MZ este seria um exe qualquer"));
    expect(inspect(fake)).toEqual({ ok: false, erro: "nao_e_pacote" });
    writeFileSync(fake, Buffer.alloc(0));
    expect(inspect(fake)).toEqual({ ok: false, erro: "nao_e_pacote" });
    writeFileSync(fake, readFileSync(pkg).subarray(0, 20));
    expect(inspect(fake)).toEqual({ ok: false, erro: "nao_e_pacote" });
    const huge = Buffer.concat([Buffer.from("OMNI4UP1"), Buffer.from([0xff, 0xff, 0xff, 0xff])]);
    writeFileSync(fake, huge);
    expect(inspect(fake)).toEqual({ ok: false, erro: "nao_e_pacote" });
  });

  it("arquivo inexistente vira erro de leitura, não exceção", () => {
    expect(inspect(join(dir, "nao-existe.omni4update"))).toEqual({ ok: false, erro: "nao_lido" });
  });

  it("assinado corretamente, mas de outro produto: recusa", () => {
    const manifest = Buffer.from(JSON.stringify({ product: "outro", version: "9.0.0", size: 0, sha512: "" }));
    const signature = sign(null, manifest, keys.privateKeyPem);
    const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
    writeFileSync(pkg, Buffer.concat([Buffer.from("OMNI4UP1"), u32(manifest.length), manifest, u32(signature.length), signature]));
    expect(inspect()).toEqual({ ok: false, erro: "nao_e_pacote" });
  });

  it("compara versões como números", () => {
    expect(compareVersions("1.9.0", "1.10.0")).toBeLessThan(0);
    expect(compareVersions("2.0.0", "1.99.99")).toBeGreaterThan(0);
    expect(compareVersions("1.66.0", "1.66.0")).toBe(0);
  });
});
