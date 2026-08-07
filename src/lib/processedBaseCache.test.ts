import { describe, expect, it } from "vitest";
import { computeProcessedCachePlan } from "./processedBaseCache";

describe("processed base cache plan", () => {
  it("keeps small payloads monolithic", () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({
      sku: String(index),
      categoria: "Cobertura",
      rol: index,
    }));

    const plan = computeProcessedCachePlan(rows);

    expect(plan.mode).toBe("monolithic");
    expect(plan.chunkSize).toBe(rows.length);
  });

  it("uses chunked cache for wide payloads even below the row-count limit", () => {
    const longText = "x".repeat(8_000);
    const rows = Array.from({ length: 10_000 }, (_, index) => ({
      sku: String(index),
      categoria: "Cobertura",
      descricao: longText,
    }));

    const plan = computeProcessedCachePlan(rows);

    expect(plan.mode).toBe("chunked");
    expect(plan.estimatedBytes).toBeGreaterThan(64 * 1024 * 1024);
  });

  it("reduces chunk size when average rows are too large for the default chunk", () => {
    const longText = "x".repeat(1_000);
    const rows = Array.from({ length: 250_000 }, (_, index) => ({
      sku: String(index),
      categoria: "Cobertura",
      descricao: longText,
    }));

    const plan = computeProcessedCachePlan(rows);

    expect(plan.mode).toBe("chunked");
    expect(plan.chunkSize).toBeGreaterThanOrEqual(1_000);
    expect(plan.chunkSize).toBeLessThan(50_000);
  });
});
