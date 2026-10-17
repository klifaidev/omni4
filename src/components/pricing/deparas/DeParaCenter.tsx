// Central de De/Paras — onde a pessoa vê e corrige como as bases viram
// categorias, canais, UFs e regionais nas análises.
//
// - Pendências: tudo que está sem mapeamento nas bases carregadas, numa fila
//   só, da que mais pesa no ROL para a que menos pesa, com sugestão pronta;
// - um painel por De/Para: busca, filtros (pendentes, corrigidos no app),
//   edição na linha, edição em lote de SKUs e "desfazer" de cada correção;
// - os De/Paras comerciais, que antes só podiam ser baixados, agora se
//   corrigem aqui.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatNum, formatPct } from "@/lib/format";
import {
  DEPARA_FIELDS,
  getDeParaBySku,
  getDeParaFieldOptions,
  listDeParaEntries,
  type DeParaEntry,
  type DeParaOverrideEntry,
} from "@/lib/depara";
import {
  getComercialEntries,
  getComercialValueOptions,
  normComercialKey,
  type ComercialMapId,
} from "@/lib/deparaComercial";
import { DEPARA_MAPS, DEPARA_MAP_BY_ID, coverageLabel, shareLabel, type DeParaHealth, type PendingItem } from "@/lib/deparaHealth";
import { hierarchyFromSuggestion, suggestComercial, suggestSkuHierarchy } from "@/lib/deparaSuggest";
import {
  exportDeparasXlsx,
  exportInovacaoDeparaAtualXlsx,
  exportInovacaoDeparaModeloXlsx,
  exportPendenciasXlsx,
} from "@/lib/exportDeparaXlsx";
import { getInovacaoMap } from "@/lib/deparaInovacao";
import { parseInovacaoDeparaFile } from "@/lib/parseDeparaInovacao";
import { useBasesLocais } from "@/hooks/use-bases-locais";
import { useBudget } from "@/store/budget";
import { useDeParaCenter, type DeParaView } from "@/store/deparaCenter";
import { useInovacaoDepara } from "@/store/inovacaoDepara";
import { usePricing } from "@/store/pricing";
import { ValuePicker } from "./ValuePicker";
import {
  saveComercialEntry,
  saveSkuEntries,
  undoComercialEntry,
  undoSkuEntries,
  useDeParaHealth,
} from "./deparaActions";

const FIELD_LABEL: Record<keyof DeParaEntry, string> = {
  categoria: "Categoria",
  subcategoria: "Subcategoria",
  marca: "Marca",
  tecnologia: "Tecnologia",
  formato: "Formato",
  mercado: "Mercado",
  faixaPeso: "Faixa de peso",
  sabor: "Sabor",
  skuDesc: "Descrição",
};

const isBlank = (v?: string) => {
  const s = (v ?? "").trim();
  return !s || s.toUpperCase() === "TBD";
};

const TABLE_LIMIT = 250;

