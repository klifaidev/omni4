# Slides drag performance - 2026-07-10

## Contexto

Relato: ao arrastar um bloco no `CustomSlideEditor`, havia atraso perceptivel antes do elemento acompanhar o mouse, principalmente em slides com muitos blocos/graficos.

## Hipotese analisada

O handler `onDrag` do `Rnd` chamava `computeGuides()` em cada evento de movimento. `computeGuides()` calculava o snap corretamente, mas tambem chamava `setGuides()` diretamente. Como o evento de drag dispara muitas vezes por segundo, isso podia forcar re-render do `CustomSlideEditor` em frequencia maior que a taxa de frames da tela.

Trecho confirmado no codigo antes da correcao:

- `onDrag` -> `computeGuides(ids, d.x, d.y, blk.w, blk.h)`
- `computeGuides` -> `setGuides(snap.guides)`

## Correcao aplicada

- O calculo de snap continua sincrono e imediato, preservando precisao das guias e do alinhamento.
- A atualizacao visual das linhas guia agora passa por `requestAnimationFrame`.
- Ha no maximo uma chamada de `setGuides` por frame de tela.
- Estados de guias identicos sao ignorados, evitando renders redundantes.
- `onDragStop` e `onResizeStop` cancelam qualquer frame pendente e limpam as guias imediatamente.

## Yjs e posicao controlada

O `Rnd` segue controlado por `blk.x/blk.y`, mas a edicao local de posicao no fluxo Yjs so e emitida em `onDragStop` para este caminho. Portanto, a reflexao local do Yjs nao deveria atualizar `config.blocks` a cada pixel durante o drag.

O risco remanescente e uma atualizacao remota chegar durante um drag ativo. A correcao principal reduz drasticamente o re-render causado pelas guias; se ainda houver relato de "briga" de posicao em sessao colaborativa real, o proximo endurecimento recomendado e pausar a aplicacao visual de patches remotos para o bloco atualmente arrastado ate o `onDragStop`.

## Medicao

Tentativa local:

- App iniciado em `http://127.0.0.1:8080/#/slides`.
- Chrome headless isolado tentado com `--remote-debugging-port`, mas a porta de depuracao nao ficou acessivel neste ambiente.
- Playwright tambem nao ficou utilizavel pelo REPL por restricao de permissao fora do workspace.

Resultado: nao foi possivel coletar uma gravacao real do React DevTools Profiler neste ambiente.

## Roteiro para medir no Electron/DevTools

1. Abrir a aba Slides.
2. Criar ou abrir um slide customizado com 20-30 blocos, incluindo graficos.
3. Abrir React DevTools Profiler.
4. Iniciar gravacao.
5. Arrastar um bloco por aproximadamente 1 segundo, atravessando regioes onde guias aparecem.
6. Parar a gravacao.
7. Conferir:
   - renders de `CustomSlideEditor`;
   - duracao media por render;
   - se `BlockRenderer` e `ChartCanvas` permanecem estaveis.

Meta esperada apos a correcao:

- `CustomSlideEditor` nao deve renderizar a cada evento bruto do mouse.
- A frequencia de render causada por guias deve ficar limitada ao frame rate visual.
- `BlockRenderer`/`ChartCanvas` nao devem renderizar em cascata se os blocos nao mudarem.

## Validacao automatizada

- Teste adicionado para `computeSnap`, garantindo que snap e coordenadas de guias continuam corretos.
- Testes existentes de Yjs/provider continuam cobrindo sincronizacao e convergencia.

## Conclusao

A causa mais provavel do atraso foi confirmada por leitura direta do codigo: `setGuides()` era chamado em cada evento de drag. A correcao preserva a funcionalidade de guias e reduz a atualizacao de estado para no maximo uma vez por frame.
