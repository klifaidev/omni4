# Como publicar uma nova versão do OMNI4

O app não procura atualização em nenhum servidor. A versão nova é gerada neste
computador e enviada por Teams ou pasta da empresa; cada pessoa arrasta o arquivo
na aba **Ajustes**.

## Pré-requisitos
- A chave privada de assinatura em `%USERPROFILE%\.omni4\chave-atualizacao.pem`
  (criada uma vez com `npm run update:key`). **Guarde uma cópia em lugar seguro.**
  A chave pública correspondente é `electron/update-public-key.pem`, que vai dentro do app.

## Gerar uma versão
Sobe o número, faz commit e tag, compila e gera o pacote:

```
npm run release:patch    (correção, ex: 1.0.0 → 1.0.1)
npm run release:minor    (novidade, ex: 1.0.0 → 1.1.0)
npm run release:major    (mudança grande, ex: 1.0.0 → 2.0.0)
```

Para gerar o pacote de novo sem mudar a versão: `npm run update:pack`
(ou `npm run update:pack -- --skip-build` para aproveitar o instalador já compilado).

## O que sai em `release/`
```
OMNI4-Atualizacao-X.Y.Z.omni4update        ← o que todos recebem e arrastam em Ajustes
OMNI4-Pricing-Analytics-Setup-X.Y.Z.exe    ← instalador comum (primeira instalação)
```

O primeiro build em um computador baixa da internet as ferramentas de empacotamento
do electron-builder; depois ficam em cache. Em uma rede que bloqueie esse download,
gere a versão em outra rede.

## O que o app confere antes de instalar
1. É um pacote do OMNI4 com a assinatura Ed25519 da chave acima.
2. A versão é mais nova que a instalada (voltar de versão é recusado).
3. O SHA-512 do instalador bate com o que foi assinado, de novo logo antes de executar.

Bases, esteira, atividades e preferências ficam em `%APPDATA%`, fora da pasta do
programa, e o instalador não mexe nelas.

## Se a chave privada se perder
Os apps instalados vão recusar pacotes assinados com outra chave. Crie uma chave nova,
gere a versão e peça a todos que rodem **uma vez** o instalador `.exe`, que substitui o
app sem apagar os dados. A partir daí, valem os pacotes da chave nova.

## Assinatura de código (Authenticode) — ainda não configurado
O instalador não tem assinatura de código do Windows. A assinatura do pacote prova ao
**app** quem publicou, mas não muda o que o **Windows** vê: SmartScreen ou políticas da
TI (AppLocker, WDAC) podem bloquear o instalador. O app avisa quando isso acontece.

Para assinar quando houver um certificado (`.pfx`/`.p12`), defina antes do build as
variáveis `CSC_LINK` (caminho do certificado) e `CSC_KEY_PASSWORD` (senha). O
electron-builder assina sozinho, sem mudança de código.
