// Gera o instalador e o pacote assinado de atualização da versão do package.json.
// Uso: npm run update:pack            (compila e empacota)
//      npm run update:pack -- --skip-build  (usa o instalador que já está em release/)
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { EXTENSION, writePackage } = require("../electron/updatePackage");
const { PRIVATE_KEY_PATH, PUBLIC_KEY_PATH, publicKeyOf } = require("./update-key");

async function main() {
  const root = path.join(__dirname, "..");
  const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

  if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    throw new Error(`Chave privada não encontrada em ${PRIVATE_KEY_PATH}. Rode "npm run update:key" ou restaure a sua cópia.`);
  }
  const privateKeyPem = fs.readFileSync(PRIVATE_KEY_PATH, "utf8");
  // Com a chave errada, o app instalado recusaria o pacote: melhor parar aqui.
  if (publicKeyOf(privateKeyPem).trim() !== fs.readFileSync(PUBLIC_KEY_PATH, "utf8").replace(/\r\n/g, "\n").trim()) {
    throw new Error(`A chave privada não corresponde a ${PUBLIC_KEY_PATH}.`);
  }

  if (!process.argv.includes("--skip-build")) {
    execSync("npm run electron:build", { cwd: root, stdio: "inherit" });
  }

  const installerPath = path.join(root, "release", `OMNI4-Pricing-Analytics-Setup-${version}.exe`);
  if (!fs.existsSync(installerPath)) throw new Error(`Instalador não encontrado: ${installerPath}`);

  const outPath = path.join(root, "release", `OMNI4-Atualizacao-${version}${EXTENSION}`);
  await writePackage({ installerPath, outPath, version, privateKeyPem });

  console.log(`\nPronto para enviar:`);
  console.log(`  Atualização (arrastar em Ajustes): ${outPath}`);
  console.log(`  Instalador (quem ainda não tem a aba Ajustes): ${installerPath}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
