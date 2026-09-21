# OMNI4 Pricing Analytics

Aplicativo desktop de análise de pricing e lucratividade B2B: Bridge PVM, mix,
portfólio de SKUs, custos, budget e montagem de apresentações.

Os dados são carregados localmente pelo usuário e processados na própria
máquina — o app não envia bases para servidores externos.

## Stack

- React + TypeScript + Vite
- Electron (instalador Windows via electron-builder, com auto-update)
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
