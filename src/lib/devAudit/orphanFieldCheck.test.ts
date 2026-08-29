import { describe, it, expect } from "vitest";
import { findOrphanFields } from "./orphanFieldCheck";

describe("orphanFieldCheck", () => {
  it("todo campo escrito pelos inspectors de Slides tem um consumidor conhecido", () => {
    const orphans = findOrphanFields();
    if (orphans.length > 0) {
      const report = orphans
        .map((o) => `  • "${o.field}" — ${o.file}:${o.line}\n      ${o.snippet}`)
        .join("\n");
      throw new Error(
        `${orphans.length} campo(s) escrito(s) por um inspector do editor de Slides ` +
        `mas nunca lido(s) pelos renderers/helpers correspondentes ` +
        `(BlockRenderer.tsx, ChartCanvas.tsx, ShapeRenderer.tsx e afins):\n\n${report}\n\n` +
        `Isso é a mesma classe de bug de v1.9.341/342 (showBudget, marker.shape, ` +
        `style.area.stacked/lineOnTop, topN, lineDirection) — o usuário muda a opção ` +
        `e nada acontece na tela.\n\n` +
        `Antes de "corrigir": confirme lendo o inspector e o(s) render(s) relevantes. ` +
        `Se for um campo em progresso ou deliberadamente só-para-export, adicione-o ` +
        `ao ALLOWLIST em src/lib/devAudit/orphanFieldCheck.ts com o motivo — nunca ` +
        `apague este teste para fazê-lo passar.`,
      );
    }
    expect(orphans).toEqual([]);
  });
});
