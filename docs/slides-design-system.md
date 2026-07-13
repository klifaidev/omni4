# Slides Design System

## Materiais

| Token/classe | Uso | Intencao |
| --- | --- | --- |
| `surface-base` / `bg-surface-base` | Area de trabalho e fundo estrutural | Plano mais baixo, sem competir com conteudo. |
| `surface-panel` / `bg-surface-panel` | Paineis fixos como esteira e inspector | Separa painel da tela base com leve variacao tonal. |
| `surface-raised` / `bg-surface-raised` | Cards, secoes e blocos dentro de painel | Cria agrupamento sem parecer modal. |
| `surface-overlay` / `bg-surface-overlay` | Flyouts, popovers, menus e painel de blocos | Camada flutuante com sombra mais perceptivel. |

As classes `surface-panel`, `surface-raised` e `surface-overlay` tambem aplicam sombra e inset highlight. Preferir essas classes em superficies da aba Slides.

## Tipografia

| Classe | Tamanho/peso | Uso |
| --- | --- | --- |
| `slides-type-title` | `16px / 600` | Titulo de slide, nome principal do item selecionado, ponto focal do painel. |
| `slides-type-section` | `13px / 600` | Nome de secao, grupo de inspector, titulo de popover/flyout. |
| `slides-type-label` | `10px / 600 uppercase` | Label de campo, categoria, metadado curto. |
| `slides-type-helper` | `11px / 400` | Texto auxiliar, descricao curta e empty state secundario. |
| `slides-type-badge` | `10px / 600` | Badges compactos, contadores e estados. |

Evitar criar novos tamanhos para controles da aba Slides sem antes tentar encaixar nesses niveis.
