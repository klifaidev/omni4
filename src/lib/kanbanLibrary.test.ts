import { describe, expect, it } from "vitest";
import { allAssignees, allTags, deleteAssignee, deleteTag, renameAssignee, renameTag, type KanbanState } from "./kanban";

const card = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: id, createdAt: "2026-01-01", ...extra });
const base = (): KanbanState => ({
  columns: [{ id: "c1", title: "A fazer", accent: "", cardIds: ["a", "b", "c"] }],
  cards: {
    a: card("a", { tags: ["Pricing", "Urgente"], assignee: "Ana" }),
    b: card("b", { tags: ["pricing"], assignee: "ana" }),
    c: card("c", { tags: ["Budget"], assignee: "Bruno" }),
  },
  tagLibrary: ["Pricing", "Sem uso"],
  assigneeLibrary: ["Carla"],
});

describe("biblioteca de tags", () => {
  it("renomear troca a tag em todas as atividades e na biblioteca", () => {
    const s = renameTag(base(), "Pricing", "Preço");
    expect(s.cards.a.tags).toEqual(["Preço", "Urgente"]);
    expect(s.cards.b.tags).toEqual(["Preço"]);
    expect(s.tagLibrary).toEqual(["Preço", "Sem uso"]);
  });
  it("renomear para uma tag que já existe une as duas sem duplicar", () => {
    const s = renameTag(base(), "Urgente", "budget");
    expect(s.cards.a.tags).toEqual(["Pricing", "Budget"]);
    expect(allTags(s)).toEqual(["Budget", "Pricing", "Sem uso"]);
  });
  it("excluir tira a tag de todas as atividades e da biblioteca", () => {
    const s = deleteTag(base(), "PRICING");
    expect(s.cards.a.tags).toEqual(["Urgente"]);
    expect(s.cards.b.tags).toBeUndefined();
    expect(s.tagLibrary).toEqual(["Sem uso"]);
    expect(s.columns).toEqual(base().columns);
  });
});

describe("cadastro de responsáveis", () => {
  it("lista cadastrados e usados, sem repetir", () => {
    expect(allAssignees(base())).toEqual(["Ana", "Bruno", "Carla"]);
  });
  it("renomear troca o responsável em todas as atividades", () => {
    const s = renameAssignee(base(), "Ana", "Ana Paula");
    expect(s.cards.a.assignee).toBe("Ana Paula");
    expect(s.cards.b.assignee).toBe("Ana Paula");
    expect(s.cards.c.assignee).toBe("Bruno");
  });
  it("excluir deixa as atividades sem responsável e tira do cadastro", () => {
    const s = deleteAssignee(base(), "Carla");
    expect(s.assigneeLibrary).toEqual([]);
    const t = deleteAssignee(base(), "Bruno");
    expect(t.cards.c.assignee).toBeUndefined();
  });
});
