/// <reference types="vite/client" />

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
  };
}
