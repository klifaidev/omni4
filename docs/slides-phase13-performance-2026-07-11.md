# Slides Fase 13 - Performance final - 2026-07-11

## Objetivo

Fechar a Fase 13 medindo os cinco sintomas de fluidez reportados na aba Slides:

1. tempo para abrir a aba Slides;
2. tempo para abrir o editor personalizado;
3. tempo para trocar de slide dentro do editor;
4. tempo para inserir um grafico novo ate a interface voltar a responder;
5. tempo de resposta ao clicar em um slide especifico na esteira.

## Contexto comparativo

| Sintoma | Antes documentado | Fonte |
| --- | ---: | --- |
| Abrir aba Slides | Sem numero historico confiavel. Havia trabalho redundante de preview fora da tela em decks grandes. | `docs/slides-strip-virtualization-2026-07-10.md` |
| Abrir editor personalizado | Relato original de aproximadamente 5s; medicao anterior ficou inconclusiva por falha de key duplicada no Dialog. | `docs/slides-editor-open-performance-2026-07-10.md` |
| Trocar slide dentro do editor | Sem numero historico confiavel. A Fase 13.4 removeu remount forcado por `key={current.id}` e aqueceu slides recentes. | Fase 13.4 |
| Inserir grafico novo | Sem numero historico confiavel. Relato: primeiro calculo sem cache travava a interface. A Fase 13.4 moveu calculos pesados para Web Worker. | Fase 13.4 |
| Clicar em slide na esteira | Sem numero historico confiavel. A virtualizacao e miniatura leve reduziram trabalho de preview. | `docs/slides-strip-virtualization-2026-07-10.md` |

## Metodo

Ambiente:

- app local em `http://127.0.0.1:8080/#/slides`;
- navegador integrado do Codex;
- deck local inicialmente com 2 slides; para medir troca dentro do editor, foi criado temporariamente um segundo slide customizado pela propria UI;
- sem base KE30 carregada neste ambiente, entao os blocos de grafico entram em empty-state de base local.

Limitacoes:

- React DevTools Profiler real nao ficou acessivel neste ambiente, mesma limitacao ja registrada nos relatorios anteriores.
- O runtime do navegador nao permitiu inicializar `window.__OMNI_SLIDES_PERF__` manualmente por `evaluate`; os contadores lidos permaneceram vazios nesta sessao.
- Portanto, a medicao abaixo e de tempo de interacao UI por automacao de navegador, nao uma gravacao de commits React.

## Resultados

Cinco rodadas, em milissegundos:

| Rodada | Abrir aba Slides | Clicar slide na esteira | Abrir editor custom | Trocar custom -> custom | Inserir grafico novo |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 242 | 404 | 469 | 824 | 2383 |
| 2 | 197 | 394 | 476 | 867 | 1333 |
| 3 | 180 | 401 | 502 | 846 | 1353 |
| 4 | 187 | 387 | 498 | 811 | 1366 |
| 5 | 179 | 386 | 489 | 866 | 1307 |

Resumo:

| Sintoma | Media | Mediana | Leitura |
| --- | ---: | ---: | --- |
| Abrir aba Slides | 197ms | 187ms | OK no deck local. |
| Clicar slide na esteira | 394ms | 394ms | OK; sem travamento perceptivel no deck local. |
| Abrir editor personalizado | 487ms | 489ms | Melhor que o relato original de ~5s. |
| Trocar entre dois slides custom no editor | 843ms total ida+volta | 846ms total | OK, mas nao instantaneo; cada perna ficou em ~400-440ms. |
| Inserir grafico novo | 1548ms | 1353ms | Ainda perceptivel. Primeira rodada teve aquecimento pior; depois estabilizou em ~1,3s. |

## Interpretacao

Os sintomas de abertura da aba, abertura do editor e clique na esteira estao bons no deck local disponivel. A troca entre slides customizados melhorou o suficiente para nao parecer travada, mas ainda nao e instantanea.

O unico sintoma que ainda merece investigacao especifica e inserir grafico novo. Mesmo sem base local carregada, a UI levou cerca de 1,3s apos o aquecimento para chegar ao inspector do grafico. Isso sugere que o custo restante pode estar em montagem/estado/layout do `CustomSlideEditor` e do inspector, nao necessariamente no calculo de dados que ja foi movido para worker.

## Status dos 5 sintomas

| Sintoma | Status final |
| --- | --- |
| Abrir aba Slides | OK no ambiente medido. |
| Abrir editor personalizado | OK no ambiente medido. |
| Trocar de slide dentro do editor | OK com ressalva; nao instantaneo, mas sem atraso grave. |
| Inserir grafico novo | Reabrir investigacao. Ainda perceptivel em ~1,3s apos aquecimento. |
| Clicar slide na esteira | OK no ambiente medido. |

## Proxima investigacao recomendada

Focar exclusivamente em "inserir grafico novo":

1. medir com React DevTools Profiler em ambiente Electron/Chrome real;
2. separar tempo de `addBlock/newChartBlock`, atualizacao da store, render do canvas, render do inspector e inicializacao de `ChartCanvas`;
3. confirmar se o custo esta no inspector/estado visual ou em algum calculo ainda sincrono;
4. se for montagem visual, considerar inserir o bloco imediatamente com skeleton e adiar inspector pesado para o frame seguinte.

## Validacao

- `npm run build`: passou.
- `npm run test -- src/lib/slideThumbnailCache.test.ts src/lib/slideCalcCache.test.ts`: passou durante a etapa.
- `npm run test`: primeira execucao teve uma falha intermitente em `src/lib/supabaseYjsProvider.test.ts` no caso de update criptografado corrompido; o mesmo arquivo isolado passou em seguida, e a repeticao da suite completa tambem passou com 19 arquivos e 84 testes.
- Build final de producao: passou.
