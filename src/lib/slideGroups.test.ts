import { describe, expect, it } from "vitest";
import {
  addItemsToGroup,
  buildFlowRows,
  duplicateGroupItems,
  groupDragId,
  groupItems,
  moveGroup,
  moveItem,
  nextGroupName,
  normalizeGroups,
  pickGroupColor,
  rangeIds,
  remapGroups,
  removeItemsFromGroups,
  sanitizeGroups,
  sortableIdsOf,
  ungroup,
  uniqueGroupName,
  type SlideGroup,
} from "./slideGroups";

type It = { id: string; groupId?: string };
const sl = (id: string, groupId?: string): It => (groupId ? { id, groupId } : { id });
const ids = (items: It[]) => items.map((i) => i.id).join(",");
const gof = (items: It[]) => items.map((i) => `${i.id}${i.groupId ? `:${i.groupId}` : ""}`).join(",");
const grp = (id: string, extra: Partial<SlideGroup> = {}): SlideGroup => ({ id, name: id.toUpperCase(), color: "blue", ...extra });

describe("normalizeGroups", () => {
  it("tira referência a grupo inexistente e apaga grupo vazio", () => {
    const r = normalizeGroups([sl("a", "x"), sl("b")], [grp("y")]);
    expect(gof(r.items)).toBe("a,b");
    expect(r.groups).toEqual([]);
  });

  it("junta os membros de um grupo espalhados pela lista", () => {
    const r = normalizeGroups([sl("a", "g"), sl("b"), sl("c", "g"), sl("d")], [grp("g")]);
    expect(gof(r.items)).toBe("a:g,c:g,b,d");
  });

  it("junta vários grupos sem trocar a ordem entre eles", () => {
    const r = normalizeGroups(
      [sl("a", "g1"), sl("b", "g2"), sl("c", "g1"), sl("d", "g2"), sl("e")],
      [grp("g1"), grp("g2")],
    );
    expect(gof(r.items)).toBe("a:g1,c:g1,b:g2,d:g2,e");
  });

  it("devolve os mesmos arrays quando já está certo", () => {
    const items = [sl("a", "g"), sl("b", "g"), sl("c")];
    const groups = [grp("g")];
    const r = normalizeGroups(items, groups);
    expect(r.items).toBe(items);
    expect(r.groups).toBe(groups);
  });
});

describe("criar, entrar, sair, desfazer grupo", () => {
  const base = [sl("a"), sl("b"), sl("c"), sl("d"), sl("e")];

  it("agrupa slides separados, juntos no lugar do primeiro", () => {
    const r = groupItems(base, [], ["b", "d"], "g1", "Resultados")!;
    expect(gof(r.items)).toBe("a,b:g1,d:g1,c,e");
    expect(r.groups[0]).toMatchObject({ id: "g1", name: "Resultados" });
  });

  it("agrupar sem nome dá 'Grupo 1', depois 'Grupo 2'", () => {
    const first = groupItems(base, [], ["a"], "g1")!;
    expect(first.groups[0].name).toBe("Grupo 1");
    const second = groupItems(first.items, first.groups, ["c"], "g2")!;
    expect(second.groups[1].name).toBe("Grupo 2");
    expect(nextGroupName(second.groups)).toBe("Grupo 3");
  });

  it("nome repetido ganha número", () => {
    expect(uniqueGroupName("Resultados", [grp("x", { name: "resultados" })])).toBe("Resultados (2)");
    expect(uniqueGroupName("Resultados", [grp("x", { name: "Resultados" })], "x")).toBe("Resultados");
  });

  it("cores novas escolhem a menos usada", () => {
    expect(pickGroupColor([])).toBe("blue");
    expect(pickGroupColor([grp("a", { color: "blue" })])).toBe("violet");
  });

  it("entrar num grupo existente: vai para o fim dele", () => {
    const g = groupItems(base, [], ["a", "b"], "g1")!;
    const r = addItemsToGroup(g.items, g.groups, ["e"], "g1");
    expect(gof(r.items)).toBe("a:g1,b:g1,e:g1,c,d");
  });

  it("sair do grupo e dissolver o grupo", () => {
    const g = groupItems(base, [], ["a", "b", "c"], "g1")!;
    const out = removeItemsFromGroups(g.items, g.groups, ["b"]);
    expect(gof(out.items)).toBe("a:g1,c:g1,b,d,e".replace("a:g1,c:g1,b", "a:g1,c:g1,b"));
    const gone = ungroup(g.items, g.groups, "g1");
    expect(gof(gone.items)).toBe("a,b,c,d,e");
    expect(gone.groups).toEqual([]);
  });

  it("tirar o último membro apaga o grupo", () => {
    const g = groupItems(base, [], ["a"], "g1")!;
    const r = removeItemsFromGroups(g.items, g.groups, ["a"]);
    expect(r.groups).toEqual([]);
  });
});

