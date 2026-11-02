import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { installGlobalRendererErrorHandlers } from "@/lib/rendererErrorReporting";
import { loadCrashState } from "@/lib/crashRecovery";
import { startMemoryGuard } from "@/lib/memoryGuard";
import { hydrateKanban } from "@/lib/kanban";

installGlobalRendererErrorHandlers();

// O estado do último crash precisa estar lido antes do primeiro render: ao
// reabrir direto na Tabela Dinâmica, ela decide no próprio mount se abre em
// modo seguro. Fora do Electron isso resolve na hora.
// As atividades também são lidas do disco antes do primeiro render: assim todo
// leitor síncrono (aba, diálogo rápido, resumo da Home) já enxerga o estado
// salvo. hydrateKanban nunca rejeita — falha vira aviso e gravação bloqueada.
void Promise.all([loadCrashState(), hydrateKanban()]).finally(() => {
  createRoot(document.getElementById("root")!).render(
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>,
  );
  // Guarda de memória: libera caches antes de a tela chegar ao limite e cair.
  startMemoryGuard();
});
