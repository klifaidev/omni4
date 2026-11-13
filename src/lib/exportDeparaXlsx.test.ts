import { afterEach, describe, expect, it } from "vitest";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { listDeParaEntries } from "./depara";
import { clearBaseHierarchy, registerBaseHierarchy } from "./baseHierarchy";
import { buildDeparasWorkbook, buildHierarchySheetRows, HIERARCHY_SHEET } from "./exportDeparaXlsx";
import { parseDePara360, planDePara360, stripHierarchyCode } from "./depara360";

const asFile = (bytes: ArrayBuffer, name = "De-Para 360.xlsx") =>
  ({ name, arrayBuffer: async () => bytes }) as unknown as File;

describe("De/Para 360 — aba de hierarquia no layout DE/PARA", () => {
  afterEach(() => clearBaseHierarchy());
  const known = listDeParaEntries().find((e) => e.entry.categoria && e.entry.marca && /^\d+$/.test(e.sku))!;

  it("põe o DE (como veio na base) ao lado do PARA (o que o app usa)", () => {
    registerBaseHierarchy({ [known.sku]: { marca: "B1 Top", tecnologia: "A13 Kibled" } });
    const rows = buildHierarchySheetRows([[{ sku: "999999123", skuDesc: "SKU SÓ NA BASE" }]]);
    expect(rows[0]).toEqual([
      "Artigo", "",
      "DE - 01 Categoria", "PARA - 01 Categoria", "Subcategoria",
      "DE - 02 Marca", "PARA - 02 Marca",
      "DE - 03 Família", "PARA - 03 Tecnologia",
      "DE - 04 Formato", "PARA - 04 Formato",
      "DE - 05 Mercado", "PARA - 05 Mercado",
      "DE - 06 Faixa de Peso", "PARA - 06 Faixa de Peso",
      "DE - 07 Sabor", "PARA - 07 Sabor",
    ]);
    const row = rows.find((r) => r[0] === Number(known.sku))!;
    expect(row[5]).toBe("B1 Top");
    expect(row[6]).toBe(known.entry.marca);
    expect(row[7]).toBe("A13 Kibled");
    expect(row[3]).toBe(known.entry.categoria);
    // SKU que só existe na base sai com o PARA em branco, para ser preenchido.
    const novo = rows.find((r) => r[0] === 999999123)!;
    expect(novo[1]).toBe("SKU SÓ NA BASE");
    expect(novo.slice(2).every((v) => v === "")).toBe(true);
  });

  it("grava as cores e volta a ser lido pela Central sem gerar mudanças", async () => {
    const out = await buildDeparasWorkbook();
    const bytes = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
    const zip = await JSZip.loadAsync(bytes);
    const wb = XLSX.read(bytes, { type: "array" });
    const index = wb.SheetNames.indexOf(HIERARCHY_SHEET);
    const sheet = await zip.file(`xl/worksheets/sheet${index + 1}.xml`)!.async("string");
    const styles = await zip.file("xl/styles.xml")!.async("string");
    expect(sheet).toMatch(/<c r="A1" s="\d+"/);
    expect(sheet).toContain('state="frozen"');
    expect(sheet).toContain("<autoFilter");
    expect(styles).toContain("FFE00000");
    expect(styles).toContain("FF00B050");

    const plan = planDePara360(await parseDePara360(asFile(bytes)));
    expect(plan.counts.sku).toBe(0);
  });

  it("lê a planilha do time com os códigos da hierarquia (\"B1 Top\" → Top)", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Artigo", "", "DE - 01 Categoria", "PARA - 01 Categoria", "Subcategoria", "DE - 02 Marca", "PARA - 02 Marca"],
      [Number(known.sku), "X", "A1 Chocolates", `A1 ${known.entry.categoria}`, "", "B1 Top", "B9 Marca Nova Teste"],
    ]), "De Para");
    const parsed = await parseDePara360(asFile(XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer));
    expect(parsed.found).toEqual(["hierarquia"]);
    // Categoria igual (sem o código) não muda; só a marca nova entra.
    expect(planDePara360(parsed).sku[known.sku]).toEqual({ marca: "Marca Nova Teste" });
  });

  it("tira só o código do começo", () => {
    expect(stripHierarchyCode("A7 10kg e acima")).toBe("10kg e acima");
    expect(stripHierarchyCode("B1 Top")).toBe("Top");
    expect(stripHierarchyCode("Top")).toBe("Top");
    expect(stripHierarchyCode("2 - 4,99kg")).toBe("2 - 4,99kg");
  });
});
