import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, X, CheckSquare, Square } from "lucide-react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectFilterProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  variant?: "sku" | "comercial" | "inovacao";
  /** Deprecated — sempre usamos "X selecionados" no trigger. */
  showChips?: boolean;
}

export function MultiSelectFilter({
  options,
  selected,
  onChange,
  placeholder = "Todos",
  variant = "sku",
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const triggerClass =
    variant === "comercial"
      ? "h-9 w-full justify-between border-success/40 bg-success/10 text-xs hover:bg-success/15"
      : variant === "inovacao"
        ? "h-9 w-full justify-between border-accent/50 bg-accent/10 text-xs hover:bg-accent/15"
        : "h-9 w-full justify-between border-border/50 bg-secondary/40 text-xs";

  const accentText =
    variant === "comercial" ? "text-success"
    : variant === "inovacao" ? "text-accent"
    : "text-primary";

  const toggle = (v: string) => {
    if (selected.includes(v)) onChange(selected.filter((s) => s !== v));
    else onChange([...selected, v]);
  };

  const clearAll = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    onChange([]);
  };

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, search]);

  const allFilteredValues = useMemo(
    () => filteredOptions.map((o) => o.value),
    [filteredOptions],
  );
  const allFilteredSelected =
    allFilteredValues.length > 0 &&
    allFilteredValues.every((v) => selected.includes(v));

  const toggleAllFiltered = () => {
    if (allFilteredSelected) {
      // desmarca apenas os filtrados
      const set = new Set(allFilteredValues);
      onChange(selected.filter((s) => !set.has(s)));
    } else {
      // marca todos os filtrados (mantém seleção fora do filtro)
      const merged = new Set<string>([...selected, ...allFilteredValues]);
      onChange(Array.from(merged));
    }
  };

  const triggerText = (() => {
    if (selected.length === 0) return placeholder;
    if (selected.length === 1) {
      const opt = options.find((o) => o.value === selected[0]);
      return opt?.label ?? selected[0];
    }
    if (selected.length === options.length) return "Todos selecionados";
    return `${selected.length} selecionados`;
  })();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          size="sm"
          className={cn(
            triggerClass,
            selected.length === 0 && "text-muted-foreground",
            selected.length > 0 && `${accentText} font-medium`,
          )}
        >
          <span className="truncate">{triggerText}</span>
          <span className="ml-2 inline-flex items-center gap-1">
            {selected.length > 0 && (
              <span
                role="button"
                tabIndex={0}
                onClick={clearAll}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") clearAll(e as unknown as React.MouseEvent);
                }}
                className="rounded p-0.5 opacity-60 hover:bg-background/50 hover:opacity-100"
                aria-label="Limpar seleção"
              >
                <X className="h-3 w-3" />
              </span>
            )}
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar…"
            className="h-9"
            value={search}
            onValueChange={setSearch}
          />

          {/* Barra de ações estilo Excel */}
          <div className="flex items-center justify-between gap-2 border-b border-border/40 bg-secondary/30 px-2 py-1.5">
            <button
              type="button"
              onClick={toggleAllFiltered}
              disabled={filteredOptions.length === 0}
              className={cn(
                "inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium transition-colors",
                "hover:bg-background disabled:opacity-40",
                accentText,
              )}
            >
              {allFilteredSelected ? (
                <CheckSquare className="h-3.5 w-3.5" />
              ) : (
                <Square className="h-3.5 w-3.5" />
              )}
              {search.trim()
                ? allFilteredSelected ? "Desmarcar filtrados" : "Selecionar filtrados"
                : allFilteredSelected ? "Desmarcar todos" : "Selecionar todos"}
            </button>
            <button
              type="button"
              onClick={() => clearAll()}
              disabled={selected.length === 0}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-40"
            >
              <X className="h-3 w-3" />
              Limpar
            </button>
          </div>

          <CommandList className="max-h-[280px]">
            <CommandEmpty>Nada encontrado.</CommandEmpty>
            <CommandGroup>
              {filteredOptions.map((o) => {
                const checked = selected.includes(o.value);
                return (
                  <CommandItem
                    key={o.value}
                    value={o.label}
                    onSelect={() => toggle(o.value)}
                    className="text-xs"
                  >
                    <span
                      className={cn(
                        "mr-2 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
                        checked
                          ? `border-transparent ${
                              variant === "comercial" ? "bg-success" :
                              variant === "inovacao" ? "bg-accent" : "bg-primary"
                            } text-primary-foreground`
                          : "border-border/60 bg-background",
                      )}
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    <span className="truncate">{o.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>

          {/* Rodapé com contagem */}
          <CommandSeparator />
          <div className="flex items-center justify-between px-3 py-1.5 text-[10px] text-muted-foreground">
            <span>
              {selected.length} de {options.length} selecionado{options.length !== 1 ? "s" : ""}
            </span>
            {search.trim() && (
              <span>{filteredOptions.length} resultado{filteredOptions.length !== 1 ? "s" : ""}</span>
            )}
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
