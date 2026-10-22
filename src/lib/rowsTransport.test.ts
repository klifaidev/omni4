import { describe, expect, it } from "vitest";
import { createRowsReceiver, isRowsRegisterMessage, packedTransferList, packRows, unpackRows, uploadRowsInParts, UPLOAD_PART_ROWS } from "./rowsTransport";
import { generateDemoData } from "./demoData";
import { budgetRowsAsPricing } from "./budgetAdapter";

const noYield = () => Promise.resolve();

/** Igualdade estrita, inclusive "campo ausente" × "campo com undefined". */
function expectSameRows(actual: object[], expected: object[]) {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    const a = actual[i] as Record<string, unknown>;
    const e = expected[i] as Record<string, unknown>;
    expect(Object.keys(a).sort()).toEqual(Object.keys(e).sort());
    for (const key of Object.keys(e)) expect(Object.is(a[key], e[key])).toBe(true);
  }
}

async function roundTrip(rows: object[], every?: number) {
  const packed = await packRows(rows, noYield, every);
  expect(packed).not.toBeNull();
  // Simula a transferência para o worker (o clone estruturado também move os buffers).
  const moved = structuredClone(packed!, { transfer: packedTransferList(packed!) });
  return unpackRows(moved);
}

describe("linhas em colunas para o worker dos Slides", () => {
  it("base Real de demonstração: ida e volta idêntica", async () => {
    const rows = generateDemoData({ monthsBack: 13, rowsPerMonth: 500 }).realRows;
    expectSameRows(await roundTrip(rows, 777), rows);
  });

  it("Budget visto como Real (outros campos): ida e volta idêntica", async () => {
    const rows = budgetRowsAsPricing(generateDemoData({ monthsBack: 13, rowsPerMonth: 300 }).budgetRows);
    expectSameRows(await roundTrip(rows), rows);
  });

  it("casos de borda: ausente, undefined, null, NaN, -0, campo que aparece tarde", async () => {
    const rows = [
      { periodo: "001.2026", rol: 1, uf: undefined },
      { periodo: "001.2026", rol: Number.NaN, extra: "x" },
      { periodo: "002.2026", rol: -0, uf: "SP", extra: null },
      { rol: 3, mod: 5 },
      { periodo: "003.2026", tardio: undefined },
      { periodo: "003.2026" },
      { periodo: "004.2026", tardio: "agora", rol: 4 },
      {},
      { soNulo: null },
    ];
    expectSameRows(await roundTrip(rows, 2), rows);
  });

  it("dicionário grande (mais de 65 mil textos) continua exato", async () => {
    const rows = Array.from({ length: 70_000 }, (_, i) => ({ sku: `S${i}`, rol: i }));
    expectSameRows(await roundTrip(rows, 10_000), rows);
  });

  it("formato inesperado devolve null (o envio antigo assume)", async () => {
    expect(await packRows([{ a: 1 }, { a: "texto" }], noYield)).toBeNull();
    expect(await packRows([{ a: "x" }, { a: 2 }], noYield)).toBeNull();
    expect(await packRows([{ a: true }], noYield)).toBeNull();
    expect(await packRows([{ a: { b: 1 } }], noYield)).toBeNull();
  });

  it("devolve a vez para a tela entre as fatias", async () => {
    let yields = 0;
    const rows = Array.from({ length: 10 }, (_, i) => ({ rol: i }));
    await packRows(rows, async () => { yields++; }, 3);
    expect(yields).toBe(3);
  });

  it("base vazia", async () => {
    expect(await roundTrip([])).toEqual([]);
  });
});

describe("protocolo de envio em partes (tela → worker)", () => {
  function fakeWorker() {
    const store = new Map<string, object[]>();
    const receiver = createRowsReceiver<object>(store);
    const log: string[] = [];
    const target = {
      postMessage(message: unknown, transfer?: Transferable[]) {
        // Igual ao postMessage: clone estruturado, movendo os buffers.
        const delivered = structuredClone(message, { transfer: (transfer ?? []) as Transferable[] });
        if (!isRowsRegisterMessage(delivered)) throw new Error("mensagem inesperada");
        log.push(delivered.type);
        receiver.handle(delivered);
      },
    };
    return { store, receiver, log, target };
  }

  it("partes em ordem; o conjunto só aparece inteiro, idêntico ao original", async () => {
    const rows = generateDemoData({ monthsBack: 13, rowsPerMonth: 1_700 }).realRows; // > 1 parte
    const w = fakeWorker();
    let checks = 0;
    await uploadRowsInParts(w.target, "base", rows, () => {
      checks++;
      // Durante o envio, o conjunto ainda não está disponível para cálculo.
      if (w.log.at(-1) !== "registerEnd") expect(w.store.has("base")).toBe(false);
      return true;
    }, noYield);
    expect(w.log[0]).toBe("registerStart");
    expect(w.log.at(-1)).toBe("registerEnd");
    expect(w.log.filter((t) => t === "registerPart").length).toBe(Math.ceil(rows.length / UPLOAD_PART_ROWS));
    expect(checks).toBeGreaterThan(0);
    expectSameRows(w.store.get("base")!, rows);
  }, 60_000);

  it("parte fora do formato: o conjunto inteiro vai do jeito antigo", async () => {
    const rows: object[] = Array.from({ length: UPLOAD_PART_ROWS + 10 }, (_, i) => ({ v: i }));
    (rows[UPLOAD_PART_ROWS + 5] as { v: unknown }).v = "texto";
    const w = fakeWorker();
    await uploadRowsInParts(w.target, "misto", rows, () => true, noYield);
    expect(w.log.at(-1)).toBe("register");
    expectSameRows(w.store.get("misto")!, rows);
  });

  it("worker trocado no meio: o envio é abandonado e nada fica pela metade", async () => {
    const rows = Array.from({ length: UPLOAD_PART_ROWS * 3 }, (_, i) => ({ v: i }));
    const w = fakeWorker();
    let alive = 2;
    await expect(uploadRowsInParts(w.target, "x", rows, () => alive-- > 0, noYield)).rejects.toThrow(/reiniciado/);
    expect(w.store.has("x")).toBe(false);
    w.receiver.release("x");
  });
});
