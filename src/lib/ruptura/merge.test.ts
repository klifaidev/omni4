import { describe, expect, it } from "vitest";
import { buildRupturaModel, detectRupturaHeader } from "./parse";
import { mergeRupturaModels } from "./merge";

const HEADER = ["ID da Pesquisa", "Marca", "Produto (SKU)", "Rede", "Bandeira", "PDV", "Cidade", "Estado", "Data", "Produto em Ruptura"];

function model(rows: unknown[][], fileName: string) {
  const all = [HEADER, ...rows];
  const header = detectRupturaHeader(all);
  if ("error" in header) throw new Error(header.error);
  return buildRupturaModel(all, header, { fileName, sheetName: "report" });
}

const august = model([
  [1, "TOP", "COB BARRA", "CARREFOUR", "ATACADAO", "Loja A", "Salvador", "Bahia", "2026-08-10", "Sim"],
  [2, "TOP", "COB GOTAS", "CARREFOUR", "ATACADAO", "Loja A", "Salvador", "Bahia", "2026-08-10", "Não"],
  [3, "TOP", "COB BARRA", "CARREFOUR", "ATACADAO", "Loja A", "Salvador", "Bahia", "2026-09-02", "Não"],
], "historico.xlsx");

const september = model([
  [10, "TOP", "COB BARRA", "CARREFOUR", "ATACADÃO", "Loja A", "Salvador", "Bahia", "2026-09-20", "Sim"],
  [11, "TOP", "CHOC NOVO", "ASSAI", "ASSAI", "Loja B", "Recife", "Pernambuco", "2026-09-21", "Sim"],
], "Base One.xlsx");

describe("mescla da ruptura mês a mês", () => {
  it("o mês novo substitui o mesmo mês e mantém o histórico", () => {
    const merged = mergeRupturaModels(august, september, { replaceExisting: true });
    expect(merged.months).toEqual(["2026-08", "2026-09"]);
    const sep = merged.months.indexOf("2026-09");
    const sepCells = merged.cells.month.filter((m) => m === sep).length;
    expect(sepCells).toBe(2); // as 2 avaliações de setembro da Base One, não a antiga
    const aug = merged.months.indexOf("2026-08");
    expect(merged.cells.month.filter((m) => m === aug).length).toBe(2);
  });

  it("manter os atuais ignora os meses repetidos do modelo novo", () => {
    const merged = mergeRupturaModels(august, september, { replaceExisting: false });
    const sep = merged.months.indexOf("2026-09");
    const results = merged.cells.result.filter((_, i) => merged.cells.month[i] === sep);
    expect(results).toEqual([0]); // a avaliação antiga de setembro (Não)
  });

  it("a mesma loja escrita com acento diferente continua sendo uma loja", () => {
    const merged = mergeRupturaModels(august, september, { replaceExisting: true });
    expect(merged.stores.rede.length).toBe(2); // Loja A (Carrefour) + Loja B (Assaí)
    expect(merged.dict.sku).toHaveLength(3);
  });

  it("recalcula meses com respostas Não a partir das avaliações", () => {
    const merged = mergeRupturaModels(august, september, { replaceExisting: true });
    expect(merged.quality.monthsWithNegatives).toEqual([merged.months.indexOf("2026-08")]);
    expect(merged.quality.firstDate).toBe("2026-08-10");
    expect(merged.quality.lastDate).toBe("2026-09-21");
  });
});
