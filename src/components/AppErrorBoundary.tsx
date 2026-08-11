import React from "react";
import { Button } from "@/components/ui/button";
import { reportRendererError } from "@/lib/rendererErrorReporting";

type State = {
  error: Error | null;
};

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportRendererError("react.error-boundary", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
        <div className="w-full max-w-md rounded-xl border border-border/70 bg-card p-6 text-center shadow-lg">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 text-lg font-bold text-destructive">
            !
          </div>
          <h1 className="text-lg font-semibold">Algo deu errado</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Registramos o erro no log do aplicativo para diagnosticar a causa. Voce pode recarregar o Omni4 e tentar novamente.
          </p>
          <div className="mt-5 flex justify-center">
            <Button type="button" onClick={() => window.location.reload()}>
              Recarregar aplicativo
            </Button>
          </div>
          <p className="mt-4 break-words rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
            {this.state.error.message}
          </p>
        </div>
      </div>
    );
  }
}
