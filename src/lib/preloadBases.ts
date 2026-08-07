import { parseBudgetFile } from "@/lib/budget";
import { parseCsvFile } from "@/lib/csv";
import { parseForecastFile } from "@/lib/forecast";
import { parseInovacaoDeparaFile } from "@/lib/parseDeparaInovacao";
import { parseDemandaXlsx } from "@/lib/parseDemanda";
import { parseRollingFile } from "@/lib/rolling";
import { useBudget } from "@/store/budget";
import { useDemanda } from "@/store/demanda";
import { useForecast } from "@/store/forecast";
import { useInovacaoDepara } from "@/store/inovacaoDepara";
import { usePricing } from "@/store/pricing";
import { useRolling } from "@/store/rolling";
import { loadProcessedBase, saveProcessedBaseInBackground } from "@/lib/processedBaseCache";
import type { ParsedBudget } from "@/lib/budget";
import type { ParsedCsv } from "@/lib/csv";
import type { InfoArquivoBase, InfoBase, TipoBase } from "@/hooks/use-bases-locais";

type PreloadStatus = "idle" | "loading" | "done" | "error";

export interface BasesPreloadProgress {
  status: PreloadStatus;
  percent: number;
  label: string;
  detail?: string;
  loaded: string[];
  failed: string[];
}

const BASE_LABELS: Record<TipoBase, string> = {
  deparaInovacao: "De/Para Inovacao",
  ke30: "KE30 (Real)",
  budget: "Budget",
  forecast: "Forecast",
  rolling: "Rolling",
  demanda: "Demanda",
};

const LOAD_ORDER: TipoBase[] = ["deparaInovacao", "ke30", "budget", "forecast", "rolling", "demanda"];

function base64ToFile(base64: string, nomeArquivo: string, ultimaModificacao: string): File {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const ext = nomeArquivo.split(".").pop()?.toLowerCase() ?? "csv";
  const mime = ext === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return new File([bytes], nomeArquivo, { type: mime, lastModified: new Date(ultimaModificacao).getTime() });
}

async function carregarBase(tipo: TipoBase): Promise<File[]> {
  if (!window.electronAPI?.bases) return [];
  const result = await window.electronAPI.bases.carregar(tipo);
  if (!result.ok || !result.arquivos) return [];
  return result.arquivos.map(({ nomeArquivo, conteudoBase64, ultimaModificacao }) =>
    base64ToFile(conteudoBase64, nomeArquivo, ultimaModificacao),
  );
}

async function carregarArquivo(tipo: TipoBase, arquivo: InfoArquivoBase): Promise<File | null> {
  if (!window.electronAPI?.bases) return null;
  if (window.electronAPI.bases.carregarArquivo) {
    const result = await window.electronAPI.bases.carregarArquivo(tipo, arquivo.nomeArquivo);
    if (!result.ok || !result.arquivo) return null;
    return base64ToFile(result.arquivo.conteudoBase64, result.arquivo.nomeArquivo, result.arquivo.ultimaModificacao);
  }
  const files = await carregarBase(tipo);
  return files.find((file) => file.name === arquivo.nomeArquivo) ?? null;
}

function arquivosDaBase(base: InfoBase | undefined): InfoArquivoBase[] {
  if (!base) return [];
  if (base.arquivos?.length) return base.arquivos;
  return base.nomeArquivos.map((nomeArquivo) => ({
    nomeArquivo,
    tamanho: 0,
    ultimaModificacao: base.ultimaModificacao,
  }));
}

function emptyProgress(): BasesPreloadProgress {
  return {
    status: "done",
    percent: 100,
    label: "Tudo pronto",
    loaded: [],
    failed: [],
  };
}

