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

O coletor `window.__OMNI_SLIDES_PERF__` chegou a ser criado automaticamente em `DEV`/localhost para facilitar medicoes, mas isso foi revertido nesta revisao de performance: agora ele e totalmente opt-in.

Atualizacao posterior: para evitar que o proprio diagnostico piore a fluidez do editor, a coleta deixou de ser automatica. Mesmo em DEV/localhost, nada e contado se a flag abaixo nao estiver ligada. Isso remove o overhead de chamadas de contagem do caminho quente de render/drag quando ninguem esta medindo.

```js
window.__OMNI_SLIDES_PERF_ENABLED__ = true
window.__OMNI_SLIDES_PERF__ = { counts: {}, events: [], measures: [] }
```

Eventos e medidas detalhadas (`events`/`measures`) so sao gravados quando a segunda flag tambem estiver ligada antes do teste:

```js
window.__OMNI_SLIDES_PERF_ENABLED__ = true
window.__OMNI_SLIDES_PERF_DETAILED__ = true
window.__OMNI_SLIDES_PERF__ = { counts: {}, events: [], measures: [] }
location.reload()
```

Os buffers detalhados tambem passaram a ser circulares, mantendo somente os ultimos 200 eventos e as ultimas 200 medidas, em vez de crescerem ate dezenas de milhares de entradas.

### Diagnostico do overhead da instrumentacao

Nao foi possivel repetir a sequencia real com base local/Electron neste ambiente, mas o overhead do coletor em si foi isolado com um microbenchmark local simulando chamadas frequentes de render:

| Eventos simulados | Coletor anterior (`events.push` + corte em 50k) | Coletor leve atual (`counts` apenas) |
| --- | ---: | ---: |
| 10.000 | 4,25ms | 1,96ms |
| 50.000 | 14,74ms | 10,51ms |
| 60.000 | 1.132,63ms | 11,18ms |
| 100.000 | 8.375,97ms | 21,76ms |
| 200.000 | Estourou timeout de 10s | Nao aplicavel nessa rodada |

Conclusao: a instrumentacao anterior podia, sim, virar parte relevante do problema em sessoes longas ou em fluxos com muitos renders/eventos, especialmente ao ultrapassar 50k eventos. A correcao atual remove tambem os contadores do modo padrao: sem `window.__OMNI_SLIDES_PERF_ENABLED__ = true`, o caminho de render/drag nao grava nada.

## Correcao preventiva aplicada

Os comparadores de memoizacao de blocos/graficos usavam `JSON.stringify` diretamente:

- `BlockRenderer`: `prev === next || JSON.stringify(prev) === JSON.stringify(next)`
- `ChartCanvas`: `prev === next || JSON.stringify(prev) === JSON.stringify(next)`

Isso mantinha a comparacao por conteudo, mas podia serializar repetidamente blocos pesados quando referencias mudavam. Foi substituido por assinatura cacheada em `WeakMap`, preservando o comportamento e reduzindo custo de comparacoes repetidas.

Tambem foi adicionado um polyfill minimo de `process.env` no Vite. Logs antigos do navegador mostraram `ReferenceError: process is not defined` vindo de `react-rnd` durante montagem de `Draggable`, exatamente no caminho com muitos blocos. Esse erro nao apareceu no build, mas era um risco claro para a fluidez do editor em dev/Electron.

### Investigacao do `process.env` em DEV

Foi checado o historico de `vite.config.ts`:

- `7dfb55a` adicionou apenas `process.env.NODE_ENV` em `define` e em `optimizeDeps.esbuildOptions.define`.
- Essa primeira correcao era incompleta para DEV porque dependencias pre-otimizadas pelo Vite, como `react-rnd`, ainda podiam acessar o objeto global `process` diretamente antes da substituicao fina de `process.env.NODE_ENV`.
- Nao houve regressao nem commit posterior desfazendo a correcao. O problema era cobertura incompleta.
- `39b18d9` ampliou a cobertura para `process`, `process.env` e `process.env.NODE_ENV`, tanto no `define` principal quanto no `optimizeDeps.esbuildOptions.define`, cobrindo build e servidor de desenvolvimento.

Validacao desta etapa:

- `http://127.0.0.1:8080` respondeu `200`.
- O modulo servido em DEV para `src/lib/slidesPerfCounters.ts` ja contem a auto-inicializacao nova de `window.__OMNI_SLIDES_PERF__`.
- O prebundle atual de `node_modules/.vite/deps/react-rnd.js` nao apresentou ocorrencias remanescentes de `process.env`/`NODE_ENV` na checagem local.

## Resultado da investigacao de slides quentes

O cache de "ultimos slides quentes" do fullscreen nao mantem editores/canvases montados. O codigo atual apenas adiciona os IDs recentes e chama `warmSlideThumbnail(item)`.

Isso aquece miniatura/dados, mas nao impede remontagem do `CustomSlideEditor` e dos `ChartCanvas` ao alternar slides no fullscreen. Como o `CustomSlideEditor` usa um store global unico (`editorStore.ts`), manter 2-3 instancias vivas em paralelo exigiria uma refatoracao maior para store por instancia. Portanto, a Fase 13.5 nao cobre esse caminho especifico hoje.

