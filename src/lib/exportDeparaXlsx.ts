// Exportador unificado dos De Paras → XLSX (várias abas).
// Útil para validação e auditoria.
import * as XLSX from "xlsx";
import deparaPrincipal from "@/data/depara.json";
import deparaComercial from "@/data/depara_comercial.json";
import deparaInovacao from "@/data/depara_inovacao.json";

interface DeParaPrincipalEntry {
  categoria: string;
  subcategoria: string;
  marca: string;
  tecnologia: string;
  formato: string;
  mercado: string;
  faixaPeso: string;
  sabor: string;
  skuDesc: string;
}

interface DeParaInovacaoEntry {
  classificacao: string;
  anoLancamento?: number | string | null;
  legado?: string | null;
}

interface DeParaComercialShape {
  canalToCanalAjustado: Record<string, string>;
  regiaoToUf: Record<string, string>;
  regiaoToMercadoAjustado: Record<string, string>;
  ufToRegional: Record<string, string>;
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

export function exportDeparasXlsx() {
  const wb = XLSX.utils.book_new();

  // 1) De Para Principal (SKU → atributos)
  const principal = deparaPrincipal as Record<string, DeParaPrincipalEntry>;
  const principalRows = Object.entries(principal)
    .map(([sku, v]) => ({
      SKU: sku,
      Descrição: v.skuDesc ?? "",
      Categoria: v.categoria ?? "",
      Subcategoria: v.subcategoria ?? "",
      Marca: v.marca ?? "",
      Tecnologia: v.tecnologia ?? "",
      Formato: v.formato ?? "",
      Mercado: v.mercado ?? "",
      "Faixa de Peso": v.faixaPeso ?? "",
      Sabor: v.sabor ?? "",
    }))
    .sort((a, b) => a.SKU.localeCompare(b.SKU));
  appendSheet(
    wb,
    "1. SKU - Hierarquia",
    ["SKU", "Descrição", "Categoria", "Subcategoria", "Marca", "Tecnologia", "Formato", "Mercado", "Faixa de Peso", "Sabor"],
    principalRows,
  );

  // 2) De Para Inovação (SKU → classificação + legado)
  const inov = deparaInovacao as Record<string, DeParaInovacaoEntry>;
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

  // 3-6) De Para Comercial — uma aba para cada mapeamento
  const comercial = deparaComercial as DeParaComercialShape;

  const canalRows = Object.entries(comercial.canalToCanalAjustado)
    .map(([from, to]) => ({ "Canal Origem": from, "Canal Ajustado": to }))
    .sort((a, b) => a["Canal Origem"].localeCompare(b["Canal Origem"]));
  appendSheet(wb, "3. Canal → Canal Ajustado", ["Canal Origem", "Canal Ajustado"], canalRows);

  const regiaoUfRows = Object.entries(comercial.regiaoToUf)
    .map(([from, to]) => ({ "Região Origem": from, UF: to }))
    .sort((a, b) => a["Região Origem"].localeCompare(b["Região Origem"]));
  appendSheet(wb, "4. Região → UF", ["Região Origem", "UF"], regiaoUfRows);

  const regiaoMercRows = Object.entries(comercial.regiaoToMercadoAjustado)
    .map(([from, to]) => ({ "Região Origem": from, "Mercado Ajustado": to }))
    .sort((a, b) => a["Região Origem"].localeCompare(b["Região Origem"]));
  appendSheet(wb, "5. Região → Mercado Ajust.", ["Região Origem", "Mercado Ajustado"], regiaoMercRows);

  const ufRegionalRows = Object.entries(comercial.ufToRegional)
    .map(([from, to]) => ({ UF: from, Regional: to }))
    .sort((a, b) => a.UF.localeCompare(b.UF));
  appendSheet(wb, "6. UF → Regional", ["UF", "Regional"], ufRegionalRows);

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

  const today = new Date();
  const stamp = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
  XLSX.writeFile(wb, `de-paras_auditoria_${stamp}.xlsx`);
}
