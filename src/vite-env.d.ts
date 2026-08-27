/// <reference types="vite/client" />

// Forma canonica de window.electronAPI. Ha um unico ponto de verdade aqui
// (em vez de "declare global" espalhados por arquivo) porque interfaces
// ambientes duplicadas para a MESMA propriedade opcional com formatos
// diferentes nao se mesclam de forma confiavel entre arquivos sem relacao
// de import direta — cada arquivo pode acabar enxergando um formato
// diferente dependendo da ordem de resolucao do TypeScript. Ver
// src/hooks/use-bases-locais.ts para os tipos detalhados de `bases` e
// src/store/slidesFlow.ts para os de `slidesFlow`.
interface Window {
  electronAPI?: {
    reportRendererError?: (payload: {
      source: string;
      message: string;
      stack?: string;
      componentStack?: string;
      timestamp: string;
      context: {
        href: string;
        route: string;
        userAgent: string;
      };
    }) => void;
    bases?: import("./hooks/use-bases-locais").ElectronBasesAPI;
    slidesFlow?: import("./store/slidesFlow").ElectronSlidesFlowAPI;
    isElectron?: boolean;
  };
}
