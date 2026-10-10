import type { ReactNode } from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Info, Minus } from "lucide-react";
import { GlassCard } from "@/components/pricing/GlassCard";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatNum, formatPct } from "@/lib/format";
import { monthKeyLabel, pointDelta, relativeDelta, type RupturaPeriod } from "@/lib/ruptura/metrics";
import type { RupturaModel } from "@/lib/ruptura/types";
import { cn } from "@/lib/utils";
import type { RupturaView } from "./useRupturaView";

export function periodLabel(model: RupturaModel, period: RupturaPeriod): string {
  const a = monthKeyLabel(model.months[period.from]);
  if (period.from === period.to) return a;
  return `${a}–${monthKeyLabel(model.months[period.to])}`;
}

type Delta = { kind: "pct" | "pp"; value: number } | null;

function DeltaPill({ delta, label }: { delta: Delta; label: string }) {
  if (!delta) return null;
  const v = delta.value;
  const dir = Math.abs(v) < 1e-9 ? "flat" : v > 0 ? "up" : "down";
  const text = delta.kind === "pp"
    ? `${v > 0 ? "+" : v < 0 ? "−" : ""}${formatNum(Math.abs(v) * 100, 1)} p.p.`
    : `${v > 0 ? "+" : v < 0 ? "−" : ""}${formatNum(Math.abs(v) * 100, 1)}%`;
  // Em ruptura, subir é ruim: alta em vermelho, queda em verde.
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
          dir === "up" && "bg-destructive/15 text-destructive",
          dir === "down" && "bg-success/15 text-success",
          dir === "flat" && "bg-muted text-muted-foreground",
        )}
      >
        {dir === "up" && <ArrowUpRight className="h-3 w-3" />}
        {dir === "down" && <ArrowDownRight className="h-3 w-3" />}
        {dir === "flat" && <Minus className="h-3 w-3" />}
        {text}
      </span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </span>
  );
}

function Kpi({
  label,
  value,
  sub,
  delta,
  deltaLabel,
  help,
  unavailable,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  delta?: Delta;
  deltaLabel?: string;
  help: ReactNode;
  unavailable?: boolean;
}) {
  return (
    <GlassCard surface="raised" className="flex min-w-0 flex-col gap-2 p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="-m-1 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" aria-label={`Como calculamos: ${label}`}>
              <Info className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[300px] text-xs leading-relaxed">{help}</TooltipContent>
        </Tooltip>
      </div>
      <div className={cn("text-2xl font-light leading-tight tabular-nums", unavailable ? "text-muted-foreground" : "text-foreground")}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      {delta && deltaLabel && <DeltaPill delta={delta} label={deltaLabel} />}
    </GlassCard>
  );
}

export function RupturaKpis({ view }: { view: RupturaView }) {
  const { model, totals, previous, withRate, period } = view;
  const prev = previous?.totals;
  const vsLabel = previous ? `vs ${periodLabel(model, previous.period)}` : "";
  const d = (cur: number, before: number | undefined): Delta => {
    const v = relativeDelta(cur, before);
    return v === null ? null : { kind: "pct", value: v };
  };
  const rateDelta = pointDelta(totals.rate, prev?.rate ?? null);

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <Kpi
        label="Taxa de ruptura"
        value={totals.rate === null ? "Indisponível" : formatPct(totals.rate)}
        unavailable={totals.rate === null}
        sub={totals.rate === null ? "Aguarda respostas “Não” na base" : `${formatNum(totals.occurrences)} de ${formatNum(totals.evaluations)} avaliações`}
        delta={rateDelta === null ? null : { kind: "pp", value: rateDelta }}
        deltaLabel={vsLabel}
        help={
          <>
            Avaliações com ruptura ÷ avaliações válidas (Sim + Não), contando uma avaliação por loja × SKU × mês — a última
            pesquisa do mês. {withRate ? "" : "Esta base só traz respostas “Sim”: sem os “Não”, o denominador teria só rupturas e a taxa daria 100%. Por isso ela fica indisponível até a base completa chegar."}
          </>
        }
      />
      <Kpi
        label="Lojas com ruptura"
        value={formatNum(totals.storesAffected)}
        sub={withRate ? `de ${formatNum(totals.storesSurveyed)} lojas pesquisadas` : `${formatNum(totals.storesSurveyed)} lojas com registro`}
        delta={d(totals.storesAffected, prev?.storesAffected)}
        deltaLabel={vsLabel}
        help="Lojas distintas com ao menos um SKU em ruptura. Loja = Rede + Bandeira + PDV + Cidade + Estado (a base não tem código de loja). Uma loja com dez SKUs ausentes conta uma vez."
      />
      <Kpi
        label="Ocorrências"
        value={formatNum(totals.occurrences)}
        sub={`loja × SKU × mês · ${formatNum(totals.rawEvaluations)} pesquisas brutas`}
        delta={d(totals.occurrences, prev?.occurrences)}
        deltaLabel={vsLabel}
        help="Combinações loja × SKU × mês em ruptura. Várias pesquisas da mesma loja e SKU no mês viram uma só (vale a mais recente), então este número é menor que a contagem de linhas da planilha."
      />
      <Kpi
        label="SKUs afetados"
        value={formatNum(totals.skusAffected)}
        sub={`de ${formatNum(model.dict.sku.length)} SKUs na base`}
        delta={d(totals.skusAffected, prev?.skusAffected)}
        deltaLabel={vsLabel}
        help="SKUs distintos com ao menos uma ocorrência de ruptura no recorte."
      />
      <Kpi
        label="Redes afetadas"
        value={formatNum(totals.redesAffected)}
        sub={`de ${formatNum(totals.redesSurveyed)} redes com registro`}
        delta={d(totals.redesAffected, prev?.redesAffected)}
        deltaLabel={vsLabel}
        help="Redes distintas com ao menos uma loja em ruptura."
      />
      <Kpi
        label="Oportunidade financeira"
        value="Indisponível"
        unavailable
        sub="Requer ligar redes e SKUs ao KE30"
        help="Receita e margem potenciais dependem de saber quanto cada loja venderia do SKU. A base de pesquisa não tem código de cliente nem de produto, e o KE30 não tem PDV: sem um De/Para de Rede → clientes e SKU → material confirmado, qualquer valor seria inventado."
      />
      <span className="sr-only">Período analisado: {periodLabel(model, period)}</span>
    </div>
  );
}

