# Colaboracao persistente - seguranca e superficie de dados

Este documento descreve a superficie de dados da Sala Colaborativa Persistente da aba Slides. Ele serve como material de apoio para revisao juridica, LGPD e seguranca da informacao. Nao substitui a revisao formal dessas areas.

## Resumo tecnico

A sala colaborativa sincroniza a estrutura do deck, layout, textos manuais, comentarios e edicao simultanea entre participantes. Bases brutas e arquivos de origem continuam locais em cada computador.

Cada sala possui uma chave de conteudo AES-GCM de 256 bits, gerada aleatoriamente no cliente quando a sala e criada. Essa chave nao e derivada diretamente de um unico codigo. Em vez disso, ela e "embrulhada" duas vezes: uma copia cifrada com chave derivada do codigo de editor e outra cifrada com chave derivada do codigo de visualizador. Assim, editor e visualizador destravam a mesma chave de conteudo final sem o servidor receber os codigos em texto puro.

O Supabase armazena snapshots, estado compactado do Yjs e comentarios como payloads criptografados. A colaboracao ao vivo usa Supabase Realtime; os updates Yjs e o Awareness de texto tambem sao criptografados antes do broadcast.

## O que trafega criptografado

| Camada | Conteudo | Como trafega | Observacao |
| --- | --- | --- | --- |
| Snapshot persistente | Estrutura do deck, ordem dos slides, tipos de slide, filtros, periodos, layout, blocos customizados, textos manuais, notas e configuracao visual | `collab_room_snapshots.encrypted_payload` com AES-GCM | O snapshot atual e salvo como estado Yjs compactado (`payload_type: "yjs-state"`) dentro do envelope da sala. |
| Updates Yjs ao vivo | Alteracoes incrementais em texto, blocos, posicao, tamanho, ordem e configuracao do editor customizado | Broadcast Realtime com `payload_type: "yjs-update"` criptografado | O envelope externo contem `id`, `senderId` e `sentAt`; o conteudo do update fica cifrado. |
| Campos de texto livres | Titulos, subtitulos, notas do apresentador, textos de insight/storytelling e campos equivalentes | Dentro de Y.Text, transmitido como update Yjs criptografado | A digitacao incremental nao trafega em texto aberto no provider Yjs. |
| KPI manual | `manualValue` de bloco KPI manual | Dentro de Y.Text, transmitido como update Yjs criptografado | Este campo pode conter valor real de negocio digitado manualmente e usa o mesmo envelope criptografado. |
| Comentarios persistidos | Texto do comentario, autor, cor do autor, status logico e metadados do comentario | `collab_room_comments.encrypted_payload` com AES-GCM | A tabela tambem guarda em claro `room_id`, `slide_id`, `block_id`, `status`, `created_at` e `updated_at` para indexacao e listagem. |
| Awareness de texto Yjs | Nome, cor, campo selecionado, bloco, slide e posicao de cursor/selecionado em campo de texto | Broadcast Realtime com `payload_type: "yjs-awareness"` criptografado | A decisao atual e criptografar Awareness por conter identidade e metadados de cursor. |
| Chave de conteudo da sala | Chave AES-GCM usada para snapshots, comentarios e updates Yjs | `keyBundle.envelopes[].encrypted_key` | Ha um envelope para editor e outro para visualizador, ambos derivados via HKDF-SHA256 a partir do respectivo codigo e `room_public_id`. |

## O que trafega ou fica armazenado em claro

