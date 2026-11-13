// Exportador unificado dos De Paras → XLSX (várias abas).
// Útil para validação e auditoria.
import * as XLSX from "xlsx";
import { listDeParaEntries, type DeParaEntry } from "./depara";
import { getComercialEntries, type ComercialMapId } from "./deparaComercial";
import { getInovacaoMap } from "./deparaInovacao";
import type { PendingItem } from "./deparaHealth";
import { allBaseHierarchy, getBaseHierarchy, type BaseHierField } from "./baseHierarchy";

interface DeParaInovacaoEntry {
  classificacao: string;
  anoLancamento?: number | string | null;
  legado?: string | null;
}

function autoSizeCols(rows: Record<string, unknown>[], headers: string[]) {
  return headers.map((h) => {
    const maxLen = Math.min(
      60,
      Math.max(
        h.length,
        ...rows.slice(0, 500).map((r) => String(r[h] ?? "").length),
      ),
    );
    return { wch: maxLen + 2 };
  });
}

function appendSheet(
  wb: XLSX.WorkBook,
  name: string,
  headers: string[],
  rows: Record<string, unknown>[],
) {
  const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
  ws["!cols"] = autoSizeCols(rows, headers);
  // Freeze first row
  ws["!freeze"] = { xSplit: 0, ySplit: 1 } as unknown as XLSX.WorkSheet["!freeze"];
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
}

function downloadWorkbook(wb: XLSX.WorkBook, prefix: string) {
  const today = new Date();
  const stamp = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
  XLSX.writeFile(wb, `${prefix}_${stamp}.xlsx`);
}

function getInovacaoRows() {
  const inov = getInovacaoMap() as Record<string, DeParaInovacaoEntry>;
  return Object.entries(inov)
    .map(([sku, v]) => ({
      SKU: sku,
      Classificacao: v.classificacao ?? "",
      "Ano de Lancamento": v.anoLancamento ?? "",
      Legado: v.legado ?? "",
    }))
    .sort((a, b) => a.SKU.localeCompare(b.SKU));
}

export function exportInovacaoDeparaAtualXlsx() {
  const wb = XLSX.utils.book_new();
  appendSheet(
    wb,
    "DePara Inovacao",
    ["SKU", "Classificacao", "Ano de Lancamento", "Legado"],
    getInovacaoRows(),
  );
  downloadWorkbook(wb, "depara_inovacao_atual");
}

export function exportInovacaoDeparaModeloXlsx() {
  const wb = XLSX.utils.book_new();
  appendSheet(
    wb,
    "Modelo",
    ["SKU", "Classificacao", "Ano de Lancamento", "Legado"],
    [
      { SKU: "100001", Classificacao: "Inovacao", "Ano de Lancamento": "2026", Legado: "1A" },
      { SKU: "100002", Classificacao: "Regular", "Ano de Lancamento": "", Legado: "" },
    ],
  );
  downloadWorkbook(wb, "modelo_depara_inovacao");
}

/** Linha mínima de qualquer base (Real/Budget) usada só para recuperar a
 * descrição original do SKU quando o De/Para mestre está sem nome. */
export interface SkuDescSourceRow {
  sku?: string;
  skuDesc?: string;
}

/**
 * Monta um SKU → descrição a partir das bases carregadas no app, na ordem em
 * que foram passadas (a primeira ocorrência não vazia de cada SKU vence).
 * Usado como fallback só para os SKUs cujo De/Para mestre não tem nome.
 */
function buildSkuDescFallback(rowsBySource: SkuDescSourceRow[][]): Map<string, string> {
  const fallback = new Map<string, string>();
  for (const rows of rowsBySource) {
    for (const row of rows) {
      if (!row.sku || fallback.has(row.sku)) continue;
      const desc = row.skuDesc?.trim();
      if (desc) fallback.set(row.sku, desc);
    }
  }
  return fallback;
}

/**
 * De/Para 360: o mesmo arquivo, para circular no time e anexar de volta na
 * Central (lib/depara360 reconhece as abas pelas colunas).
 */
export async function exportDePara360Xlsx(rowsBySource: SkuDescSourceRow[][] = []) {
  await exportDeparasXlsx(rowsBySource, "De-Para 360");
}

type HierKind = "de" | "para";

