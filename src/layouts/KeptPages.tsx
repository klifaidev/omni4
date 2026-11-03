// As abas do app, prontas antes do clique.
//
// Cada aba fica montada numa camada própria. Trocar de aba é só mostrar uma
// camada e esconder a outra, sem montar componentes nem desenhar gráficos: a
// troca cabe num quadro. Enquanto oculta, a aba fica congelada (lib/pageFreeze)
// e não gasta nada; se os filtros mudaram, ela é atualizada aos poucos quando o
// usuário está parado (ou, no pior caso, na hora de abrir, antes de aparecer).
//
// A camada oculta mantém a largura da tela e continua com layout (visibility,
// não display:none): os gráficos não percebem a troca e não se redesenham.
import { Component, memo, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { PageScope, PageScopeContext } from "@/lib/pageFreeze";
import { reportRendererError } from "@/lib/rendererErrorReporting";
import { useKeptPages } from "@/store/keptPages";
import { PAGE_BY_PATH, PAGES, preparePage, type PageEntry } from "./pageTable";

const HIDDEN_LAYER: CSSProperties = {
  // fixed: não entra na área de rolagem da tela, seja qual for a largura guardada.
  position: "fixed",
  top: 0,
  left: 0,
  height: "100vh",
  overflow: "hidden",
  // O conteúdo é pulado por inteiro (sem pintura e sem foco) com content-visibility,
  // aplicado em PageLayer, mas o layout fica guardado: aparecer não exige refazer
  // nada. `visibility` e `inert` são herdados e obrigam a recalcular o estilo de
  // cada nó da aba, tanto ao mostrar quanto ao esconder. Até lá, opacidade zero.
  opacity: 0,
  pointerEvents: "none",
  zIndex: -1,
};

/** Tempo sem mexer em nada antes de atualizar as abas ocultas. */
const CATCH_UP_QUIET_MS = 700;

function PageRouteFallback() {
  return (
    <div className="flex min-h-[calc(100vh-72px)] items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
    </div>
  );
}

/**
 * Um erro numa aba oculta não pode derrubar o app (o usuário nem está nela).
 * A aba some e tenta de novo ao ser aberta; se falhar à vista, o erro sobe para
 * a tela de erro do app, como sempre foi.
 */
interface LayerBoundaryProps {
  active: boolean;
  path: string;
  children: ReactNode;
}

interface LayerBoundaryState {
  error: Error | null;
  /** O erro acabou de chegar: ainda não se sabe se a aba estava à vista. */
  fresh: boolean;
  failedWhileActive: boolean;
}

class LayerBoundary extends Component<LayerBoundaryProps, LayerBoundaryState> {
  state: LayerBoundaryState = { error: null, fresh: false, failedWhileActive: false };

  static getDerivedStateFromError(error: Error): Partial<LayerBoundaryState> {
    return { error, fresh: true };
  }

  static getDerivedStateFromProps(props: LayerBoundaryProps, state: LayerBoundaryState): Partial<LayerBoundaryState> | null {
    if (!state.error) return null;
    if (state.fresh) return { fresh: false, failedWhileActive: props.active };
    // Falhou oculta e agora foi aberta: nova tentativa.
    if (props.active && !state.failedWhileActive) return { error: null };
    return null;
  }

  componentDidCatch(error: Error) {
    if (this.props.active) return;
    reportRendererError(`aba oculta ${this.props.path}`, error);
  }

  render() {
    if (this.state.error) {
      if (this.props.active) throw this.state.error;
      return null;
    }
    return this.props.children;
  }
}

interface PageLayerProps {
  page: PageEntry;
  active: boolean;
  register: (path: string, scope: PageScope | null) => void;
}

const PageLayer = memo(function PageLayer({ page, active, register }: PageLayerProps) {
  const [scope] = useState(() => new PageScope(!active));
  const layerRef = useRef<HTMLDivElement>(null);
  const [Screen] = useState(() => page.loaded ?? page.Component);

  useEffect(() => {
    register(page.path, scope);
    return () => register(page.path, null);
  }, [page.path, register, scope]);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    if (active) {
      layer.style.contentVisibility = "";
      scope.thaw();
      return;
    }
    layer.style.width = `${layer.parentElement?.clientWidth ?? window.innerWidth}px`;
    scope.freeze();
    // content-visibility só dois quadros depois de a camada sair do fluxo. No mesmo
    // quadro, o Chromium guarda para a rolagem com a roda a altura que a tela tinha
    // com esta aba à vista: a aba seguinte (Bases, por exemplo) não rolava além disso.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => { layer.style.contentVisibility = "hidden"; });
    });
    return () => cancelAnimationFrame(frame);
  }, [active, scope]);

  // Depois das limpezas dos outros efeitos: os Slides, ao sair de cena, zeram o título.
  useEffect(() => {
    if (active) document.title = scope.title ?? "OMNI4";
  }, [active, scope]);

  return (
    <div
      ref={layerRef}
      data-page-layer={page.path}
      aria-hidden={!active}
      style={active ? undefined : { ...HIDDEN_LAYER, width: layerRef.current?.style.width }}
    >
      <PageScopeContext.Provider value={scope}>
        <LayerBoundary active={active} path={page.path}>
          <Suspense fallback={active ? <PageRouteFallback /> : null}>
            <Screen />
          </Suspense>
        </LayerBoundary>
      </PageScopeContext.Provider>
    </div>
  );
});

