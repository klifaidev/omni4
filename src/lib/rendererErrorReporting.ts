type RendererErrorPayload = {
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
};

let globalHandlersInstalled = false;

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function errorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}

function currentRoute(): string {
  if (typeof window === "undefined") return "unknown";
  return window.location.hash || window.location.pathname || "unknown";
}

export function buildRendererErrorPayload(
  source: string,
  error: unknown,
  componentStack?: string,
): RendererErrorPayload {
  return {
    source,
    message: errorMessage(error),
    stack: errorStack(error),
    componentStack,
    timestamp: new Date().toISOString(),
    context: {
      href: typeof window !== "undefined" ? window.location.href : "unknown",
      route: currentRoute(),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
    },
  };
}

export function reportRendererError(source: string, error: unknown, componentStack?: string) {
  const payload = buildRendererErrorPayload(source, error, componentStack);
  try {
    window.electronAPI?.reportRendererError?.(payload);
  } catch (reportError) {
    console.error("[renderer-error-reporting] Falha ao enviar erro para o Electron", reportError);
  }
  console.error("[renderer-error-reporting]", payload);
}

export function installGlobalRendererErrorHandlers() {
  if (typeof window === "undefined") return;
  if (globalHandlersInstalled) return;
  globalHandlersInstalled = true;

  window.addEventListener("error", (event) => {
    reportRendererError("window.error", event.error ?? event.message);
  });

  window.addEventListener("unhandledrejection", (event) => {
    reportRendererError("window.unhandledrejection", event.reason ?? "Unhandled promise rejection");
  });
}
