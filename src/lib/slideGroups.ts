// Grupos de slides na esteira.
//
// A esteira continua sendo UMA lista na ordem da apresentação — grupos são
// uma camada por cima (nome, cor, recolher), então apresentar, exportar,
// numerar e o editor em tela cheia seguem a mesma ordem de sempre. A única
// regra: os slides de um grupo ficam sempre lado a lado (`normalizeGroups`).

export interface SlideGroup {
  id: string;
  name: string;
  /** Chave de GROUP_COLORS. */
  color: GroupColorKey;
  /** Recolhido na esteira (os slides continuam na apresentação). */
  collapsed?: boolean;
}

export const GROUP_COLORS = {
  blue: { label: "Azul", hex: "#3B82F6" },
  violet: { label: "Violeta", hex: "#8B5CF6" },
  pink: { label: "Rosa", hex: "#EC4899" },
  red: { label: "Vermelho", hex: "#EF4444" },
  orange: { label: "Laranja", hex: "#F97316" },
  amber: { label: "Âmbar", hex: "#EAB308" },
  green: { label: "Verde", hex: "#22C55E" },
  teal: { label: "Turquesa", hex: "#14B8A6" },
  slate: { label: "Cinza", hex: "#64748B" },
} as const;

export type GroupColorKey = keyof typeof GROUP_COLORS;
export const GROUP_COLOR_KEYS = Object.keys(GROUP_COLORS) as GroupColorKey[];
/** Ordem em que as cores novas são sorteadas: sempre a menos usada. */
const AUTO_COLOR_ORDER: GroupColorKey[] = ["blue", "violet", "teal", "orange", "pink", "green", "amber", "red", "slate"];

export const GROUP_ID_PREFIX = "group:";
export const groupDragId = (groupId: string) => `${GROUP_ID_PREFIX}${groupId}`;
export const isGroupDragId = (id: string) => id.startsWith(GROUP_ID_PREFIX);
export const groupIdFromDragId = (id: string) => id.slice(GROUP_ID_PREFIX.length);

export function isGroupColor(value: unknown): value is GroupColorKey {
  return typeof value === "string" && value in GROUP_COLORS;
}

export interface Groupable {
  id: string;
  groupId?: string;
}

/** Cor automática: a menos usada entre os grupos existentes. */
export function pickGroupColor(groups: readonly SlideGroup[]): GroupColorKey {
  const used = new Map<GroupColorKey, number>();
  for (const g of groups) used.set(g.color, (used.get(g.color) ?? 0) + 1);
  let best = AUTO_COLOR_ORDER[0];
  for (const key of AUTO_COLOR_ORDER) {
    if ((used.get(key) ?? 0) < (used.get(best) ?? 0)) best = key;
  }
  return best;
}

/**
 * Deixa a lista consistente: tira referências a grupos que não existem,
 * apaga grupos vazios e junta os slides de cada grupo (um slide solto que
 * ficou longe do grupo vai para o fim dele). Devolve os mesmos arrays quando
 * nada muda.
 */
export function normalizeGroups<T extends Groupable>(
  items: readonly T[],
  groups: readonly SlideGroup[],
): { items: T[]; groups: SlideGroup[] } {
  const known = new Set(groups.map((g) => g.id));
  let changed = false;
  const cleaned = items.map((item) => {
    if (item.groupId && !known.has(item.groupId)) {
      changed = true;
      const { groupId: _drop, ...rest } = item;
      void _drop;
      return rest as T;
    }
    return item;
  });

  // Junta os membros de cada grupo no lugar do primeiro.
  const out: T[] = [];
  const placedAt = new Map<string, number>(); // grupo → índice (em out) do último membro
  for (const item of cleaned) {
    const gid = item.groupId;
    if (!gid) {
      out.push(item);
      continue;
    }
    const last = placedAt.get(gid);
    if (last === undefined) {
      placedAt.set(gid, out.length);
      out.push(item);
      continue;
    }
    // Já existe bloco desse grupo: entra logo depois do último membro.
    out.splice(last + 1, 0, item);
    placedAt.set(gid, last + 1);
    // Os blocos de grupos que vinham depois deslocam uma posição.
    for (const [other, idx] of placedAt) if (other !== gid && idx > last) placedAt.set(other, idx + 1);
  }
  const moved = out.some((item, i) => item !== cleaned[i]);

  const usedGroups = new Set(out.map((i) => i.groupId).filter(Boolean) as string[]);
  const keptGroups = groups.filter((g) => usedGroups.has(g.id));
  if (keptGroups.length !== groups.length) changed = true;

  if (!changed && !moved) return { items: items as T[], groups: groups as SlideGroup[] };
  return { items: out, groups: keptGroups.length === groups.length ? (groups as SlideGroup[]) : keptGroups };
}

