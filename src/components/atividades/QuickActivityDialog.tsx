import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tag as TagIcon, X } from "lucide-react";
import {
  KanbanCard,
  Priority,
  Recurrence,
  loadState,
  newId,
  saveState,
} from "@/lib/kanban";

export interface QuickActivityPrefill {
  title?: string;
  description?: string;
  tags?: string[];
  priority?: Priority;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  prefill?: QuickActivityPrefill;
}

export function QuickActivityDialog({ open, onOpenChange, prefill }: Props) {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [priority, setPriority] = useState<Priority | "none">("none");
  const [recurrence, setRecurrence] = useState<Recurrence | "none">("none");
  const [colId, setColId] = useState<string>("");

  // Load columns lazily on open
  const [columns, setColumns] = useState<{ id: string; title: string; accent: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    const st = loadState();
    const cols = st.columns.map((c) => ({ id: c.id, title: c.title, accent: c.accent }));
    setColumns(cols);
    setColId(cols[0]?.id ?? "");
    setTitle(prefill?.title ?? "");
    setDescription(prefill?.description ?? "");
    setTags(prefill?.tags ?? []);
    setPriority(prefill?.priority ?? "none");
    setRecurrence("none");
    setTagDraft("");
  }, [open, prefill]);

  function addTag() {
    const v = tagDraft.trim();
    if (!v || tags.includes(v)) return;
    setTags((s) => [...s, v]);
    setTagDraft("");
  }

  function handleSave() {
    if (!title.trim() && !description.trim()) {
      onOpenChange(false);
      return;
    }
    const card: KanbanCard = {
      id: newId("card"),
      title: title.trim(),
      description: description.trim() || undefined,
      priority: priority === "none" ? undefined : priority,
      tags: tags.length ? tags : undefined,
      recurrence: recurrence === "none" ? null : recurrence,
      createdAt: new Date().toISOString(),
    };

    // Persist directly via loadState/saveState
    const st = loadState();
    const targetColId = st.columns.some((c) => c.id === colId) ? colId : st.columns[0]?.id;
    if (!targetColId) {
      toast.error("Nenhuma coluna disponível");
      return;
    }
    const next = {
      cards: { ...st.cards, [card.id]: card },
      columns: st.columns.map((c) =>
        c.id === targetColId ? { ...c, cardIds: [...c.cardIds, card.id] } : c,
      ),
    };
    saveState(next);
    onOpenChange(false);

    toast.success("Atividade criada!", {
      action: {
        label: "Ver em Atividades →",
        onClick: () => navigate("/atividades"),
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova atividade</DialogTitle>
          <DialogDescription className="sr-only">
            Crie uma atividade rapidamente
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            autoFocus
            placeholder="Título"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="border-0 bg-transparent px-0 text-base font-medium shadow-none focus-visible:ring-0"
          />
          <Textarea
            placeholder="Descrição (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="resize-none border-0 bg-muted/30 text-sm"
          />

          <div className="grid grid-cols-2 gap-3">
            <Mini label="Status">
              <Select value={colId} onValueChange={setColId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Coluna" />
                </SelectTrigger>
                <SelectContent>
                  {columns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: `hsl(${c.accent})` }}
                        />
                        {c.title}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Mini>

            <Mini label="Prioridade">
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority | "none")}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem prioridade</SelectItem>
                  <SelectItem value="low">Baixa</SelectItem>
                  <SelectItem value="med">Média</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                </SelectContent>
              </Select>
            </Mini>

            <Mini label="Recorrência">
              <Select
                value={recurrence}
                onValueChange={(v) => setRecurrence(v as Recurrence | "none")}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não repete</SelectItem>
                  <SelectItem value="weekly">Semanalmente</SelectItem>
                  <SelectItem value="biweekly">A cada 2 semanas</SelectItem>
                  <SelectItem value="monthly">Mensalmente</SelectItem>
                </SelectContent>
              </Select>
            </Mini>
          </div>

          <Mini label="Tags">
            <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background p-2">
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                >
                  <TagIcon className="h-2.5 w-2.5 text-muted-foreground" />
                  {t}
                  <button
                    onClick={() => setTags(tags.filter((x) => x !== t))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
              <input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addTag();
                  } else if (e.key === "Backspace" && !tagDraft && tags.length) {
                    setTags(tags.slice(0, -1));
                  }
                }}
                onBlur={addTag}
                placeholder={tags.length ? "" : "Adicionar tag e Enter"}
                className="flex-1 min-w-[120px] bg-transparent text-xs outline-none"
              />
            </div>
          </Mini>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Criar atividade
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Mini({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}
