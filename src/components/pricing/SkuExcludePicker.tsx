import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, X, MinusCircle } from "lucide-react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PricingRow } from "@/lib/types";

interface SkuExcludePickerProps {
  rows: PricingRow[];
  excluded: string[];
  onChange: (next: string[]) => void;
}

export function SkuExcludePicker({ rows, excluded, onChange }: SkuExcludePickerProps) {
  const [open, setOpen] = useState(false);

  const options = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      if (!r.sku) continue;
      if (!map.has(r.sku)) map.set(r.sku, r.skuDesc ?? "");
    }
    return Array.from(map.entries())
      .map(([sku, desc]) => ({ sku, desc, label: desc ? `${sku} — ${desc}` : sku }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [rows]);

  const toggle = (sku: string) => {
    if (excluded.includes(sku)) onChange(excluded.filter((s) => s !== sku));
    else onChange([...excluded, sku]);
  };

  const clear = () => onChange([]);

  const labelFor = (sku: string) =>
    options.find((o) => o.sku === sku)?.label ?? sku;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              size="sm"
              className={cn(
                "h-9 min-w-[260px] justify-between border-destructive/40 bg-destructive/5 text-xs hover:bg-destructive/10",
                excluded.length > 0 && "text-destructive",
              )}
            >
              <span className="inline-flex items-center gap-1.5">
                <MinusCircle className="h-3.5 w-3.5" />
                {excluded.length > 0
                  ? `Excluindo ${excluded.length} SKU${excluded.length > 1 ? "s" : ""}`
                  : "Excluir SKU(s) do DRE"}
              </span>
              <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[420px] p-0" align="end">
            <Command>
              <CommandInput placeholder="Buscar SKU ou descrição…" className="h-9" />
              <CommandList>
                <CommandEmpty>Nenhum SKU encontrado.</CommandEmpty>
                <CommandGroup>
                  {options.map((o) => {
                    const checked = excluded.includes(o.sku);
                    return (
                      <CommandItem
                        key={o.sku}
                        value={o.label}
                        onSelect={() => toggle(o.sku)}
                        className="text-xs"
                      >
                        <Check
                          className={cn(
                            "mr-2 h-3.5 w-3.5",
                            checked ? "opacity-100 text-destructive" : "opacity-0",
                          )}
                        />
                        <span className="truncate">{o.label}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {excluded.length > 0 && (
          <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={clear}>
            <X className="mr-1 h-3 w-3" /> Limpar
          </Button>
        )}
      </div>
      {excluded.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {excluded.map((sku) => (
            <Badge
              key={sku}
              variant="outline"
              className="border-destructive/40 bg-destructive/10 text-[10px] font-normal text-destructive"
            >
              <span className="max-w-[260px] truncate">{labelFor(sku)}</span>
              <button
                type="button"
                onClick={() => toggle(sku)}
                className="ml-1.5 rounded hover:text-destructive/70"
                aria-label={`Remover exclusão ${sku}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
