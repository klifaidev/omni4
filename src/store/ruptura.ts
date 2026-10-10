// Estado da aba Inteligência de Ruptura.
//
// A base bruta (~50 MB, ~550 mil linhas) nunca fica na memória da interface:
// o worker lê e consolida, e só o modelo colunar (poucos MB) chega aqui. No
// Electron, o arquivo original e o modelo consolidado ficam salvos em
// bases/ruptura — a próxima abertura lê o modelo direto do cache.
import { create } from "zustand";
import { isRupturaModel } from "@/lib/ruptura/parse";
import { RUPTURA_MODEL_VERSION, type RupturaDim, type RupturaModel } from "@/lib/ruptura/types";
import type { RupturaFilters, RupturaPeriod } from "@/lib/ruptura/metrics";
import type { RupturaWorkerResponse } from "@/workers/rupturaParse.worker";

const TIPO = "ruptura";
const CACHE_KIND = "ruptura-model";

export type RupturaStatus = "idle" | "checking" | "loading" | "ready" | "error";

export interface RupturaProgress {
  label: string;
  /** 0–1, ou null quando a etapa não informa avanço (leitura do XLSX). */
  fraction: number | null;
}

interface RupturaState {
  model: RupturaModel | null;
  status: RupturaStatus;
  progress: RupturaProgress | null;
  error: string | null;
  /** Nome do arquivo salvo no Electron (null fora dele ou sem base). */
  savedFileName: string | null;
  filters: RupturaFilters;
  period: RupturaPeriod | null;
  loadSaved: () => Promise<void>;
  importFile: (file: File) => Promise<void>;
  removeBase: () => Promise<void>;
  setFilter: (dim: RupturaDim, values: string[]) => void;
  toggleFilterValue: (dim: RupturaDim, value: string) => void;
  clearFilters: () => void;
  setPeriod: (period: RupturaPeriod | null) => void;
}

function bases() {
  return window.electronAPI?.bases ?? null;
}

function parseInWorker(buffer: ArrayBuffer, fileName: string, onProgress: (p: RupturaProgress) => void): Promise<RupturaModel> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/rupturaParse.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<RupturaWorkerResponse>) => {
      const msg = event.data;
      if (msg.type === "progress") {
        if (msg.stage === "reading") onProgress({ label: "Lendo a planilha", fraction: null });
        else onProgress({ label: "Consolidando avaliações por mês × loja × SKU", fraction: msg.total ? (msg.done ?? 0) / msg.total : null });
        return;
      }
      worker.terminate();
      if (msg.type === "done") resolve(msg.model);
      else reject(new Error(msg.message));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "Falha no processamento da planilha."));
    };
    worker.postMessage({ buffer, fileName }, [buffer]);
  });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** Período padrão: a base inteira. */
function fullPeriod(model: RupturaModel): RupturaPeriod {
  return { from: 0, to: Math.max(0, model.months.length - 1) };
}

export const useRuptura = create<RupturaState>((set, get) => ({
  model: null,
  status: "idle",
  progress: null,
  error: null,
  savedFileName: null,
  filters: {},
  period: null,

  loadSaved: async () => {
    const api = bases();
    if (!api || get().model || get().status === "checking" || get().status === "loading") return;
    set({ status: "checking", error: null });
    try {
      const info = await api.info();
      const saved = info.ok ? info.bases?.[TIPO] : undefined;
      const fileName = saved?.nomeArquivo ?? saved?.nomeArquivos?.[saved.nomeArquivos.length - 1];
      if (!fileName) {
        set({ status: "idle" });
        return;
      }
      set({ status: "loading", savedFileName: fileName, progress: { label: "Abrindo a base salva", fraction: null } });
      const cached = await api.carregarProcessado?.(TIPO, fileName, CACHE_KIND, RUPTURA_MODEL_VERSION);
      if (cached?.ok && cached.hit && isRupturaModel(cached.payload)) {
        const model = cached.payload;
        set({ model, status: "ready", progress: null, period: fullPeriod(model), filters: {} });
        return;
      }
      const file = await api.carregarArquivo?.(TIPO, fileName);
      if (!file?.ok || !file.arquivo) throw new Error("Não foi possível abrir o arquivo salvo da base de ruptura.");
      const model = await parseInWorker(base64ToBuffer(file.arquivo.conteudoBase64), fileName, (progress) => set({ progress }));
      set({ model, status: "ready", progress: null, period: fullPeriod(model), filters: {} });
      void api.salvarProcessado?.(TIPO, fileName, CACHE_KIND, RUPTURA_MODEL_VERSION, model);
    } catch (err) {
      set({ status: "error", progress: null, error: err instanceof Error ? err.message : "Falha ao abrir a base de ruptura." });
    }
  },

  importFile: async (file: File) => {
    if (get().status === "loading") return;
    set({ status: "loading", error: null, progress: { label: "Lendo o arquivo", fraction: null } });
    try {
      const buffer = await file.arrayBuffer();
      const model = await parseInWorker(buffer, file.name, (progress) => set({ progress }));
      set({ model, status: "ready", progress: null, period: fullPeriod(model), filters: {} });
      const api = bases();
      if (api) {
        set({ progress: { label: "Salvando a base no computador", fraction: null } });
        await api.deletar(TIPO);
        const saved = await api.salvar(TIPO, file.name, await fileToBase64(file));
        if (saved.ok) {
          await api.salvarProcessado?.(TIPO, file.name, CACHE_KIND, RUPTURA_MODEL_VERSION, model);
          set({ savedFileName: file.name });
        }
        set({ progress: null });
      }
    } catch (err) {
      set({
        status: get().model ? "ready" : "error",
        progress: null,
        error: err instanceof Error ? err.message : "Falha ao ler a base de ruptura.",
      });
    }
  },

  removeBase: async () => {
    const api = bases();
    if (api) await api.deletar(TIPO);
    set({ model: null, status: "idle", progress: null, error: null, savedFileName: null, filters: {}, period: null });
  },

  setFilter: (dim, values) => set((s) => ({ filters: { ...s.filters, [dim]: values } })),

  toggleFilterValue: (dim, value) =>
    set((s) => {
      const current = s.filters[dim] ?? [];
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      return { filters: { ...s.filters, [dim]: next } };
    }),

  clearFilters: () => set((s) => ({ filters: {}, period: s.model ? fullPeriod(s.model) : null })),

  setPeriod: (period) => set({ period }),
}));
