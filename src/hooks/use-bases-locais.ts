import { useCallback } from "react";

export type TipoBase = "ke30" | "budget" | "deparaInovacao" | "personalizado";

export interface InfoBase {
  quantidade: number;
  nomeArquivo?: string;
  nomeArquivos: string[];
  arquivos?: InfoArquivoBase[];
  tamanhoTotal: number;
  ultimaModificacao: string;
}

export interface InfoArquivoBase {
  nomeArquivo: string;
  tamanho: number;
  ultimaModificacao: string;
}

interface ArquivoBaseSalvo extends InfoArquivoBase {
  conteudoBase64: string;
}

// Forma de window.electronAPI.bases — o tipo canonico de window.electronAPI
// fica em src/vite-env.d.ts, que importa este tipo daqui.
export interface ElectronBasesAPI {
  salvar: (tipo: string, nomeArquivo: string, conteudoBase64: string) => Promise<{ ok: boolean; erro?: string }>;
  carregar: (tipo: string) => Promise<{ ok: boolean; arquivos?: ArquivoBaseSalvo[]; motivo?: string; erro?: string }>;
  carregarArquivo?: (tipo: string, nomeArquivo: string) => Promise<{ ok: boolean; arquivo?: ArquivoBaseSalvo; motivo?: string; erro?: string }>;
  carregarProcessado?: (tipo: string, nomeArquivo: string, cacheKind: string, version: number) => Promise<{ ok: boolean; hit?: boolean; payload?: unknown; motivo?: string; erro?: string }>;
  salvarProcessado?: (tipo: string, nomeArquivo: string, cacheKind: string, version: number, payload: unknown) => Promise<{ ok: boolean; erro?: string }>;
  carregarProcessadoManifesto?: (tipo: string, nomeArquivo: string, cacheKind: string, version: number) => Promise<{ ok: boolean; hit?: boolean; manifest?: unknown; motivo?: string; erro?: string }>;
  carregarProcessadoChunk?: (tipo: string, nomeArquivo: string, cacheKind: string, index: number) => Promise<{ ok: boolean; rows?: unknown[]; erro?: string }>;
  iniciarProcessadoEmChunks?: (tipo: string, nomeArquivo: string, cacheKind: string, version: number, header: unknown, totalRows: number, chunkSize: number) => Promise<{ ok: boolean; erro?: string }>;
  salvarProcessadoChunk?: (tipo: string, nomeArquivo: string, cacheKind: string, index: number, rows: unknown[]) => Promise<{ ok: boolean; erro?: string }>;
  finalizarProcessadoEmChunks?: (tipo: string, nomeArquivo: string, cacheKind: string, chunks: number) => Promise<{ ok: boolean; erro?: string }>;
  info: () => Promise<{ ok: boolean; bases?: Record<string, InfoBase>; erro?: string }>;
  deletar: (tipo: string, nomeArquivo?: string) => Promise<{ ok: boolean; erro?: string }>;
  invalidarProcessado?: (tipo?: string) => Promise<{ ok: boolean; erro?: string }>;
}

function fileToDataUrlBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // result = "data:<mime>;base64,<dados>" — extrair apenas os dados
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(",")[1]);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function arquivoSalvoToFile({ conteudoBase64, nomeArquivo, ultimaModificacao }: ArquivoBaseSalvo): File {
  const binary = atob(conteudoBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const ext = nomeArquivo.split(".").pop() ?? "csv";
  const mime = ext === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return new File([bytes], nomeArquivo, { type: mime, lastModified: new Date(ultimaModificacao).getTime() });
}

export function useBasesLocais() {
  const isElectron = !!(window.electronAPI?.bases);

  const salvarBase = useCallback(async (tipo: TipoBase, file: File): Promise<{ ok: boolean; erro?: string }> => {
    if (!window.electronAPI?.bases) return { ok: false };
    const conteudoBase64 = await fileToDataUrlBase64(file);
    return window.electronAPI.bases.salvar(tipo, file.name, conteudoBase64);
  }, []);

  const carregarBase = useCallback(async (tipo: TipoBase): Promise<File[]> => {
    if (!window.electronAPI?.bases) return [];
    const result = await window.electronAPI.bases.carregar(tipo);
    if (!result.ok || !result.arquivos) return [];
    return result.arquivos.map(arquivoSalvoToFile);
  }, []);

  const carregarArquivo = useCallback(async (tipo: TipoBase, nomeArquivo: string): Promise<File | null> => {
    if (!window.electronAPI?.bases) return null;
    const result = window.electronAPI.bases.carregarArquivo
      ? await window.electronAPI.bases.carregarArquivo(tipo, nomeArquivo)
      : await window.electronAPI.bases.carregar(tipo);
    if (!result.ok) return null;
    if ("arquivo" in result && result.arquivo) return arquivoSalvoToFile(result.arquivo);
    if ("arquivos" in result && result.arquivos) {
      const found = result.arquivos.find((arquivo) => arquivo.nomeArquivo === nomeArquivo);
      return found ? arquivoSalvoToFile(found) : null;
    }
    return null;
  }, []);

  const infoBasesSalvas = useCallback(async (): Promise<Record<TipoBase, InfoBase | undefined>> => {
    if (!window.electronAPI?.bases) return {} as Record<TipoBase, InfoBase | undefined>;
    const result = await window.electronAPI.bases.info();
    if (!result.ok || !result.bases) return {} as Record<TipoBase, InfoBase | undefined>;
    return result.bases as Record<TipoBase, InfoBase | undefined>;
  }, []);

  const deletarBase = useCallback(async (tipo: TipoBase, nomeArquivo?: string): Promise<boolean> => {
    if (!window.electronAPI?.bases) return false;
    const result = await window.electronAPI.bases.deletar(tipo, nomeArquivo);
    return result.ok;
  }, []);

  return { isElectron, salvarBase, carregarBase, carregarArquivo, infoBasesSalvas, deletarBase };
}
