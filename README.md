# OMNI4 Pricing Analytics

Aplicativo desktop de análise de pricing e lucratividade B2B: Bridge PVM, mix,
portfólio de SKUs, custos, budget e montagem de apresentações.

Os dados são carregados localmente pelo usuário e processados na própria
máquina — o app não envia bases para servidores externos.

## Stack

- React + TypeScript + Vite
- Electron (instalador Windows via electron-builder)
- Tailwind CSS + shadcn/ui
- Vitest

## Desenvolvimento

```bash
npm install
npm run dev          # interface no navegador (http://localhost:8080)
npm run electron     # interface dentro do Electron
npm test             # testes
```

## Build e release

Ver [RELEASING.md](RELEASING.md).

## Para avaliação de segurança (TI)

- Atualização: não há atualização automática pela internet. Cada versão chega
  como um arquivo `.omni4update` assinado; o app só aceita pacotes assinados
  pela chave privada do responsável, que não está no repositório. Só a chave
  pública está em `electron/update-public-key.pem`.
- Processo principal e ponte segura com a interface: `electron/main.js` e
  `electron/preload.js`.
- Dependências: `package.json` e `package-lock.json` (auditoria: `npm audit`).
- Gerar o instalador a partir do código: `npm ci` e depois
  `npm run electron:build` (saída em `release/`). Requer Node 22 ou superior.

