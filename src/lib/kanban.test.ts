import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadState, type KanbanCard, type KanbanState } from "./kanban";

const STORAGE_KEY = "harald.kanban.v1";
const SEED_FLAG = "harald.kanban.seed.top3.v1";

function seed(state: KanbanState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function stateWithDoneCard(card: KanbanCard): KanbanState {
  return {
    columns: [
      { id: "todo", title: "A fazer", accent: "0 0% 0%", cardIds: [] },
      { id: "done", title: "Concluído", accent: "0 0% 0%", cardIds: [card.id] },
    ],
    cards: { [card.id]: card },
  };
}

beforeEach(() => {
  localStorage.clear();
  // O seed de "Top 3" é um efeito colateral à parte — não é o que estes
  // testes verificam, e sem isso ele injetaria cards extras na 1ª coluna.
  localStorage.setItem(SEED_FLAG, "done");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("recorrência — próxima instância ao concluir uma atividade vencida", () => {
  it("mensal preserva o dia do mês (31/jan vira 28/fev, não 2/fev)", () => {
    seed(stateWithDoneCard({
      id: "c1", title: "Fechar relatório", recurrence: "monthly",
      dueDate: "2026-01-31", createdAt: "2026-01-01T00:00:00.000Z",
    }));
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 1, 15)); // 15/fev/2026

    const next = loadState();

    const todo = next.columns[0].cardIds.map((id) => next.cards[id]);
    expect(todo).toHaveLength(1);
    expect(todo[0].title).toBe("Fechar relatório");
    expect(todo[0].dueDate).toBe("2026-02-28"); // fev/2026 não é bissexto
  });

  it("mensal, depois de vários meses sem abrir o app, cai no fim de cada mês sem 'grudar' num dia menor", () => {
    seed(stateWithDoneCard({
      id: "c1", title: "Fechar relatório", recurrence: "monthly",
      dueDate: "2026-01-31", createdAt: "2026-01-01T00:00:00.000Z",
    }));
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 10)); // 10/jun/2026 — 5 meses depois

    const next = loadState();

    const todo = next.columns[0].cardIds.map((id) => next.cards[id]);
    expect(todo).toHaveLength(1);
    // Se a soma fosse encadeada (30d fixos por vez, ou a partir do último
    // resultado já arredondado), o dia iria diminuindo mês a mês. Como cada
    // mês é calculado a partir da data-base original, junho — que não tem
    // dia 31 — cai certinho no dia 30 (seu último dia).
    expect(todo[0].dueDate).toBe("2026-06-30");
  });

  it("semanal soma exatamente 7 dias a partir do prazo original", () => {
    seed(stateWithDoneCard({
      id: "c1", title: "Relatório semanal", recurrence: "weekly",
      dueDate: "2026-03-02", createdAt: "2026-02-01T00:00:00.000Z",
    }));
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 5)); // 05/mar/2026

    const next = loadState();

    const todo = next.columns[0].cardIds.map((id) => next.cards[id]);
    expect(todo).toHaveLength(1);
    expect(todo[0].dueDate).toBe("2026-03-09");
  });

  it("não gera nada para atividade sem recorrência ou com prazo ainda no futuro", () => {
    seed(stateWithDoneCard({
      id: "c1", title: "Tarefa única", createdAt: "2026-01-01T00:00:00.000Z",
      dueDate: "2020-01-01",
    }));
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 10));
    expect(loadState().columns[0].cardIds).toHaveLength(0);

    seed(stateWithDoneCard({
      id: "c2", title: "Ainda não venceu", recurrence: "weekly",
      dueDate: "2099-01-01", createdAt: "2026-01-01T00:00:00.000Z",
    }));
    expect(loadState().columns[0].cardIds).toHaveLength(0);
  });

  it("reabrir a página (loadState de novo) não duplica a próxima instância", () => {
    seed(stateWithDoneCard({
      id: "c1", title: "Fechar relatório", recurrence: "monthly",
      dueDate: "2026-01-31", createdAt: "2026-01-01T00:00:00.000Z",
    }));
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 1, 15));

    loadState();
    const second = loadState();

    expect(second.columns[0].cardIds).toHaveLength(1);
  });
});
