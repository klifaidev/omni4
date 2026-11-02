// Congelamento de abas ocultas.
//
// As abas ficam montadas para abrir na hora (ver layouts/KeptPages). Só que uma
// aba oculta não pode recalcular a cada filtro: seriam vinte telas refazendo
// contas e desenhando gráficos para ninguém ver. Então, enquanto oculta, ela
// enxerga as stores como estavam quando saiu de cena, e não é avisada de nada.
// Ao voltar, descongela: só os componentes cujo valor mudou de verdade renderizam.
//
// Funciona trocando o que a aba enxerga da store, sem mudar nada nas telas: quem
// usa `usePricing(...)` dentro de uma aba passa pelo PageScope daquela aba; quem
// está fora de uma aba (barra lateral, Slides) usa a store normalmente. Leituras
// com `getState()` em clique ou efeito continuam vendo o valor atual.
import { createContext, useContext } from "react";
import { create, useStore, type StateCreator, type StoreApi, type UseBoundStore } from "zustand";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyStore = StoreApi<any>;

const freezableStores = new Set<AnyStore>();

export class PageScope {
  frozen = false;
  /** Alguma store que esta aba usa mudou enquanto ela estava congelada. */
  stale = false;
  /** Título da aba, aplicado à janela quando ela está à vista. */
  title: string | null = null;
  /** Avisado quando a aba fica desatualizada. */
  onStale: (() => void) | null = null;

  private snapshots = new Map<AnyStore, unknown>();
  private listeners = new Set<() => void>();
  private apis = new Map<AnyStore, AnyStore>();

  constructor(frozen: boolean) {
    if (frozen) this.freeze();
  }

  freeze(): void {
    if (this.frozen) return;
    for (const store of freezableStores) this.snapshots.set(store, store.getState());
    this.frozen = true;
  }

  /** Descongela e avisa os componentes da aba; só renderiza quem mudou de valor. */
  thaw(): void {
    if (!this.frozen) return;
    this.frozen = false;
    this.stale = false;
    this.snapshots.clear();
    for (const listener of [...this.listeners]) listener();
  }

  apiFor(store: AnyStore): AnyStore {
    let api = this.apis.get(store);
    if (api) return api;
    api = {
      ...store,
      getState: () => (this.frozen && this.snapshots.has(store) ? this.snapshots.get(store) : store.getState()),
      subscribe: (listener) => {
        this.listeners.add(listener as () => void);
        const unsubscribe = store.subscribe((state, previous) => {
          if (!this.frozen) {
            listener(state, previous);
            return;
          }
          if (this.stale) return;
          this.stale = true;
          this.onStale?.();
        });
        return () => {
          this.listeners.delete(listener as () => void);
          unsubscribe();
        };
      },
    };
    this.apis.set(store, api);
    return api;
  }
}

export const PageScopeContext = createContext<PageScope | null>(null);

export function usePageScope(): PageScope | null {
  return useContext(PageScopeContext);
}

function freezable<T>(store: UseBoundStore<StoreApi<T>>): UseBoundStore<StoreApi<T>> {
  freezableStores.add(store);
  const useFreezableStore = (selector?: (state: T) => unknown) => {
    const scope = useContext(PageScopeContext);
    return useStore(scope ? (scope.apiFor(store) as StoreApi<T>) : store, selector as (state: T) => unknown);
  };
  return Object.assign(useFreezableStore, store) as UseBoundStore<StoreApi<T>>;
}

/** Igual ao `create` do zustand; a store resultante respeita o congelamento. */
export const createFreezable = (<T>(init?: StateCreator<T, [], []>) =>
  init
    ? freezable(create<T>()(init))
    : (later: StateCreator<T, [], []>) => freezable(create<T>()(later))) as typeof create;
