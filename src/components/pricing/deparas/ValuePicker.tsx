// Escolher um valor de De/Para: busca entre os valores já usados (para não
// nascer "ESPECIALIZADO" e "Especializado") e, se não existir, cria.
import { useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function ValuePicker({
  value,
  options,
  onChange,
  placeholder = "Escolher",
  className,
  ariaLabel,
  highlightEmpty = false,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  /** Destaca o campo vazio (campo pendente). */
  highlightEmpty?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const typed = query.trim();
  const exists = options.some((o) => o.toLowerCase() === typed.toLowerCase());

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[220px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar ou criar…" value={query} onValueChange={setQuery} className="h-9 text-xs" />
          <CommandList className="max-h-64">
            <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">Nenhum valor parecido.</CommandEmpty>
            {typed && !exists && (
              <CommandGroup>
                <CommandItem value={`__criar__${typed}`} onSelect={() => pick(typed)} className="text-xs">
                  <Plus className="mr-2 h-3.5 w-3.5" /> Criar “{typed}”
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {options.map((option) => (
                <CommandItem key={option} value={option} onSelect={() => pick(option)} className="text-xs">
                  <Check className={cn("mr-2 h-3.5 w-3.5", option === value ? "opacity-100" : "opacity-0")} />
                  {option}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
