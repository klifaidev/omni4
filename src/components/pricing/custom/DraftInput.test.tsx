import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DraftInput } from "./DraftInput";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("DraftInput", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it("grava o rascunho pendente no handler da instância que estava editando, mesmo desmontando antes do debounce", () => {
    // Reproduz o bug relatado: digitar no título de um bloco, trocar de bloco
    // selecionado durante o congelamento, e a edição do primeiro bloco cair
    // no segundo. Com `key` por bloco no inspector, trocar de bloco desmonta
    // este input — o rascunho pendente tem que ir pro handler DELE.
    const commitBlocoA = vi.fn();
    const commitBlocoB = vi.fn();

    const { rerender } = render(
      <DraftInput key="bloco-a" value="Título A" onCommit={commitBlocoA} />,
    );

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Título A editado" } });

    // Troca de bloco antes do debounce disparar.
    rerender(<DraftInput key="bloco-b" value="Título B" onCommit={commitBlocoB} />);

    expect(commitBlocoA).toHaveBeenCalledTimes(1);
    expect(commitBlocoA).toHaveBeenCalledWith("Título A editado");
    expect(commitBlocoB).not.toHaveBeenCalled();
    // E o campo agora mostra o valor do bloco novo, não o rascunho do anterior.
    expect(screen.getByRole("textbox")).toHaveValue("Título B");
  });

  it("não grava nada ao desmontar quando não há edição pendente", () => {
    const onCommit = vi.fn();
    const { unmount } = render(<DraftInput value="Título" onCommit={onCommit} />);
    unmount();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("grava uma vez só quando o debounce dispara antes do desmonte", () => {
    const onCommit = vi.fn();
    const { unmount } = render(<DraftInput value="Título" onCommit={onCommit} />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Editado" } });
    vi.advanceTimersByTime(400);
    expect(onCommit).toHaveBeenCalledTimes(1);

    unmount();
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});
