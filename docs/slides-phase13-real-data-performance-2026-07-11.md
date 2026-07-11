# Slides Phase 13 - Medicao com base carregada

Data: 2026-07-11

## Contexto

A medicao anterior de "inserir grafico novo" foi feita sem base local carregada, entao o bloco caiu em empty-state e nao exercitou o caminho pesado de dados. Esta repeticao carregou a base demo pelo fluxo real do app em `Upload / Bases`, que gerou:

- Real: 7.200 linhas
- Budget: 8.640 linhas
- Periodo: 12 meses, Jul/25 a Jun/26

O editor foi aberto na aba Slides em modo tela cheia, usando slides personalizados ja presentes no deck. A medicao abaixo usa marcos observaveis de UI/DOM no navegador interno.

## Limitacoes do ambiente

| Item | Resultado |
| --- | --- |
| React DevTools Profiler | Nao disponivel neste ambiente automatizado. |
| Aba Performance do Chrome/Electron | Nao disponivel no navegador interno usado pelo Codex. |
| `window.__OMNI_SLIDES_PERF__` pos-carregamento | Falhou: `Cannot add property __OMNI_SLIDES_PERF__, object is not extensible`. |
| `Object.defineProperty(window, "__OMNI_SLIDES_PERF__")` | Falhou pelo mesmo motivo: `window` nao extensivel. |
| Injecao antes do carregamento | A API `addInitScript` nao esta exposta pelo subset Playwright do navegador interno. |
| Worker por `performance.getEntriesByType("resource")` | Nao apareceu como recurso observavel no navegador interno, apesar do codigo executar `computeChartSeriesAsync` via `slideCalc.worker.ts` quando ha `Worker` disponivel. |

Conclusao: os tempos abaixo sao reais para a UI observada, mas a quebra interna exata de React render/commit, custo de Recharts e tempo puro de JavaScript ainda precisa ser confirmada em Electron/Chrome real com Profiler.

## Inserir Grafico Novo Com Dados Reais

Fluxo medido: editor personalizado em tela cheia, base demo carregada, clique no bloco `Linha`.

| Rodada | Estado inicial | Retorno do clique | Canvas/SVG/Recharts novo visivel | Inspector pronto | Empty-state de dados | Observacao |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| 1 | 20 chart canvases | 4.028 ms | 4.117 ms | 4.117 ms | Nao | Real/KE30 renderizado, sem mensagem de dados ausentes. |
| 2 | 22 chart canvases | 4.061 ms | 4.134 ms | 4.134 ms | Nao | Mesmo padrao apos aquecimento. |
| 3 | 24 chart canvases | 4.004 ms | 4.115 ms | 4.115 ms | Nao | Mesmo padrao apos mais blocos no slide. |

Resumo:

- Mediana de retorno do clique: 4.028 ms.
- Mediana ate canvas/inspector: 4.117 ms.
- Os marcos de canvas, SVG/Recharts e inspector aparecem juntos, depois do bloqueio do clique.
- Nao houve skeleton/loading perceptivel entre clique e render final.

Interpretacao:

- Com base real, o sintoma e pior do que a medicao anterior sem dados.
- A UI fica bloqueada por cerca de 4s antes do novo grafico ficar observavel.
- Mesmo que o calculo de serie seja assinc via Worker no codigo (`ChartCanvas` -> `computeChartSeriesAsync`), ainda ha custo sincrono relevante no fluxo de adicionar/renderizar o bloco, possivelmente por re-render do editor inteiro, montagem de muitos `ChartCanvas`/Recharts e/ou trabalho sincronico previo ao primeiro frame.

## Quebra Por Etapa - Inserir Grafico

| Etapa solicitada | Evidencia mensuravel neste ambiente | Resultado |
| --- | --- | --- |
| `addBlock` / `newChartBlock` | Nao ha instrumentacao interna acessivel sem alterar o app; o clique so retorna apos o trabalho bloqueante. | Incluido no bloco de 4.004-4.061 ms ate o retorno do clique. |
| Atualizacao da store | Nao separavel por DOM/Playwright sem Profiler ou marks internos. | Incluida no mesmo bloco de clique bloqueante. |
| Render do canvas | Primeiro aumento de `[data-chart-canvas]`, SVG e `.recharts-*`. | 4.115-4.134 ms. |
| Render do inspector | Texto `FONTE DE DADOS` visivel. | 4.115-4.134 ms. |
| Inicializacao do `ChartCanvas` | Primeiro canvas/SVG/Recharts observavel. | 4.115-4.134 ms; nao separavel do commit React sem Profiler. |

