import { beforeEach, describe, expect, it } from "vitest";
import { addCustomOption, getCustomOptions, removeCustomOption, resetCustomOptions } from "./customOptions";

describe("opções manuais", () => {
  beforeEach(() => resetCustomOptions());

  it("cadastra por campo, limpa espaços e não duplica (ignora acento e maiúsculas)", () => {
    expect(addCustomOption("sku.marca", "  Nova   Marca ")).toBe("Nova Marca");
    expect(addCustomOption("sku.marca", "nova marca")).toBe("Nova Marca");
    expect(addCustomOption("sku.sabor", "Pistáche")).toBe("Pistáche");
    expect(addCustomOption("sku.sabor", "PISTACHE")).toBe("Pistáche");
    expect(getCustomOptions("sku.marca")).toEqual(["Nova Marca"]);
    expect(getCustomOptions("sku.sabor")).toEqual(["Pistáche"]);
  });

  it("remove só da lista do campo", () => {
    addCustomOption("sku.marca", "A");
    addCustomOption("sku.marca", "B");
    removeCustomOption("sku.marca", "A");
    expect(getCustomOptions("sku.marca")).toEqual(["B"]);
  });
});
