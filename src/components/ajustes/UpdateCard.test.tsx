import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ElectronUpdatesAPI, UpdatePrepareResult } from "@/lib/updateFile";
import { UpdateCard } from "./UpdateCard";

function fakeApi(prepareResult: UpdatePrepareResult) {
  let progress: (percent: number) => void = () => undefined;
  const api = {
    info: vi.fn(async () => ({ version: "1.66.0" })),
    prepare: vi.fn(async () => prepareResult),
    choose: vi.fn(async (): Promise<UpdatePrepareResult> => ({ ok: false, erro: "cancelado" })),
    discard: vi.fn(async () => ({ ok: true })),
    install: vi.fn(async (): Promise<{ ok: boolean; erro?: "instalador_bloqueado" }> => ({ ok: true })),
    onProgress: vi.fn((callback: (percent: number) => void) => {
      progress = callback;
      return () => undefined;
    }),
  } satisfies ElectronUpdatesAPI;
  (window as unknown as { electronAPI: unknown }).electronAPI = { updates: api };
  return { api, emitProgress: (percent: number) => progress(percent) };
}

async function dropFile() {
  const file = new File(["x"], "OMNI4-Atualizacao-1.67.0.omni4update");
  fireEvent.drop(await screen.findByTestId("update-drop-zone"), { dataTransfer: { files: [file] } });
}

describe("atualização por arquivo", () => {
  afterEach(() => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  });

  it("mostra a versão instalada", async () => {
    fakeApi({ ok: false, erro: "cancelado" });
    render(<UpdateCard />);
    expect(await screen.findByText("1.66.0")).toBeInTheDocument();
  });

  it("arquivo válido: só instala depois de confirmar", async () => {
    const { api } = fakeApi({ ok: true, version: "1.67.0", currentVersion: "1.66.0" });
    render(<UpdateCard />);
    await dropFile();
    const confirm = await screen.findByRole("button", { name: "Atualizar e reiniciar" });
    expect(screen.getByText("1.67.0")).toBeInTheDocument();
    expect(api.install).not.toHaveBeenCalled();
    fireEvent.click(confirm);
    await waitFor(() => expect(api.install).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/O app vai reabrir sozinho/)).toBeInTheDocument();
  });

  it("cancelar descarta o que foi preparado e volta ao início", async () => {
    const { api } = fakeApi({ ok: true, version: "1.67.0", currentVersion: "1.66.0" });
    render(<UpdateCard />);
    await dropFile();
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    expect(api.discard).toHaveBeenCalledTimes(1);
    expect(api.install).not.toHaveBeenCalled();
    expect(screen.getByTestId("update-drop-zone")).toBeInTheDocument();
  });

  it.each([
    [{ ok: false, erro: "assinatura" }, /não tem a assinatura do OMNI4/],
    [{ ok: false, erro: "integridade" }, /incompleto ou foi alterado/],
    [{ ok: false, erro: "nao_e_pacote" }, /não é um arquivo de atualização/],
    [{ ok: false, erro: "mesma_versao", version: "1.66.0" }, /versão 1\.66\.0, que você já tem/],
    [{ ok: false, erro: "versao_antiga", version: "1.60.0", currentVersion: "1.66.0" }, /1\.60\.0, mais antiga que a sua \(1\.66\.0\)/],
  ] as [UpdatePrepareResult, RegExp][])("recusa com mensagem clara: %j", async (result, message) => {
    const { api } = fakeApi(result);
    render(<UpdateCard />);
    await dropFile();
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.queryByRole("button", { name: "Atualizar e reiniciar" })).toBeNull();
    expect(api.install).not.toHaveBeenCalled();
  });

  it("instalador bloqueado pelo Windows: avisa e continua no app", async () => {
    const { api } = fakeApi({ ok: true, version: "1.67.0", currentVersion: "1.66.0" });
    api.install.mockResolvedValue({ ok: false, erro: "instalador_bloqueado" });
    render(<UpdateCard />);
    await dropFile();
    fireEvent.click(await screen.findByRole("button", { name: "Atualizar e reiniciar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Windows não deixou/);
  });

  it("mostra o progresso enquanto confere", async () => {
    const { api, emitProgress } = fakeApi({ ok: false, erro: "cancelado" });
    let finish: (r: UpdatePrepareResult) => void = () => undefined;
    api.prepare.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<UpdateCard />);
    await dropFile();
    await screen.findByText("Conferindo o arquivo");
    act(() => emitProgress(42));
    expect(screen.getByText("42%")).toBeInTheDocument();
    await act(async () => finish({ ok: false, erro: "cancelado" }));
    expect(screen.getByTestId("update-drop-zone")).toBeInTheDocument();
  });

  it("desistir na janela de escolher arquivo não mostra erro", async () => {
    const { api } = fakeApi({ ok: false, erro: "cancelado" });
    render(<UpdateCard />);
    fireEvent.click(await screen.findByRole("button", { name: "Escolher arquivo" }));
    await waitFor(() => expect(api.choose).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("fora do app instalado: explica, sem área de arrastar", () => {
    render(<UpdateCard />);
    expect(screen.getByText(/funciona no app instalado/)).toBeInTheDocument();
    expect(screen.queryByTestId("update-drop-zone")).toBeNull();
  });
});
