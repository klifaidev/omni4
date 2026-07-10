# Slides editor open performance - 2026-07-10

## Objetivo

Investigar o atraso perceptivel ao abrir o editor personalizado da aba Slides, antes de aplicar qualquer correcao. A hipotese principal era recomputacao sincronica de dados de graficos no primeiro mount do `ChartCanvas`, sem cache compartilhado com a miniatura da esteira.

## Resultado

Status: inconclusivo para correcao automatica.

Nao foi possivel confirmar a causa exata com React DevTools Profiler e Chrome/Electron Performance neste ambiente. Por isso, nenhuma correcao foi aplicada nesta etapa.

## Evidencias coletadas

| Item | Status | Evidencia |
| --- | --- | --- |
| Servidor local | OK | `http://127.0.0.1:8080` respondeu `200`. |
| Chrome headless com porta de depuracao | Falhou | A instancia aberta com remote debugging nao gerou `DevToolsActivePort`, e `http://127.0.0.1:9227/json/version` retornou erro de conexao. |
| Navegador interno | Parcial | A aba `#/slides` abriu e mostrou o deck local com 2 slides, incluindo um slide personalizado. |
| React DevTools Profiler / Performance | Nao coletado | A ferramenta de navegador disponivel neste ambiente permite DOM, screenshot e logs, mas nao expoe diretamente o React Profiler nem uma gravacao de Performance da main thread. |
| Entrada no editor fullscreen | Falhou no ambiente de teste | Ao acionar `Abrir editor em tela cheia`, a tela ficou escura/vazia no navegador interno. O log mostrou warning React de chave duplicada: `Encountered two children with the same key, 48cab7ac-12d9-4996-937d-34a705564d61`, dentro do fluxo de `Dialog` em `SlidesBeta`. |
| Cache compartilhado preview/editor | Nao encontrado | `SlidePreview.tsx` renderiza slide custom com `CustomCanvasReadOnly`, que usa `BlockRenderer`. `BlockRenderer` delega graficos para `ChartCanvas`. O editor fullscreen monta outro `CustomSlideEditor` e outros `ChartCanvas`. Os `useMemo` sao locais ao componente; nao ha cache module-level compartilhado entre miniatura e editor. |

## Caminho de codigo relevante

| Arquivo | Evidencia |
| --- | --- |
| `src/components/pricing/SlidePreview.tsx` | `ScaledPreview` renderiza `CustomCanvasReadOnly` para slides customizados; previews de Budget/Bridge tambem calculam dados com `computeBudgetEvoMonthly`, `applyFilters` e `calcPVM`. |
| `src/components/pricing/custom/PresentationMode.tsx` | `CustomCanvasReadOnly` ordena todos os blocos do slide e renderiza cada um com `BlockRenderer`. |
| `src/components/pricing/custom/BlockRenderer.tsx` | Blocos de bridge calculam PVM via `applyOmniFilters` + `calcPVM`; blocos de grafico delegam para `ChartCanvas`. |
| `src/components/pricing/custom/chart/ChartCanvas.tsx` | No mount, seleciona linhas da fonte, aplica filtros/cross-filters e calcula series/rankings/PVM dentro de `useMemo`. Esses resultados nao sao reaproveitados fora da instancia atual do componente. |
| `src/pages/SlidesBeta.tsx` | O fullscreen editor monta `FullscreenCustomEditor`, que por sua vez monta `CustomSlideEditor` para o slide custom selecionado. |

## Interpretacao

A hipotese de recomputacao redundante e plausivel: o preview da esteira e o editor montam arvores independentes de `BlockRenderer`/`ChartCanvas`, entao um grafico que ja foi calculado para a miniatura pode ser calculado novamente ao abrir o editor.

Ainda assim, ela nao esta comprovada como a causa dos 5 segundos. O atraso pode estar em uma ou mais destas fontes:

- Calculo sincronico de dados (`applyFilters`, `calcPVM`, agregacoes e ranking) no mount dos graficos.
- Custo de primeira renderizacao/layout dos graficos no Recharts.
- Montagem pesada do `Dialog` fullscreen e do `CustomSlideEditor`.
- Estado local com IDs duplicados no deck, sugerido pelo warning de chave duplicada observado no teste.
- Algum efeito de colaboracao/Yjs ou reflexao de estado durante a abertura.

## Decisao desta etapa

Nao aplicar cache nem outra correcao ainda. O pedido desta etapa era confirmar antes de corrigir, e a confirmacao por profiler/performance nao foi obtida.

## Proxima medicao recomendada

1. Abrir o app no Electron/Chrome com React DevTools Profiler disponivel.
2. Usar um deck de teste com 20-30 blocos, sendo varios graficos.
3. Ativar os contadores ja existentes no console antes de abrir o editor:

```js
window.__OMNI_SLIDES_PERF__ = { counts: {}, events: [] }
```

4. Gravar a abertura do editor personalizado.
5. Conferir:
   - tempo ate o editor ficar interativo;
   - commits do `CustomSlideEditor`;
   - contagem de renders de `ChartCanvas`, `BlockRenderer` e `ScaledPreview`;
   - tarefas longas na main thread atribuiveis a `applyFilters`, `calcPVM`, agregacoes ou Recharts.

## Correcao provavel se a hipotese for confirmada

Criar um cache leve para dados derivados de graficos, compartilhado entre preview e editor, com chave estavel baseada em:

- `slideId`;
- `block.id`;
- tipo/fonte de dado;
- filtros e periodos;
- medida/dimensoes do grafico;
- versao/assinatura da base local carregada.

O cache deve ser invalidado quando a base ou os filtros mudarem. Se a medicao mostrar que o gargalo principal e Recharts/layout, a correcao adequada provavelmente sera diferir a primeira renderizacao pesada, usar skeleton progressivo ou renderizar graficos abaixo da dobra depois que o editor ja estiver interativo.

