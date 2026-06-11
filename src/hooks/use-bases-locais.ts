import { useCallback } from "react";

export type TipoBase = "ke30" | "budget" | "demanda";

export interface InfoBase {
  nomeArquivo: string;
  tamanho: number;
  ultimaModificacao: string;
}

declare global {
  interface Window {
    electronAPI?: {
      bases?: {
        salvar: (tipo: string, nomeArquivo: string, conteudoBase64: string) => Promise<{ ok: boolean; erro?: string }>;
        carregar: (tipo: string) => Promise<{ ok: boolean; nomeArquivo?: string; conteudoBase64?: string; tamanho?: number; ultimaModificacao?: string; motivo?: string }>;
        info: () => Promise<{ ok: boolean; bases?: Record<string, InfoBase>; erro?: string }>;
        deletar: (tipo: string) => Promise<{ ok: boolean; erro?: string }>;
      };
    };
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const buffer = reader.result as ArrayBuffer;
      const base64 = btoa(
        new Uint8Array(buffer).reduce((d, b) => d + String.fromCharCode(b), ""),
      );
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
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

  const salvarBase = useCallback(async (tipo: TipoBase, file: File): Promise<boolean> => {
    if (!window.electronAPI?.bases) return false;
    const conteudoBase64 = await fileToBase64(file);
    const result = await window.electronAPI.bases.salvar(tipo, file.name, conteudoBase64);
    return result.ok;
  }, []);

  const carregarBase = useCallback(async (tipo: TipoBase): Promise<File | null> => {
    if (!window.electronAPI?.bases) return null;
    const result = await window.electronAPI.bases.carregar(tipo);
    if (!result.ok || !result.conteudoBase64 || !result.nomeArquivo) return null;
    return base64ToFile(result.conteudoBase64, result.nomeArquivo);
  }, []);

  const infoBasesSalvas = useCallback(async (): Promise<Record<TipoBase, InfoBase | undefined>> => {
    if (!window.electronAPI?.bases) return {} as Record<TipoBase, InfoBase | undefined>;
    const result = await window.electronAPI.bases.info();
    if (!result.ok || !result.bases) return {} as Record<TipoBase, InfoBase | undefined>;
    return result.bases as Record<TipoBase, InfoBase | undefined>;
  }, []);

  const deletarBase = useCallback(async (tipo: TipoBase): Promise<boolean> => {
    if (!window.electronAPI?.bases) return false;
    const result = await window.electronAPI.bases.deletar(tipo);
    return result.ok;
  }, []);

  return { isElectron, salvarBase, carregarBase, infoBasesSalvas, deletarBase };
}