### Decisao: adiado, nao esquecido

Decisao desta fase: nao corrigir o cache de slides quentes agora.

Razao tecnica: o editor personalizado usa um store global unico em `src/components/pricing/custom/editorStore.ts`. Manter os ultimos 2-3 slides realmente "quentes" exigiria manter varias instancias de `CustomSlideEditor`/`ChartCanvas` montadas ao mesmo tempo, cada uma com sua propria instancia de store, selecao, historico undo/redo, binding de `onChange`, atalhos, registro de canvas e estado temporario de drag/resize. Fazer isso sem isolar o store por slide criaria risco alto de um editor sobrescrever ou reagir ao estado do outro.

Como revisitar no futuro:

1. Extrair uma fabrica de store por instancia de editor, em vez do singleton atual.
2. Permitir que o fullscreen mantenha 2-3 `CustomSlideEditor` montados em modo oculto/hibernado.
3. Suspender listeners caros e interacoes nos editores ocultos, mantendo apenas estado/render quente.
4. Garantir que exportacao, undo/redo, selecao e Yjs apontem para a instancia correta do slide ativo.

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
4. Para uma medicao leve, no console, ligar e limpar a coleta:

```js
window.__OMNI_SLIDES_PERF_ENABLED__ = true
window.__OMNI_SLIDES_PERF__ = { counts: {}, events: [], measures: [] }
```

5. Inserir um grafico `Linha`.
6. Ler os contadores:

```js
window.__OMNI_SLIDES_PERF__.counts
```

Para capturar tambem eventos e duracoes, ligue o modo detalhado antes de recarregar a tela:

```js
window.__OMNI_SLIDES_PERF_ENABLED__ = true
window.__OMNI_SLIDES_PERF_DETAILED__ = true
window.__OMNI_SLIDES_PERF__ = { counts: {}, events: [], measures: [] }
location.reload()
```

Indicadores principais:

- `counts.ChartCanvas`: quantos `ChartCanvas` executaram.
- `counts["ChartCanvas:<blockId>"]`: quais blocos renderizaram.
- `counts["slides.chartCanvas.mount"]`: quantos canvases montaram de fato no modo leve.
- `counts["slides.addChart.clickToReturn"]` e `counts["slides.addChartBlockAction"]`: quantas vezes o caminho de add foi acionado.
- `counts["slides.calc.cacheHit"]` e `counts["slides.calc.workerFallback"]`: se o novo grafico usou cache ou fallback.
- No modo detalhado, `measures` mostra duracao real de `slides.addChart.clickToReturn`, `slides.addChartBlockAction`, `slides.worker.duration` e `slides.calc.workerClient`.

Comandos uteis no console:

```js
// Resumo rapido de renders por componente.
window.__OMNI_SLIDES_PERF__.counts
```

```js
// Quantos ChartCanvas renderizaram ao menos uma vez.
Object.entries(window.__OMNI_SLIDES_PERF__.counts)
  .filter(([key]) => key.startsWith("ChartCanvas:"))
  .length
```

```js
// Eventos de mount real de ChartCanvas.
// Requer window.__OMNI_SLIDES_PERF_DETAILED__ = true antes do reload.
window.__OMNI_SLIDES_PERF__.events
  .filter((event) => event.name === "slides.chartCanvas.mount")
```

```js
// Duracoes medidas do worker / cache client.
// Requer window.__OMNI_SLIDES_PERF_DETAILED__ = true antes do reload.
window.__OMNI_SLIDES_PERF__.measures
  .filter((measure) => measure.name === "slides.worker.duration" || measure.name === "slides.calc.workerClient")
```

```js
// Ver se houve cache hit ou fallback sincronico.
const c = window.__OMNI_SLIDES_PERF__.counts
({
  cacheHit: c["slides.calc.cacheHit"] ?? 0,
  workerFallback: c["slides.calc.workerFallback"] ?? 0
})
```

```js
// Marcos especificos do clique de inserir grafico.
// Requer window.__OMNI_SLIDES_PERF_DETAILED__ = true antes do reload.
window.__OMNI_SLIDES_PERF__.measures
  .filter((measure) => measure.name.includes("addChart"))
```

## Conclusao

A hipotese de cascata agora pode ser confirmada com contadores internos. Pelo codigo, o caminho local de `addChartBlockAction` preserva as referencias dos blocos existentes (`blocks: [...c.blocks, blk]`), entao a cascata nao deveria chegar ao `ChartCanvas` se a memoizacao estiver funcionando. Se os marks mostrarem que todos os `ChartCanvas` renderizam, a origem provavel passa a ser alguma etapa posterior recriando os objetos de bloco, ou o comparador/memo sendo invalidado por props auxiliares.

Para o problema de troca de slide no fullscreen, a causa esta confirmada por leitura: os slides "quentes" nao ficam montados; apenas miniaturas sao aquecidas.