/**
 * Aba de hierarquia no layout da planilha de De/Para do time: para cada nível,
 * o DE (como veio na base, ex.: "B1 Top") ao lado do PARA (o que o app usa).
 * A subcategoria não existe na base, então só tem o PARA.
 */
const HIER_COLUMNS: { header: string; kind: HierKind; field: BaseHierField }[] = [
  { header: "DE - 01 Categoria", kind: "de", field: "categoria" },
  { header: "PARA - 01 Categoria", kind: "para", field: "categoria" },
  { header: "Subcategoria", kind: "para", field: "subcategoria" },
  { header: "DE - 02 Marca", kind: "de", field: "marca" },
  { header: "PARA - 02 Marca", kind: "para", field: "marca" },
  { header: "DE - 03 Família", kind: "de", field: "tecnologia" },
  { header: "PARA - 03 Tecnologia", kind: "para", field: "tecnologia" },
  { header: "DE - 04 Formato", kind: "de", field: "formato" },
  { header: "PARA - 04 Formato", kind: "para", field: "formato" },
  { header: "DE - 05 Mercado", kind: "de", field: "mercado" },
  { header: "PARA - 05 Mercado", kind: "para", field: "mercado" },
  { header: "DE - 06 Faixa de Peso", kind: "de", field: "faixaPeso" },
  { header: "PARA - 06 Faixa de Peso", kind: "para", field: "faixaPeso" },
  { header: "DE - 07 Sabor", kind: "de", field: "sabor" },
  { header: "PARA - 07 Sabor", kind: "para", field: "sabor" },
];

export const HIERARCHY_SHEET = "1. SKU - Hierarquia";

/** Linhas da aba de hierarquia (cabeçalho + uma linha por SKU), na ordem das colunas. */
export function buildHierarchySheetRows(rowsBySource: SkuDescSourceRow[][] = []): (string | number)[][] {
  // Alguns SKUs vêm sem nome no De/Para mestre: usa a descrição como veio na
  // base carregada (Real/Budget), senão o SKU fica sem referência nenhuma.
  const skuDescFallback = buildSkuDescFallback(rowsBySource);
  const entries = new Map(listDeParaEntries().map((e) => [e.sku, e.entry]));
  // SKUs das bases ainda sem De/Para também saem, com o PARA em branco: é
  // nessa linha que o time preenche a classificação.
  const skus = new Set<string>([...entries.keys(), ...skuDescFallback.keys(), ...allBaseHierarchy().keys()]);
  const header: (string | number)[] = ["Artigo", "", ...HIER_COLUMNS.map((c) => c.header)];
  const body = Array.from(skus)
    .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }))
    .map((sku) => {
      const entry = entries.get(sku);
      const base = getBaseHierarchy(sku);
      const desc = (entry?.skuDesc && entry.skuDesc.trim()) || skuDescFallback.get(sku) || "";
      const code: string | number = /^\d{1,15}$/.test(sku) ? Number(sku) : sku;
      return [code, desc, ...HIER_COLUMNS.map((c) => (c.kind === "de" ? base?.[c.field] : entry?.[c.field]) ?? "")];
    });
  return [header, ...body];
}

function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * O SheetJS gratuito não grava cores: aplica o visual da planilha do time
 * direto no XML — cabeçalho vermelho (DE) e verde (PARA), corpo do DE em
 * amarelo e do PARA em verde-claro, código e cabeçalho congelados, filtro.
 */
