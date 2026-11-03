import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { listDeParaEntries } from "./depara";
import { getComercialEntries } from "./deparaComercial";
import { getInovacaoMap } from "./deparaInovacao";
import { parseDePara360, planDePara360 } from "./depara360";

function workbookFile(sheets: Record<string, Record<string, unknown>[]>, name = "De-Para 360.xlsx"): File {
  const wb = XLSX.utils.book_new();
  for (const [sheet, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheet);
  const bytes = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  // O File do jsdom não tem arrayBuffer(); o leitor só usa isso e o nome.
  return { name, arrayBuffer: async () => bytes } as unknown as File;
}

describe("De/Para 360", () => {
  const known = listDeParaEntries().find((e) => e.entry.categoria && e.entry.marca)!;
  const canal = getComercialEntries("canalToCanalAjustado")[0];
  const inovacao = Object.entries(getInovacaoMap()).map(([sku, v]) => ({
    SKU: sku,
    Classificação: v.classificacao,
    "Ano de Lançamento": v.anoLancamento ?? "",
    Legado: v.legado ?? "",
  }));

  it("reconhece as abas pelas colunas e só aplica o que muda", async () => {
    const file = workbookFile({
      Índice: [{ Aba: "1. SKU - Hierarquia", Descrição: "x" }],
      // Nome de aba qualquer: o que vale são as colunas.
      Produtos: [
        { SKU: known.sku, Descrição: known.entry.skuDesc, Categoria: "CATEGORIA NOVA", Marca: known.entry.marca, Origem: "Padrão" },
        { SKU: "999999001", Descrição: "SKU NOVO TESTE", Categoria: "BISCOITOS", Marca: "", Origem: "" },
      ],
      "2. SKU - Inovação": inovacao,
      "3. Canal → Canal Ajustado": [
        { "Canal Origem": canal.key, "Canal Ajustado": canal.value, Origem: "Padrão" },
        { "Canal Origem": "CANAL INEXISTENTE TESTE", "Canal Ajustado": "ESPECIALIZADO", Origem: "" },
      ],
      "6. UF → Regional": [{ UF: "ZZ", Regional: "REGIONAL TESTE", Origem: "" }],
    });

    const parsed = await parseDePara360(file);
    expect(parsed.found.sort()).toEqual(["canalToCanalAjustado", "hierarquia", "inovacao", "ufToRegional"].sort());

    const plan = planDePara360(parsed);
    // SKU conhecido: só a categoria muda; descrição e marca iguais não entram.
    expect(plan.sku[known.sku]).toEqual({ categoria: "CATEGORIA NOVA" });
    // SKU novo: entra o que veio preenchido; marca vazia não apaga nem cria nada.
    expect(plan.sku["999999001"]).toEqual({ skuDesc: "SKU NOVO TESTE", categoria: "BISCOITOS" });
    // Canal igual ao app não muda; o novo entra.
    expect(plan.comercial.canalToCanalAjustado).toEqual({ "CANAL INEXISTENTE TESTE": "ESPECIALIZADO" });
    expect(plan.comercial.ufToRegional).toEqual({ ZZ: "REGIONAL TESTE" });
    // Inovação idêntica à do app: nada a substituir.
    expect(plan.inovacao).toBeNull();
    expect(plan.counts).toEqual({ sku: 2, comercial: 2, inovacao: 0 });
  });

  it("recusa um arquivo sem nenhum De/Para", async () => {
    const file = workbookFile({ Planilha1: [{ Cliente: "A", Valor: 1 }] }, "outra.xlsx");
    await expect(parseDePara360(file)).rejects.toThrow(/Nenhuma aba de De\/Para/);
  });
});
