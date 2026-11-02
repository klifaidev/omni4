import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ boom: false, mounts: { a: 0, b: 0, up: 0 }, setValue: (_: number) => {} }));

vi.mock("@/lib/rendererErrorReporting", () => ({ reportRendererError: vi.fn() }));
vi.mock("./pageTable", async () => {
  const React = await import("react");
  const { createFreezable } = await import("@/lib/pageFreeze");
  const useValue = createFreezable<{ value: number; set: (v: number) => void }>((set) => ({
    value: 0,
    set: (value) => set({ value }),
  }));
  h.setValue = (v: number) => useValue.getState().set(v);

  const A = () => {
    const value = useValue((s) => s.value);
    const [clicks, setClicks] = React.useState(0);
    React.useEffect(() => { h.mounts.a += 1; }, []);
    return React.createElement("button", { onClick: () => setClicks((c) => c + 1) }, `A ${value} cliques ${clicks}`);
  };
  const B = () => {
    const value = useValue((s) => s.value);
    React.useEffect(() => { h.mounts.b += 1; }, []);
    if (h.boom) throw new Error("falha na aba B");
    return React.createElement("div", null, `B ${value}`);
  };
  const Up = () => {
    React.useEffect(() => { h.mounts.up += 1; }, []);
    return React.createElement("div", null, "Upload");
  };
  const entry = (path: string, Component: React.ComponentType, keep = true) => ({
    path,
    label: path,
    load: async () => ({ default: Component }),
    Component,
    loaded: Component,
    keep,
    warm: keep,
  });
  const PAGES = [entry("/a", A), entry("/b", B), entry("/up", Up, false)];
  return { PAGES, PAGE_BY_PATH: new Map(PAGES.map((p) => [p.path, p])), preparePage: async () => undefined };
});

import { useKeptPages } from "@/store/keptPages";
import { KeptPages } from "./KeptPages";

function layer(path: string) {
  return document.querySelector(`[data-page-layer="${path}"]`) as HTMLElement | null;
}

async function warmedUp() {
  await waitFor(() => expect(useKeptPages.getState().warmup.status).toBe("done"));
}

describe("abas prontas (KeptPages)", () => {
  beforeEach(() => {
    h.boom = false;
    h.mounts = { a: 0, b: 0, up: 0 };
    h.setValue(0);
    useKeptPages.setState({ mounted: [], warmup: { status: "idle", done: 0, total: 0, label: "" } });
  });

  it("pré-monta as abas e deixa só a aberta à vista", async () => {
    render(<KeptPages activePath="/a" />);
    await warmedUp();
    expect(layer("/a")?.getAttribute("aria-hidden")).toBe("false");
    expect(layer("/b")?.getAttribute("aria-hidden")).toBe("true");
    expect(layer("/b")?.style.contentVisibility).toBe("hidden");
    expect(h.mounts.b).toBe(1);
  });

  it("não pré-monta aba marcada para montar só ao abrir", async () => {
    const { rerender } = render(<KeptPages activePath="/a" />);
    await warmedUp();
    expect(layer("/up")).toBeNull();
    rerender(<KeptPages activePath="/up" />);
    await waitFor(() => expect(screen.getByText("Upload")).toBeTruthy());
    rerender(<KeptPages activePath="/a" />);
    await waitFor(() => expect(layer("/up")).toBeNull());
  });

  it("trocar de aba não remonta e preserva o estado da aba", async () => {
    const { rerender } = render(<KeptPages activePath="/a" />);
    await warmedUp();
    act(() => screen.getByRole("button").click());
    rerender(<KeptPages activePath="/b" />);
    rerender(<KeptPages activePath="/a" />);
    expect(layer("/a")?.textContent).toContain("cliques 1");
    expect(h.mounts.a).toBe(1);
    expect(h.mounts.b).toBe(1);
  });

  it("aba oculta não muda enquanto oculta e abre com o valor atual", async () => {
    const { rerender } = render(<KeptPages activePath="/a" />);
    await warmedUp();
    // Sem esperar a atualização por trás: é o caso de abrir logo depois do filtro.
    act(() => h.setValue(7));
    expect(layer("/a")?.textContent).toContain("A 7");
    expect(layer("/b")?.textContent).toBe("B 0");
    rerender(<KeptPages activePath="/b" />);
    expect(layer("/b")?.textContent).toBe("B 7");
  });

  it("com o usuário parado, a aba oculta se atualiza sozinha e continua oculta", async () => {
    render(<KeptPages activePath="/a" />);
    await warmedUp();
    act(() => h.setValue(5));
    await waitFor(() => expect(layer("/b")?.textContent).toBe("B 5"), { timeout: 3000 });
    expect(layer("/b")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("erro em aba oculta não derruba o app; ela tenta de novo ao abrir", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    h.boom = true;
    const { rerender } = render(<KeptPages activePath="/a" />);
    await warmedUp();
    expect(layer("/a")?.textContent).toContain("A 0");
    expect(layer("/b")?.textContent).toBe("");

    h.boom = false;
    rerender(<KeptPages activePath="/b" />);
    await waitFor(() => expect(layer("/b")?.textContent).toBe("B 0"));
    quiet.mockRestore();
  });

  it("guarda de memória desmonta as ocultas; a aba aberta continua", async () => {
    const { rerender } = render(<KeptPages activePath="/a" />);
    await warmedUp();
    act(() => useKeptPages.getState().releaseHidden());
    await waitFor(() => expect(layer("/b")).toBeNull());
    expect(layer("/a")).not.toBeNull();
    expect(h.mounts.a).toBe(1);
    rerender(<KeptPages activePath="/b" />);
    await waitFor(() => expect(layer("/b")?.textContent).toBe("B 0"));
    expect(h.mounts.b).toBe(2);
  });
});
