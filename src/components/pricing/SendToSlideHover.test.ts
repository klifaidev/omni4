import { describe, expect, it } from "vitest";
import { isSendToSlideEnabledForPage } from "@/lib/sendToSlideRollout";

describe("SendToSlideHover rollout", () => {
  it("enables the first rollout only for the selected high-priority pages", () => {
    expect(isSendToSlideEnabledForPage("Visão Geral")).toBe(true);
    expect(isSendToSlideEnabledForPage("Positivação")).toBe(true);
    expect(isSendToSlideEnabledForPage("Análise de Preço")).toBe(true);
  });

  it("keeps the remaining pages hidden until the next rollout", () => {
    expect(isSendToSlideEnabledForPage("Budget")).toBe(false);
    expect(isSendToSlideEnabledForPage("DRE")).toBe(false);
    expect(isSendToSlideEnabledForPage("Canais")).toBe(false);
    expect(isSendToSlideEnabledForPage("Farol de Cadastro")).toBe(false);
  });
});