function lastDayOfMonth(key: string): number {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Faixa de qualidade dos dados logo abaixo dos cartões. */
export function RupturaQualityStrip({ model }: { model: RupturaModel }) {
  const q = model.quality;
  const lastKey = model.months[model.months.length - 1];
  const lastDay = q.lastDate ? Number(q.lastDate.slice(8, 10)) : null;
  const partial = lastKey && lastDay !== null && q.lastDate?.startsWith(lastKey) && lastDay < lastDayOfMonth(lastKey);
  const warnings: string[] = [];
  if (q.nao === 0) warnings.push("Sem respostas “Não”: taxa de ruptura e lojas pesquisadas sem ruptura ficam de fora.");
  if (partial) warnings.push(`${monthKeyLabel(lastKey)} vai só até ${q.lastDate!.slice(8, 10)}/${q.lastDate!.slice(5, 7)} — mês parcial.`);
  if (q.invalidResult > 0) warnings.push(`${formatNum(q.invalidResult)} linhas com resposta vazia ou inválida foram descartadas (não contam como presença).`);
  if (q.missingKey > 0) warnings.push(`${formatNum(q.missingKey)} linhas sem SKU, PDV ou data foram descartadas.`);
  if (q.pdvHomonyms > 0) warnings.push(`${formatNum(q.pdvHomonyms)} nomes de PDV aparecem em mais de uma loja — mantidos separados por rede/cidade/UF.`);
  if (q.surveysInManyStores > 0) warnings.push(`${formatNum(q.surveysInManyStores)} IDs de pesquisa aparecem em mais de uma loja.`);
  if (q.exactDuplicates > 0) warnings.push(`${formatNum(q.exactDuplicates)} linhas repetidas (mesma pesquisa e SKU).`);
  if (q.unknownStates.length > 0) warnings.push(`Estados não reconhecidos (fora do mapa): ${q.unknownStates.join(", ")}.`);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-border/40 bg-secondary/20 px-4 py-2.5 text-[11px] text-muted-foreground">
      <span><strong className="font-medium text-foreground tabular-nums">{formatNum(q.rawRows)}</strong> linhas → <strong className="font-medium text-foreground tabular-nums">{formatNum(model.cells.month.length)}</strong> avaliações loja × SKU × mês</span>
      <span>Respostas: <span className="tabular-nums">{formatNum(q.sim)}</span> Sim · <span className="tabular-nums">{formatNum(q.nao)}</span> Não</span>
      <span><span className="tabular-nums">{formatNum(model.stores.rede.length)}</span> lojas · <span className="tabular-nums">{formatNum(q.surveys)}</span> pesquisas</span>
      {warnings.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 font-medium text-warning hover:bg-warning/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-warning">
              <AlertTriangle className="h-3 w-3" /> {warnings.length} {warnings.length === 1 ? "ponto de atenção" : "pontos de atenção"}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[380px] text-xs leading-relaxed">
            <ul className="space-y-1.5">
              {warnings.map((w) => <li key={w} className="flex gap-2"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-warning" />{w}</li>)}
            </ul>
          </PopoverContent>
        </Popover>
      )}
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="ml-auto underline-offset-2 hover:text-foreground hover:underline">Como contamos</button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[400px] space-y-2 text-xs leading-relaxed">
          <p><strong className="font-medium">Loja</strong> = Rede + Bandeira + PDV + Cidade + Estado. A base não tem código de estabelecimento; o nome do PDV sozinho nunca é usado como chave.</p>
          <p><strong className="font-medium">Avaliação</strong> = uma por mês × loja × SKU. Se a loja foi pesquisada várias vezes no mês, vale a pesquisa mais recente (empate de horário: a última linha do arquivo). Na base atual, {formatNum(q.mergedDuplicates)} linhas foram fundidas assim.</p>
          <p><strong className="font-medium">Ocorrência</strong> = avaliação cujo resultado é “Sim”. Resposta vazia nunca é tratada como produto presente.</p>
          <p><strong className="font-medium">Participação</strong> = ocorrências do item ÷ ocorrências do recorte. Lojas e SKUs afetados não somam entre grupos (a mesma loja pode estar em várias categorias).</p>
          <p className="text-muted-foreground">Arquivo: {model.fileName} · aba “{model.sheetName}” · pesquisas de {q.firstDate?.split("-").reverse().join("/")} a {q.lastDate?.split("-").reverse().join("/")}.</p>
        </PopoverContent>
      </Popover>
    </div>
  );
}