export function DeParaCenter() {
  const open = useDeParaCenter((s) => s.open);
  const view = useDeParaCenter((s) => s.view);
  const setView = useDeParaCenter((s) => s.setView);
  const close = useDeParaCenter((s) => s.close);
  const health = useDeParaHealth();
  const realRows = usePricing((s) => s.rows);
  const budgetRows = useBudget((s) => s.rows);

  const exportAll = () => {
    try {
      exportDeparasXlsx([realRows, budgetRows]);
      toast.success("De/Paras exportados, com as correções feitas no app.");
    } catch {
      toast.error("Falha ao exportar os De/Paras.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="flex h-[88vh] max-w-6xl flex-col gap-0 overflow-hidden p-0">
        <header className="flex flex-wrap items-center gap-3 border-b border-border/50 px-5 py-3.5 pr-12">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <ShieldCheck className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-base">Central de De/Paras</DialogTitle>
            <DialogDescription className="text-[11px]">
              Como as bases viram categorias, canais, UFs e regionais. Corrigir aqui vale na hora para o app inteiro.
            </DialogDescription>
          </div>
          {health.pending.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 text-xs"
              onClick={() => exportPendenciasXlsx(health.pending, (id) => DEPARA_MAP_BY_ID[id].title)}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> Baixar pendências
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={exportAll}>
            <Download className="h-3.5 w-3.5" /> Baixar todos (.xlsx)
          </Button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[250px_minmax(0,1fr)]">
          <Rail health={health} view={view} onSelect={setView} />
          <main className="min-h-0 overflow-y-auto">
            {view === "pendencias" && <PendingView health={health} />}
            {view === "hierarquia" && <HierarchyView health={health} />}
            {view === "inovacao" && <InovacaoView />}
            {view !== "pendencias" && view !== "hierarquia" && view !== "inovacao" && (
              <ComercialView key={view} map={view} health={health} />
            )}
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Navegação ────────────────────────────────────────────────────────────

function Rail({ health, view, onSelect }: { health: DeParaHealth; view: DeParaView; onSelect: (v: DeParaView) => void }) {
  const groups = ["Produto", "Comercial"] as const;
  return (
    <nav aria-label="De/Paras" className="hidden min-h-0 overflow-y-auto border-r border-border/50 bg-secondary/20 p-3 md:block">
      <button
        type="button"
        onClick={() => onSelect("pendencias")}
        className={cn(
          "mb-3 w-full rounded-xl border px-3 py-3 text-left transition-colors",
          view === "pendencias" ? "border-primary/40 bg-primary/10" : "border-border/50 bg-card/60 hover:bg-secondary/60",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold">Pendências</span>
          <span className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums",
            health.pending.length ? "bg-warning/15 text-warning" : "bg-emerald-500/10 text-emerald-500",
          )}>
            {health.pending.length || "0"}
          </span>
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          {!health.hasData
            ? "Carregue uma base para medir."
            : health.pending.length
              ? "Da que mais pesa no ROL para a que menos pesa."
              : "Tudo mapeado nas bases carregadas."}
        </div>
      </button>

      {groups.map((group) => (
        <div key={group} className="mb-3">
          <div className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{group}</div>
          <ul className="space-y-1">
            {DEPARA_MAPS.filter((m) => m.group === group).map((m) => {
              const h = health.maps[m.id];
              const pending = h.pending.length;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(m.id)}
                    className={cn(
                      "w-full rounded-lg px-2.5 py-2 text-left transition-colors",
                      view === m.id ? "bg-primary/10 text-foreground" : "hover:bg-secondary/60",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium">{m.title}</span>
                      {m.id !== "inovacao" && (
                        pending > 0
                          ? <span className="shrink-0 text-[10px] font-semibold tabular-nums text-warning">{pending}</span>
                          : <Check className="h-3 w-3 shrink-0 text-emerald-500" />
                      )}
                    </div>
                    {h.coverage !== null && m.id !== "inovacao" && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-border/60">
                          <div className={cn("h-full rounded-full", h.coverage < 1 ? "bg-warning" : "bg-emerald-500")} style={{ width: `${Math.max(2, h.coverage * 100)}%` }} />
                        </div>
                        <span className="text-[10px] tabular-nums text-muted-foreground">{coverageLabel(h.coverage)}</span>
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <p className="px-1 text-[10px] leading-relaxed text-muted-foreground">
        A barra mostra quanto do ROL do Real já está mapeado em cada De/Para.
      </p>
    </nav>
  );
}

function MobileViewSelect({ view, onSelect }: { view: DeParaView; onSelect: (v: DeParaView) => void }) {
  return (
    <div className="mb-4 md:hidden">
      <Select value={view} onValueChange={(v) => onSelect(v as DeParaView)}>
        <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="pendencias">Pendências</SelectItem>
          {DEPARA_MAPS.map((m) => <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function ViewHeader({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  const view = useDeParaCenter((s) => s.view);
  const setView = useDeParaCenter((s) => s.setView);
  return (
    <>
      <MobileViewSelect view={view} onSelect={setView} />
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-0.5 max-w-2xl text-[11px] text-muted-foreground">{description}</p>
        </div>
        {children}
      </div>
    </>
  );
}

// ── Pendências ───────────────────────────────────────────────────────────

function PendingView({ health }: { health: DeParaHealth }) {
  const [showAll, setShowAll] = useState(false);
  const items = showAll ? health.pending : health.pending.slice(0, 40);
  const worst = health.pending.find((p) => !p.onlyBudget);

  return (
    <div className="p-5">
      <ViewHeader
        title={health.pending.length ? `${health.pending.length} valor${health.pending.length === 1 ? "" : "es"} sem De/Para` : "Nenhuma pendência"}
        description={
          !health.hasData
            ? "As pendências aparecem quando há bases carregadas: o Omni4 confere cada SKU, canal, região e UF das bases contra os De/Paras."
            : health.pending.length
              ? `Valores das bases carregadas que ficam sem classificação nas análises.${worst ? ` O que mais pesa é ${formatPct(worst.share, 2)} do ROL.` : ""} Use a sugestão com um clique ou escolha outro valor.`
              : "Todos os SKUs, canais, regiões e UFs das bases carregadas têm De/Para."
        }
      />
      {health.pending.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border/60 py-14 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          <div className="text-sm font-medium">{health.hasData ? "Tudo mapeado" : "Sem bases carregadas"}</div>
          <div className="max-w-sm text-xs text-muted-foreground">
            {health.hasData ? "Quando uma base nova trouxer um SKU ou canal desconhecido, ele aparece aqui." : "Carregue a Base One na aba Bases."}
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => <PendingCard key={item.id} item={item} />)}
        </ul>
      )}
      {!showAll && health.pending.length > items.length && (
        <Button variant="ghost" size="sm" className="mt-3 text-xs" onClick={() => setShowAll(true)}>
          Mostrar todas as {health.pending.length} pendências
        </Button>
      )}
    </div>
  );
}

function ImpactBadge({ item }: { item: PendingItem }) {
  if (item.onlyBudget) {
    return <span className="text-[11px] text-muted-foreground">só no Budget · {formatNum(item.rows)} linhas</span>;
  }
  return (
    <span className="text-right">
      <span className={cn("block text-sm font-semibold tabular-nums", item.share >= 0.005 ? "text-destructive" : "text-foreground")}>
        {shareLabel(item.share).replace(" do ROL", "")}
      </span>
      <span className="block text-[10px] text-muted-foreground">{item.share > 0 ? "do ROL · " : ""}{formatNum(item.rows)} linhas</span>
    </span>
  );
}

function PendingCard({ item }: { item: PendingItem }) {
  const map = DEPARA_MAP_BY_ID[item.map];
  return (
    <li className="rounded-xl border border-border/50 bg-card/60 p-3.5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{map.title}</span>
            <span className="truncate font-mono text-[13px] font-semibold">{item.key}</span>
          </div>
          {item.label && <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{item.label}</div>}
          {item.missingFields && item.missingFields.length > 0 && item.missingFields.length < DEPARA_FIELDS.length && (
            <div className="mt-1 text-[11px] text-warning">
              Falta: {item.missingFields.map((f) => FIELD_LABEL[f]).join(", ")}
            </div>
          )}
          {item.missingFields?.length === DEPARA_FIELDS.length && (
            <div className="mt-1 text-[11px] text-warning">SKU novo — ainda não está no De/Para.</div>
          )}
        </div>
        <ImpactBadge item={item} />
      </div>
      <div className="mt-3">
        {item.map === "hierarquia"
          ? <SkuFix sku={item.key} description={item.label} />
          : <ComercialFix map={item.map as ComercialMapId} keyText={item.key} />}
      </div>
    </li>
  );
}

function ComercialFix({ map, keyText }: { map: ComercialMapId; keyText: string }) {
  const version = useDeParaCenter((s) => s.version);
  const suggestion = useMemo(() => suggestComercial(map, keyText), [map, keyText, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const options = useMemo(() => getComercialValueOptions(map), [map, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const title = DEPARA_MAP_BY_ID[map].to;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {suggestion && (
        <Button
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => saveComercialEntry(map, keyText, suggestion.value, DEPARA_MAP_BY_ID[map].title)}
        >
          <Wand2 className="h-3.5 w-3.5" /> Usar “{suggestion.value}”
        </Button>
      )}
      {suggestion && <span className="text-[11px] text-muted-foreground">{suggestion.reason}</span>}
      <div className={cn("w-56", suggestion && "ml-auto")}>
        <ValuePicker
          value=""
          options={options}
          placeholder={suggestion ? "Outro valor…" : `Escolher ${title}…`}
          ariaLabel={`${title} para ${keyText}`}
          onChange={(value) => saveComercialEntry(map, keyText, value, DEPARA_MAP_BY_ID[map].title)}
        />
      </div>
    </div>
  );
}

/** Correção de um SKU: sugestão por SKU parecido + editor dos campos. */
function SkuFix({ sku, description }: { sku: string; description?: string }) {
  const version = useDeParaCenter((s) => s.version);
  const [editing, setEditing] = useState(false);
  const current = useMemo(() => getDeParaBySku(sku), [sku, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const desc = current?.skuDesc || description;
  const suggestions = useMemo(() => suggestSkuHierarchy(sku, desc), [sku, desc, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const best = suggestions[0];

  const useSuggestion = () => {
    if (!best) return;
    const entry: DeParaOverrideEntry = { ...hierarchyFromSuggestion(best.entry) };
    // Só preenche o que falta: o que o SKU já tem continua.
    for (const field of DEPARA_FIELDS) if (current && !isBlank(current[field])) delete entry[field];
    if (desc && (!current || isBlank(current.skuDesc))) entry.skuDesc = desc;
    saveSkuEntries({ [sku]: entry }, `SKU ${sku} recebeu a hierarquia do ${best.sku}.`);
  };

  if (editing) {
    return (
      <SkuEditor
        sku={sku}
        initial={{ ...(current ?? {}), skuDesc: current?.skuDesc || description || "" }}
        onCancel={() => setEditing(false)}
        onSave={(entry) => {
          saveSkuEntries({ [sku]: entry });
          setEditing(false);
        }}
        suggestion={best ? { sku: best.sku, entry: best.entry } : undefined}
      />
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {best && (
        <>
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={useSuggestion}>
            <Wand2 className="h-3.5 w-3.5" /> Copiar de {best.sku}
          </Button>
          <span className="min-w-0 truncate text-[11px] text-muted-foreground">
            {best.entry.skuDesc} · {best.entry.categoria} / {best.entry.subcategoria} · {formatPct(best.score, 0)} parecido
          </span>
        </>
      )}
      <Button size="sm" variant="outline" className={cn("h-8 gap-1.5 text-xs", best && "ml-auto")} onClick={() => setEditing(true)}>
        <Pencil className="h-3.5 w-3.5" /> {best ? "Preencher à mão" : "Preencher"}
      </Button>
    </div>
  );
}

function SkuEditor({
  sku,
  initial,
  onSave,
  onCancel,
  suggestion,
}: {
  sku: string;
  initial: Partial<DeParaEntry>;
  onSave: (entry: DeParaOverrideEntry) => void;
  onCancel: () => void;
  suggestion?: { sku: string; entry: DeParaEntry };
}) {
  const version = useDeParaCenter((s) => s.version);
  const [draft, setDraft] = useState<Partial<DeParaEntry>>(initial);
  const options = useMemo(
    () => Object.fromEntries(DEPARA_FIELDS.map((f) => [f, getDeParaFieldOptions(f)])) as Record<keyof DeParaEntry, string[]>,
    [version], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const filled = DEPARA_FIELDS.filter((f) => !isBlank(draft[f])).length;

  const save = () => {
    const entry: DeParaOverrideEntry = {};
    for (const f of DEPARA_FIELDS) if (!isBlank(draft[f])) entry[f] = draft[f]!.trim();
    if (Object.keys(entry).length === 0) {
      toast.info("Preencha ao menos um campo para salvar.");
      return;
    }
    onSave(entry);
  };

  return (
    <div className="rounded-lg border border-border/50 bg-secondary/20 p-3">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          SKU <span className="font-mono font-semibold text-foreground">{sku}</span> · {filled} de {DEPARA_FIELDS.length} campos
        </span>
        {suggestion && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 text-[11px]"
            onClick={() => setDraft((d) => {
              const next = { ...d };
              for (const f of DEPARA_FIELDS) if (f !== "skuDesc" && isBlank(next[f])) next[f] = suggestion.entry[f];
              return next;
            })}
          >
            <Sparkles className="h-3 w-3" /> Completar com {suggestion.sku}
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {DEPARA_FIELDS.filter((f) => f !== "skuDesc").map((field) => (
          <label key={field} className="block">
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{FIELD_LABEL[field]}</span>
            <ValuePicker
              value={draft[field] ?? ""}
              options={options[field]}
              highlightEmpty
              ariaLabel={`${FIELD_LABEL[field]} do SKU ${sku}`}
              onChange={(value) => setDraft((d) => ({ ...d, [field]: value }))}
            />
          </label>
        ))}
        <label className="block sm:col-span-2 lg:col-span-4">
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Descrição</span>
          <Input
            className={cn("h-8 text-xs", isBlank(draft.skuDesc) && "border-warning/50 bg-warning/5")}
            value={draft.skuDesc ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, skuDesc: e.target.value }))}
          />
        </label>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onCancel}>Cancelar</Button>
        <Button size="sm" className="h-8 text-xs" onClick={save}>Salvar</Button>
      </div>
    </div>
  );
}

// ── SKU → Hierarquia ─────────────────────────────────────────────────────

type Filter = "todos" | "pendentes" | "app" | "bases";

function FilterChips({ value, onChange, counts }: { value: Filter; onChange: (f: Filter) => void; counts: Record<Filter, number> }) {
  const labels: Record<Filter, string> = { todos: "Todos", bases: "Nas bases", pendentes: "Pendentes", app: "Corrigidos no app" };
  return (
    <div role="radiogroup" aria-label="Filtrar" className="flex flex-wrap gap-1">
      {(Object.keys(labels) as Filter[]).map((f) => (
        <button
          key={f}
          type="button"
          role="radio"
          aria-checked={value === f}
          onClick={() => onChange(f)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
            value === f ? "border-primary/40 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:bg-secondary/60",
          )}
        >
          {labels[f]} <span className="tabular-nums opacity-70">{formatNum(counts[f])}</span>
        </button>
      ))}
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full max-w-xs">
      <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
      <Input className="h-8 pl-8 text-xs" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      {value && (
        <button type="button" aria-label="Limpar busca" className="absolute right-2 top-2 text-muted-foreground hover:text-foreground" onClick={() => onChange("")}>
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function OriginChip({ source }: { source: "padrao" | "app" }) {
  return source === "app"
    ? <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">no app</span>
    : <span className="text-[10px] text-muted-foreground">padrão</span>;
}

function HierarchyView({ health }: { health: DeParaHealth }) {
  const version = useDeParaCenter((s) => s.version);
  const realRows = usePricing((s) => s.rows);
  const budgetRows = useBudget((s) => s.rows);
  const [query, setQuery] = useState("");
  const pendingSkus = useMemo(() => new Map(health.maps.hierarquia.pending.map((p) => [p.key, p])), [health]);
  const [filter, setFilter] = useState<Filter>(pendingSkus.size ? "pendentes" : "todos");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);

  const inBases = useMemo(() => {
    const set = new Set<string>();
    for (const r of realRows) if (r.sku) set.add(r.sku);
    for (const r of budgetRows) if (r.sku) set.add(r.sku);
    return set;
  }, [realRows, budgetRows]);

  // SKUs das bases que nem existem no De/Para entram na lista como pendentes.
  const all = useMemo(() => {
    const listed = listDeParaEntries();
    const known = new Set(listed.map((e) => e.sku));
    const extra = [...pendingSkus.values()]
      .filter((p) => !known.has(p.key))
      .map((p) => ({
        sku: p.key,
        entry: { categoria: "", subcategoria: "", marca: "", tecnologia: "", formato: "", mercado: "", faixaPeso: "", sabor: "", skuDesc: p.label ?? "" },
        source: "padrao" as const,
        missingFields: [...DEPARA_FIELDS],
      }));
    return [...extra, ...listed];
  }, [pendingSkus, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => ({
    todos: all.length,
    bases: all.filter((e) => inBases.has(e.sku)).length,
    pendentes: all.filter((e) => pendingSkus.has(e.sku)).length,
    app: all.filter((e) => e.source === "app").length,
  }), [all, inBases, pendingSkus]);

  const filtered = useMemo(() => {
    const q = normComercialKey(query);
    return all
      .filter((e) => filter === "todos"
        || (filter === "bases" && inBases.has(e.sku))
        || (filter === "pendentes" && pendingSkus.has(e.sku))
        || (filter === "app" && e.source === "app"))
      .filter((e) => !q || normComercialKey(`${e.sku} ${e.entry.skuDesc} ${e.entry.categoria} ${e.entry.marca}`).includes(q))
      .sort((a, b) => {
        if (filter === "pendentes") return Math.abs(pendingSkus.get(b.sku)?.rol ?? 0) - Math.abs(pendingSkus.get(a.sku)?.rol ?? 0);
        return 0;
      });
  }, [all, filter, query, inBases, pendingSkus]);

  const visible = filtered.slice(0, TABLE_LIMIT);
  const allVisibleSelected = visible.length > 0 && visible.every((e) => selected.has(e.sku));

  useEffect(() => { setSelected(new Set()); }, [filter, query]);

  return (
    <div className="p-5">
      <ViewHeader title="SKU → Hierarquia" description={DEPARA_MAP_BY_ID.hierarquia.description}>
        <SearchBox value={query} onChange={setQuery} placeholder="Buscar SKU, descrição, categoria…" />
      </ViewHeader>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <FilterChips value={filter} onChange={setFilter} counts={counts} />
        {filtered.length > TABLE_LIMIT && (
          <span className="text-[11px] text-muted-foreground">Mostrando {TABLE_LIMIT} de {formatNum(filtered.length)} — refine a busca</span>
        )}
      </div>

      {selected.size > 0 && <BulkBar skus={[...selected]} onDone={() => setSelected(new Set())} />}

      <div className="overflow-x-auto rounded-xl border border-border/50">
        <table className="w-full min-w-[760px] text-xs">
          <thead className="bg-secondary/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="w-9 px-3 py-2">
                <Checkbox
                  aria-label="Selecionar todos os visíveis"
                  checked={allVisibleSelected}
                  onCheckedChange={(v) => setSelected(v === true ? new Set(visible.map((e) => e.sku)) : new Set())}
                />
              </th>
              <th className="px-2 py-2 font-medium">SKU</th>
              <th className="px-2 py-2 font-medium">Categoria</th>
              <th className="px-2 py-2 font-medium">Subcategoria</th>
              <th className="px-2 py-2 font-medium">Marca</th>
              <th className="px-2 py-2 font-medium">Faixa de peso</th>
              <th className="px-2 py-2 font-medium">Origem</th>
              <th className="w-20 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {visible.map((e) => {
              const pending = pendingSkus.get(e.sku);
              return (
                <SkuRow
                  key={e.sku}
                  sku={e.sku}
                  entry={e.entry}
                  source={e.source}
                  pending={pending}
                  selected={selected.has(e.sku)}
                  editing={editing === e.sku}
                  onToggle={(on) => setSelected((cur) => {
                    const next = new Set(cur);
                    if (on) next.add(e.sku); else next.delete(e.sku);
                    return next;
                  })}
                  onEdit={() => setEditing(editing === e.sku ? null : e.sku)}
                  onCloseEditor={() => setEditing(null)}
                />
              );
            })}
          </tbody>
        </table>
        {visible.length === 0 && (
          <div className="py-10 text-center text-xs text-muted-foreground">Nenhum SKU para este filtro.</div>
        )}
      </div>
    </div>
  );
}

function Cell({ value }: { value: string }) {
  return isBlank(value)
    ? <span className="text-warning">—</span>
    : <span className="block max-w-[150px] truncate" title={value}>{value}</span>;
}

function SkuRow({
  sku, entry, source, pending, selected, editing, onToggle, onEdit, onCloseEditor,
}: {
  sku: string;
  entry: DeParaEntry;
  source: "padrao" | "app";
  pending?: PendingItem;
  selected: boolean;
  editing: boolean;
  onToggle: (on: boolean) => void;
  onEdit: () => void;
  onCloseEditor: () => void;
}) {
  return (
    <>
      <tr className={cn("border-t border-border/40 align-middle", selected && "bg-primary/[0.04]", pending && "bg-warning/[0.03]")}>
        <td className="px-3 py-2">
          <Checkbox aria-label={`Selecionar SKU ${sku}`} checked={selected} onCheckedChange={(v) => onToggle(v === true)} />
        </td>
        <td className="px-2 py-2">
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-semibold">{sku}</span>
            {pending && !pending.onlyBudget && <span className="text-[10px] tabular-nums text-warning">{shareLabel(pending.share)}</span>}
          </div>
          <div className="max-w-[220px] truncate text-[11px] text-muted-foreground" title={entry.skuDesc}>{entry.skuDesc || "Sem descrição"}</div>
        </td>
        <td className="px-2 py-2"><Cell value={entry.categoria} /></td>
        <td className="px-2 py-2"><Cell value={entry.subcategoria} /></td>
        <td className="px-2 py-2"><Cell value={entry.marca} /></td>
        <td className="px-2 py-2"><Cell value={entry.faixaPeso} /></td>
        <td className="px-2 py-2"><OriginChip source={source} /></td>
        <td className="px-2 py-2">
          <div className="flex justify-end gap-0.5">
            {source === "app" && (
              <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Desfazer correção do SKU ${sku}`} title="Voltar ao padrão" onClick={() => undoSkuEntries([sku])}>
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Editar SKU ${sku}`} onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
        </td>
      </tr>
      {editing && (
        <tr className="border-t border-border/40 bg-secondary/10">
          <td colSpan={8} className="px-3 py-3">
            <SkuEditorWithSuggestion sku={sku} entry={entry} onDone={onCloseEditor} />
          </td>
        </tr>
      )}
    </>
  );
}

function SkuEditorWithSuggestion({ sku, entry, onDone }: { sku: string; entry: DeParaEntry; onDone: () => void }) {
  const best = useMemo(() => suggestSkuHierarchy(sku, entry.skuDesc)[0], [sku, entry.skuDesc]);
  return (
    <SkuEditor
      sku={sku}
      initial={entry}
      suggestion={best ? { sku: best.sku, entry: best.entry } : undefined}
      onCancel={onDone}
      onSave={(e) => {
        saveSkuEntries({ [sku]: e });
        onDone();
      }}
    />
  );
}

function BulkBar({ skus, onDone }: { skus: string[]; onDone: () => void }) {
  const version = useDeParaCenter((s) => s.version);
  const [field, setField] = useState<keyof DeParaEntry>("categoria");
  const options = useMemo(() => getDeParaFieldOptions(field), [field, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const apply = (value: string) => {
    saveSkuEntries(Object.fromEntries(skus.map((sku) => [sku, { [field]: value }])), `${FIELD_LABEL[field]} = ${value} em ${skus.length} SKU${skus.length === 1 ? "" : "s"}.`);
    onDone();
  };
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/[0.06] px-3 py-2">
      <span className="text-xs font-medium">{skus.length} SKU{skus.length === 1 ? "" : "s"} selecionado{skus.length === 1 ? "" : "s"}</span>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
      <Select value={field} onValueChange={(v) => setField(v as keyof DeParaEntry)}>
        <SelectTrigger className="h-8 w-[150px] text-xs" aria-label="Campo"><SelectValue /></SelectTrigger>
        <SelectContent>
          {DEPARA_FIELDS.filter((f) => f !== "skuDesc").map((f) => <SelectItem key={f} value={f}>{FIELD_LABEL[f]}</SelectItem>)}
        </SelectContent>
      </Select>
      <div className="w-56">
        <ValuePicker value="" options={options} placeholder={`Definir ${FIELD_LABEL[field].toLowerCase()}…`} onChange={apply} ariaLabel="Valor para os SKUs selecionados" />
      </div>
      <Button size="sm" variant="ghost" className="ml-auto h-8 text-xs" onClick={onDone}>Limpar seleção</Button>
    </div>
  );
}

// ── Comerciais ───────────────────────────────────────────────────────────

function ComercialView({ map, health }: { map: ComercialMapId; health: DeParaHealth }) {
  const version = useDeParaCenter((s) => s.version);
  const info = DEPARA_MAP_BY_ID[map];
  const pending = health.maps[map].pending;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>(pending.length ? "pendentes" : "todos");
  const entries = useMemo(() => getComercialEntries(map), [map, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const options = useMemo(() => getComercialValueOptions(map), [map, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const inUse = useInUseKeys(map);

  type Row = { key: string; value: string; source: "padrao" | "app" | "pendente"; item?: PendingItem; suggestion?: string };
  const rows: Row[] = useMemo(() => [
    ...pending.map((item) => ({ key: item.key, value: "", source: "pendente" as const, item, suggestion: suggestComercial(map, item.key)?.value })),
    ...entries.map((e) => ({ ...e })),
  ], [map, pending, entries]);

  const counts = {
    todos: rows.length,
    bases: rows.filter((r) => r.source === "pendente" || inUse.has(normComercialKey(r.key))).length,
    pendentes: pending.length,
    app: entries.filter((e) => e.source === "app").length,
  };
  const q = normComercialKey(query);
  const visible = rows
    .filter((r) => filter === "todos"
      || (filter === "bases" && (r.source === "pendente" || inUse.has(normComercialKey(r.key))))
      || (filter === "pendentes" && r.source === "pendente")
      || (filter === "app" && r.source === "app"))
    .filter((r) => !q || normComercialKey(`${r.key} ${r.value}`).includes(q));

  return (
    <div className="p-5">
      <ViewHeader title={info.title} description={info.description}>
        <SearchBox value={query} onChange={setQuery} placeholder={`Buscar ${info.from.toLowerCase()} ou ${info.to.toLowerCase()}…`} />
      </ViewHeader>
      <div className="mb-3"><FilterChips value={filter} onChange={setFilter} counts={counts} /></div>
      <div className="overflow-x-auto rounded-xl border border-border/50">
        <table className="w-full min-w-[620px] text-xs">
          <thead className="bg-secondary/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">{info.from}</th>
              <th className="w-64 px-2 py-2 font-medium">{info.to}</th>
              <th className="px-2 py-2 font-medium">Origem</th>
              <th className="w-12 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={`${r.source}:${r.key}`} className={cn("border-t border-border/40", r.source === "pendente" && "bg-warning/[0.04]")}>
                <td className="px-3 py-2">
                  <span className="font-mono">{r.key}</span>
                  {r.item && !r.item.onlyBudget && <span className="ml-2 text-[10px] tabular-nums text-warning">{shareLabel(r.item.share)}</span>}
                  {r.item?.onlyBudget && <span className="ml-2 text-[10px] text-muted-foreground">só no Budget</span>}
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                  {r.suggestion && (
                    <Button
                      size="sm"
                      className="h-8 shrink-0 gap-1 px-2 text-[11px]"
                      title={`Usar a sugestão ${r.suggestion}`}
                      onClick={() => saveComercialEntry(map, r.key, r.suggestion!, info.title)}
                    >
                      <Wand2 className="h-3 w-3" /> Usar
                    </Button>
                  )}
                  <ValuePicker
                    value={r.value}
                    options={options}
                    highlightEmpty
                    placeholder={r.suggestion ? `Sugestão: ${r.suggestion}` : "Escolher…"}
                    ariaLabel={`${info.to} para ${r.key}`}
                    onChange={(value) => { if (value !== r.value) saveComercialEntry(map, r.key, value, info.title); }}
                  />
                  </div>
                </td>
                <td className="px-2 py-2">
                  {r.source === "pendente"
                    ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-warning"><AlertTriangle className="h-3 w-3" /> sem De/Para</span>
                    : <OriginChip source={r.source} />}
                </td>
                <td className="px-2 py-2 text-right">
                  {r.source === "app" && (
                    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Desfazer correção de ${r.key}`} title="Voltar ao padrão" onClick={() => undoComercialEntry(map, r.key, info.title)}>
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && <div className="py-10 text-center text-xs text-muted-foreground">Nada para este filtro.</div>}
      </div>
    </div>
  );
}

function useInUseKeys(map: ComercialMapId): Set<string> {
  const realRows = usePricing((s) => s.rows);
  const budgetRows = useBudget((s) => s.rows);
  return useMemo(() => {
    const set = new Set<string>();
    for (const r of realRows) {
      const key = map === "canalToCanalAjustado" ? r.canal : map === "ufToRegional" ? r.uf : r.regiao;
      if (key) set.add(normComercialKey(key));
    }
    if (map === "canalToCanalAjustado") for (const b of budgetRows) if (b.canal) set.add(normComercialKey(b.canal));
    return set;
  }, [map, realRows, budgetRows]);
}

// ── Inovação ─────────────────────────────────────────────────────────────

function InovacaoView() {
  const file = useInovacaoDepara((s) => s.file);
  const map = useInovacaoDepara((s) => s.map);
  const setDepara = useInovacaoDepara((s) => s.setDepara);
  const clearDepara = useInovacaoDepara((s) => s.clearDepara);
  const reclassifyPricing = usePricing((s) => s.reclassifyInovacao);
  const reclassifyBudget = useBudget((s) => s.reclassifyInovacao);
  const basesLocais = useBasesLocais();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const bump = useDeParaCenter((s) => s.bump);

  const entries = useMemo(() => Object.entries(getInovacaoMap()).sort((a, b) => a[0].localeCompare(b[0])), [map]); // eslint-disable-line react-hooks/exhaustive-deps
  const inovacoes = entries.filter(([, v]) => /inova/i.test(v.classificacao)).length;
  const q = normComercialKey(query);
  const visible = entries.filter(([sku, v]) => !q || normComercialKey(`${sku} ${v.classificacao} ${v.legado ?? ""}`).includes(q)).slice(0, TABLE_LIMIT);

  const reclassify = () => {
    reclassifyPricing();
    reclassifyBudget();
    bump();
  };

  const handleImport = async (selected: File | undefined) => {
    if (!selected) return;
    try {
      setBusy(true);
      const parsed = await parseInovacaoDeparaFile(selected);
      if (parsed.file.rowCount === 0) {
        toast.error(parsed.warnings[0] ?? "Nenhum SKU válido encontrado no De/Para.");
        return;
      }
      setDepara(parsed.map, parsed.file);
      reclassify();
      if (basesLocais.isElectron) await basesLocais.salvarBase("deparaInovacao", selected);
      toast.success(`De/Para de Inovação substituído: ${parsed.file.rowCount.toLocaleString("pt-BR")} SKU(s).`);
      parsed.warnings.forEach((warning) => toast.warning(warning));
    } catch {
      toast.error("Falha ao importar o De/Para de Inovação.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const restore = async () => {
    clearDepara();
    reclassify();
    if (basesLocais.isElectron) await basesLocais.deletarBase("deparaInovacao");
    toast.success("De/Para de Inovação restaurado para o padrão do app.");
  };

  return (
    <div className="p-5">
      <ViewHeader title="SKU → Inovação" description={`${DEPARA_MAP_BY_ID.inovacao.description} Fonte ativa: ${file?.name ?? "padrão do app"}.`}>
        <SearchBox value={query} onChange={setQuery} placeholder="Buscar SKU, classificação, legado…" />
      </ViewHeader>
      <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => handleImport(e.target.files?.[0])} />
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border/50 bg-secondary/20 p-3">
        <div className="mr-auto text-xs">
          <span className="font-semibold tabular-nums">{formatNum(entries.length)}</span> SKUs classificados ·{" "}
          <span className="font-semibold tabular-nums">{formatNum(inovacoes)}</span> inovações
        </div>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={exportInovacaoDeparaAtualXlsx}>
          <Download className="h-3.5 w-3.5" /> Atual
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={exportInovacaoDeparaModeloXlsx}>
          <FileSpreadsheet className="h-3.5 w-3.5" /> Modelo
        </Button>
        <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Substituir
        </Button>
        {file && (
          <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive" onClick={restore}>Restaurar padrão</Button>
        )}
      </div>
      <div className="overflow-x-auto rounded-xl border border-border/50">
        <table className="w-full min-w-[520px] text-xs">
          <thead className="bg-secondary/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">SKU</th>
              <th className="px-2 py-2 font-medium">Classificação</th>
              <th className="px-2 py-2 font-medium">Lançamento</th>
              <th className="px-2 py-2 font-medium">Legado</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(([sku, v]) => (
              <tr key={sku} className="border-t border-border/40">
                <td className="px-3 py-2 font-mono">{sku}</td>
                <td className="px-2 py-2">
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", /inova/i.test(v.classificacao) ? "bg-primary/10 text-primary" : "text-muted-foreground")}>
                    {v.classificacao}
                  </span>
                </td>
                <td className="px-2 py-2 tabular-nums">{v.anoLancamento ?? "—"}</td>
                <td className="px-2 py-2">{v.legado ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {entries.length > TABLE_LIMIT && !q && (
        <p className="mt-2 text-[11px] text-muted-foreground">Mostrando {TABLE_LIMIT} de {formatNum(entries.length)} — busque para achar um SKU.</p>
      )}
    </div>
  );
}
