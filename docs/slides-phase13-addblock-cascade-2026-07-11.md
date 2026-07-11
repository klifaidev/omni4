# Slides Phase 13 - AddBlock Cascade Investigation

Data: 2026-07-11

## Objetivo

Investigar o gargalo medido com base real carregada: inserir um grafico novo no `CustomSlideEditor` levou cerca de 4,1s em slide com 20+ graficos. A hipotese era cascata de re-render/recalculo dos graficos ja existentes no caminho local de `addBlock`, fora da sala colaborativa/Yjs.

## Alteracoes de instrumentacao

Foram adicionados marks/eventos internos de performance em:

| Ponto | Evento/medida |
| --- | --- |
| Acao local `addBlockAction` | `slides.addBlockAction` |
| Acao local `addChartBlockAction` | `slides.addChartBlockAction` |
| Acao local `insertBlockAction` | `slides.insertBlockAction` |
| Clique de inserir bloco/grafico no editor | `slides.addBlock.clickToReturn`, `slides.addChart.clickToReturn` |
| Commit do `CustomSlideEditor` | `slides.customEditor.commit` |
| Render de `ChartCanvas` | contador `ChartCanvas` e `ChartCanvas:<blockId>` |
| Mount/unmount de `ChartCanvas` | `slides.chartCanvas.mount`, `slides.chartCanvas.unmount` |
| Worker/cache de calculo | `slides.worker.start`, `slides.worker.end`, `slides.worker.duration`, `slides.calc.workerClient`, `slides.calc.cacheHit`, `slides.calc.workerFallback` |
| Mount/unmount do inspector | `slides.inspector.mount`, `slides.inspector.unmount` |

O coletor `window.__OMNI_SLIDES_PERF__` agora e criado automaticamente em `DEV` e em `localhost`/`127.0.0.1`, para nao depender de injecao manual pelo DevTools.

## Correcao preventiva aplicada

Os comparadores de memoizacao de blocos/graficos usavam `JSON.stringify` diretamente:

- `BlockRenderer`: `prev === next || JSON.stringify(prev) === JSON.stringify(next)`
- `ChartCanvas`: `prev === next || JSON.stringify(prev) === JSON.stringify(next)`

Isso mantinha a comparacao por conteudo, mas podia serializar repetidamente blocos pesados quando referencias mudavam. Foi substituido por assinatura cacheada em `WeakMap`, preservando o comportamento e reduzindo custo de comparacoes repetidas.

Tambem foi adicionado um polyfill minimo de `process.env` no Vite. Logs antigos do navegador mostraram `ReferenceError: process is not defined` vindo de `react-rnd` durante montagem de `Draggable`, exatamente no caminho com muitos blocos. Esse erro nao apareceu no build, mas era um risco claro para a fluidez do editor em dev/Electron.

## Resultado da investigacao de slides quentes

O cache de "ultimos slides quentes" do fullscreen nao mantem editores/canvases montados. O codigo atual apenas adiciona os IDs recentes e chama `warmSlideThumbnail(item)`.

Isso aquece miniatura/dados, mas nao impede remontagem do `CustomSlideEditor` e dos `ChartCanvas` ao alternar slides no fullscreen. Como o `CustomSlideEditor` usa um store global unico (`editorStore.ts`), manter 2-3 instancias vivas em paralelo exigiria uma refatoracao maior para store por instancia. Portanto, a Fase 13.5 nao cobre esse caminho especifico hoje.

## Medicao

Nao foi possivel coletar os marks internos nesta sessao do navegador interno:

- A instancia 8080 continuou servindo um bundle anterior durante a automacao, mesmo apos reload.
- A tentativa de subir uma instancia limpa em 8081 nao respondeu (`ERR_CONNECTION_REFUSED`).
- O navegador interno tambem ja tinha a limitacao anterior de nao permitir injecao manual confiavel em `window.__OMNI_SLIDES_PERF__`.

Portanto, esta etapa deixa o app instrumentado para medicao real no Electron/Chrome, mas nao registra uma comparacao antes/depois confiavel dentro deste ambiente.

## Como medir agora

No Electron/Chrome real ou em uma instancia dev limpa:

1. Carregar dados demo ou uma base real.
2. Abrir Slides > slide personalizado com 20+ graficos.
3. Abrir editor em tela cheia.
4. No console, limpar a coleta:

```js
window.__OMNI_SLIDES_PERF__ = { counts: {}, events: [], measures: [] }
```

5. Inserir um grafico `Linha`.
6. Ler:

```js
window.__OMNI_SLIDES_PERF__
```

Indicadores principais:

- `counts.ChartCanvas`: quantos `ChartCanvas` executaram.
- `counts["ChartCanvas:<blockId>"]`: quais blocos renderizaram.
- eventos `slides.chartCanvas.mount`: quantos canvases montaram de fato.
- medidas `slides.addChart.clickToReturn` e `slides.addChartBlockAction`: custo do caminho de add.
- medidas `slides.worker.duration` e eventos `slides.calc.cacheHit`: se o novo grafico usou worker/cache ou fallback.

## Conclusao

A hipotese de cascata agora pode ser confirmada com contadores internos. Pelo codigo, o caminho local de `addChartBlockAction` preserva as referencias dos blocos existentes (`blocks: [...c.blocks, blk]`), entao a cascata nao deveria chegar ao `ChartCanvas` se a memoizacao estiver funcionando. Se os marks mostrarem que todos os `ChartCanvas` renderizam, a origem provavel passa a ser alguma etapa posterior recriando os objetos de bloco, ou o comparador/memo sendo invalidado por props auxiliares.

Para o problema de troca de slide no fullscreen, a causa esta confirmada por leitura: os slides "quentes" nao ficam montados; apenas miniaturas sao aquecidas.
