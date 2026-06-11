import { create } from "zustand";
import type { DemandaDeck, DemandaEdit, DemandaConfig, MetodoSugestao } from "@/lib/demanda";
import {
  sugestaoSazonalidade,
  sugestaoTendencia,
  sugestaoAnterior,
} from "@/lib/demandaCalc";

const SESSION_KEY = "demanda-edits-session";

function persistEdits(nomeArquivo: string, edits: DemandaEdit) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ nomeArquivo, edits }));
  } catch {}
}

function loadFromSession(nomeArquivo: string): DemandaEdit | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { nomeArquivo: string; edits: DemandaEdit };
    if (saved?.nomeArquivo === nomeArquivo && saved?.edits) return saved.edits;
  } catch {}
  return null;
}

interface DemandaState {
  deck: DemandaDeck | null;
  edits: DemandaEdit;
  config: DemandaConfig;
  canalAtivo: string | null;
  skuDrawerOpen: string | null;
  sessionRestored: boolean;

  loadDeck: (deck: DemandaDeck) => void;
  clearDeck: () => void;
  setEdit: (canal: string, cod: number, mesIdx: number, valor: number) => void;
  setEditsForSku: (canal: string, cod: number, values: Record<number, number>) => void;
  clearSkuEdits: (canal: string, cod: number) => void;
  applyMetodo: (canal: string, cod: number, metodo: MetodoSugestao) => void;
  applyMetodoCanalTodo: (canal: string, metodo: MetodoSugestao) => void;
  setCanalAtivo: (canal: string) => void;
  setSkuDrawerOpen: (key: string | null) => void;
  setConfig: (patch: Partial<DemandaConfig>) => void;
  dismissSessionRestored: () => void;
}

export const useDemanda = create<DemandaState>((set, get) => ({
  deck: null,
  edits: {},
  config: { fatorCrescimento: 1.05, mesesTendencia: 4 },
  canalAtivo: null,
  skuDrawerOpen: null,
  sessionRestored: false,

  loadDeck: (deck) => {
    const saved = loadFromSession(deck.nomeArquivo);
    const edits = saved ?? {};
    const sessionRestored = saved !== null;
    const canais = Array.from(new Set(deck.rows.map((r) => r.sku.regional))).sort();
    set({ deck, edits, canalAtivo: canais[0] ?? null, skuDrawerOpen: null, sessionRestored });
  },

  clearDeck: () => {
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
    set({ deck: null, edits: {}, canalAtivo: null, skuDrawerOpen: null, sessionRestored: false });
  },

  setEdit: (canal, cod, mesIdx, valor) =>
    set((s) => {
      const edits = {
        ...s.edits,
        [canal]: {
          ...(s.edits[canal] ?? {}),
          [cod]: {
            ...(s.edits[canal]?.[cod] ?? {}),
            [mesIdx]: valor,
          },
        },
      };
      if (s.deck) persistEdits(s.deck.nomeArquivo, edits);
      return { edits };
    }),

  setEditsForSku: (canal, cod, values) =>
    set((s) => {
      const edits = {
        ...s.edits,
        [canal]: {
          ...(s.edits[canal] ?? {}),
          [cod]: {
            ...(s.edits[canal]?.[cod] ?? {}),
            ...values,
          },
        },
      };
      if (s.deck) persistEdits(s.deck.nomeArquivo, edits);
      return { edits };
    }),

  clearSkuEdits: (canal, cod) =>
    set((s) => {
      const canalEdits = { ...(s.edits[canal] ?? {}) };
      delete canalEdits[cod];
      const edits = { ...s.edits, [canal]: canalEdits };
      if (s.deck) persistEdits(s.deck.nomeArquivo, edits);
      return { edits };
    }),

  applyMetodo: (canal, cod, metodo) => {
    const { deck, config } = get();
    if (!deck) return;
    const row = deck.rows.find((r) => r.sku.regional === canal && r.sku.cod === cod);
    if (!row) return;

    let valores: number[];
    if (metodo === "sazonalidade") {
      valores = sugestaoSazonalidade(row, config.fatorCrescimento);
    } else if (metodo === "tendencia") {
      valores = sugestaoTendencia(row, config.mesesTendencia);
    } else {
      valores = sugestaoAnterior(row);
    }

    const mesAtualIdx = deck.meses.mesAtualIdx;
    const patch: Record<number, number> = {};
    for (let i = mesAtualIdx + 1; i < 12; i++) {
      patch[i] = valores[i] ?? 0;
    }
    get().setEditsForSku(canal, cod, patch);
  },

  applyMetodoCanalTodo: (canal, metodo) => {
    const { deck } = get();
    if (!deck) return;
    for (const row of deck.rows.filter((r) => r.sku.regional === canal)) {
      get().applyMetodo(canal, row.sku.cod, metodo);
    }
  },

  setCanalAtivo: (canal) => set({ canalAtivo: canal }),
  setSkuDrawerOpen: (key) => set({ skuDrawerOpen: key }),
  setConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),
  dismissSessionRestored: () => set({ sessionRestored: false }),
}));
