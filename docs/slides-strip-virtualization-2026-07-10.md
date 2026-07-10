# Slides strip virtualization - 2026-07-10

## Contexto

A esteira de slides renderizava `ScaledPreview`/`SlidePreview` para todos os slides do deck ao mesmo tempo. Em decks com 30-40 slides, isso significava recalcular previews reais fora da tela, incluindo PVM, Budget Evo, filtros e canvas customizado.

## Correcao aplicada

- Adicionada uma janela virtual leve para previews.
- Os cards continuam montados para preservar:
  - scroll;
  - selecao do slide atual;
  - drag-and-drop com `@dnd-kit`;
  - badges de preflight/comentarios.
- Fora da janela visivel + buffer, o card mostra apenas um retangulo cinza leve no lugar do preview.
- `ScaledPreview` passou a registrar contador opcional em `window.__OMNI_SLIDES_PERF__`, facilitando novas medicoes.

## Areas cobertas

| Area | Antes | Depois |
| --- | --- | --- |
| Esteira principal | Todo `FlowCard` renderizava `ScaledPreview` | Apenas indices visiveis + overscan renderizam `ScaledPreview` |
| Strip lateral do editor fullscreen | Todo `StripThumbnail` renderizava `ScaledPreview` | Apenas indices visiveis + overscan renderizam `ScaledPreview` |
| Itens fora da janela | Preview pesado fora da tela | Placeholder leve com proporcao do slide |
| DnD | Todos os itens montados | Todos os itens continuam montados; apenas preview pesado e virtualizado |

## Antes/depois esperado

Em um deck com 30-40 slides:

| Metrica | Antes | Depois esperado |
| --- | ---: | ---: |
| `ScaledPreview` montados ao carregar a esteira principal | 30-40 | ~8-12, conforme altura da janela |
| `ScaledPreview` montados na strip fullscreen | 30-40 | ~6-10, conforme altura da janela |
| Trabalho fora da tela | Alto | Baixo; placeholder leve |

## Medicao

Nao foi possivel coletar React DevTools Profiler automatizado neste ambiente, pela mesma limitacao ja encontrada na etapa anterior: o navegador headless nao expôs a porta de depuracao e Playwright nao ficou acessivel pelo REPL por restricao de permissao fora do workspace.

Roteiro para medir no Electron/DevTools:

1. Abrir a aba Slides com um deck de 30-40 slides.
2. Ativar `window.__OMNI_SLIDES_PERF__ = { counts: {}, events: [] }` no DevTools.
3. Recarregar a aba.
4. Conferir `window.__OMNI_SLIDES_PERF__.counts.ScaledPreview`.
5. Rolar a esteira e confirmar que novos previews entram na janela sob demanda.
6. Repetir dentro do editor fullscreen.

## Resultado tecnico

A virtualizacao reduz o trabalho de preview para a parte visivel da esteira sem remover os elementos sortables do DOM. Isso preserva o comportamento de drag-and-drop e selecao, enquanto evita renderizar previews caros fora da tela.
