// Kanban — tipos e persistência local
export type Priority = "low" | "med" | "high";

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export type Recurrence = "weekly" | "biweekly" | "monthly";

export interface KanbanCard {
  id: string;
  title: string;
  description?: string;
  dueDate?: string; // ISO yyyy-mm-dd
  assignee?: string;
  priority?: Priority;
  tags?: string[];
  checklist?: ChecklistItem[];
  recurrence?: Recurrence | null;
  createdAt: string;
}

export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  weekly: "Semanalmente",
  biweekly: "A cada 2 semanas",
  monthly: "Mensalmente",
};

const RECURRENCE_DAYS: Record<Recurrence, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
};

export interface KanbanColumn {
  id: string;
  title: string;
  accent: string; // hsl color e.g. "220 12% 70%"
  cardIds: string[];
}

export interface KanbanState {
  columns: KanbanColumn[];
  cards: Record<string, KanbanCard>;
}

const STORAGE_KEY = "harald.kanban.v1";

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Baixa",
  med: "Média",
  high: "Alta",
};

export const PRIORITY_TONE: Record<Priority, string> = {
  low: "bg-muted/40 text-muted-foreground border-border/40",
  med: "bg-warning/15 text-warning border-warning/30",
  high: "bg-destructive/15 text-destructive border-destructive/30",
};

export const COLUMN_ACCENTS = [
  { label: "Cinza", value: "220 12% 65%" },
  { label: "Âmbar", value: "38 92% 60%" },
  { label: "Azul", value: "217 91% 60%" },
  { label: "Verde", value: "158 64% 52%" },
  { label: "Roxo", value: "263 70% 65%" },
  { label: "Vermelho", value: "0 84% 65%" },
  { label: "Ciano", value: "195 70% 60%" },
];

export function defaultState(): KanbanState {
  return {
    columns: [
      { id: col(), title: "A fazer", accent: "220 12% 65%", cardIds: [] },
      { id: col(), title: "Top 3", accent: "38 92% 60%", cardIds: [] },
      { id: col(), title: "Em andamento", accent: "217 91% 60%", cardIds: [] },
      { id: col(), title: "Concluído", accent: "158 64% 52%", cardIds: [] },
    ],
    cards: {},
  };
}

function col() {
  return "c_" + Math.random().toString(36).slice(2, 9);
}
export function newId(prefix = "k") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function loadState(): KanbanState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return generateRecurring(seedTop3(defaultState()));
    const parsed = JSON.parse(raw) as KanbanState;
    if (!parsed.columns || !parsed.cards) return generateRecurring(seedTop3(defaultState()));
    return generateRecurring(seedTop3(parsed));
  } catch {
    return generateRecurring(seedTop3(defaultState()));
  }
}

/**
 * Para cada card concluído (na última coluna) com recurrence definida e dueDate no passado,
 * gera uma nova instância na primeira coluna, com checklist resetado e nova data.
 */
