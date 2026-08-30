// Camada de i18n — Fase 2 da "Doutrina do Editor" (fundação de
// acessibilidade e i18n). Ver memória de projeto
// "project_doutrina_editor_progress" para o plano completo.
//
// POR QUÊ ISTO EXISTE AGORA, SEM UM SEGUNDO IDIOMA PRA LANÇAR:
// compras de indústria grande costumam exigir suporte multilíngue antes de
// avaliar a interface. Hoje toda string do editor de Slides está cravada
// direto no JSX em português. Extrair pra um dicionário agora é
// configuração; deixar pra quando o segundo idioma for pedido de verdade é
// reescrita cara — quanto mais componentes existirem até lá, mais caro fica.
// Esta é só a fundação: nenhum seletor de idioma existe ainda, o app
// continua 100% PT-BR.
//
// CONVENÇÃO:
// 1. Toda string nova voltada ao usuário no editor de Slides entra em
//    pt-BR.ts, nunca solta no JSX. Chame de "cravar string" adicionar uma
//    string de UI fora deste dicionário — evite.
// 2. Estrutura por caminho: `slides.editor.<área>.<sub-área>.<chave>`,
//    espelhando a pasta/componente de quem consome (ex.: o dicionário do
//    ShapeInspector.tsx fica em `slides.editor.inspectors.shape`).
// 3. String com valor interpolado (ex.: "Opacidade 40%") é uma função
//    `(valor) => \`texto ${valor}\`` no dicionário, não uma string com
//    placeholder — mantém tudo acessado do mesmo jeito
//    (`strings.a.b.c` ou `strings.a.b.c(valor)`) e com o mesmo
//    typo-safety do TypeScript, sem precisar de biblioteca de parsing.
// 4. Para adicionar um segundo idioma quando for realmente necessário: crie
//    `en-US.ts` com `export const enUS = { ... } satisfies Dictionary;` —
//    o `satisfies` faz o TypeScript recusar o build se faltar ou sobrar
//    uma chave. Depois troque `strings` por uma seleção baseada em locale
//    (ainda não existe, porque ainda não existe um segundo idioma real).
//
// MIGRADO ATÉ AGORA (ver Fase 2 na memória do projeto para o que falta):
//   - src/components/pricing/custom/ShapeInspector.tsx
// Isto é uma fatia, não a extração completa do editor — o resto continua
// com string cravada no JSX até ser migrado incrementalmente.

import { ptBR } from "./pt-BR";

export type Dictionary = typeof ptBR;

export const strings: Dictionary = ptBR;