function nextTask(ms = 0): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function KeptPages({ activePath }: { activePath: string | null }) {
  const mounted = useKeptPages((s) => s.mounted);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const list = useMemo(() => {
    const paths = activePath && PAGE_BY_PATH.has(activePath) && !mounted.includes(activePath)
      ? [...mounted, activePath]
      : mounted;
    return paths.map((path) => PAGE_BY_PATH.get(path)).filter((entry): entry is PageEntry => !!entry);
  }, [activePath, mounted]);

  // Guarda a aba aberta (se ela for das que ficam).
  useEffect(() => {
    if (activePath && PAGE_BY_PATH.get(activePath)?.keep) useKeptPages.getState().addMounted(activePath);
  }, [activePath, mounted]);

  // Pré-montagem na abertura do app: uma aba por vez, deixando a tela de entrada
  // mostrar o progresso entre elas.
  useEffect(() => {
    const store = useKeptPages.getState();
    if (store.warmup.status !== "idle") return;
    const pages = PAGES.filter((entry) => entry.warm);
    let done = 0;
    store.setWarmup({ status: "running", done, total: pages.length, label: pages[0]?.label ?? "" });
    void (async () => {
      for (const entry of pages) {
        useKeptPages.getState().setWarmup({ status: "running", done, total: pages.length, label: entry.label });
        await nextTask();
        try {
          await preparePage(entry);
          useKeptPages.getState().addMounted(entry.path);
        } catch {
          // Sem o arquivo da aba agora: ela tenta de novo quando for aberta.
        }
        await nextTask(10);
        done += 1;
      }
      // Uma aba pode ter gravado um padrão na store ao montar (a Bridge grava o par
      // de meses): as que dependem dele se atualizam antes de a entrada liberar.
      for (const [path, scope] of scopes.current) {
        if (!scope.stale || path === activeRef.current) continue;
        flushSync(() => scope.thaw());
        scope.freeze();
        await nextTask();
      }
      useKeptPages.getState().setWarmup({ status: "done", done, total: pages.length, label: "" });
    })();
  }, []);

  // Cada aba lembra onde estava rolada; a primeira visita começa do topo.
  const scrollByPath = useRef(new Map<string, number>());
  const scrollPath = useRef(activePath);
  useLayoutEffect(() => {
    const main = wrapperRef.current?.closest("main");
    if (!main) return;
    scrollPath.current = activePath;
    if (activePath) main.scrollTop = scrollByPath.current.get(activePath) ?? 0;
  }, [activePath]);
  useEffect(() => {
    const main = wrapperRef.current?.closest("main");
    if (!main) return;
    const onScroll = () => {
      if (scrollPath.current) scrollByPath.current.set(scrollPath.current, main.scrollTop);
    };
    main.addEventListener("scroll", onScroll, { passive: true });
    return () => main.removeEventListener("scroll", onScroll);
  }, []);

  // Atualização das abas ocultas depois que os dados ou filtros mudam: uma por
  // vez, só com o usuário parado, e nunca com os Slides abertos.
  const scopes = useRef(new Map<string, PageScope>());
  const activeRef = useRef(activePath);
  activeRef.current = activePath;
  const lastInput = useRef(0);
  const catchUpTimer = useRef<number | null>(null);
  const scheduleCatchUp = useRef<() => void>(() => undefined);

  useEffect(() => {
    const markInput = () => {
      lastInput.current = performance.now();
    };
    const events = ["pointerdown", "keydown", "wheel"] as const;
    for (const name of events) window.addEventListener(name, markInput, { passive: true, capture: true });

    const schedule = (delay = CATCH_UP_QUIET_MS) => {
      if (catchUpTimer.current !== null) window.clearTimeout(catchUpTimer.current);
      catchUpTimer.current = window.setTimeout(run, delay);
    };
    const run = () => {
      catchUpTimer.current = null;
      const stale = [...scopes.current.entries()].find(([path, scope]) => scope.stale && path !== activeRef.current);
      if (!stale) return;
      const sinceInput = performance.now() - lastInput.current;
      if (activeRef.current === null || sinceInput < CATCH_UP_QUIET_MS) {
        schedule(CATCH_UP_QUIET_MS);
        return;
      }
      const [, scope] = stale;
      // flushSync: renderiza agora e congela de novo em seguida, ainda oculta.
      flushSync(() => scope.thaw());
      scope.freeze();
      schedule(60);
    };
    scheduleCatchUp.current = () => schedule();

    return () => {
      for (const name of events) window.removeEventListener(name, markInput, { capture: true });
      if (catchUpTimer.current !== null) window.clearTimeout(catchUpTimer.current);
    };
  }, []);

  const register = useRef((path: string, scope: PageScope | null) => {
    if (scope) {
      scope.onStale = () => scheduleCatchUp.current();
      scopes.current.set(path, scope);
    } else {
      scopes.current.delete(path);
    }
  }).current;

  return (
    <div ref={wrapperRef}>
      {list.map((entry) => (
        <PageLayer key={entry.path} page={entry} active={entry.path === activePath} register={register} />
      ))}
    </div>
  );
}
