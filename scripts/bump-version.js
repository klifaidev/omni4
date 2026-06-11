const fs = require("fs");
const { execSync } = require("child_process");

const type = process.argv[2]; // patch | minor | major
if (!["patch", "minor", "major"].includes(type)) {
  console.error("Uso: node scripts/bump-version.js <patch|minor|major>");
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const [major, minor, patch] = pkg.version.split(".").map(Number);

let newVersion;
if (type === "major") newVersion = `${major + 1}.0.0`;
else if (type === "minor") newVersion = `${major}.${minor + 1}.0`;
else newVersion = `${major}.${minor}.${patch + 1}`;

const oldVersion = pkg.version;
pkg.version = newVersion;
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");

console.log(`Versão atualizada: ${oldVersion} → ${newVersion}`);
console.log("Criando commit e tag...");

execSync("git add package.json");
execSync(`git commit -m "chore: release v${newVersion}"`);
execSync(`git tag v${newVersion}`);
execSync("git push");
execSync("git push --tags");

console.log(`\nTag v${newVersion} criada e publicada!`);
console.log("O GitHub Actions vai iniciar o build automaticamente.");
