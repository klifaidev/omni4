// Kanban — tipos e persistência local
import { toast } from "sonner";

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
  /** Quando a atividade entrou na última coluna (ISO datetime). Carimbado só
   *  na transição — editar outros campos ou mover entre colunas do meio não
   *  mexe aqui. Base real de "concluídas esta semana" (ver metrics). */
  completedAt?: string;
}

export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  weekly: "Semanalmente",
  biweekly: "A cada 2 semanas",
  monthly: "Mensalmente",
};

// "monthly" não entra aqui: soma de dias fixos faz a data recorrente
// "deslizar" (dia 31 vira dia 2, depois dia 4...). Mês usa aritmética de
// calendário própria (addMonthsClamped) para manter sempre o mesmo dia.
const RECURRENCE_DAYS: Record<"weekly" | "biweekly", number> = {
  weekly: 7,
  biweekly: 14,
};

/** Soma N meses de calendário, preso ao dia original (30/jan +1 mês = 28 ou
 *  29/fev, nunca março) — sempre a partir da data-base, nunca encadeado, pra
 *  não ficar "preso" num dia menor depois de vários meses perdidos. */
function addMonthsClamped(date: Date, months: number): Date {
  const day = date.getDate();
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const daysInTargetMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, daysInTargetMonth));
  return target;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

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

// ---------------------------------------------------------------------------
// Status de gravação — antes, uma falha ao gravar no localStorage (cota
// cheia, modo privado, etc.) era engolida em silêncio: a sessão continuava
// normal na tela, mas nada novo era salvo. Foi a causa raiz do incidente
// crítico da esteira de Slides (v1.9.337); aqui usamos a mesma prevenção,
// só que sem precisar do arquivo do Electron (o volume de dados é pequeno).
// ---------------------------------------------------------------------------
export type KanbanSaveStatus = "ok" | "error";
let saveStatus: KanbanSaveStatus = "ok";
const saveStatusListeners = new Set<(s: KanbanSaveStatus) => void>();

export function getKanbanSaveStatus(): KanbanSaveStatus {
  return saveStatus;
}

/** Devolve uma função para cancelar a inscrição. */
export function subscribeKanbanSaveStatus(cb: (s: KanbanSaveStatus) => void): () => void {
  saveStatusListeners.add(cb);
  return () => saveStatusListeners.delete(cb);
}

function setSaveStatus(next: KanbanSaveStatus) {
  if (next === saveStatus) return;
  saveStatus = next;
  saveStatusListeners.forEach((cb) => cb(next));
}

/** Único ponto que grava o estado das atividades no localStorage. */
function writeStorage(state: KanbanState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    setSaveStatus("ok");
    return true;
  } catch (err) {
    console.error("[kanban] falha ao salvar atividades:", err);
    if (saveStatus === "ok") {
      toast.error("Não foi possível salvar as atividades", {
        description: "As mudanças desta sessão podem se perder ao fechar o app. Tente liberar espaço no navegador ou salvar de novo em instantes.",
        duration: 10000,
      });
    }
    setSaveStatus("error");
    return false;
  }
}

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

/** Leitura pura do estado persistido — nunca escreve no localStorage. */
export function loadState(): KanbanState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as KanbanState;
    if (!parsed.columns || !parsed.cards) return defaultState();
    return parsed;
  } catch {
    return defaultState();
  }
}

/**
 * Como `loadState`, mas também roda a manutenção periódica: semeia "Top 3"
 * na primeira vez e gera a próxima instância de atividades recorrentes já
 * vencidas — o que PODE escrever no localStorage. Só a aba Atividades chama
 * esta versão, de propósito: mantém num único lugar quem tem permissão de
 * gerar essas gravações, então outros leitores independentes do mesmo
 * estado — o diálogo rápido, o resumo da Home, o scan diário de
 * notificações do AppShell — nunca disputam essa escrita nem correm o
 * risco de sobrescrever uma recorrência que acabou de ser criada; eles usam
 * `loadState` puro.
 */
export function loadStateWithMaintenance(): KanbanState {
  return generateRecurring(seedTop3(loadState()));
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

  const todayIso = isoDate(new Date());

  const newCards: Record<string, KanbanCard> = { ...state.cards };
  const newIds: string[] = [];
  const nowIso = new Date().toISOString();
  let mutated = false;

  for (const cid of lastCol.cardIds) {
    const c = state.cards[cid];
    if (!c?.recurrence || !c.dueDate) continue;
    if (c.dueDate >= todayIso) continue;

    const base = new Date(c.dueDate + "T00:00:00");
    let next: Date;
    if (c.recurrence === "monthly") {
      // Sempre a partir da data-base original (nunca encadeado a partir do
      // `next` anterior), pra não "grudar" num dia menor depois de pular
      // vários meses sem abrir o app.
      let months = 1;
      next = addMonthsClamped(base, months);
      while (isoDate(next) < todayIso) {
        months += 1;
        next = addMonthsClamped(base, months);
      }
    } else {
      const days = RECURRENCE_DAYS[c.recurrence];
      next = new Date(base.getTime() + days * 86400000);
      while (isoDate(next) < todayIso) {
        next = new Date(next.getTime() + days * 86400000);
      }
    }
    const nextIso = isoDate(next);

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
  writeStorage(next);
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
  writeStorage(state);
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