## Trocar Slide Dentro Do Editor

Fluxo medido: alternar no strip fullscreen entre slide 1 e slide 2.

| Acao | Antes | Depois | Retorno do clique | Header atualizado | Mudanca de canvases/Recharts | Colaboracao ativa |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Slide 1 -> Slide 2 | 26 canvases / 78 Recharts | 0 canvases / 0 Recharts | 300 ms | 343 ms | 343 ms | Nao |
| Slide 2 -> Slide 1 | 0 canvases / 0 Recharts | 26 canvases / 78 Recharts | 566 ms | 649 ms | 649 ms | Nao |
| Slide 1 -> Slide 2 | 26 canvases / 78 Recharts | 0 canvases / 0 Recharts | 292 ms | 333 ms | 333 ms | Nao |
| Slide 2 -> Slide 1 | 0 canvases / 0 Recharts | 26 canvases / 78 Recharts | 555 ms | 632 ms | 632 ms | Nao |

Resumo:

- Ir para slide sem graficos: ~333-343 ms ate estado visivel.
- Voltar para slide com muitos graficos: ~632-649 ms ate estado visivel.
- A sala colaborativa/Yjs nao estava ativa; nao havia sinais visuais de sala, salvamento ou sincronizacao.

Interpretacao:

- A troca lenta nao parece causada por Yjs/colaboracao fora de sala ativa.
- O custo cresce quando o destino monta muitos graficos/Recharts.
- O cache de ultimos slides "quentes" nao evitou a remontagem observada nesse caminho fullscreen, ou nao esta cobrindo este caso com esse volume de blocos.

## Testes

Antes da correcao, a suite completa foi rodada 3 vezes:

| Rodada | Resultado |
| --- | --- |
| 1 | Passou: 19 arquivos, 84 testes. |
| 2 | Passou: 19 arquivos, 84 testes. |
| 3 | Falhou em `src/lib/supabaseYjsProvider.test.ts`, caso de reconexao: esperava `["send_failed"]`, recebeu `[]`. |

Causa encontrada:

- O provider chama `onSendFailure` depois do timer de throttle, criptografia do update e tentativa de envio.
- O teste usava `await wait(30)`, que era uma espera fixa curta demais para Web Crypto + timer em algumas execucoes.
- Nao era a falha do caso "update corrompido"; esse teste passou em todas as rodadas.

Correcao aplicada:

- `src/lib/supabaseYjsProvider.test.ts` agora usa `waitFor(() => failures.length > 0)` antes da assercao, removendo a temporizacao fragil sem mudar o provider.

Depois da correcao:

| Validacao | Resultado |
| --- | --- |
| `npm run test -- src/lib/supabaseYjsProvider.test.ts` | Passou: 5 testes. |
| `npm run test` rodada 1 | Passou: 19 arquivos, 84 testes. |
| `npm run test` rodada 2 | Passou: 19 arquivos, 84 testes. |
| `npm run test` rodada 3 | Passou: 19 arquivos, 84 testes. |

## Conclusao

Os numeros reais com dados carregados mostram que "inserir grafico novo" ainda esta perceptivelmente lento: cerca de 4,1s ate o novo grafico/inspector aparecer. A troca de slide tambem continua acima do alvo de sensacao instantanea, especialmente ao voltar para slide com muitos graficos (~0,63s).

Recomendacao para a proxima investigacao: instrumentar internamente o editor com marks leves de performance em modo dev, cobrindo `addBlock`, commit do `CustomSlideEditor`, mount do `ChartCanvas`, inicio/fim do worker e mount do inspector. Sem essa instrumentacao ou sem Electron/Chrome real com Profiler, nao da para separar com precisao quanto desses 4s e store/update React, quanto e Recharts e quanto e qualquer fallback sincronico de calculo.
