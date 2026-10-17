// Interface do filtro cruzado: a barra do slide (o que está filtrando, de
// onde veio, quantos blocos mudaram, o que não se aplica) e o selo de cada
// bloco. Nada aparece na exportação (data-export-hide).
import { useEffect, useMemo, useState } from "react";
import { Filter, Pin, PinOff, X } from "lucide-react";
import type { CustomBlock } from "@/lib/customSlide";
import { describeFilter, dimensionLabel, filterGesture, type CrossFilter } from "@/lib/crossFilter";
import { cn } from "@/lib/utils";
import { useFilterStatuses, useBlockFilterStatus, useSlideFilters, type BlockFilterStatus } from "./SlideFilterContext";

const DATA_KINDS_WITHOUT_FILTER = new Set(["title", "text", "image", "shape"]);

export function isDataBlock(block: Pick<CustomBlock, "kind">): boolean {
  return !DATA_KINDS_WITHOUT_FILTER.has(block.kind);
}

function blockName(block: CustomBlock | undefined): string {
  if (!block) return "Bloco";
  const b = block as { title?: string; label?: string; kind: string };
  const raw = (b.title || b.label || "").replace(/\*+/g, "").replace(/\{[^}]*\}/g, "…").trim();
  if (raw) return raw.length > 32 ? `${raw.slice(0, 31)}…` : raw;
  const kindNames: Record<string, string> = { chart: "Gráfico", table: "Tabela", kpi: "Cartão", topSku: "Top SKU", dre: "DRE", bridge: "Bridge" };
  return kindNames[b.kind] ?? "Bloco analítico";
}

function skippedReason(status: BlockFilterStatus["skipped"][number]): string {
  return status.reason === "time"
    ? "mostra a evolução no tempo — o mês fica destacado, sem sumir com os outros"
    : `a base deste bloco não tem ${dimensionLabel(status.filter.dimension)}`;
}

interface CrossFilterBarProps {
  blocks: CustomBlock[];
  /** Apresentação: o filtro pode seguir para os próximos slides. */
  pinned?: boolean;
  onTogglePin?: () => void;
  className?: string;
  /** Mostra a dica quando não há filtro (editor). */
  showHint?: boolean;
  /** Só a dica: some quando há filtro (a barra ativa fica em outro lugar). */
  hintOnly?: boolean;
}