async function styleHierarchySheet(bytes: ArrayBuffer, sheetIndex: number, rowCount: number): Promise<Uint8Array> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(bytes);
  const stylesPath = "xl/styles.xml";
  let styles = await zip.file(stylesPath)!.async("string");

  const append = (tag: string, xml: string, added: number): number => {
    const base = Number(styles.match(new RegExp(`<${tag} count="(\\d+)"`))?.[1] ?? 0);
    styles = styles
      .replace(new RegExp(`<${tag} count="\\d+"`), `<${tag} count="${base + added}"`)
      .replace(`</${tag}>`, `${xml}</${tag}>`);
    return base;
  };
  const font = (bold: boolean, rgb: string) =>
    `<font>${bold ? "<b/>" : ""}<sz val="11"/><color rgb="${rgb}"/><name val="Calibri"/><family val="2"/></font>`;
  const fontBase = append("fonts", font(true, "FFFFFFFF") + font(false, "FF000000"), 2);
  const fill = (rgb: string) => `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;
  const fillBase = append("fills", fill("FFE00000") + fill("FF00B050") + fill("FFFFFF99") + fill("FFE2EFDA"), 4);
  const side = (name: string) => `<${name} style="thin"><color rgb="FFBFBFBF"/></${name}>`;
  const borderId = append("borders", `<border>${side("left")}${side("right")}${side("top")}${side("bottom")}<diagonal/></border>`, 1);
  const xf = (fontId: number, fillId: number, center: boolean) =>
    `<xf numFmtId="0" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0" applyFont="1" applyFill="1" applyBorder="1"` +
    (center ? ' applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' : "/>");
  const xfBase = append(
    "cellXfs",
    xf(fontBase, fillBase, true) + xf(fontBase, fillBase + 1, true) + xf(fontBase + 1, fillBase + 2, false) + xf(fontBase + 1, fillBase + 3, false),
    4,
  );
  zip.file(stylesPath, styles);

  // Código e descrição seguem o vermelho/amarelo do "Artigo".
  const kinds: HierKind[] = ["de", "de", ...HIER_COLUMNS.map((c) => c.kind)];
  const sheetPath = `xl/worksheets/sheet${sheetIndex + 1}.xml`;
  let sheet = await zip.file(sheetPath)!.async("string");
  sheet = sheet.replace(/<c r="([A-Z]+)(\d+)"(?: s="\d+")?/g, (_m, col: string, row: string) => {
    const para = kinds[columnIndex(col)] === "para";
    const s = row === "1" ? xfBase + (para ? 1 : 0) : xfBase + (para ? 3 : 2);
    return `<c r="${col}${row}" s="${s}"`;
  });
  const lastCol = String.fromCharCode(64 + kinds.length);
  sheet = sheet
    .replace(
      /<sheetView workbookViewId="0"\s*\/>/,
      '<sheetView workbookViewId="0"><pane xSplit="2" ySplit="1" topLeftCell="C2" activePane="bottomRight" state="frozen"/><selection pane="bottomRight"/></sheetView>',
    )
    .replace("</sheetData>", `</sheetData><autoFilter ref="A1:${lastCol}${Math.max(rowCount, 1)}"/>`);
  zip.file(sheetPath, sheet);

  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