export function membersOf<T extends Groupable>(items: readonly T[], groupId: string): T[] {
  return items.filter((i) => i.groupId === groupId);
}

/** "Grupo 1", "Grupo 2"… — o primeiro número livre. */
export function nextGroupName(groups: readonly SlideGroup[]): string {
  const names = new Set(groups.map((g) => g.name.trim().toLowerCase()));
  for (let n = 1; n < 1000; n++) {
    if (!names.has(`grupo ${n}`)) return `Grupo ${n}`;
  }
  return "Novo grupo";
}

/** Nome que não repete outro grupo ("Resultados" → "Resultados (2)"). */
export function uniqueGroupName(name: string, groups: readonly SlideGroup[], ignoreId?: string): string {
  const base = name.trim() || nextGroupName(groups);
  const taken = new Set(groups.filter((g) => g.id !== ignoreId).map((g) => g.name.trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base} (${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return base;
}

/** Cria o grupo com os slides escolhidos, juntos no lugar do primeiro deles. */
export function groupItems<T extends Groupable>(
  items: readonly T[],
  groups: readonly SlideGroup[],
  ids: readonly string[],
  groupId: string,
  name?: string,
): { items: T[]; groups: SlideGroup[] } | null {
  const wanted = new Set(ids);
  const picked = items.filter((i) => wanted.has(i.id));
  if (picked.length === 0) return null;
  const firstIndex = items.findIndex((i) => wanted.has(i.id));
  const rest = items.filter((i) => !wanted.has(i.id));
  // Posição de inserção: depois dos slides que vinham antes do primeiro escolhido.
  const before = items.slice(0, firstIndex).filter((i) => !wanted.has(i.id)).length;
  const next = [
    ...rest.slice(0, before),
    ...picked.map((i) => ({ ...i, groupId })),
    ...rest.slice(before),
  ];
  const group: SlideGroup = {
    id: groupId,
    name: uniqueGroupName(name ?? "", groups),
    color: pickGroupColor(groups),
  };
  return normalizeGroups(next, [...groups, group]);
}

/** Põe slides num grupo existente: entram no fim dele. */
export function addItemsToGroup<T extends Groupable>(
  items: readonly T[],
  groups: readonly SlideGroup[],
  ids: readonly string[],
  groupId: string,
): { items: T[]; groups: SlideGroup[] } {
  const wanted = new Set(ids);
  const moving = items.filter((i) => wanted.has(i.id) && i.groupId !== groupId);
  if (moving.length === 0) return { items: items as T[], groups: groups as SlideGroup[] };
  const rest = items.filter((i) => !wanted.has(i.id) || i.groupId === groupId);
  const lastMember = rest.reduce((acc, i, idx) => (i.groupId === groupId ? idx : acc), -1);
  const at = lastMember < 0 ? rest.length : lastMember + 1;
  const next = [...rest.slice(0, at), ...moving.map((i) => ({ ...i, groupId })), ...rest.slice(at)];
  return normalizeGroups(next, groups);
}

/** Tira slides do grupo e os deixa logo depois dele (ou onde já estavam, se no meio nada muda). */
export function removeItemsFromGroups<T extends Groupable>(
  items: readonly T[],
  groups: readonly SlideGroup[],
  ids: readonly string[],
): { items: T[]; groups: SlideGroup[] } {
  const wanted = new Set(ids);
  const next = items.map((i) => {
    if (!wanted.has(i.id) || !i.groupId) return i;
    const { groupId: _drop, ...rest } = i;
    void _drop;
    return rest as T;
  });
  return normalizeGroups(next, groups);
}

/** Dissolve o grupo: os slides ficam onde estão, sem grupo. */
export function ungroup<T extends Groupable>(
  items: readonly T[],
  groups: readonly SlideGroup[],
  groupId: string,
): { items: T[]; groups: SlideGroup[] } {
  return normalizeGroups(
    items.map((i) => {
      if (i.groupId !== groupId) return i;
      const { groupId: _drop, ...rest } = i;
      void _drop;
      return rest as T;
    }),
    groups.filter((g) => g.id !== groupId),
  );
}

/**
 * Soltar `sourceId` sobre `overId` (slide ou cabeçalho de grupo `group:ID`):
 * - sobre um slide: toma o lugar dele e entra no grupo dele (ou sai do grupo,
 *   se o alvo não tem grupo) — arrastar para fora de um grupo desagrupa;
 * - sobre o cabeçalho de um grupo: entra no grupo (no início; no fim se
 *   estiver recolhido).
 */
export function moveItem<T extends Groupable>(
  items: readonly T[],
  groups: readonly SlideGroup[],
  sourceId: string,
  overId: string,
): { items: T[]; groups: SlideGroup[] } {
  const from = items.findIndex((i) => i.id === sourceId);
  if (from < 0) return { items: items as T[], groups: groups as SlideGroup[] };
  const source = items[from];

  if (isGroupDragId(overId)) {
    const gid = groupIdFromDragId(overId);
    const group = groups.find((g) => g.id === gid);
    if (!group) return { items: items as T[], groups: groups as SlideGroup[] };
    const rest = items.filter((i) => i.id !== sourceId);
    const members = rest.map((i, idx) => (i.groupId === gid ? idx : -1)).filter((idx) => idx >= 0);
    const at = members.length === 0 ? rest.length : group.collapsed ? members[members.length - 1] + 1 : members[0];
    const next = [...rest.slice(0, at), { ...source, groupId: gid }, ...rest.slice(at)];
    return normalizeGroups(next, groups);
  }

  const to = items.findIndex((i) => i.id === overId);
  if (to < 0 || from === to) return { items: items as T[], groups: groups as SlideGroup[] };
  const target = items[to];
  const next = [...items];
  next.splice(from, 1);
  next.splice(to, 0, { ...source, groupId: target.groupId } as T);
  if (!target.groupId) {
    const { groupId: _drop, ...rest } = next[to];
    void _drop;
    next[to] = rest as T;
  }
  return normalizeGroups(next, groups);
}

/**
 * Arrastar o grupo inteiro: vai para o lugar do slide (ou grupo) sobre o qual
 * foi solto. Subindo, entra antes do bloco alvo; descendo, depois dele.
 */
export function moveGroup<T extends Groupable>(
  items: readonly T[],
  groups: readonly SlideGroup[],
  groupId: string,
  overId: string,
): { items: T[]; groups: SlideGroup[] } {
  const members = items.filter((i) => i.groupId === groupId);
  if (members.length === 0) return { items: items as T[], groups: groups as SlideGroup[] };
  const overGroupId = isGroupDragId(overId)
    ? groupIdFromDragId(overId)
    : items.find((i) => i.id === overId)?.groupId;
  if (overGroupId === groupId) return { items: items as T[], groups: groups as SlideGroup[] };

  const firstIdx = items.findIndex((i) => i.groupId === groupId);
  // Bloco alvo: o grupo do alvo inteiro, ou o slide solto.
  const targetBlock = overGroupId
    ? items.filter((i) => i.groupId === overGroupId)
    : items.filter((i) => i.id === overId);
  if (targetBlock.length === 0) return { items: items as T[], groups: groups as SlideGroup[] };
  const targetFirst = items.findIndex((i) => i.id === targetBlock[0].id);
  const movingDown = targetFirst > firstIdx;

  const rest = items.filter((i) => i.groupId !== groupId);
  const anchor = movingDown
    ? rest.findIndex((i) => i.id === targetBlock[targetBlock.length - 1].id) + 1
    : rest.findIndex((i) => i.id === targetBlock[0].id);
  const next = [...rest.slice(0, anchor), ...members, ...rest.slice(anchor)];
  return normalizeGroups(next, groups);
}

// ---------------------------------------------------------------------------
// Modelo de exibição da esteira
// ---------------------------------------------------------------------------

export type FlowRow<T extends Groupable> =
  | { type: "slide"; item: T; index: number }
  | { type: "group"; group: SlideGroup; members: Array<{ item: T; index: number }>; startIndex: number };

/** Linhas da esteira: slides soltos e grupos (com os índices globais dos slides). */
export function buildFlowRows<T extends Groupable>(items: readonly T[], groups: readonly SlideGroup[]): FlowRow<T>[] {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const rows: FlowRow<T>[] = [];
  let current: Extract<FlowRow<T>, { type: "group" }> | null = null;
  items.forEach((item, index) => {
    const group = item.groupId ? byId.get(item.groupId) : undefined;
    if (!group) {
      current = null;
      rows.push({ type: "slide", item, index });
      return;
    }
    if (!current || current.group.id !== group.id) {
      current = { type: "group", group, members: [], startIndex: index };
      rows.push(current);
    }
    current.members.push({ item, index });
  });
  return rows;
}

/** Ids arrastáveis na ordem de tela: cabeçalho do grupo, e os slides se não recolhido. */
export function sortableIdsOf<T extends Groupable>(rows: readonly FlowRow<T>[]): string[] {
  const ids: string[] = [];
  for (const row of rows) {
    if (row.type === "slide") ids.push(row.item.id);
    else {
      ids.push(groupDragId(row.group.id));
      if (!row.group.collapsed) for (const m of row.members) ids.push(m.item.id);
    }
  }
  return ids;
}

/** Intervalo de slides selecionado por Shift+clique (índices na lista inteira). */
export function rangeIds<T extends { id: string }>(items: readonly T[], fromId: string, toId: string): string[] {
  const a = items.findIndex((i) => i.id === fromId);
  const b = items.findIndex((i) => i.id === toId);
  if (a < 0 || b < 0) return [toId];
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return items.slice(lo, hi + 1).map((i) => i.id);
}

/** Duplica um grupo (slides novos com ids novos) logo depois dele. */
export function duplicateGroupItems<T extends Groupable>(
  items: readonly T[],
  groups: readonly SlideGroup[],
  groupId: string,
  newGroupId: string,
  cloneItem: (item: T) => T,
): { items: T[]; groups: SlideGroup[] } | null {
  const original = groups.find((g) => g.id === groupId);
  const members = items.filter((i) => i.groupId === groupId);
  if (!original || members.length === 0) return null;
  const clones = members.map((m) => ({ ...cloneItem(m), groupId: newGroupId }) as T);
  const lastIdx = items.reduce((acc, i, idx) => (i.groupId === groupId ? idx : acc), -1);
  const next = [...items.slice(0, lastIdx + 1), ...clones, ...items.slice(lastIdx + 1)];
  const copy: SlideGroup = { ...original, id: newGroupId, name: uniqueGroupName(`${original.name} (cópia)`, groups), collapsed: false };
  return normalizeGroups(next, [...groups, copy]);
}

/** Renomeia os ids dos grupos de um conjunto de slides (carregar/importar pré-definição, duplicar deck). */
export function remapGroups<T extends Groupable>(
  items: readonly T[],
  groups: readonly SlideGroup[],
  newId: () => string,
): { items: T[]; groups: SlideGroup[] } {
  const map = new Map(groups.map((g) => [g.id, newId()]));
  return {
    items: items.map((i) => (i.groupId && map.has(i.groupId) ? ({ ...i, groupId: map.get(i.groupId) } as T) : i)),
    groups: groups.map((g) => ({ ...g, id: map.get(g.id)! })),
  };
}

/** Estimativa de duração: o mesmo critério da esteira (30 s por slide). */
export function estimatedMinutes(slideCount: number): number {
  return Math.max(1, Math.round((slideCount * 30) / 60));
}

/** Aceita só grupos bem formados (arquivo antigo, importado ou corrompido). */
export function sanitizeGroups(value: unknown): SlideGroup[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: SlideGroup[] = [];
  for (const raw of value) {
    const g = raw as Partial<SlideGroup> | null;
    if (!g || typeof g.id !== "string" || !g.id || seen.has(g.id)) continue;
    seen.add(g.id);
    out.push({
      id: g.id,
      name: typeof g.name === "string" && g.name.trim() ? g.name.trim().slice(0, 80) : "Grupo",
      color: isGroupColor(g.color) ? g.color : "blue",
      collapsed: !!g.collapsed,
    });
  }
  return out;
}
