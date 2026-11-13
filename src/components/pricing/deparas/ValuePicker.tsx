// Escolher um valor de De/Para: busca entre os valores já usados (para não
// nascer "ESPECIALIZADO" e "Especializado") e, quando surge algo novo, cria
// uma opção manual — que passa a valer nos menus do mesmo campo para todos.
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, CornerDownLeft, PenLine, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { addCustomOption, cleanOption, foldOption, removeCustomOption, useCustomOptions } from "@/lib/customOptions";

export function ValuePicker({
  value,
  options,
  onChange,
  placeholder = "Escolher",
  className,
  ariaLabel,
  highlightEmpty = false,
  priority,
  priorityLabel,
  optionsKey,
  fieldLabel,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  /** Destaca o campo vazio (campo pendente). */
  highlightEmpty?: boolean;
  /** Valores listados primeiro, num grupo próprio (ex.: subcategorias da categoria). */
  priority?: string[];
  priorityLabel?: string;
  /** Onde ficam as opções manuais deste campo (ex.: "sku.marca"). Sem ele, a opção nova vale só aqui. */
  optionsKey?: string;
  /** Nome do campo nas mensagens (ex.: "marca"). */
  fieldLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const draftRef = useRef<HTMLInputElement>(null);
  const custom = useCustomOptions(optionsKey);

  // Opções do De/Para + manuais (sem repetir a mesma grafia).
  const { all, manual } = useMemo(() => {
    const seen = new Set(options.map(foldOption));
    const manualOnly = custom.filter((c) => !seen.has(foldOption(c)));
    const merged = [...options, ...manualOnly].sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
    return { all: merged, manual: new Set(manualOnly) };
  }, [options, custom]);

  const typed = query.trim();
  const exists = all.some((o) => foldOption(o) === foldOption(typed));
  const first = (priority ?? []).filter((p) => all.includes(p));
  const firstSet = new Set(first);
  const rest = all.filter((o) => !firstSet.has(o));

  const draftClean = cleanOption(draft);
  const duplicate = draftClean ? all.find((o) => foldOption(o) === foldOption(draftClean)) : undefined;

  useEffect(() => {
    if (creating) draftRef.current?.focus();
  }, [creating]);

  const reset = () => {
    setQuery("");
    setCreating(false);
    setDraft("");
  };

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
    reset();
  };

  const create = (text: string) => {
    const clean = cleanOption(text);
    if (!clean) return;
    const already = all.find((o) => foldOption(o) === foldOption(clean));
    if (already) return pick(already);
    pick(optionsKey ? addCustomOption(optionsKey, clean) : clean);
  };

  const renderItem = (option: string) => (
    <CommandItem key={option} value={option} onSelect={() => pick(option)} className="group text-xs">
      <Check className={cn("mr-2 h-3.5 w-3.5 shrink-0", option === value ? "opacity-100" : "opacity-0")} />
      <span className="truncate">{option}</span>
      {manual.has(option) && (
        <span className="ml-auto flex shrink-0 items-center gap-1 pl-2">
          <span className="rounded bg-primary/10 px-1 py-px text-[9px] font-semibold uppercase tracking-wider text-primary">manual</span>
          {optionsKey && option !== value && (
            <button
              type="button"
              aria-label={`Remover a opção manual ${option}`}
              title="Remover da lista (não muda SKUs já classificados)"
              onPointerDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                removeCustomOption(optionsKey, option);
              }}
              className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 group-data-[selected=true]:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      )}
    </CommandItem>
  );

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          className={cn(
            "h-8 w-full justify-between px-2.5 text-xs font-normal",
            !value && "text-muted-foreground",
            !value && highlightEmpty && "border-warning/50 bg-warning/5",
            className,
          )}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[240px] p-0" align="start">
        {creating ? (
          <div className="p-2.5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold">Nova opção{fieldLabel ? ` de ${fieldLabel}` : ""}</span>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                Voltar
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                create(draft);
              }}
              className="flex items-center gap-1.5"
            >
              <input
                ref={draftRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    e.preventDefault();
                    setCreating(false);
                  }
                }}
                placeholder="Nome da nova opção"
                aria-label={`Nome da nova opção${fieldLabel ? ` de ${fieldLabel}` : ""}`}
                maxLength={80}
                className="h-8 min-w-0 flex-1 rounded-md border border-primary/50 bg-background px-2 text-xs outline-none ring-2 ring-primary/15"
              />
              <Button type="submit" size="sm" className="h-8 gap-1 px-2.5 text-xs" disabled={!draftClean}>
                {duplicate ? "Usar" : "Adicionar"} <CornerDownLeft className="h-3 w-3" />
              </Button>
            </form>
            <p className="mt-1.5 text-[10.5px] leading-snug text-muted-foreground">
              {duplicate
                ? <>Já existe <strong className="text-foreground">{duplicate}</strong> — será usada a opção existente.</>
                : optionsKey
                  ? "Fica disponível nos menus deste campo para todos os SKUs."
                  : "Vale para esta classificação."}
            </p>
          </div>
        ) : (
          <Command>
            <CommandInput placeholder="Buscar…" value={query} onValueChange={setQuery} className="h-9 text-xs" />
            <CommandList className="max-h-64">
              <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">Nenhum valor parecido.</CommandEmpty>
              {typed && !exists && (
                <CommandGroup>
                  <CommandItem value={`__criar__${typed}`} onSelect={() => create(typed)} className="text-xs">
                    <Plus className="mr-2 h-3.5 w-3.5" /> Criar opção “{cleanOption(typed)}”
                  </CommandItem>
                </CommandGroup>
              )}
              {first.length > 0 && (
                <CommandGroup heading={priorityLabel}>{first.map(renderItem)}</CommandGroup>
              )}
              <CommandGroup heading={first.length > 0 ? "Outros valores" : undefined}>{rest.map(renderItem)}</CommandGroup>
            </CommandList>
            <button
              type="button"
              onClick={() => {
                setDraft(typed);
                setCreating(true);
              }}
              className="flex w-full items-center gap-2 border-t border-border/50 px-3 py-2 text-left text-xs font-medium text-primary transition-colors hover:bg-primary/[0.07]"
            >
              <PenLine className="h-3.5 w-3.5" /> Nova opção manual…
            </button>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}
