// Guarda estrutural contra "controles órfãos" no editor de Slides: um campo
// que um inspector escreve via onChange/updSeries/updPath/updStyle mas que
// nenhum renderer (nem os helpers de layout/dado que ele delega) nunca lê.
//
// Contexto: essa foi exatamente a classe de bug relatada pelo usuário e
// corrigida em v1.9.341/342 (showBudget do DRE, marker.shape do gráfico de
// linha, style.area.stacked/lineOnTop, topN do Top Ranking, lineDirection de
// forma). Ver memória de projeto "project_slides_orphan_controls_v1_9_341_342".
//
// Isto é uma rede de segurança heurística, não uma prova formal:
// - Um campo é considerado "lido" se seu nome aparece como palavra inteira em
//   QUALQUER arquivo do RENDER_SCOPE — de propósito leniente (prefere deixar
//   passar um falso positivo raro a travar o time com alarme falso).
// - Campos legítimos que ainda não têm consumidor (feature em progresso) ou
//   que são deliberadamente só-para-export devem entrar no ALLOWLIST abaixo,
//   com um comentário explicando o motivo — nunca remover o campo do
//   inspector nem "resolver" um achado real apagando a checagem.
//
// Um achado aqui significa: alguém adicionou (ou renomeou) um controle no
// inspector e esqueceu de fazer o renderer consumir o valor. Antes de
// consertar, confirme lendo o inspector e o(s) renderer(s) relevantes — o
// heurístico aponta o suspeito, não decide sozinho.

import ts from "typescript";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..", "..");

/** Onde os controles do editor de Slides são declarados (onChange/updX). */
export const INSPECTOR_FILES = [
  "src/components/pricing/custom/inspectors/BlockInspectors.tsx",
  "src/components/pricing/custom/chart/ChartInspector.tsx",
  "src/components/pricing/custom/ShapeInspector.tsx",
];

/** Onde um valor de bloco/série precisa aparecer para "fazer algo na tela".
 *  Inclui os renderers, as outras telas que desenham blocos (editor,
 *  apresentação, prévia) e todo helper de @/lib que eles importam — um campo
 *  como `topN` nunca é lido diretamente em BlockRenderer.tsx, só dentro de
 *  resolveTopSkuFit (customCapacity.ts), por exemplo, e `relativeRange` só
 *  dentro de resolveMonthRangeSelection (relativePeriods.ts). Lista obtida
 *  varrendo os imports `@/lib/*` reais desses arquivos — reflete o que o
 *  código de fato usa, não uma lista escolhida à mão. */
export const RENDER_SCREEN_FILES = [
  "src/components/pricing/custom/BlockRenderer.tsx",
  "src/components/pricing/custom/chart/ChartCanvas.tsx",
  "src/components/pricing/custom/chart/chartHelpers.tsx",
  "src/components/pricing/custom/ShapeRenderer.tsx",
  "src/components/pricing/custom/CustomSlideEditor.tsx",
  "src/components/pricing/custom/PresentationMode.tsx",
  "src/components/pricing/SlidePreview.tsx",
];

export const RENDER_LIB_FILES = [
  "analytics", "bridgeYtdBudget", "budget", "budgetAdapter", "canvasFit",
  "customCanvasRegistry", "customCapacity", "customKpi", "customSlide",
  "customSlideLayout", "customSlideSourceFooter", "customTableChartData",
  "customTemplates", "deparaComercial", "exportPdf", "farol", "fiscalYear",
  "format", "pivot", "pivotData", "positivacao",
  "relativePeriods", "slideBrandKit", "slideCalcCache",
  "slideCalcWorkerClient", "slideColors", "slideDataSourceTheme",
  "slideDeckPreparation", "slideDesignTokens", "slideLocalDataStatus",
  "slidesPerfCounters", "slideThemes", "slideThumbnailCache", "slidesFlow",
  "types",
].map((name) => `src/lib/${name}.ts`);

export const RENDER_SCOPE_FILES = [...RENDER_SCREEN_FILES, ...RENDER_LIB_FILES];

/** Nomes de função cujo argumento-patch declara campos de estado do bloco/série. */
const MUTATOR_ARG_INDEX: Record<string, number> = {
  onChange: 0,
  updSeries: 1,
  updPath: 1,
  updStyle: 0,
};

/** Campos com nome comum demais pra esse heurístico funcionar (ex.: "id"
 *  aparece em toda parte por motivos não relacionados), ou que são
 *  deliberadamente consumidos fora do RENDER_SCOPE — sempre com o motivo
 *  documentado ao lado. */
