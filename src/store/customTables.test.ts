import { describe, expect, it } from "vitest";
import {
  createCustomTableDraft,
  parseCustomTablesPayload,
  serializeCustomTables,
} from "./customTables";

describe("customTables", () => {
  it("serializes and parses multiple free-form custom tables", () => {
    const tableA = {
      ...createCustomTableDraft("Concorrentes 2026"),
      columns: ["Concorrente", "Preco", "Volume"],
      rows: [
        ["Marca A", 12.5, 1000],
        ["Marca B", 10.2, 850],
      ],
    };
    const tableB = {
      ...createCustomTableDraft("Metas do Trimestre"),
      columns: ["Mes", "Meta"],
      rows: [["Abr/26", 0.32]],
    };

    const parsed = parseCustomTablesPayload(serializeCustomTables([tableA, tableB]));

    expect(parsed).toHaveLength(2);
    expect(parsed[0].name).toBe("Concorrentes 2026");
    expect(parsed[0].columns).toEqual(["Concorrente", "Preco", "Volume"]);
    expect(parsed[0].rows[0]).toEqual(["Marca A", 12.5, 1000]);
    expect(parsed[1].name).toBe("Metas do Trimestre");
  });
});
