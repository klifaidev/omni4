import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// As bases carregam sob controle do teste (resolvidas quando o teste mandar).
let resolveBases: () => void = () => undefined;
vi.mock("@/lib/preloadBases", () => ({
  preloadSavedBases: vi.fn((onProgress: (p: unknown) => void) => {
    onProgress({ status: "loading", percent: 10, label: "Carregando KE30 (Real)", loaded: [], failed: [] });
    return new Promise<void>((resolve) => { resolveBases = resolve; });
  }),
}));
vi.mock("@/lib/preloadSlidesRoute", () => ({ preloadSlidesRoute: vi.fn(() => Promise.resolve()) }));

import { AppPreloader } from "./AppPreloader";

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("entrada do app (AppPreloader)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("mostra o carregamento das bases e segura o app", async () => {
    render(<AppPreloader><div>app pronto</div></AppPreloader>);
    await flush();
    expect(screen.getByText("Carregando KE30 (Real)")).toBeInTheDocument();
    expect(screen.queryByText("app pronto")).toBeNull();
  });

  it("entra assim que as bases terminam", async () => {
    render(<AppPreloader><div>app pronto</div></AppPreloader>);
    await flush();
    resolveBases();
    await flush(300);
    expect(screen.getByText("app pronto")).toBeInTheDocument();
  });
});