export async function preloadSavedBases(
  onProgress: (progress: BasesPreloadProgress) => void,
): Promise<BasesPreloadProgress> {
  if (!window.electronAPI?.bases) {
    const done = emptyProgress();
    onProgress(done);
    return done;
  }

  const infoResult = await window.electronAPI.bases.info();
  const info = (infoResult.ok && infoResult.bases ? infoResult.bases : {}) as Record<TipoBase, InfoBase | undefined>;
  const available = LOAD_ORDER.filter((tipo) => !!info[tipo]);

  if (available.length === 0) {
    const done = emptyProgress();
    onProgress(done);
    return done;
  }

  const loaded: string[] = [];
  const failed: string[] = [];
  const total = available.length;
  const pricing = usePricing.getState();

  onProgress({
    status: "loading",
    percent: 0,
    label: "Preparando bases salvas",
    detail: `${total} base(s) encontrada(s)`,
    loaded,
    failed,
  });

  for (let i = 0; i < available.length; i++) {
    const tipo = available[i];
    const label = BASE_LABELS[tipo];
    const startPercent = Math.round((i / total) * 100);

    onProgress({
      status: "loading",
      percent: startPercent,
      label: `Carregando ${label}`,
      detail: info[tipo]?.nomeArquivos?.join(", "),
      loaded: [...loaded],
      failed: [...failed],
    });

    try {
      pricing.setParsingStart();
      if (tipo === "deparaInovacao") {
        const files = await carregarBase(tipo);
        const latest = files[files.length - 1];
        if (latest) {
          const parsed = await parseInovacaoDeparaFile(latest);
          if (parsed.file.rowCount > 0) {
            useInovacaoDepara.getState().setDepara(parsed.map, parsed.file);
          }
        }
      }

      if (tipo === "ke30" && usePricing.getState().files.length === 0) {
        for (const arquivo of arquivosDaBase(info[tipo])) {
          let parsed = await loadProcessedBase<ParsedCsv>("ke30", arquivo.nomeArquivo, "ke30-parsed-csv");
          if (!parsed) {
            const file = await carregarArquivo("ke30", arquivo);
            if (!file) continue;
            parsed = await parseCsvFile(file);
            if (parsed.rows.length > 0) {
              saveProcessedBaseInBackground("ke30", arquivo.nomeArquivo, "ke30-parsed-csv", parsed);
            }
          }
          if (parsed.rows.length > 0) {
            usePricing.getState().addParsed(parsed.rows, parsed.file, false, parsed.missing);
          }
        }
      }

      if (tipo === "budget" && useBudget.getState().rows.length === 0) {
        for (const arquivo of arquivosDaBase(info[tipo])) {
          let parsed = await loadProcessedBase<ParsedBudget>("budget", arquivo.nomeArquivo, "budget-parsed-xlsx");
          if (!parsed) {
            const file = await carregarArquivo("budget", arquivo);
            if (!file) continue;
            parsed = await parseBudgetFile(file);
            if (parsed.rows.length > 0) {
              saveProcessedBaseInBackground("budget", arquivo.nomeArquivo, "budget-parsed-xlsx", parsed);
            }
          }
          if (parsed.rows.length > 0) {
            useBudget.getState().addBudget(parsed.rows, parsed.file, false);
          }
        }
      }

      if (tipo === "forecast" && useForecast.getState().rows.length === 0) {
        const files = await carregarBase(tipo);
        for (const file of files) {
          const parsed = await parseForecastFile(file);
          if (parsed.rows.length > 0) {
            useForecast.getState().addForecast(parsed.rows, parsed.file, false);
          }
        }
      }

      if (tipo === "rolling" && useRolling.getState().rows.length === 0) {
        const files = await carregarBase(tipo);
        for (const file of files) {
          const parsed = await parseRollingFile(file);
          if (parsed.rows.length > 0) {
            useRolling.getState().addRolling(parsed.rows, parsed.file);
          }
        }
      }

      if (tipo === "demanda" && useDemanda.getState().deck === null) {
        const files = await carregarBase(tipo);
        const latest = files[files.length - 1];
        if (latest) {
          const parsed = await parseDemandaXlsx(latest);
          useDemanda.getState().loadDeck(parsed, latest);
        }
      }

      loaded.push(label);
    } catch (error) {
      console.error(`Erro ao pre-carregar ${label}:`, error);
      failed.push(label);
    } finally {
      usePricing.getState().setParsingEnd();
    }

    onProgress({
      status: "loading",
      percent: Math.round(((i + 1) / total) * 100),
      label: `${label} carregada`,
      detail: failed.includes(label) ? "Nao foi possivel carregar esta base." : undefined,
      loaded: [...loaded],
      failed: [...failed],
    });
  }

  const done: BasesPreloadProgress = {
    status: failed.length ? "error" : "done",
    percent: 100,
    label: failed.length ? "Entrada liberada com avisos" : "Tudo pronto",
    detail: failed.length ? `${failed.length} base(s) nao puderam ser carregadas.` : undefined,
    loaded,
    failed,
  };
  onProgress(done);
  return done;
}
