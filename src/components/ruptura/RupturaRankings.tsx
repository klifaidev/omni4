import { useMemo, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { formatNum, formatPct } from "@/lib/format";
import { groupBy, groupByKey, type CellPredicate, type RupturaGroupRow } from "@/lib/ruptura/metrics";
import type { RupturaDim, RupturaModel } from "@/lib/ruptura/types";
import { cn } from "@/lib/utils";
import { useRuptura } from "@/store/ruptura";
import { metricColumns, RupturaTable, type RupturaColumn } from "./RupturaTable";
import type { RupturaView } from "./useRupturaView";

function useToggle(dim: RupturaDim) {
  const filters = useRuptura((s) => s.filters);
  const toggle = useRuptura((s) => s.toggleFilterValue);
  return {
    isSelected: (label: string) => (filters[dim] ?? []).includes(label),
    toggle: (label: string) => toggle(dim, label),
  };
}

const labelColumn = <T extends RupturaGroupRow>(label: string, render?: (r: T) => ReactNode): RupturaColumn<T> => ({
  key: "label",
  label,
  render: render ?? ((r) => <span className="block max-w-[280px] truncate" title={r.label}>{r.label}</span>),
  sortValue: (r) => r.label,
  exportValue: (r) => r.label,
});

const countColumn = <T extends RupturaGroupRow>(key: keyof RupturaGroupRow & string, label: string, title?: string): RupturaColumn<T> => ({
  key,
  label,
  align: "right",
  title,
  render: (r) => formatNum(r[key] as number),
  sortValue: (r) => r[key] as number,
  exportValue: (r) => r[key] as number,
});

// ── Categoria ────────────────────────────────────────────────────────────

export function CategoryRanking({ view }: { view: RupturaView }) {
  const { model, predicate, withRate } = view;
  const rows = useMemo(() => groupBy(model, predicate, "categoria", withRate), [model, predicate, withRate]);
  const sel = useToggle("categoria");
  const columns = useMemo<RupturaColumn<RupturaGroupRow>[]>(
    () => [labelColumn("Categoria"), countColumn("skusAffected", "SKUs af."), ...metricColumns({ withRate })],
    [withRate],
  );
  return (
    <RupturaTable
      title="Ruptura por categoria"
      rows={rows}
      columns={columns}
      bars
      exportName="ruptura_categorias"
      onRowClick={(r) => sel.toggle(r.label)}
      isSelected={(r) => sel.isSelected(r.label)}
    />
  );
}

type ChildProps = { model: RupturaModel; predicate: CellPredicate; withRate: boolean; total: number };

// ── Canal (com aprofundamento por rede) ─────────────────────────────────

export function ChannelRanking({ view }: { view: RupturaView }) {
  const { model, predicate, withRate } = view;
  const rows = useMemo(() => groupBy(model, predicate, "canal", withRate), [model, predicate, withRate]);
  const sel = useToggle("canal");
  const columns = useMemo<RupturaColumn<RupturaGroupRow>[]>(
    () => [
      labelColumn("Canal"),
      countColumn("redesSurveyed", "Redes", "Redes com registro de pesquisa no canal"),
      ...metricColumns({ withRate }),
    ],
    [withRate],
  );
  return (
    <RupturaTable
      title="Ruptura por canal"
      subtitle="Detalhe cada canal para ver as redes"
      rows={rows}
      columns={columns}
      exportName="ruptura_canais"
      onRowClick={(r) => sel.toggle(r.label)}
      isSelected={(r) => sel.isSelected(r.label)}
      renderExpanded={(r) => <ChannelRedes model={model} predicate={predicate} withRate={withRate} total={view.totals.occurrences} canal={r.key} />}
    />
  );
}

function ChannelRedes({ model, predicate, withRate, total, canal }: ChildProps & { canal: number }) {
  const sel = useToggle("rede");
  const rows = useMemo(() => {
    const canalOf = model.stores.canal;
    const redeOf = model.stores.rede;
    return groupByKey(
      model,
      (i) => predicate(i) && canalOf[model.cells.store[i]] === canal,
      (i) => redeOf[model.cells.store[i]],
      (k) => model.dict.rede[k],
      withRate,
    );
  }, [model, predicate, withRate, canal]);
  return (
    <ChildList
      total={total}
      rows={rows.slice(0, 12)}
      more={rows.length - 12}
      onClick={(r) => sel.toggle(r.label)}
      isSelected={(r) => sel.isSelected(r.label)}
      storesLabel="lojas af."
    />
  );
}

// ── Rede → Bandeira → PDV ───────────────────────────────────────────────

export function HierarchyRanking({ view }: { view: RupturaView }) {
  const { model, predicate, withRate } = view;
  const rows = useMemo(() => groupBy(model, predicate, "rede", withRate), [model, predicate, withRate]);
  const sel = useToggle("rede");
  const columns = useMemo<RupturaColumn<RupturaGroupRow>[]>(
    () => [
      labelColumn("Rede"),
      countColumn("storesSurveyed", "PDVs c/ registro", "PDVs com alguma avaliação no recorte"),
      countColumn("skusAffected", "SKUs af."),
      ...metricColumns({ withRate, storesLabel: "PDVs afetados" }),
    ],
    [withRate],
  );
  return (
    <RupturaTable
      title="Rede → Bandeira → PDV"
      subtitle="Clique numa rede para filtrar; use a seta para abrir bandeiras e PDVs"
      rows={rows}
      columns={columns}
      searchable
      pageSize={12}
      exportName="ruptura_redes"
      onRowClick={(r) => sel.toggle(r.label)}
      isSelected={(r) => sel.isSelected(r.label)}
      renderExpanded={(r) => <RedeChildren model={model} predicate={predicate} withRate={withRate} total={view.totals.occurrences} rede={r.key} />}
    />
  );
}

function RedeChildren({ model, predicate, withRate, total, rede }: ChildProps & { rede: number }) {
  const sel = useToggle("bandeira");
  const bandeiras = useMemo(() => {
    const { stores, cells } = model;
    return groupByKey(
      model,
      (i) => predicate(i) && stores.rede[cells.store[i]] === rede,
      (i) => stores.bandeira[cells.store[i]],
      (k) => model.dict.bandeira[k],
      withRate,
    );
  }, [model, predicate, withRate, rede]);
  // Rede com uma bandeira de mesmo nome: pula o nível repetido.
  if (bandeiras.length === 1 && bandeiras[0].label === model.dict.rede[rede]) {
    return <BandeiraStores model={model} predicate={predicate} withRate={withRate} total={total} bandeira={bandeiras[0].key} />;
  }
  return (
    <ChildList
      total={total}
      rows={bandeiras}
      onClick={(r) => sel.toggle(r.label)}
      isSelected={(r) => sel.isSelected(r.label)}
      storesLabel="PDVs af."
      renderExpanded={(r) => <BandeiraStores model={model} predicate={predicate} withRate={withRate} total={total} bandeira={r.key} />}
    />
  );
}

function BandeiraStores({ model, predicate, withRate, total, bandeira }: ChildProps & { bandeira: number }) {
  const sel = useToggle("pdv");
  const rows = useMemo(() => {
    const { stores, cells, dict } = model;
    return groupByKey(
      model,
      (i) => predicate(i) && stores.bandeira[cells.store[i]] === bandeira,
      (i) => cells.store[i],
      (s) => dict.pdv[stores.pdv[s]],
      withRate,
    );
  }, [model, predicate, withRate, bandeira]);
  const place = (store: number) => `${model.dict.cidade[model.stores.cidade[store]]}/${model.stores.uf[store] ?? "?"}`;
  return (
    <ChildList
      total={total}
      rows={rows.slice(0, 30)}
      more={rows.length - 30}
      onClick={(r) => sel.toggle(r.label)}
      isSelected={(r) => sel.isSelected(r.label)}
      storesLabel=""
      sub={(r) => place(r.key)}
      store
    />
  );
}

/** Lista compacta de filhos dentro de uma linha aberta. */
function ChildList({
  rows,
  total,
  more = 0,
  onClick,
  isSelected,
  storesLabel,
  renderExpanded,
  sub,
  store,
}: {
  rows: RupturaGroupRow[];
  /** Ocorrências do recorte inteiro: a participação é sobre o total, não sobre o pai. */
  total: number;
  more?: number;
  onClick: (r: RupturaGroupRow) => void;
  isSelected: (r: RupturaGroupRow) => boolean;
  storesLabel: string;
  renderExpanded?: (r: RupturaGroupRow) => ReactNode;
  sub?: (r: RupturaGroupRow) => string;
  /** Linha de loja: mostra SKUs afetados em vez de lojas. */
  store?: boolean;
}) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const showRate = rows.some((r) => r.rate !== null);
  return (
    <div className="space-y-0.5 pl-4">
      {rows.map((r) => (
        <div key={r.key}>
          <div
            role="button"
            tabIndex={0}
            onClick={() => onClick(r)}
            onKeyDown={(e) => { if (e.key === "Enter") onClick(r); }}
            className={cn("grid cursor-pointer items-center gap-x-4 rounded-md px-2 py-1 text-[11px] tabular-nums hover:bg-secondary/40", showRate ? "grid-cols-[minmax(0,1fr)_repeat(4,auto)]" : "grid-cols-[minmax(0,1fr)_repeat(3,auto)]", isSelected(r) && "bg-primary/10")}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              {renderExpanded && (
                <button
                  type="button"
                  aria-expanded={open.has(r.key)}
                  aria-label={open.has(r.key) ? `Recolher ${r.label}` : `Detalhar ${r.label}`}
                  className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen((prev) => {
                      const next = new Set(prev);
                      if (next.has(r.key)) next.delete(r.key);
                      else next.add(r.key);
                      return next;
                    });
                  }}
                >
                  <ChevronRight className={cn("h-3 w-3 transition-transform", open.has(r.key) && "rotate-90")} />
                </button>
              )}
              <span className="truncate" title={r.label}>{r.label}</span>
              {sub && <span className="shrink-0 text-muted-foreground">{sub(r)}</span>}
            </span>
            <span className="text-right text-muted-foreground">{store ? `${formatNum(r.skusAffected)} SKUs af.` : `${formatNum(r.storesAffected)}/${formatNum(r.storesSurveyed)} ${storesLabel}`}</span>
            <span className="w-20 text-right">{formatNum(r.occurrences)} oc.</span>
            {showRate && <span className="w-14 text-right">{r.rate === null ? "—" : formatPct(r.rate)}</span>}
            <span className="w-12 text-right text-muted-foreground" title="Participação no total do recorte">{formatPct(total > 0 ? r.occurrences / total : 0)}</span>
          </div>
          {renderExpanded && open.has(r.key) && <div className="py-1">{renderExpanded(r)}</div>}
        </div>
      ))}
      {more > 0 && <p className="px-2 py-1 text-[11px] text-muted-foreground">+ {formatNum(more)} — filtre para ver todos</p>}
    </div>
  );
}

