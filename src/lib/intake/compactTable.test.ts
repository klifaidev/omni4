import { describe, expect, it } from "vitest";
import {
  compactAllRows,
  compactDataRows,
  compactHeaders,
  decodeCompactTable,
  encodeCompactTable,
  filterCompactRows,
  isCompactTableName,
  toCompactTable,
} from "./compactTable";

const sheet = [
  ["Relatório KE30", null, null],
  ["Artigo", "Período/ano", "Rec. Líquida"],
  ["100009 CHOC", "009.2026 Setembro 2026", 1234.5],
  ["100010 COB", "009.2026 Setembro 2026", -2],
  [12345, null, 0],
  [null, null, null],
];

describe("tabela compacta (.omnib)", () => {
  it("separa cabeçalho e dados e escolhe o tipo de cada coluna", () => {
    const table = toCompactTable(sheet, 1);
    expect(table.head).toHaveLength(2);
    expect(table.rowCount).toBe(3); // a linha vazia do fim não é dado
    expect(table.columns.map((c) => c.type)).toEqual(["dict", "dict", "num"]);
    expect(compactHeaders(table)).toEqual(["Artigo", "Período/ano", "Rec. Líquida"]);
  });

  it("guarda texto repetido uma vez só e preserva número no meio de texto", () => {
    const table = toCompactTable(sheet, 1);
    const periodo = table.columns[1];
    expect(periodo.type === "dict" && periodo.dict).toEqual(["009.2026 Setembro 2026"]);
    expect(compactDataRows(table)[2]).toEqual([12345, null, 0]);
  });

  it("ida e volta pelo arquivo devolve exatamente as mesmas linhas", async () => {
    const table = toCompactTable(sheet, 1);
    const bytes = await encodeCompactTable(table, { kind: "real", sourceName: "Base One.xlsx", sheetName: "Real", createdAt: "2026-10-17" });
    const { table: back, meta } = await decodeCompactTable(bytes);
    expect(meta.sheetName).toBe("Real");
    expect(compactAllRows(back)).toEqual(compactAllRows(table));
  });

  it("usa códigos de 16 bits quando o dicionário passa de 255 valores", async () => {
    const rows: unknown[][] = [["SKU"]];
    for (let i = 0; i < 300; i++) rows.push([`SKU ${i}`]);
    const table = toCompactTable(rows, 0);
    const col = table.columns[0];
    expect(col.type === "dict" && col.codes).toBeInstanceOf(Uint16Array);
    const { table: back } = await decodeCompactTable(await encodeCompactTable(table, { kind: "x", sourceName: "", sheetName: "", createdAt: "" }));
    expect(compactDataRows(back)[299]).toEqual(["SKU 299"]);
  });

  it("filtra linhas mantendo o tipo das colunas", () => {
    const table = toCompactTable(sheet, 1);
    const only = filterCompactRows(table, (r) => r !== 1);
    expect(compactDataRows(only)).toEqual([["100009 CHOC", "009.2026 Setembro 2026", 1234.5], [12345, null, 0]]);
  });

  it("reconhece o nome do arquivo compacto", () => {
    expect(isCompactTableName("Real 2026-09.omnib")).toBe(true);
    expect(isCompactTableName("KE30 Setembro.csv")).toBe(false);
  });
});
