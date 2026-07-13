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

## Superficies de acao

| Superficie | Deve conter | Nao deve conter |
| --- | --- | --- |
| Toolbar flutuante do bloco | Acoes rapidas e frequentes do objeto selecionado: estilo, camada, duplicar, comentar e menu de acoes raras/destrutivas. | Configuracao detalhada de dados, filtros, medidas ou campos longos. |
| Inspector lateral | Propriedades completas do bloco: posicao, tamanho, conteudo, filtros, fonte de dados, aparencia e opcoes especificas do tipo. | Atalhos duplicados da toolbar como duplicar, excluir, trazer para frente ou enviar para tras. |
| Painel de camadas | Ordem, visibilidade, bloqueio e selecao de todos os blocos do slide. | Edicao de conteudo ou configuracoes especificas do bloco. |
| Rail da paleta | Navegacao por categorias de descoberta: Favoritos, Modelos, Graficos, Elementos, Story, Omni e Assets. | Configuracoes do bloco selecionado ou comandos de camada. |

Icones sem texto visivel precisam de `aria-label` e tooltip com verbo especifico. Evitar labels genericos como "seta acima"; preferir "Trazer uma camada para frente" ou "Reordenar coluna acima", de acordo com o contexto.
