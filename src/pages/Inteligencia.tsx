import { useMemo, useState } from "react";
import {
  BrainCircuit,
  Cpu,
  Database,
  FileText,
  Lightbulb,
  Loader2,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Topbar } from "@/components/pricing/Topbar";
import { GlassCard } from "@/components/pricing/GlassCard";
import { EmptyState } from "@/components/pricing/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { usePageTitle } from "@/hooks/use-page-title";
import { usePricing } from "@/store/pricing";
import { useBudget } from "@/store/budget";
import { useForecast } from "@/store/forecast";
import { useRolling } from "@/store/rolling";
import { budgetRowsAsPricingFiltered } from "@/lib/budgetAdapter";
import { forecastRowsAsPricingLatest } from "@/lib/forecastAdapter";
import { rollingRowsAsPricing } from "@/lib/rollingAdapter";
import {
  askOllamaLocal,
  buildLocalExecutiveReading,
  buildOllamaPrompt,
  buildOmniAiContext,
  type AiRankItem,
  type OllamaResult,
} from "@/lib/aiInsights";
import { formatBRL, formatNum, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

const QUICK_PROMPTS = [
  "Explique os principais riscos da selecao atual.",
  "Gere uma leitura executiva para o slide mensal.",
  "Quais SKUs merecem ataque comercial?",
  "Compare Real contra Budget e Rolling.",
];

export default function Inteligencia() {
  usePageTitle("Inteligencia");
  const realRows = usePricing((s) => s.rows);
  const filters = usePricing((s) => s.filters);
  const selectedPeriods = usePricing((s) => s.selectedPeriods);
  const budgetRows = useBudget((s) => s.rows);
  const forecastRows = useForecast((s) => s.rows);
  const rollingRows = useRolling((s) => s.rows);

  const [question, setQuestion] = useState("Faca uma leitura executiva dos dados atuais.");
  const [model, setModel] = useState("llama3.2:3b");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<OllamaResult | null>(null);

  const context = useMemo(
    () =>
      buildOmniAiContext({
        realRows,
        budgetRows: budgetRowsAsPricingFiltered(budgetRows, "budget"),
        forecastRows: forecastRowsAsPricingLatest(forecastRows),
        rollingRows: rollingRowsAsPricing(rollingRows),
        filters,
        selectedPeriods,
      }),
    [realRows, budgetRows, forecastRows, rollingRows, filters, selectedPeriods],
  );

  const fallbackReading = useMemo(() => buildLocalExecutiveReading(context, question), [context, question]);
  const hasAnyData = context.sources.length > 0;
  const real = context.sources.find((source) => source.key === "real");

  async function generate() {
    if (!hasAnyData) return;
    setBusy(true);
    const prompt = buildOllamaPrompt(context, question);
    const result = await askOllamaLocal({ model, prompt });
    if (!result.ok) {
      const local: OllamaResult = {
        ...result,
        ok: true,
        text: fallbackReading,
        mode: "local",
      };
      setAnswer(local);
      toast.info("IA local indisponivel. Usei a leitura interna do OMNI4.");
    } else {
      setAnswer(result);
    }
    setBusy(false);
  }

  async function copyAnswer() {
    const text = answer?.text || fallbackReading;
    await navigator.clipboard.writeText(text);
    toast.success("Leitura copiada.");
  }

  if (!hasAnyData) {
    return (
      <>
        <Topbar title="Inteligencia" subtitle="Analise executiva local dos dados do OMNI4" />
        <div className="px-8 py-6">
          <EmptyState
            title="Sem dados para analisar"
            message="Carregue uma base Real, Budget, Forecast ou Rolling para liberar a leitura inteligente."
            actionLabel="Ir para Upload"
            actionHref="/upload"
            icon={BrainCircuit}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Inteligencia" subtitle="IA local e leitura executiva dos dados carregados" />
      <div className="space-y-6 px-8 py-6">
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <GlassCard className="overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <Badge variant="secondary" className="gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Offline first
                </Badge>
                <div>
                  <h2 className="text-lg font-semibold">Analista OMNI4</h2>
                  <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
                    A resposta usa os indicadores ja calculados no app. A LLM local e opcional.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                <Cpu className="h-4 w-4 text-primary" />
                <Input
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  className="h-7 w-[150px] border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0"
                  aria-label="Modelo local"
                />
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <Textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                className="min-h-[92px] resize-none bg-background/60 text-sm"
                placeholder="Pergunte algo sobre margem, volume, gaps, SKUs, budget, forecast ou rolling..."
              />
              <div className="flex flex-wrap gap-2">
                {QUICK_PROMPTS.map((prompt) => (
                  <Button key={prompt} type="button" variant="outline" size="sm" onClick={() => setQuestion(prompt)}>
                    {prompt}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" className="gap-2" onClick={generate} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Gerar leitura
                </Button>
                <Button type="button" variant="outline" className="gap-2" onClick={copyAnswer}>
                  <FileText className="h-4 w-4" />
                  Copiar
                </Button>
                {answer && (
                  <Badge
                    variant={answer.mode === "llm" ? "default" : "secondary"}
                    className={cn("ml-auto", answer.mode === "local" && "text-muted-foreground")}
                  >
                    {answer.mode === "llm" ? `LLM local - ${answer.elapsedMs} ms` : "Leitura interna OMNI4"}
                  </Badge>
                )}
              </div>
            </div>
          </GlassCard>

          <GlassCard>
            <div className="mb-4 flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Contexto carregado</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {context.sources.map((source) => (
                <div key={source.key} className="rounded-lg border border-border/60 bg-background/50 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{source.label}</p>
                  <p className="mt-1 text-lg font-semibold">{source.rowCount.toLocaleString("pt-BR")}</p>
                  <p className="text-[11px] text-muted-foreground">{source.periods.length} meses</p>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>

        <GlassCard className="min-h-[260px]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Leitura executiva</h3>
            </div>
            {answer?.error && (
              <Badge variant="secondary" className="gap-1.5 text-muted-foreground">
                <TriangleAlert className="h-3.5 w-3.5" />
                Ollama indisponivel
              </Badge>
            )}
          </div>
          <div className="whitespace-pre-wrap rounded-lg border border-border/50 bg-background/60 p-4 text-sm leading-6 text-foreground">
            {answer?.text || fallbackReading}
          </div>
        </GlassCard>

        <div className="grid gap-4 xl:grid-cols-3">
          <MetricTile label="Receita Real" value={formatBRL(real?.totals.rol ?? 0)} />
          <MetricTile label="Volume Real" value={`${formatNum((real?.totals.volumeKg ?? 0) / 1000, 1)} t`} />
          <MetricTile label="CM % Real" value={formatPct(real?.totals.cmPct ?? 0)} />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <RankPanel title="Alavancas positivas" items={context.realHighlights.bestSkus} />
          <RankPanel title="Pontos de atencao" items={context.realHighlights.riskSkus} risk />
        </div>
      </div>
    </>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <GlassCard>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </GlassCard>
  );
}

function RankPanel({ title, items, risk = false }: { title: string; items: AiRankItem[]; risk?: boolean }) {
  return (
    <GlassCard>
      <h3 className="mb-4 text-sm font-semibold">{title}</h3>
      <div className="space-y-3">
        {items.length === 0 && <p className="text-sm text-muted-foreground">Sem itens relevantes na selecao atual.</p>}
        {items.map((item) => (
          <div key={item.name} className="rounded-lg border border-border/50 bg-background/50 p-3">
            <div className="flex items-start justify-between gap-3">
              <p className="line-clamp-2 text-sm font-medium">{item.name}</p>
              <Badge variant={risk ? "destructive" : "secondary"}>{formatPct(item.cmPct)}</Badge>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
              <span>{formatBRL(item.contribMarginal)}</span>
              <span>{formatNum(item.volumeKg / 1000, 1)} t</span>
              <span>{formatBRL(item.precoMedio, { digits: 2 })}/kg</span>
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
