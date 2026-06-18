import { useCallback } from "react";

export type TipoBase = "ke30" | "budget" | "forecast" | "demanda";

export interface InfoBase {
  quantidade: number;
  nomeArquivos: string[];
  tamanhoTotal: number;
  ultimaModificacao: string;
}

declare global {
  interface Window {
    electronAPI?: {
      bases?: {
        salvar: (tipo: string, nomeArquivo: string, conteudoBase64: string) => Promise<{ ok: boolean; erro?: string }>;
        carregar: (tipo: string) => Promise<{ ok: boolean; arquivos?: Array<{ nomeArquivo: string; conteudoBase64: string; tamanho: number; ultimaModificacao: string }>; motivo?: string; erro?: string }>;
        info: () => Promise<{ ok: boolean; bases?: Record<string, InfoBase>; erro?: string }>;
        deletar: (tipo: string, nomeArquivo?: string) => Promise<{ ok: boolean; erro?: string }>;
      };
    };
  }
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

function base64ToFile(base64: string, nomeArquivo: string): File {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], nomeArquivo);
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
    return result.arquivos.map(({ nomeArquivo, conteudoBase64, ultimaModificacao }) => {
      const binary = atob(conteudoBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const ext = nomeArquivo.split(".").pop() ?? "csv";
      const mime = ext === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      return new File([bytes], nomeArquivo, { type: mime, lastModified: new Date(ultimaModificacao).getTime() });
    });
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

  return { isElectron, salvarBase, carregarBase, infoBasesSalvas, deletarBase };
}
