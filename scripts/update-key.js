// Cria o par de chaves que assina os pacotes de atualização.
// A privada fica só neste computador, fora do repositório. A pública vai junto
// com o app, que só aceita pacotes assinados pela privada correspondente.
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PRIVATE_KEY_PATH = process.env.OMNI4_UPDATE_KEY || path.join(os.homedir(), ".omni4", "chave-atualizacao.pem");
const PUBLIC_KEY_PATH = path.join(__dirname, "..", "electron", "update-public-key.pem");

function publicKeyOf(privateKeyPem) {
  return crypto.createPublicKey(privateKeyPem).export({ type: "spki", format: "pem" });
}

function main() {
  if (fs.existsSync(PRIVATE_KEY_PATH)) {
    // Trocar a chave faria os apps já instalados recusarem os próximos pacotes.
    console.log(`A chave já existe e foi mantida: ${PRIVATE_KEY_PATH}`);
    return;
  }
  const { privateKey } = crypto.generateKeyPairSync("ed25519");
  const privatePem = privateKey.export({ type: "pkcs8", format: "pem" });
  fs.mkdirSync(path.dirname(PRIVATE_KEY_PATH), { recursive: true });
  fs.writeFileSync(PRIVATE_KEY_PATH, privatePem, { mode: 0o600, flag: "wx" });
  fs.writeFileSync(PUBLIC_KEY_PATH, publicKeyOf(privatePem));
  console.log(`Chave privada criada em: ${PRIVATE_KEY_PATH}`);
  console.log(`Chave pública gravada em: ${PUBLIC_KEY_PATH}`);
  console.log("Guarde uma cópia da chave privada em lugar seguro e não a envie a ninguém.");
}

if (require.main === module) main();

module.exports = { PRIVATE_KEY_PATH, PUBLIC_KEY_PATH, publicKeyOf };
