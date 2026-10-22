import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// As bases carregam sob controle do teste (resolvidas quando o teste mandar).
let resolveBases: () => void = () => undefined;
vi.mock("@/lib/preloadBases", () => ({
  preloadSavedBases: vi.fn((onProgress: (p: unknown) => void) => {
    onProgress({ status: "loading", percent: 10, label: "Carregando KE30 (Real)", loaded: [], failed: [] });
    return new Promise<void>((resolve) => { resolveBases = resolve; });
  }),
}));
vi.mock("@/lib/preloadSlidesRoute", () => ({ preloadSlidesRoute: vi.fn(() => Promise.resolve()) }));

import { AppPreloader } from "./AppPreloader";

type Cb = (value: string | number) => void;
function fakeUpdateApi() {
  const handlers: Record<string, Cb[]> = {};
  const on = (name: string) => (cb: Cb) => {
    (handlers[name] ??= []).push(cb);
    return () => { handlers[name] = handlers[name].filter((h) => h !== cb); };
  };
  const api = {
    onUpdateStatus: on("status"),
    onUpdateAvailable: on("available"),
    onUpdateProgress: on("progress"),
    onUpdateDownloaded: on("downloaded"),
    onUpdateNotAvailable: on("notAvailable"),
    onUpdateError: on("error"),
    checkForUpdates: vi.fn(),
    installUpdate: vi.fn(),
  };
  const emit = (name: string, value: string | number = "") => { for (const h of [...(handlers[name] ?? [])]) h(value); };
  return { api, emit, listeners: (name: string) => (handlers[name] ?? []).length };
}

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("entrada do app (AppPreloader)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  });

  it("carrega as bases sem esperar a resposta da atualização", async () => {
    const { api } = fakeUpdateApi();
    (window as unknown as { electronAPI: unknown }).electronAPI = api;
    render(<AppPreloader><div>app pronto</div></AppPreloader>);
    await flush();
    expect(api.checkForUpdates).toHaveBeenCalled();
    // As bases já estão carregando enquanto a verificação segue sem resposta.
    expect(screen.getByText("Carregando KE30 (Real)")).toBeInTheDocument();
  });

  it("sem atualização: entra assim que as bases terminam", async () => {
    const { api, emit } = fakeUpdateApi();
    (window as unknown as { electronAPI: unknown }).electronAPI = api;
    render(<AppPreloader><div>app pronto</div></AppPreloader>);
    await flush();
    emit("notAvailable", "1.0.0");
    resolveBases();
    await flush(300);
    expect(screen.getByText("app pronto")).toBeInTheDocument();
  });

  it("atualização encontrada: baixa e reinicia, sem liberar o app", async () => {
    const { api, emit } = fakeUpdateApi();
    (window as unknown as { electronAPI: unknown }).electronAPI = api;
    render(<AppPreloader><div>app pronto</div></AppPreloader>);
    await flush();
    emit("available", "9.9.9");
    resolveBases();
    await flush(5000);
    // A tela mostra a atualização (não as bases) e o app não é liberado.
    expect(screen.getByText("Atualização 9.9.9 encontrada")).toBeInTheDocument();
    expect(screen.queryByText("app pronto")).toBeNull();
    emit("downloaded", "9.9.9");
    await flush(700);
    expect(api.installUpdate).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("app pronto")).toBeNull();
  });

  it("servidor lento: entra após a folga e desliga o reinício automático", async () => {
    const { api, emit, listeners } = fakeUpdateApi();
    (window as unknown as { electronAPI: unknown }).electronAPI = api;
    render(<AppPreloader><div>app pronto</div></AppPreloader>);
    await flush();
    resolveBases();
    await flush(1000);
    expect(screen.queryByText("app pronto")).toBeNull();
    await flush(1000);
    expect(screen.getByText("app pronto")).toBeInTheDocument();
    // Uma atualização que chegue agora fica com o aviso dentro do app.
    expect(listeners("downloaded")).toBe(0);
    emit("available", "9.9.9");
    emit("downloaded", "9.9.9");
    await flush(1000);
    expect(api.installUpdate).not.toHaveBeenCalled();
  });

  it("erro na verificação não segura a entrada", async () => {
    const { api, emit } = fakeUpdateApi();
    (window as unknown as { electronAPI: unknown }).electronAPI = api;
    render(<AppPreloader><div>app pronto</div></AppPreloader>);
    await flush();
    emit("error", "net::ERR_NAME_NOT_RESOLVED");
    resolveBases();
    await flush(300);
    expect(screen.getByText("app pronto")).toBeInTheDocument();
  });

  it("fora do app instalado: entra direto", async () => {
    render(<AppPreloader><div>app pronto</div></AppPreloader>);
    await flush();
    resolveBases();
    await flush(300);
    expect(screen.getByText("app pronto")).toBeInTheDocument();
  });
});
