import { AlertTriangle } from "lucide-react";
import { SendToSlideIconButton } from "@/components/pricing/SendToSlideHover";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatNum } from "@/lib/format";
import { monthKeyLabel } from "@/lib/ruptura/metrics";
import { rupturaVisualPayload } from "@/lib/sendToSlide";
import type { RupturaModel } from "@/lib/ruptura/types";
import { useRuptura } from "@/store/ruptura";
import { computeRupturaKpis, periodText } from "./visuals/data";
import { RupturaKpiCard } from "./visuals/KpiVisuals";
import { RUPTURA_VISUAL_IDS } from "./visuals/registry";
import type { RupturaView } from "./useRupturaView";

export const periodLabel = periodText;

export function RupturaKpis({ view }: { view: RupturaView }) {
  const { model, period } = view;
  const filters = useRuptura((s) => s.filters);
  const cards = computeRupturaKpis(view);

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <div key={card.id} className="group/send-slide flex min-w-0 flex-col">
          <RupturaKpiCard
            data={card}
            variant="tab"
            action={(
              <SendToSlideIconButton
                className="h-6 w-6"
                payload={rupturaVisualPayload({
                  visualization: card.label,
                  visualId: RUPTURA_VISUAL_IDS.kpi,
                  params: { metric: card.id },
                  filters,
                  period,
                })}
              />
            )}
          />
        </div>
      ))}
      <RupturaKpiCard
        variant="tab"
        data={{
          label: "Oportunidade financeira",
          value: "Indisponível",
          unavailable: true,
          sub: "Requer ligar redes e SKUs ao KE30",
          delta: null,
          deltaLabel: "",
          help: "Receita e margem potenciais dependem de saber quanto cada loja venderia do SKU. A base de pesquisa não tem código de cliente nem de produto, e o KE30 não tem PDV: sem um De/Para de Rede → clientes e SKU → material confirmado, qualquer valor seria inventado.",
        }}
      />
      <span className="sr-only">Período analisado: {periodText(model, period)}</span>
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
  if (q.nao === 0) warnings.push("Sem respostas “Não”: GINI de ruptura e lojas pesquisadas sem ruptura ficam de fora.");
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