describe("arrastar um slide", () => {
  // g1: a b | c solto | g2: d e | f solto
  const items = [sl("a", "g1"), sl("b", "g1"), sl("c"), sl("d", "g2"), sl("e", "g2"), sl("f")];
  const groups = [grp("g1"), grp("g2")];

  it("sobre um membro de outro grupo: entra nesse grupo", () => {
    const r = moveItem(items, groups, "c", "e");
    // Descendo, o slide passa para depois do alvo (o mesmo arrastar de sempre da esteira).
    expect(gof(r.items)).toBe("a:g1,b:g1,d:g2,e:g2,c:g2,f");
  });

  it("sobre slide solto: sai do grupo (arrastar para fora desagrupa)", () => {
    const r = moveItem(items, groups, "a", "c");
    expect(gof(r.items)).toBe("b:g1,c,a,d:g2,e:g2,f".replace("c,a", "c,a"));
    expect(r.items.find((i) => i.id === "a")!.groupId).toBeUndefined();
  });

  it("dentro do mesmo grupo: só reordena e continua nele", () => {
    const r = moveItem(items, groups, "a", "b");
    expect(gof(r.items)).toBe("b:g1,a:g1,c,d:g2,e:g2,f");
  });

  it("sobre o cabeçalho do grupo: entra no início; recolhido, no fim", () => {
    expect(gof(moveItem(items, groups, "f", groupDragId("g2")).items)).toBe("a:g1,b:g1,c,f:g2,d:g2,e:g2");
    const collapsed = [grp("g1"), grp("g2", { collapsed: true })];
    expect(gof(moveItem(items, collapsed, "f", groupDragId("g2")).items)).toBe("a:g1,b:g1,c,d:g2,e:g2,f:g2");
  });

  it("slide que sai e deixa o grupo vazio apaga o grupo", () => {
    const solo = [sl("a", "g1"), sl("c")];
    const r = moveItem(solo, [grp("g1")], "a", "c");
    expect(r.groups).toEqual([]);
  });

  it("origem inexistente não muda nada", () => {
    expect(moveItem(items, groups, "zzz", "c").items).toBe(items);
  });
});

describe("arrastar o grupo inteiro", () => {
  const items = [sl("a", "g1"), sl("b", "g1"), sl("c"), sl("d", "g2"), sl("e", "g2"), sl("f")];
  const groups = [grp("g1"), grp("g2")];

  it("descendo sobre um slide solto: passa depois dele", () => {
    expect(gof(moveGroup(items, groups, "g1", "c").items)).toBe("c,a:g1,b:g1,d:g2,e:g2,f");
  });

  it("descendo sobre outro grupo: passa depois do grupo todo", () => {
    expect(gof(moveGroup(items, groups, "g1", groupDragId("g2")).items)).toBe("c,d:g2,e:g2,a:g1,b:g1,f");
    expect(gof(moveGroup(items, groups, "g1", "e").items)).toBe("c,d:g2,e:g2,a:g1,b:g1,f");
  });

  it("subindo: entra antes do bloco alvo", () => {
    expect(gof(moveGroup(items, groups, "g2", "c").items)).toBe("a:g1,b:g1,d:g2,e:g2,c,f");
    expect(gof(moveGroup(items, groups, "g2", groupDragId("g1")).items)).toBe("d:g2,e:g2,a:g1,b:g1,c,f");
  });

  it("soltar sobre o próprio grupo não muda nada", () => {
    expect(moveGroup(items, groups, "g1", "b").items).toBe(items);
  });
});

describe("modelo de exibição", () => {
  const items = [sl("a"), sl("b", "g1"), sl("c", "g1"), sl("d"), sl("e", "g2")];
  const groups = [grp("g1"), grp("g2", { collapsed: true })];

  it("monta linhas com índices globais", () => {
    const rows = buildFlowRows(items, groups);
    expect(rows.map((r) => r.type)).toEqual(["slide", "group", "slide", "group"]);
    const g1 = rows[1];
    expect(g1.type === "group" && g1.members.map((m) => m.index)).toEqual([1, 2]);
    expect(g1.type === "group" && g1.startIndex).toBe(1);
  });

  it("ids arrastáveis: grupo recolhido só mostra o cabeçalho", () => {
    expect(sortableIdsOf(buildFlowRows(items, groups))).toEqual(["a", "group:g1", "b", "c", "d", "group:g2"]);
  });

  it("intervalo do Shift+clique vale nos dois sentidos", () => {
    expect(rangeIds(items, "b", "d")).toEqual(["b", "c", "d"]);
    expect(rangeIds(items, "d", "b")).toEqual(["b", "c", "d"]);
  });
});

describe("duplicar e copiar grupos", () => {
  it("duplica o grupo com ids novos logo depois dele", () => {
    const g = groupItems([sl("a"), sl("b"), sl("c")], [], ["a", "b"], "g1", "Resultados")!;
    let n = 0;
    const r = duplicateGroupItems(g.items, g.groups, "g1", "g2", (i) => ({ ...i, id: `${i.id}${++n}` }))!;
    expect(gof(r.items)).toBe("a:g1,b:g1,a1:g2,b2:g2,c");
    expect(r.groups.map((x) => x.name)).toEqual(["Resultados", "Resultados (cópia)"]);
  });

  it("remapeia os ids dos grupos (carregar pré-definição)", () => {
    let n = 0;
    const r = remapGroups([sl("a", "g1"), sl("b")], [grp("g1")], () => `novo${++n}`);
    expect(gof(r.items)).toBe("a:novo1,b");
    expect(r.groups[0].id).toBe("novo1");
  });

  it("aceita só grupos bem formados", () => {
    expect(sanitizeGroups("x")).toEqual([]);
    expect(sanitizeGroups([{ id: "a", name: " Nome ", color: "roxo" }, { id: "a" }, null, { name: "sem id" }])).toEqual([
      { id: "a", name: "Nome", color: "blue", collapsed: false },
    ]);
  });
});
