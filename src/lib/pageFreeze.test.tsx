import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createFreezable, PageScope, PageScopeContext } from "./pageFreeze";

interface CounterState {
  count: number;
  other: number;
  inc: () => void;
  bumpOther: () => void;
}

function makeStore() {
  return createFreezable<CounterState>((set) => ({
    count: 0,
    other: 0,
    inc: () => set((s) => ({ count: s.count + 1 })),
    bumpOther: () => set((s) => ({ other: s.other + 1 })),
  }));
}

function setup() {
  const useCounter = makeStore();
  const renders = vi.fn();
  const Page = () => {
    const count = useCounter((s) => s.count);
    renders();
    return <div data-testid="value">{count}</div>;
  };
  return { useCounter, renders, Page };
}

describe("congelamento de abas (pageFreeze)", () => {
  it("fora de uma aba, a store funciona como uma store comum", () => {
    const { useCounter, Page } = setup();
    render(<Page />);
    act(() => useCounter.getState().inc());
    expect(screen.getByTestId("value").textContent).toBe("1");
  });

  it("aba à vista recebe as mudanças", () => {
    const { useCounter, Page } = setup();
    const scope = new PageScope(false);
    render(<PageScopeContext.Provider value={scope}><Page /></PageScopeContext.Provider>);
    act(() => useCounter.getState().inc());
    expect(screen.getByTestId("value").textContent).toBe("1");
    expect(scope.stale).toBe(false);
  });

  it("aba congelada não renderiza nem muda de valor, e fica marcada como desatualizada", () => {
    const { useCounter, renders, Page } = setup();
    const scope = new PageScope(false);
    const onStale = vi.fn();
    scope.onStale = onStale;
    render(<PageScopeContext.Provider value={scope}><Page /></PageScopeContext.Provider>);
    renders.mockClear();

    scope.freeze();
    act(() => {
      useCounter.getState().inc();
      useCounter.getState().inc();
    });

    expect(renders).not.toHaveBeenCalled();
    expect(screen.getByTestId("value").textContent).toBe("0");
    expect(scope.stale).toBe(true);
    expect(onStale).toHaveBeenCalledTimes(1);
  });

  it("ao descongelar, mostra o valor atual", () => {
    const { useCounter, Page } = setup();
    const scope = new PageScope(false);
    render(<PageScopeContext.Provider value={scope}><Page /></PageScopeContext.Provider>);
    scope.freeze();
    act(() => useCounter.getState().inc());

    act(() => scope.thaw());

    expect(screen.getByTestId("value").textContent).toBe("1");
    expect(scope.stale).toBe(false);
  });

  it("ao descongelar sem o valor ter mudado, não renderiza nada de novo", () => {
    const { useCounter, renders, Page } = setup();
    const scope = new PageScope(false);
    render(<PageScopeContext.Provider value={scope}><Page /></PageScopeContext.Provider>);
    scope.freeze();
    // Outra parte da store muda: a aba é avisada, mas o que ela lê é o mesmo.
    act(() => useCounter.getState().bumpOther());
    renders.mockClear();

    act(() => scope.thaw());

    expect(renders).not.toHaveBeenCalled();
  });

  it("aba montada já congelada lê o valor do momento e fica parada nele", () => {
    const { useCounter, Page } = setup();
    act(() => useCounter.getState().inc());
    const scope = new PageScope(true);
    render(<PageScopeContext.Provider value={scope}><Page /></PageScopeContext.Provider>);
    expect(screen.getByTestId("value").textContent).toBe("1");

    act(() => useCounter.getState().inc());
    expect(screen.getByTestId("value").textContent).toBe("1");

    act(() => scope.thaw());
    expect(screen.getByTestId("value").textContent).toBe("2");
  });

  it("getState continua devolvendo o valor atual, mesmo com a aba congelada", () => {
    const { useCounter } = setup();
    const scope = new PageScope(true);
    act(() => useCounter.getState().inc());
    expect(scope.frozen).toBe(true);
    expect(useCounter.getState().count).toBe(1);
  });
});