function fileStamp(): string {
  const today = new Date();
  return `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function exportDeparasXlsx(rowsBySource: SkuDescSourceRow[][] = [], filePrefix = "de-paras_auditoria") {
  const bytes = await buildDeparasWorkbook(rowsBySource);
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  downloadBlob(blob, `${filePrefix}_${fileStamp()}.xlsx`);
}

/** Monta o arquivo com todas as abas, já com o visual da aba de hierarquia. */
export async function buildDeparasWorkbook(rowsBySource: SkuDescSourceRow[][] = []): Promise<Uint8Array> {
  const wb = XLSX.utils.book_new();

  // 1) Hierarquia por SKU no layout DE/PARA do time — com as correções do app.
  const hierarchyRows = buildHierarchySheetRows(rowsBySource);
  const wsHier = XLSX.utils.aoa_to_sheet(hierarchyRows);
  wsHier["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
  wsHier["!cols"] = [
    { wch: 10 },
    { wch: 34 },
    ...HIER_COLUMNS.map((c, i) => ({
      wch: Math.min(32, Math.max(c.header.length, ...hierarchyRows.slice(1, 800).map((r) => String(r[i + 2] ?? "").length)) + 2),
    })),
  ];
  XLSX.utils.book_append_sheet(wb, wsHier, HIERARCHY_SHEET);
  const principalCount = hierarchyRows.length - 1;

  // 2) De Para Inovação (SKU → classificação + legado)
  const inov = getInovacaoMap() as Record<string, DeParaInovacaoEntry>;
  const inovRows = Object.entries(inov)
    .map(([sku, v]) => ({
      SKU: sku,
      Classificação: v.classificacao ?? "",
      "Ano de Lançamento": v.anoLancamento ?? "",
      Legado: v.legado ?? "",
    }))
    .sort((a, b) => a.SKU.localeCompare(b.SKU));
  appendSheet(
    wb,
    "2. SKU - Inovação",
    ["SKU", "Classificação", "Ano de Lançamento", "Legado"],
    inovRows,
  );

  // 3-6) De Para Comercial — uma aba para cada mapeamento, com as correções do app.
  const comercialRows = (id: ComercialMapId, fromHeader: string, toHeader: string) =>
    getComercialEntries(id).map((e) => ({
      [fromHeader]: e.key,
      [toHeader]: e.value,
      Origem: e.source === "app" ? "Corrigido no app" : "Padrão",
    }));

  const canalRows = comercialRows("canalToCanalAjustado", "Canal Origem", "Canal Ajustado");
  appendSheet(wb, "3. Canal → Canal Ajustado", ["Canal Origem", "Canal Ajustado", "Origem"], canalRows);

  const regiaoUfRows = comercialRows("regiaoToUf", "Região Origem", "UF");
  appendSheet(wb, "4. Região → UF", ["Região Origem", "UF", "Origem"], regiaoUfRows);

  const regiaoMercRows = comercialRows("regiaoToMercadoAjustado", "Região Origem", "Mercado Ajustado");
  appendSheet(wb, "5. Região → Mercado Ajust.", ["Região Origem", "Mercado Ajustado", "Origem"], regiaoMercRows);

  const ufRegionalRows = comercialRows("ufToRegional", "UF", "Regional");
  appendSheet(wb, "6. UF → Regional", ["UF", "Regional", "Origem"], ufRegionalRows);

  // Aba de índice
  const indexRows = [
    { Aba: HIERARCHY_SHEET, Descrição: "DE (como veio na base) e PARA (o que o app usa) de cada nível, por SKU", "Total de Registros": principalCount },
    { Aba: "2. SKU - Inovação", Descrição: "Classificação Inovação/Regular e Legado por SKU", "Total de Registros": inovRows.length },
    { Aba: "3. Canal → Canal Ajustado", Descrição: "Mapeamento do canal bruto para canal padronizado", "Total de Registros": canalRows.length },
    { Aba: "4. Região → UF", Descrição: "Extração da UF a partir da região do CSV", "Total de Registros": regiaoUfRows.length },
    { Aba: "5. Região → Mercado Ajust.", Descrição: "Mercado padronizado a partir da região", "Total de Registros": regiaoMercRows.length },
    { Aba: "6. UF → Regional", Descrição: "Regional comercial a partir da UF", "Total de Registros": ufRegionalRows.length },
  ];
  const wsIndex = XLSX.utils.json_to_sheet(indexRows, { header: ["Aba", "Descrição", "Total de Registros"] });
  wsIndex["!cols"] = [{ wch: 30 }, { wch: 60 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsIndex, "Índice");
  // Move índice para primeira posição
  wb.SheetNames = ["Índice", ...wb.SheetNames.filter((n) => n !== "Índice")];

  const bytes = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return styleHierarchySheet(bytes, wb.SheetNames.indexOf(HIERARCHY_SHEET), hierarchyRows.length);
}

const PENDING_FIELD_LABEL: Record<keyof DeParaEntry, string> = {
  categoria: "Categoria",
  subcategoria: "Subcategoria",
  marca: "Marca",
  tecnologia: "Tecnologia",
  formato: "Formato",
  mercado: "Mercado",
  faixaPeso: "Faixa de Peso",
  sabor: "Sabor",
  skuDesc: "Descrição",
};

/** Pendências de todos os De/Paras, na ordem de impacto — para resolver fora do app. */
export function exportPendenciasXlsx(pending: PendingItem[], mapTitle: (id: PendingItem["map"]) => string) {
  const wb = XLSX.utils.book_new();
  const rows = pending.map((p) => ({
    "De/Para": mapTitle(p.map),
    Valor: p.key,
    Descrição: p.label ?? "",
    "ROL (Real)": p.onlyBudget ? "" : Number(p.rol.toFixed(2)),
    "% do ROL": p.onlyBudget ? "" : Number((p.share * 100).toFixed(3)),
    Linhas: p.rows,
    "Campos faltando": p.missingFields?.map((f) => PENDING_FIELD_LABEL[f]).join(", ") ?? "",
    Observação: p.onlyBudget ? "Só aparece no Budget" : "",
  }));
  appendSheet(wb, "Pendências", ["De/Para", "Valor", "Descrição", "ROL (Real)", "% do ROL", "Linhas", "Campos faltando", "Observação"], rows);
  downloadWorkbook(wb, "de-paras_pendencias");
}