function generateRecurring(state: KanbanState): KanbanState {
  if (!state.columns.length) return state;
  const firstCol = state.columns[0];
  const lastCol = state.columns[state.columns.length - 1];
  if (!firstCol || !lastCol || firstCol.id === lastCol.id) return state;

  const todayIso = new Date().toISOString().slice(0, 10);

  const newCards: Record<string, KanbanCard> = { ...state.cards };
  const newIds: string[] = [];
  const nowIso = new Date().toISOString();
  let mutated = false;

  for (const cid of lastCol.cardIds) {
    const c = state.cards[cid];
    if (!c?.recurrence || !c.dueDate) continue;
    if (c.dueDate >= todayIso) continue;

    const base = new Date(c.dueDate + "T00:00:00");
    const days = RECURRENCE_DAYS[c.recurrence];
    let next = new Date(base.getTime() + days * 86400000);
    // Avança até futuro
    while (next.toISOString().slice(0, 10) < todayIso) {
      next = new Date(next.getTime() + days * 86400000);
    }
    const nextIso = next.toISOString().slice(0, 10);

    // Evitar duplicar caso já exista uma instância com mesmo título e prazo na 1ª coluna
    const dup = firstCol.cardIds.some((id) => {
      const ex = state.cards[id];
      return ex && ex.title === c.title && ex.dueDate === nextIso;
    });
    if (dup) continue;

    const id = newId("card");
    newCards[id] = {
      id,
      title: c.title,
      description: c.description,
      assignee: c.assignee,
      priority: c.priority,
      tags: c.tags ? [...c.tags] : undefined,
      checklist: c.checklist
        ? c.checklist.map((it) => ({ id: newId("chk"), text: it.text, done: false }))
        : undefined,
      recurrence: c.recurrence,
      dueDate: nextIso,
      createdAt: nowIso,
    };
    newIds.push(id);
    mutated = true;
  }

  if (!mutated) return state;

  const columns = state.columns.map((col) =>
    col.id === firstCol.id ? { ...col, cardIds: [...newIds, ...col.cardIds] } : col,
  );
  const next = { cards: newCards, columns };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* noop */
  }
  return next;
}

const SEED_FLAG = "harald.kanban.seed.top3.v1";

/** One-time seed: popula "Top 3" com as atividades iniciais se ainda não foi feito. */
function seedTop3(state: KanbanState): KanbanState {
  try {
    if (localStorage.getItem(SEED_FLAG) === "done") return state;
  } catch {
    return state;
  }

  const top3 = state.columns.find(
    (c) => c.title.trim().toLowerCase() === "top 3",
  );
  if (!top3 || top3.cardIds.length > 0) {
    try {
      localStorage.setItem(SEED_FLAG, "done");
    } catch {
      /* noop */
    }
    return state;
  }

  const items: Array<Pick<KanbanCard, "title" | "description">> = [
    {
      title: "Puxar fórum para falar da planilha de SKUs Referência",
    },
    {
      title: "Estruturar plano para continuar com Melken Zero e Vegano",
      description:
        "Avaliar se vale a pena continuar com o Melken Zero e o Vegano: construir uma apresentação, entender DRE, números, quanto tem de lote mínimo (com suprimentos - Reginaldo), ele vai falar de embalagem e Fernando Cândido para terceiros.",
    },
    {
      title: "Direcionar Aline sobre as ordens a serem criadas",
      description: "Alinhar com a Mari.",
    },
    {
      title: "Criar proposta de Gestão de Categoria 2.0",
      description:
        "Estabelecer a divisão de categorias com a nova divisão da base de hierarquias, propor um período para entendimento das 360 categorias e propor um momento para estabelecimento de planos de ação para as principais dores das categorias.",
    },
    {
      title: "Ajustar Dash com nova visão estrutura de dados",
      description: "Projeto Hierarquias.",
    },
  ];

  const now = new Date().toISOString();
  const newCards: Record<string, KanbanCard> = { ...state.cards };
  const newIds: string[] = [];
  items.forEach((it) => {
    const id = newId("card");
    newCards[id] = {
      id,
      title: it.title,
      description: it.description,
      createdAt: now,
    };
    newIds.push(id);
  });

  const columns = state.columns.map((c) =>
    c.id === top3.id ? { ...c, cardIds: [...c.cardIds, ...newIds] } : c,
  );

  try {
    localStorage.setItem(SEED_FLAG, "done");
  } catch {
    /* noop */
  }

  return { cards: newCards, columns };
}


export function saveState(state: KanbanState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* noop */
  }
}

export function initials(name?: string) {
  if (!name) return "·";
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? "";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase() || "·";
}

export function avatarHue(name?: string) {
  if (!name) return 220;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

export function dueStatus(due?: string): "overdue" | "today" | "soon" | "later" | "none" {
  if (!due) return "none";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(due + "T00:00:00");
  const diff = (d.getTime() - today.getTime()) / 86400000;
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff <= 3) return "soon";
  return "later";
}

export function formatDueShort(due: string) {
  const d = new Date(due + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
}