| Camada | Dado em claro | Onde aparece | Motivo / risco |
| --- | --- | --- | --- |
| Identificadores de sala | `room_id`, `room_public_id`, nome do canal Realtime, versao do snapshot | Edge Functions, tabelas Supabase e broadcast | Necessario para localizar sala, canal e versao. Nao deve conter conteudo de negocio. |
| Hash dos codigos | `editor_code_hash`, `viewer_code_hash` ou `code_hash` | Edge Functions e tabela de convites | O codigo puro nao e enviado ao servidor; o hash autoriza criacao, entrada e salvamento. |
| Metadados de snapshot | `version`, `payload_hash`, `app_version`, `collab_protocol_version`, timestamps | `collab_room_snapshots` | Necessario para conflito de versao, auditoria tecnica e compatibilidade. |
| Metadados de comentario | `slide_id`, `block_id`, `status`, timestamps | `collab_room_comments` | Necessario para carregar comentarios por sala e ignorar removidos. O texto do comentario fica criptografado. |
| Presence geral da sala | `clientId`, nome, cor, papel, versao do app, versao de protocolo, slide atual, indice do slide, atividade, `isFollowingHost`, coordenadas de cursor geral | Supabase Presence (`channel.track`) | Dado operacional em claro para lista de participantes, seguir host, versao e presenca. Deve ser tratado como dado pessoal/metadado colaborativo. |
| Envelope de broadcast Yjs | `id`, `senderId`, `sentAt`, nome do evento | Supabase Realtime Broadcast | Necessario para deduplicacao, ordenacao operacional e descarte de mensagens proprias. O conteudo do update fica criptografado. |
| Eventos operacionais nao Yjs | `bring_to_slide`, `notify_host_update` e eventos legados `deck-op` quando usados | Supabase Realtime Broadcast | Usados para controles de sala. O fluxo Yjs cobre edicao simultanea do editor customizado. |
| Ponto de atencao: comentarios ao vivo | Eventos `comment_add`, `comment_update`, `comment_resolve`, `comment_reopen`, `comment_delete` atualmente carregam o objeto do comentario no broadcast `deck-op` | Supabase Realtime Broadcast | O comentario persistido no banco e criptografado, mas o broadcast ao vivo ainda pode expor o payload para participantes conectados ao canal. Para endurecimento futuro, trocar por evento sem texto e recarregar/decriptar pelo banco. |

## O que nunca trafega para a nuvem

| Dado | Garantia esperada | Evidencia no codigo |
| --- | --- | --- |
| Bases brutas | Linhas completas de Budget, Forecast, Rolling, KE30, Real Bud. ou equivalentes permanecem no computador local | O serializador sanitiza blocos e remove `rows`, `data`, `values`, `renderedData`, `renderedSeries`, `series` e campos calculados antes de salvar snapshot. |
| Valores calculados/renderizados de graficos | Series renderizadas, totais calculados, linhas calculadas e valores finais de graficos nao devem ser persistidos na sala | O snapshot salva estrutura, filtros, periodos e configuracao, nao o resultado calculado. Campos como `calculatedValue`, `calculatedRows`, `renderedSeries` e `chartImage` sao removidos. |
| Arquivos CSV/XLSX originais | Arquivos importados como base nao sao enviados pela colaboracao | A colaboracao trabalha com estrutura do deck e referencias/filtros; o carregamento de bases continua local. |
| Imagens renderizadas de grafico com numeros | Imagens, thumbnails e previews gerados do grafico nao devem ser salvos na sala | O sanitizador remove `thumbnailDataUrl`, `previewDataUrl`, `chartImage` e `imageDataUrl`; blocos de imagem tem `src` limpo no snapshot persistente. |

## Dados pessoais e LGPD

Os seguintes campos devem ser considerados dados pessoais ou metadados pessoais sob LGPD, ainda que o conteudo do deck esteja criptografado:

| Dado | Uso no app | Observacao LGPD |
| --- | --- | --- |
| Nome do participante | Presence, lista de participantes, toasts de entrada/saida, autoria de comentarios | Pode identificar pessoa natural. Requer base legal, transparencia e controle de acesso. |
| Cor/avatar local | Presence e autoria visual de comentario | Isoladamente pode nao identificar, mas associado ao nome e sessao vira metadado pessoal. |
| Papel na sala | Host, Editor ou Visualizador | Metadado de permissao e atividade. |
| Versao do app e protocolo | Compatibilidade entre participantes | Metadado tecnico associado ao participante. |
| Slide atual e atividade | "Slide 4", editando, apresentando, seguindo host | Metadado comportamental de uso. |
| Coordenadas de cursor e selecao | Cursor geral via Presence; selecao de texto via Awareness Yjs criptografado | Mesmo quando criptografado, descreve comportamento do usuario e deve ser minimizado quando possivel. |
| Autoria de comentario | `author`, `authorColor` dentro do comentario criptografado | Dado pessoal armazenado criptografado, mas ainda sujeito a governanca de retencao/acesso. |
| `host_name` ou equivalente operacional | Nome exibido para host/notificacoes, quando usado | Deve ser tratado como identificador pessoal se representar uma pessoa. |

