import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { installGlobalRendererErrorHandlers } from "@/lib/rendererErrorReporting";
import { loadCrashState } from "@/lib/crashRecovery";

installGlobalRendererErrorHandlers();

// O estado do último crash precisa estar lido antes do primeiro render: ao
// reabrir direto na Tabela Dinâmica, ela decide no próprio mount se abre em
// modo seguro. Fora do Electron isso resolve na hora.
void loadCrashState().finally(() => {
  createRoot(document.getElementById("root")!).render(
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>,
  );
});
