import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePricing } from "@/store/pricing";
import { useBudget } from "@/store/budget";
import { toast } from "sonner";
import {
  DEPARA_FIELDS,
  getDeParaFieldOptions,
  searchDeParaSkus,
  upsertDeParaEntries,
  type DeParaEntry,
  type DeParaSkuSearchResult,
} from "@/lib/depara";

const isEmpty = (v?: string) => {
  const s = (v ?? "").trim();
  return !s || s.toUpperCase() === "TBD";
};

const FIELD_LABELS: Record<keyof DeParaEntry, string> = {
  categoria: "Categoria",
  subcategoria: "Subcategoria",
  marca: "Marca",
  tecnologia: "Tecnologia",
  formato: "Formato",
  mercado: "Mercado",
  faixaPeso: "Faixa/Peso",
  sabor: "Sabor",
  skuDesc: "Descrição SKU",
};

const CUSTOM_VALUE = "__custom__";

function DeParaSmartField({
  field,
  value,
  onChange,
}: {
  field: keyof DeParaEntry;
  value: string;
  onChange: (value: string) => void;
}) {
  const options = useMemo(() => getDeParaFieldOptions(field), [field]);
  const [customMode, setCustomMode] = useState(false);
  const normalizedValue = value.trim();
  const valueExists = options.some((option) => option === normalizedValue);
  const showCustom = customMode || (normalizedValue !== "" && !valueExists);
  const selectValue = showCustom ? CUSTOM_VALUE : normalizedValue && valueExists ? normalizedValue : "";

  return (
    <div>
      <Label className="text-[10px] uppercase text-muted-foreground">{FIELD_LABELS[field]}</Label>
      <Select
        value={selectValue}
        onValueChange={(next) => {
          if (next === CUSTOM_VALUE) {
            setCustomMode(true);
            if (valueExists) onChange("");
            return;
          }
          setCustomMode(false);
          onChange(next);
        }}
      >
        <SelectTrigger className="mt-1 h-8 text-xs">
          <SelectValue placeholder="Selecionar ou criar" />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM_VALUE}>Personalizado...</SelectItem>
        </SelectContent>
      </Select>
      {showCustom && (
        <Input
          className="mt-1 h-8 text-xs"
          value={value}
          placeholder="Digite um novo valor"
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

export function SkuHierarchyManagerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const applySkuDeParaEntries = usePricing((s) => s.applySkuDeParaEntries);
  const applyBudgetDeParaEntries = useBudget((s) => s.applySkuDeParaEntries);
  const [query, setQuery] = useState("");
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const [draft, setDraft] = useState<DeParaEntry | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshTick forces a re-search after saving an override
  const results = useMemo(() => searchDeParaSkus(query), [query, refreshTick]);
  const activeResult: DeParaSkuSearchResult | null =
    results.find((r) => r.sku === selectedSku) ?? results[0] ?? null;
  const activeDraft = activeResult ? draft ?? activeResult.entry : null;

  const selectSku = (item: DeParaSkuSearchResult) => {
    setSelectedSku(item.sku);
    setDraft(item.entry);
  };

  const setField = (field: keyof DeParaEntry, value: string) => {
    if (!activeResult) return;
    setDraft((cur) => ({ ...(cur ?? activeResult.entry), [field]: value }));
  };

  const handleSave = () => {
    if (!activeResult || !activeDraft) return;
    const filled = DEPARA_FIELDS.map((f) => [f, activeDraft[f].trim()] as const).filter(
      ([, v]) => !isEmpty(v),
    );
    if (filled.length === 0) {
      toast.info("Preencha ao menos um campo para salvar.");
      return;
    }
    const entry = Object.fromEntries(filled);
    upsertDeParaEntries({ [activeResult.sku]: entry });
    applySkuDeParaEntries({ [activeResult.sku]: entry });
    applyBudgetDeParaEntries({ [activeResult.sku]: entry });
    toast.success(`De/Para do SKU ${activeResult.sku} atualizado.`);
    setDraft(null);
    setRefreshTick((t) => t + 1);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>Reclassificar SKU no De/Para</DialogTitle>
        </DialogHeader>
        <p className="-mt-2 text-xs text-muted-foreground">
          Busque qualquer SKU — já classificado ou não — e ajuste os campos manualmente. A alteração
          vale para o app inteiro a partir de agora.
        </p>
        <div className="grid min-h-[520px] grid-cols-[320px_minmax(0,1fr)] gap-4">
          <aside className="rounded-xl border border-border/60 bg-secondary/20 p-3">
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="h-8 pl-8 text-xs"
                placeholder="Buscar por SKU ou descrição..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="max-h-[455px] space-y-1 overflow-auto pr-1">
              {results.length === 0 && (
                <p className="px-1 py-2 text-[11px] text-muted-foreground">
                  Nenhum SKU encontrado para "{query}".
                </p>
              )}
              {results.map((item) => {
                const pending = item.missingFields.length;
                return (
                  <button
                    key={item.sku}
                    type="button"
                    onClick={() => selectSku(item)}
                    className={[
                      "w-full rounded-lg border px-2 py-2 text-left transition-colors",
                      activeResult?.sku === item.sku
                        ? "border-primary/50 bg-primary/10"
                        : "border-border/50 bg-card/50 hover:bg-secondary/50",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold">{item.sku}</span>
                      <span className={pending === 0 ? "text-[10px] text-success" : "text-[10px] text-warning"}>
                        {pending === 0 ? "Completo" : `${pending} pendente${pending > 1 ? "s" : ""}`}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {item.entry.skuDesc || "Sem descrição"}
                      {item.hasOverride && " · corrigido no app"}
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="rounded-xl border border-border/60 bg-card/70 p-4">
            {activeResult && activeDraft ? (
              <>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">SKU</div>
                    <h3 className="text-lg font-semibold">{activeResult.sku}</h3>
                    <p className="text-xs text-muted-foreground">
                      Ajuste os campos abaixo. Ao salvar, o app reaplica o De/Para nas bases já carregadas.
                    </p>
                  </div>
                  <Button size="sm" onClick={handleSave}>
                    Salvar alterações
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {DEPARA_FIELDS.map((field) => (
                    <div key={field} className={field === "skuDesc" ? "col-span-2" : undefined}>
                      <DeParaSmartField
                        field={field}
                        value={activeDraft[field] ?? ""}
                        onChange={(value) => setField(field, value)}
                      />
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Busque um SKU para reclassificar.
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