const ALLOWLIST: Record<string, string> = {
  id: "identificador genérico — nome comum demais para o heurístico de texto",
  key: "nome de prop/atributo genérico do React, não um campo de estado",
  value: "nome genérico de parâmetro/campo, não específico o bastante",
  name: "nome genérico (nome de série, de bloco, etc.) — falso positivo certo",
  selectionMode: "shape do onChange PRÓPRIO do sub-componente ComparePeriodField " +
    "(BlockInspectors.tsx ~L820), não o campo real do bloco — o caller sempre " +
    "remapeia pra baseSelectionMode/compSelectionMode, que são lidos em " +
    "BlockRenderer.tsx (confirmado manualmente em 2026-08-29).",
};

export interface OrphanField {
  field: string;
  file: string;
  line: number;
  snippet: string;
}

function unwrap(node: ts.Expression): ts.Expression {
  let n = node;
  while (
    ts.isAsExpression(n) ||
    ts.isParenthesizedExpression(n) ||
    ts.isNonNullExpression(n) ||
    ts.isTypeAssertionExpression(n)
  ) {
    n = ts.isParenthesizedExpression(n) ? n.expression
      : ts.isAsExpression(n) || ts.isTypeAssertionExpression(n) ? n.expression
      : (n as ts.NonNullExpression).expression;
  }
  return n;
}

/** Coleta recursivamente todo nome de propriedade dentro de um objeto
 *  literal, incluindo objetos aninhados (ex.: `{ marker: { shape: v } }`
 *  produz tanto "marker" quanto "shape"). Spreads (`{ ...x }`) são ignorados
 *  — não dá pra saber estaticamente as chaves de uma chamada de função. */
function collectPropertyNames(
  obj: ts.ObjectLiteralExpression,
  sourceFile: ts.SourceFile,
  out: Map<string, { line: number; snippet: string }>,
) {
  for (const prop of obj.properties) {
    if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) {
      const nameNode = prop.name;
      const fieldName = ts.isIdentifier(nameNode) || ts.isStringLiteral(nameNode)
        ? nameNode.text
        : null;
      if (fieldName && !out.has(fieldName)) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(prop.getStart(sourceFile));
        out.set(fieldName, { line: line + 1, snippet: prop.getText(sourceFile).slice(0, 90) });
      }
      if (ts.isPropertyAssignment(prop)) {
        const init = unwrap(prop.initializer);
        if (ts.isObjectLiteralExpression(init)) {
          collectPropertyNames(init, sourceFile, out);
        }
      }
    }
    // ts.isSpreadAssignment(prop) → ignorado de propósito (ver comentário acima)
  }
}

function extractWrittenFields(filePath: string): Map<string, { line: number; snippet: string }> {
  const absPath = path.join(ROOT, filePath);
  const text = fs.readFileSync(absPath, "utf8");
  const sourceFile = ts.createSourceFile(absPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = new Map<string, { line: number; snippet: string }>();

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const argIndex = MUTATOR_ARG_INDEX[node.expression.text];
      if (argIndex !== undefined) {
        const arg = node.arguments[argIndex];
        if (arg) {
          const unwrapped = unwrap(arg);
          if (ts.isObjectLiteralExpression(unwrapped)) {
            collectPropertyNames(unwrapped, sourceFile, found);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

let renderScopeTextCache: string | null = null;
function renderScopeText(): string {
  if (renderScopeTextCache !== null) return renderScopeTextCache;
  renderScopeTextCache = RENDER_SCOPE_FILES
    .map((f) => fs.readFileSync(path.join(ROOT, f), "utf8"))
    .join("\n");
  return renderScopeTextCache;
}

/** "Lido" exige um padrão de ACESSO (`.campo`, `?.campo`, `["campo"]`) — não
 *  basta o nome aparecer em qualquer lugar do arquivo. Isso importa porque o
 *  RENDER_SCOPE inclui `customSlide.ts`, que declara o campo na interface
 *  (`showBudget: boolean;`) e no valor default (`showBudget: false,`) — as
 *  duas ocorrências mais comuns de um campo nunca lido de verdade. Confirmado
 *  empiricamente: esse arquivo é 100% dot-access para ler campos de bloco
 *  (`blk.showBudget`, `b.baseSelectionMode`, `block.topN`, …), então exigir
 *  o acesso não deixa passar nenhum caso real do editor de Slides. */
function isReadSomewhereInRenderScope(field: string): boolean {
  const esc = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:\\.|\\?\\.)${esc}\\b|\\[["']${esc}["']\\]`);
  return re.test(renderScopeText());
}

/** Roda a checagem completa. Retorna a lista de campos suspeitos de órfãos —
 *  vazia quando tudo que os inspectors escrevem tem consumidor conhecido. */
export function findOrphanFields(): OrphanField[] {
  const orphans: OrphanField[] = [];
  for (const inspectorFile of INSPECTOR_FILES) {
    const written = extractWrittenFields(inspectorFile);
    for (const [field, { line, snippet }] of written) {
      if (field in ALLOWLIST) continue;
      if (!isReadSomewhereInRenderScope(field)) {
        orphans.push({ field, file: inspectorFile, line, snippet });
      }
    }
  }
  return orphans;
}
