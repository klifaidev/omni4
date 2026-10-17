// Exportador unificado dos De Paras → XLSX (várias abas).
// Útil para validação e auditoria.
import * as XLSX from "xlsx";
import { listDeParaEntries, type DeParaEntry } from "./depara";
import { getComercialEntries, type ComercialMapId } from "./deparaComercial";
import { getInovacaoMap } from "./deparaInovacao";
import type { PendingItem } from "./deparaHealth";

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

export function exportDeparasXlsx(rowsBySource: SkuDescSourceRow[][] = []) {
  const wb = XLSX.utils.book_new();

  // 1) De Para Principal (SKU → atributos) — com as correções feitas no app.
  // Alguns SKUs vêm sem nome no De/Para mestre. Para esses casos, usa a
  // descrição original tal como veio na base carregada (Real/Budget) — sem
  // ela o SKU fica sem nenhuma referência para ser
  // classificado depois. Os demais níveis (categoria, marca etc.) continuam
  // em branco normalmente; só o nome é recuperado.
  const skuDescFallback = buildSkuDescFallback(rowsBySource);
  const principalRows = listDeParaEntries()
    .map(({ sku, entry: v, source }) => ({
      SKU: sku,
      Descrição: (v.skuDesc && v.skuDesc.trim()) || skuDescFallback.get(sku) || "",
      Categoria: v.categoria ?? "",
      Subcategoria: v.subcategoria ?? "",
      Marca: v.marca ?? "",
      Tecnologia: v.tecnologia ?? "",
      Formato: v.formato ?? "",
      Mercado: v.mercado ?? "",
      "Faixa de Peso": v.faixaPeso ?? "",
      Sabor: v.sabor ?? "",
      Origem: source === "app" ? "Corrigido no app" : "Padrão",
    }))
    .sort((a, b) => a.SKU.localeCompare(b.SKU));
  appendSheet(
    wb,
    "1. SKU - Hierarquia",
    ["SKU", "Descrição", "Categoria", "Subcategoria", "Marca", "Tecnologia", "Formato", "Mercado", "Faixa de Peso", "Sabor", "Origem"],
    principalRows,
  );

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
    { Aba: "1. SKU - Hierarquia", Descrição: "Categoria, marca, tecnologia, formato etc. por SKU", "Total de Registros": principalRows.length },
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

  downloadWorkbook(wb, "de-paras_auditoria");
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