## Controles implementados

- Codigos de sala sao gerados no cliente e normalizados localmente.
- O servidor recebe hash do codigo, nao o codigo em texto puro.
- A chave de conteudo e aleatoria por sala e fica acessivel via envelopes criptografados por codigo.
- Snapshots e comentarios persistidos usam AES-GCM com IV unico por operacao.
- Updates Yjs e Awareness Yjs usam AES-GCM antes de trafegar no Realtime.
- Payload corrompido ou incompativel e descartado sem logar conteudo aberto.
- Snapshot persistente remove dados brutos, series renderizadas e imagens calculadas antes da criptografia.
- Convidado visualizador tem bloqueios de UI e handlers defensivos para nao emitir edicoes estruturais.

## Pontos de atencao para revisao externa

| Tema | Situacao atual | Recomendacao |
| --- | --- | --- |
| Presence geral em claro | Nome, papel, versao, slide atual, atividade e cursor geral trafegam pelo Presence do Supabase | Validar se esse nivel de metadado e aceitavel. Se a politica exigir, reduzir campos ou mover parte para canal criptografado. |
| Broadcast ao vivo de comentarios | Persistencia e criptografada, mas o evento realtime de comentario ainda pode carregar o comentario em claro para participantes conectados | Endurecer em fase futura: broadcastar apenas `comment_id`/acao e cada cliente recarrega o comentario criptografado da tabela. |
| Retencao | Sala tem expiracao operacional, mas a politica formal de retencao deve ser definida pela empresa | Definir prazo, rotina de limpeza e responsavel pelo tratamento. |
| Identidade anonima/local | Nao ha Supabase Auth; identidade e nome sao locais/anomimos | Validar se atende ao contexto corporativo ou se sera necessario SSO/auditoria nominal no futuro. |
| Controle de acesso por codigo | Codigo concede acesso conforme papel retornado pelo servidor | Tratar codigos como segredo operacional; orientar usuarios a compartilhar apenas por canais aprovados. |

## Texto curto para revisao juridica/seguranca

A Sala Colaborativa Persistente permite editar decks da aba Slides em conjunto. A solucao sincroniza apenas a estrutura da apresentacao: ordem de slides, layout, blocos, textos manuais, comentarios, notas e configuracoes/filtros. Bases brutas, arquivos CSV/XLSX originais, valores calculados e series renderizadas de graficos permanecem locais no computador de cada usuario.

O conteudo persistido na nuvem e criptografado no cliente com AES-GCM. Cada sala possui uma chave de conteudo aleatoria; os codigos de editor e visualizador apenas destravam essa chave por envelopes separados. O servidor recebe hashes dos codigos para autorizacao e armazena payloads criptografados.

Na edicao simultanea, os updates do Yjs e o Awareness de texto tambem trafegam criptografados. Alguns metadados operacionais permanecem em claro para funcionamento da sala, especialmente Presence: nome do participante, papel, versao do app, slide atual e atividade. Esses campos devem ser tratados como dados pessoais/metadados de uso sob LGPD.

O principal ponto de atencao atual e o broadcast ao vivo de comentarios: a copia persistida no banco e criptografada, mas o evento realtime de comentario ainda pode carregar o objeto do comentario para participantes conectados. Isso nao envia bases brutas nem arquivos originais, mas deve ser avaliado em uma revisao de seguranca e pode ser endurecido em fase futura.