// ── SKU ──────────────────────────────────────────────────────────────────

type SkuRow = RupturaGroupRow & { marca: string; categoria: string; linha: string };

export function SkuRanking({ view }: { view: RupturaView }) {
  const { model, predicate, withRate } = view;
  const sel = useToggle("sku");
  const rows = useMemo<SkuRow[]>(
    () =>
      groupBy(model, predicate, "sku", withRate).map((r) => ({
        ...r,
        marca: model.dict.marca[model.skus.marca[r.key]],
        categoria: model.dict.categoria[model.skus.categoria[r.key]],
        linha: model.dict.linha[model.skus.linha[r.key]],
      })),
    [model, predicate, withRate],
  );
  const columns = useMemo<RupturaColumn<SkuRow>[]>(
    () => [
      labelColumn<SkuRow>("SKU", (r) => (
        <span className="flex min-w-0 flex-col">
          <span className="max-w-[300px] truncate" title={r.label}>{r.label}</span>
          <span className="max-w-[300px] truncate text-[10px] text-muted-foreground" title={`${r.marca} · ${r.categoria}`}>{r.marca} · {r.categoria}</span>
        </span>
      )),
      { key: "marca", label: "Marca", exportOnly: true, render: (r) => r.marca, exportValue: (r) => r.marca },
      { key: "categoria", label: "Categoria", exportOnly: true, render: (r) => r.categoria, exportValue: (r) => r.categoria },
      { key: "linha", label: "Linha", render: (r) => <span className="block max-w-[200px] truncate" title={r.linha}>{r.linha}</span>, sortValue: (r) => r.linha, exportValue: (r) => r.linha },
      countColumn<SkuRow>("redesAffected", "Redes af."),
      ...metricColumns<SkuRow>({ withRate }),
    ],
    [withRate],
  );
  return (
    <RupturaTable
      title="Ruptura por SKU"
      rows={rows}
      columns={columns}
      searchable
      pageSize={15}
      exportName="ruptura_skus"
      onRowClick={(r) => sel.toggle(r.label)}
      isSelected={(r) => sel.isSelected(r.label)}
    />
  );
}
