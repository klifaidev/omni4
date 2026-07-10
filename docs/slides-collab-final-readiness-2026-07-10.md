# Slides Fase 12 - checklist final de prontidao tecnica

Data: 2026-07-10

## Validado por testes automatizados

| Cenario | Cobertura | Resultado esperado |
| --- | --- | --- |
| Duas pessoas excluem o mesmo bloco ao mesmo tempo | `src/lib/customSlideYjs.test.ts` | O bloco aparece removido para todos e o Y.Doc converge. |
| Uma pessoa edita um bloco que outra acabou de excluir | `src/lib/customSlideYjs.test.ts` | A visao do app mantem o bloco excluido, sem recriar item removido. |
| Duas pessoas reordenam blocos simultaneamente | `src/lib/customSlideYjs.test.ts` | Os dois documentos convergem sem duplicar ou perder ids. |
| Duas pessoas adicionam blocos diferentes simultaneamente | `src/lib/customSlideYjs.test.ts` | Ambos os blocos aparecem no resultado convergido. |
| Queda de envio Realtime no meio da edicao | `src/lib/supabaseYjsProvider.test.ts` | A edicao local fica em memoria, o provider reenvia ao reconectar e os docs convergem. |
| Update criptografado corrompido | `src/lib/supabaseYjsProvider.test.ts` | O update e descartado, a sessao segue ativa e updates validos posteriores aplicam normalmente. |
| Updates Yjs sem texto claro | `src/lib/supabaseYjsProvider.test.ts` | O payload contem `ciphertext` e nao contem o texto digitado. |
| Awareness de texto sem nome/cursor em claro | `src/lib/supabaseYjsProvider.test.ts` | Nome e selecao trafegam criptografados e aplicam no peer. |
| Comentarios ao vivo sem texto/autor em claro | `src/lib/collabCommentBroadcast.test.ts` | O payload contem `ciphertext`, nao contem texto/autor, e decripta para o evento original. |
| Modo degradado: backoff | `src/lib/collabDegradedMode.test.ts` | Tentativas usam 30s, 1min, 5min e teto de 15min. |
| Modo degradado: gatilhos Realtime | `src/lib/collabDegradedMode.test.ts` | `CHANNEL_ERROR`, `TIMED_OUT` e `CLOSED` entram no modo degradado; `SUBSCRIBED` nao. |
| Modo degradado: limite Edge Function | `src/lib/collabDegradedMode.test.ts` | Erros 402 sao reconhecidos como limite de invocacao. |

## Confirmacao de arquitetura

| Ponto | Evidencia | Conclusao |
| --- | --- | --- |
| Yjs conectado a sala real | `SlidesBeta.tsx` instancia `createSupabaseYjsProvider` com `realtimeChannel`, `persistentCollabContentKey` e evento `custom-slide-yjs:${item.id}`. | O editor customizado usa Yjs dentro da sala real. |
| Sistema antigo nao duplica edicao customizada | `SlidesBeta.tsx` envia `collabYDoc` ao `CustomSlideEditor`; o fluxo antigo `deck-op` permanece para acoes estruturais/operacionais, enquanto edicao de blocos/texto customizados usa provider Yjs. | Nao ha dois motores editando simultaneamente o mesmo texto/bloco customizado. |
| Sem fallback para comentario em claro | `use-collaboration.ts` cifra com `encryptCommentEventForBroadcast`; se nao houver chave ou se falhar, nao transmite. | Comentarios ao vivo nao trafegam como objeto aberto no Realtime. |

## Checklist manual obrigatorio antes do aceite formal

Este bloco precisa ser executado por duas ou mais pessoas reais, em maquinas/janelas separadas, porque envolve percepcao visual, DevTools/Electron e fluxo humano de colaboracao.

| Item | Como validar | Status |
| --- | --- | --- |
| Duas pessoas editando o mesmo texto | Pessoa A digita em titulo/insight/notas; Pessoa B ve alteracao incremental. | Pendente validacao humana. |
| Duas pessoas editando blocos | Adicionar, mover, redimensionar, duplicar e excluir blocos em paralelo. | Pendente validacao humana. |
| Cursores/selecao aparecem corretamente | Selecionar texto e mover cursor nos campos; confirmar nome/cor do colaborador. | Pendente validacao humana. |
| Exportacao apos colaboracao | Depois da edicao simultanea, exportar PPTX e PDF e abrir os arquivos. | Pendente validacao humana. |
| Trafego sem texto claro | Inspecionar Realtime no DevTools/Electron: updates Yjs, Awareness e comentarios devem exibir payload criptografado, sem texto digitado, autor de comentario ou `manualValue` em claro. | Pendente validacao humana. |
| Modo degradado - erro de canal | Simular `CHANNEL_ERROR`, editar durante o aviso, reconectar e confirmar que o conteudo converge. | Pendente validacao humana. |
| Modo degradado - reconnect timeout | Simular `TIMED_OUT`, editar durante o aviso, reconectar e confirmar que o conteudo converge. | Pendente validacao humana. |
| Modo degradado - limite Edge Function 402 | Simular erro 402 em salvamento, editar, confirmar aviso na topbar e recuperacao sem perda. | Pendente validacao humana. |
| Aviso da topbar | Confirmar que aparece em modo degradado e some ao reconectar. | Pendente validacao humana. |

## Conclusao tecnica

Os cenarios criticos de CRDT, criptografia de transporte, recuperacao de update invalido e degradacao foram cobertos por testes automatizados. A colaboracao simultanea esta tecnicamente pronta para piloto controlado.

Isso nao equivale a aprovacao juridica/LGPD ou autorizacao para dados sensiveis. A revisao externa de seguranca e privacidade continua obrigatoria antes de declarar a solucao formalmente aprovada para uso corporativo com dados sensiveis.