/** Faixa com os filtros ativos do slide. */
export function CrossFilterBar({ blocks, pinned, onTogglePin, className, showHint, hintOnly }: CrossFilterBarProps) {
  const { filters, clearFilter, clearAll } = useSlideFilters();
  const statuses = useFilterStatuses();
  const [openDetails, setOpenDetails] = useState(false);
  const byId = useMemo(() => new Map(blocks.map((b) => [b.id, b])), [blocks]);

  const dataBlocks = blocks.filter((b) => isDataBlock(b) && !b.hidden);
  const affected = dataBlocks.filter((b) => (statuses.get(b.id)?.applied.length ?? 0) > 0);
  const notApplicable = dataBlocks.flatMap((b) => (statuses.get(b.id)?.skipped ?? [])
    .filter((s) => s.reason === "dimension")
    .map((s) => ({ block: b, status: s })));
  const sourceOf = new Map(filters.map((f) => [f.sourceBlockId, f]));
  // Todo bloco de dados entra na conta — inclusive o de origem, que é filtrado pelos cliques dos outros.
  const receivers = dataBlocks;

  if (hintOnly && filters.length > 0) return null;
  if (filters.length === 0) {
    if (!(showHint || hintOnly) || dataBlocks.length < 2) return null;
    return (
      <div data-export-hide="true" className={cn("flex items-center gap-2 text-[11px] text-muted-foreground", className)}>
        <Filter className="h-3.5 w-3.5" />
        Ctrl+clique numa barra, fatia ou linha de tabela filtra os outros blocos · Ctrl+Shift+clique soma valores · Esc limpa
      </div>
    );
  }

  return (
    <div
      data-export-hide="true"
      role="region"
      aria-label="Filtros ativos do slide"
      className={cn(
        "flex flex-wrap items-center gap-1.5 rounded-xl border border-primary/30 bg-background/95 px-2 py-1.5 text-xs shadow-lg backdrop-blur",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1 pl-1 font-medium text-primary">
        <Filter className="h-3.5 w-3.5" />
        Filtrando
      </span>
      {filters.map((f) => (
        <FilterChip key={f.sourceBlockId} filter={f} sourceName={f.sourceLabel || blockName(byId.get(f.sourceBlockId))} onRemove={() => clearFilter(f.sourceBlockId)} />
      ))}
      <button
        type="button"
        onClick={() => setOpenDetails((v) => !v)}
        className="rounded-md px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-expanded={openDetails}
        title="Ver quais blocos mudaram"
      >
        {affected.length} de {receivers.length} {receivers.length === 1 ? "bloco" : "blocos"}
        {notApplicable.length > 0 && <span className="text-warning"> · {notApplicable.length} não se aplica</span>}
      </button>
      {onTogglePin && (
        <button
          type="button"
          onClick={onTogglePin}
          aria-pressed={!!pinned}
          title={pinned ? "O filtro segue para os próximos slides — clique para soltar" : "Levar este filtro para os próximos slides"}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5",
            pinned ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {pinned ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
          {pinned ? "Em todos os slides" : "Só neste slide"}
        </button>
      )}
      <button
        type="button"
        onClick={clearAll}
        className="ml-auto rounded-md px-2 py-0.5 font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        Limpar
      </button>
      {openDetails && (
        <div className="basis-full border-t border-border/60 pt-1.5 text-[11px] leading-relaxed">
          {receivers.length === 0 && <p className="text-muted-foreground">Não há outros blocos de dados neste slide.</p>}
          {receivers.map((b) => {
            const st = statuses.get(b.id);
            const skipped = st?.skipped ?? [];
            const off = b.participatesInCrossFilter === false;
            const origin = sourceOf.get(b.id);
            return (
              <div key={b.id} className="flex items-start gap-2">
                <span className={cn(
                  "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                  off ? "bg-muted-foreground/40" : st?.applied.length ? "bg-primary" : skipped.length ? "bg-warning" : "bg-muted-foreground/40",
                )} />
                <span className="font-medium">{blockName(b)}</span>
                <span className="text-muted-foreground">
                  {origin && <span className="text-primary">origem de {dimensionLabel(origin.dimension)}{st?.applied.length || off || skipped.length ? " · " : ""}</span>}
                  {off ? "não recebe filtros (desligado no bloco)"
                    : st?.applied.length ? `filtrado por ${st.applied.map((f) => dimensionLabel(f.dimension)).join(" e ")}`
                    : skipped.length ? skippedReason(skipped[0])
                    : origin ? "" : "sem mudança"}
                  {st?.applied.length && skipped.length ? ` · ${skippedReason(skipped[0])}` : ""}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterChip({ filter, sourceName, onRemove }: { filter: CrossFilter; sourceName: string; onRemove: () => void }) {
  return (
    <span
      className="inline-flex max-w-[280px] items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1 font-medium text-primary"
      style={{ background: "hsl(var(--primary) / 0.12)" }}
      title={`Clique em “${sourceName}”${filter.values.length > 1 && !filter.exclude ? `: ${filter.values.join(", ")}` : ""}`}
    >
      <span className="truncate">{describeFilter(filter)}</span>
      <button type="button" onClick={onRemove} aria-label={`Remover ${describeFilter(filter)}`} className="rounded-full p-0.5 hover:bg-primary/20">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

/** Selo no canto do bloco: "Filtrado" ou "Não se aplica", com o porquê. */
export function CrossFilterBadge({ blockId }: { blockId: string }) {
  const status = useBlockFilterStatus(blockId);
  if (!status) return null;
  const applied = status.applied.length > 0;
  const dimensionSkip = status.skipped.find((s) => s.reason === "dimension");
  if (!applied && !dimensionSkip) return null;
  const title = applied
    ? `Filtrado por ${status.applied.map(describeFilter).join(" e ")}${dimensionSkip ? ` · ${skippedReason(dimensionSkip)}` : ""}`
    : `Filtro não se aplica: ${skippedReason(dimensionSkip!)}`;
  return (
    <div
      data-export-hide="true"
      title={title}
      style={{
        position: "absolute", top: 4, left: 4, zIndex: 6,
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "2px 7px", borderRadius: 999, fontSize: 10, fontWeight: 600,
        fontFamily: "Calibri, sans-serif", pointerEvents: "auto", cursor: "help",
        background: applied ? "hsl(var(--primary))" : "hsl(var(--muted))",
        color: applied ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
        boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
        maxWidth: "70%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}
    >
      <Filter style={{ width: 10, height: 10, flexShrink: 0 }} />
      {applied
        ? (status.applied.length === 1 ? describeFilter(status.applied[0]) : `${status.applied.length} filtros`)
        : "Não se aplica"}
    </div>
  );
}

export interface FilterRow {
  key: string;
  /** Posição e altura em % do contêiner (mesma grade das células). */
  top: number;
  height: number;
  value: string;
  /** Linha "Outros (N)": filtra tudo menos os itens mostrados. */
  othersOf?: string[];
  label?: string;
}

/**
 * Camada clicável sobre as linhas de uma tabela/ranking: Ctrl+clique filtra o
 * slide pela linha, Ctrl+Shift+clique soma, Ctrl+clique de novo desfaz. Um
 * clique solto não filtra (e passa direto para o bloco). A linha escolhida
 * fica marcada e as outras esmaecem — como as barras do gráfico.
 */
export function RowFilterOverlay({ blockId, emits, dimension, sourceLabel, rows }: {
  blockId: string;
  emits: boolean;
  dimension: string | undefined;
  sourceLabel: string;
  rows: FilterRow[];
}) {
  const { filters, setFilter, toggleFilter, interactive } = useSlideFilters();
  if (!interactive || !emits || !dimension) return null;
  const own = filters.find((f) => f.sourceBlockId === blockId && f.dimension === dimension);
  const isSelected = (r: FilterRow) => !!own && (own.exclude ? !!r.othersOf : !r.othersOf && own.values.includes(r.value));
  return (
    <div data-export-hide="true" style={{ position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none" }}>
      {rows.filter((r) => r.value || r.othersOf).map((r) => {
        const selected = isSelected(r);
        return (
          <button
            key={r.key}
            type="button"
            title={`${selected ? "Ctrl+clique para desfazer" : `Ctrl+clique para filtrar o slide por ${r.label ?? r.value}`} · Ctrl+Shift+clique soma`}
            aria-pressed={selected}
            // Sem Ctrl o gesto é do bloco (selecionar, arrastar): não intercepta.
            onMouseDown={(e) => { if (filterGesture(e).ctrl) e.stopPropagation(); }}
            onClick={(e) => {
              const gesture = filterGesture(e);
              if (!gesture.ctrl) return;
              e.stopPropagation();
              if (r.othersOf) {
                setFilter({ sourceBlockId: blockId, dimension, values: r.othersOf, exclude: true, label: r.label ?? r.value, sourceLabel });
              } else if (gesture.shift) {
                toggleFilter({ sourceBlockId: blockId, dimension, values: [r.value], sourceLabel });
              } else {
                setFilter({ sourceBlockId: blockId, dimension, values: [r.value], sourceLabel });
              }
            }}
            style={{
              position: "absolute", left: 0, width: "100%", top: `${r.top}%`, height: `${r.height}%`,
              border: 0, padding: 0, margin: 0, cursor: "pointer", pointerEvents: "auto",
              background: own && !selected ? "rgba(255,255,255,0.55)" : "transparent",
              boxShadow: selected ? "inset 0 0 0 2px hsl(var(--primary))" : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

/** Com filtro ativo, o primeiro Esc limpa o filtro — antes de tirar a seleção ou sair da apresentação. */
export function CrossFilterEscape() {
  const { filters, clearAll } = useSlideFilters();
  const active = filters.length > 0;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      clearAll();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active, clearAll]);
  return null;
}
