// Filtro da aba Atividades que também administra os valores: escolher para
// filtrar, renomear (em todas as atividades de uma vez) ou excluir.
import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Pencil, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface ManagedFilterProps {
  /** Texto do botão quando nada está selecionado (ex.: "Todas as tags"). */
  allLabel: string;
  /** Nome do item no singular, para as mensagens (ex.: "tag", "responsável"). */
  noun: string;
  options: string[];
  /** Quantas atividades usam cada valor. */
  counts: Record<string, number>;
  multiple?: boolean;
  selected: string[];
  onChange: (selected: string[]) => void;
  onRename: (from: string, to: string) => void;
  onDelete: (value: string) => void;
  /** O que acontece com as atividades ao excluir (ex.: "a tag sai de"). */
  deleteEffect: string;
  className?: string;
}

const fold = (v: string) => v.trim().toLocaleLowerCase("pt-BR");

export function ManagedFilter({
  allLabel,
  noun,
  options,
  counts,
  multiple = false,
  selected,
  onChange,
  onRename,
  onDelete,
  deleteEffect,
  className,
}: ManagedFilterProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = fold(query);
    return q ? options.filter((o) => fold(o).includes(q)) : options;
  }, [options, query]);

  const triggerText =
    selected.length === 0 ? allLabel : selected.length === 1 ? selected[0] : `${selected.length} selecionados`;

  const toggle = (value: string) => {
    if (multiple) onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
    else onChange(selected[0] === value ? [] : [value]);
    if (!multiple) setOpen(false);
  };

  const startEdit = (value: string) => {
    setConfirming(null);
    setEditing(value);
    setDraft(value);
  };
  const commitEdit = () => {
    if (!editing) return;
    const next = draft.trim();
    if (next && next !== editing) onRename(editing, next);
    setEditing(null);
  };
  const mergeTarget = editing && draft.trim()
    ? options.find((o) => fold(o) === fold(draft) && fold(o) !== fold(editing))
    : undefined;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setEditing(null);
          setConfirming(null);
          setQuery("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          size="sm"
          className={cn(
            "h-9 justify-between gap-2 border-border/50 bg-secondary/40 px-3 text-xs font-normal",
            selected.length === 0 ? "text-muted-foreground" : "font-medium text-primary",
            className,
          )}
        >
          <span className="truncate">{triggerText}</span>
          <span className="inline-flex items-center gap-1">
            {selected.length > 0 && (
              <span
                role="button"
                tabIndex={-1}
                aria-label="Limpar filtro"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange([]);
                }}
                className="rounded p-0.5 opacity-60 hover:bg-background/50 hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </span>
            )}
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] p-0">
        <div className="relative border-b border-border/40">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Buscar ${noun}…`}
            className="h-9 w-full bg-transparent pl-8 pr-3 text-xs outline-none"
          />
        </div>

        <button
          type="button"
          onClick={() => {
            onChange([]);
            if (!multiple) setOpen(false);
          }}
          className={cn(
            "flex w-full items-center gap-2 border-b border-border/30 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/40",
            selected.length === 0 && "font-medium text-primary",
          )}
        >
          <Check className={cn("h-3.5 w-3.5", selected.length === 0 ? "opacity-100" : "opacity-0")} />
          {allLabel}
        </button>

        <div className="max-h-[300px] overflow-y-auto py-1">
          {visible.length === 0 && (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              {options.length ? "Nada encontrado." : `Nenhum(a) ${noun} cadastrado(a) ainda.`}
            </div>
          )}
          {visible.map((value) => {
            const isSel = selected.includes(value);
            const n = counts[value] ?? 0;

            if (editing === value) {
              return (
                <div key={value} className="px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit();
                        if (e.key === "Escape") {
                          e.stopPropagation();
                          setEditing(null);
                        }
                      }}
                      aria-label={`Novo nome para ${value}`}
                      className="h-7 flex-1 rounded-md border border-primary/50 bg-background px-2 text-xs outline-none ring-2 ring-primary/20"
                    />
                    <button type="button" onClick={commitEdit} aria-label="Salvar nome" className="rounded p-1 text-primary hover:bg-primary/10">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => setEditing(null)} aria-label="Cancelar" className="rounded p-1 text-muted-foreground hover:bg-muted/60">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="mt-1 px-0.5 text-[10.5px] leading-snug text-muted-foreground">
                    {mergeTarget
                      ? `"${mergeTarget}" já existe: as duas viram uma só em ${n} atividade(s).`
                      : `Muda o nome em ${n} atividade(s) de uma vez.`}
                  </p>
                </div>
              );
            }

            if (confirming === value) {
              return (
                <div key={value} className="mx-2 my-1 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2">
                  <p className="text-[11px] leading-snug text-foreground">
                    Excluir <strong>{value}</strong>?{" "}
                    <span className="text-muted-foreground">
                      {n > 0 ? `${deleteEffect} ${n} atividade(s).` : "Nenhuma atividade usa."}
                    </span>
                  </p>
                  <div className="mt-2 flex justify-end gap-1.5">
                    <button type="button" onClick={() => setConfirming(null)} className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/60">
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onDelete(value);
                        setConfirming(null);
                      }}
                      className="rounded bg-destructive px-2 py-1 text-[11px] font-medium text-destructive-foreground hover:bg-destructive/90"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div key={value} className="group flex items-center gap-1 px-1.5">
                <button
                  type="button"
                  onClick={() => toggle(value)}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-xs transition-colors hover:bg-muted/40",
                    isSel && "font-medium text-primary",
                  )}
                >
                  <Check className={cn("h-3.5 w-3.5 shrink-0", isSel ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{value}</span>
                  <span className="ml-auto shrink-0 tabular-nums text-[10px] text-muted-foreground">{n}</span>
                </button>
                <button
                  type="button"
                  onClick={() => startEdit(value)}
                  aria-label={`Renomear ${value}`}
                  title="Renomear em todas as atividades"
                  className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted/60 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setConfirming(value);
                  }}
                  aria-label={`Excluir ${value}`}
                  title="Excluir"
                  className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
        <div className="border-t border-border/30 px-3 py-1.5 text-[10px] text-muted-foreground">
          Passe o mouse sobre um item para renomear ou excluir.
        </div>
      </PopoverContent>
    </Popover>
  );
}
