import { useState, useMemo, useCallback, useRef, useEffect, memo } from "react";
import type { DemandaDeck, DemandaEdit, DemandaRow, MetodoSugestao } from "@/lib/demanda";
import {
  sugestaoSazonalidade,
  sugestaoTendencia,
  sugestaoAnterior,
  calcScoreMix,
  calcRiscoBadge,
  type RiscoBadge,
} from "@/lib/demandaCalc";
import { useDemanda } from "@/store/demanda";
import type { PricingRow } from "@/lib/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TrendingUp, TrendingDown, MoreHorizontal, Trash2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Stable empty references to prevent selector churn
const EMPTY_SKU: Record<number, number> = {};

interface DemandaGridProps {
  canal: string;
  deck: DemandaDeck;
  edits: DemandaEdit;
  pricingRows: PricingRow[];
  metric: "cm" | "mb";
  reviewMode?: boolean;
  onEdit: (canal: string, cod: number, mesIdx: number, valor: number) => void;
  onApplyMetodo: (canal: string, cod: number, metodo: MetodoSugestao) => void;
  onSkuClick: (key: string) => void;
  onClearSkuEdits: (canal: string, cod: number) => void;
  onZeroSkuFuture: (canal: string, cod: number, futureMesIndices: number[]) => void;
}

const METODO_LABELS: Record<MetodoSugestao, string> = {
  sazonalidade: "Sazonalidade",
  tendencia: "Tendência",
  anterior: "Anterior",
};

function getRowSugestoes(row: DemandaRow, metodo: MetodoSugestao, fator: number, nMeses: number): number[] {
  if (metodo === "sazonalidade") return sugestaoSazonalidade(row, fator);
  if (metodo === "tendencia") return sugestaoTendencia(row, nMeses);
  return sugestaoAnterior(row);
}

// ─── Score badge ─────────────────────────────────────────────────────────────
function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-[10px] text-muted-foreground/40">—</span>;
  const cls =
    score >= 7
      ? "bg-success/15 text-success border-success/30"
      : score >= 4
        ? "bg-warning/15 text-warning border-warning/30"
        : "bg-destructive/15 text-destructive border-destructive/30";
  return (
    <span className={cn("inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold", cls)}>
      {score.toFixed(1)}
    </span>
  );
}

// ─── Risk badge ───────────────────────────────────────────────────────────────
function RiskBadge({ risco }: { risco: RiscoBadge | null }) {
  if (!risco) return null;
  const { nivel, acuraciaStr, divergenciaStr } = risco;
  const cls =
    nivel === "alto"
      ? "bg-destructive/15 text-destructive border-destructive/30"
      : nivel === "medio"
        ? "bg-warning/15 text-warning border-warning/30"
        : "bg-success/10 text-success/80 border-success/20";
  const label = nivel === "alto" ? "Alto" : nivel === "medio" ? "Méd." : "Bx.";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("mt-0.5 inline-flex cursor-default items-center rounded-full border px-1 py-0 text-[9px] font-medium", cls)}>
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">
        <p className="mb-1 font-medium">Risco de forecast</p>
        <p>Acurácia histórica: {acuraciaStr}</p>
        <p>Divergência entre métodos: {divergenciaStr}</p>
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Consistency dot ─────────────────────────────────────────────────────────
function ConsistencyDot({ valor, ind4Val }: { valor: number; ind4Val: number }) {
  if (ind4Val === 0) return null;
  const ratio = valor / ind4Val;
  if (ratio > 1.2)
    return <span className="absolute right-0.5 top-0.5 inline-flex items-center text-warning"><TrendingUp className="h-2.5 w-2.5" /></span>;
  if (ratio < 0.8)
    return <span className="absolute right-0.5 top-0.5 inline-flex items-center text-primary"><TrendingDown className="h-2.5 w-2.5" /></span>;
  return <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-success/70" />;
}

// ─── Memoized row component ───────────────────────────────────────────────────
interface RowProps {
  row: DemandaRow;
  canal: string;
  futureMeses: { label: string; i: number }[];
  sugestoes: number[];
  score: number | null;
  risco: RiscoBadge | null;
  method: MetodoSugestao;
  rowIdx: number;
  manualEdited: React.MutableRefObject<Set<string>>;
  flashedCells: Set<string>;
  variationAlerts: Record<string, { vsSugestao: number; vsInd4: number }>;
  onEdit: (cod: number, mesIdx: number, valor: number) => void;
  onFocus: (cod: number, mesIdx: number) => void;
  onSkuClick: (key: string) => void;
  onMethodChange: (cod: number, metodo: MetodoSugestao) => void;
  onClearEdits: (cod: number) => void;
  onConfirmClear: (cod: number, descricao: string) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>, cod: number, mesIdx: number) => void;
  onVariationAlert: (key: string, alert: { vsSugestao: number; vsInd4: number } | null) => void;
}

const DemandaGridRow = memo(
  function DemandaGridRow({
    row,
    canal,
    futureMeses,
    sugestoes,
    score,
    risco,
    method,
    rowIdx,
    manualEdited,
    flashedCells,
    variationAlerts,
    onEdit,
    onFocus,
    onSkuClick,
    onMethodChange,
    onClearEdits,
    onConfirmClear,
    handleKeyDown,
    onVariationAlert,
  }: RowProps) {
    // Fine-grained subscription: only re-renders when this SKU's edits change
    const skuEdits = useDemanda(
      useCallback((s) => s.edits[canal]?.[row.sku.cod] ?? EMPTY_SKU, [canal, row.sku.cod]),
    );

    const { cod, descricao } = row.sku;
    const shortDesc = descricao.length > 22 ? descricao.slice(0, 21) + "…" : descricao;
    const ind4Valores = row.indicadores[4]?.valores;

    const getCellValue = (mesIdx: number): number =>
      skuEdits[mesIdx] ?? sugestoes[mesIdx] ?? 0;

    const isManual = (mesIdx: number): boolean =>
      manualEdited.current.has(`${cod}:${mesIdx}`);

    const rowTotal = futureMeses.reduce((sum, { i }) => sum + getCellValue(i), 0);
    const stickyBg = "bg-card/95 backdrop-blur-sm";

    return (
      <tr
        className={cn(
          "border-b border-border/20 transition-colors hover:bg-muted/20",
          rowIdx % 2 === 0 ? "bg-transparent" : "bg-muted/10",
        )}
      >
        {/* Col 1: SKU name + 3-dot menu */}
        <td
          style={{ position: "sticky", left: 0, zIndex: 20 }}
          className={cn("border-r border-border/20 px-2 py-1.5", stickyBg, "bg-card/80")}
        >
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onSkuClick(`${canal}::${cod}`)}
                  className="max-w-[155px] truncate text-left text-[11px] font-medium text-foreground hover:text-primary"
                >
                  <span className="mr-1 text-[10px] text-muted-foreground">{cod}</span>
                  {shortDesc}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                {cod} — {descricao}
              </TooltipContent>
            </Tooltip>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="ml-auto flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-muted-foreground/40 transition-colors hover:bg-muted hover:text-foreground focus:outline-none"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuItem onClick={() => onSkuClick(`${canal}::${cod}`)}>
                  Ver detalhes do SKU
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-warning focus:text-warning"
                  onClick={() => onConfirmClear(cod, descricao)}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Limpar meses futuros
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-muted-foreground"
                  onClick={() => {
                    onClearEdits(cod);
                    for (const { i } of futureMeses) {
                      manualEdited.current.delete(`${cod}:${i}`);
                    }
                    toast.success(`Sugestão automática restaurada para ${descricao.slice(0, 28)}.`);
                  }}
                >
                  <RotateCcw className="mr-2 h-3.5 w-3.5" />
                  Restaurar sugestão automática
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </td>

        {/* Col 2: Score + Risk */}
        <td
          style={{ position: "sticky", left: 200, zIndex: 20 }}
          className={cn("w-16 px-1 py-1.5 text-center", stickyBg)}
        >
          <div className="flex flex-col items-center gap-0.5">
            <ScoreBadge score={score} />
            <RiskBadge risco={risco} />
          </div>
        </td>

        {/* Col 3: Method select */}
        <td
          style={{ position: "sticky", left: 264, zIndex: 20 }}
          className={cn("px-2 py-1", stickyBg)}
        >
          <Select
            value={method}
            onValueChange={(val) => onMethodChange(cod, val as MetodoSugestao)}
          >
            <SelectTrigger className="h-7 w-full border-border/30 bg-secondary/20 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["sazonalidade", "tendencia", "anterior"] as MetodoSugestao[]).map((m) => (
                <SelectItem key={m} value={m} className="text-xs">
                  {METODO_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </td>

        {/* Month cells */}
        {futureMeses.map(({ i: mesIdx }) => {
          const valor = getCellValue(mesIdx);
          const manual = isManual(mesIdx);
          const ind4Val = ind4Valores?.[mesIdx] ?? 0;
          const cellKey = `${cod}:${mesIdx}`;
          const isFlashed = flashedCells.has(cellKey);
          const alert = variationAlerts[cellKey];

          const cellCls = cn(
            "w-20 rounded-md px-2 py-1 text-right text-[11px] transition-all duration-200 focus:outline-none border-0",
            "focus:ring-1 focus:ring-primary/60 focus:bg-primary/5",
            isFlashed && "bg-primary/20 ring-1 ring-primary/40",
            !isFlashed && manual && "bg-primary/8 text-primary",
            !isFlashed && !manual && valor === 0 && "bg-destructive/8 text-destructive/60",
            !isFlashed && !manual && valor !== 0 && "bg-secondary/20",
            alert && !isFlashed && "bg-warning/10",
          );

          const input = (
            <div className="relative">
              <input
                data-grid={canal}
                data-cod={cod}
                data-mes={mesIdx}
                type="number"
                step="0.01"
                min="0"
                value={valor}
                onFocus={() => onFocus(cod, mesIdx)}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) {
                    manualEdited.current.add(cellKey);
                    onEdit(cod, mesIdx, v);
                    // Check variation alert
                    const sugestao = sugestoes[mesIdx] ?? 0;
                    if (sugestao > 0 && ind4Val > 0) {
                      const vsSugestao = Math.abs((v - sugestao) / sugestao) * 100;
                      const vsInd4 = Math.abs((v - ind4Val) / ind4Val) * 100;
                      if (vsSugestao > 25 && vsInd4 > 25) {
                        onVariationAlert(cellKey, { vsSugestao, vsInd4 });
                      } else {
                        onVariationAlert(cellKey, null);
                      }
                    }
                  }
                }}
                onKeyDown={(e) => handleKeyDown(e, cod, mesIdx)}
                className={cellCls}
              />
              {manual && !isFlashed && (
                <span className="pointer-events-none absolute right-1 top-1 h-1 w-1 rounded-full bg-primary" />
              )}
              {alert && !manual && !isFlashed && (
                <span className="pointer-events-none absolute right-1 top-1 h-1 w-1 rounded-full bg-warning" />
              )}
              <ConsistencyDot valor={valor} ind4Val={ind4Val} />
            </div>
          );

          return (
            <td key={mesIdx} className="px-1 py-1">
              {alert ? (
                <Tooltip>
                  <TooltipTrigger asChild>{input}</TooltipTrigger>
                  <TooltipContent side="top" className="max-w-52 text-xs">
                    ⚠ Variação de {alert.vsSugestao.toFixed(0)}% vs sugestão e{" "}
                    {alert.vsInd4.toFixed(0)}% vs ciclo anterior
                  </TooltipContent>
                </Tooltip>
              ) : (
                input
              )}
            </td>
          );
        })}

        {/* Row total */}
        <td className="px-3 py-1.5 text-right text-[11px] font-semibold tabular-nums text-foreground/80">
          {rowTotal.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
        </td>
      </tr>
    );
  },
  (prev, next) => {
    if (prev.method !== next.method) return false;
    if (prev.score !== next.score) return false;
    if (prev.rowIdx !== next.rowIdx) return false;
    if (prev.sugestoes !== next.sugestoes) return false;
    if (prev.risco !== next.risco) return false;
    if (prev.flashedCells !== next.flashedCells) return false;
    if (prev.variationAlerts !== next.variationAlerts) return false;
    // Handlers are stable useCallback refs
    return true;
  },
);

// ─── Main Grid ────────────────────────────────────────────────────────────────
export function DemandaGrid({
  canal,
  deck,
  edits,
  pricingRows,
  metric,
  reviewMode = false,
  onEdit,
  onApplyMetodo,
  onSkuClick,
  onClearSkuEdits,
  onZeroSkuFuture,
}: DemandaGridProps) {
  const config = useDemanda((s) => s.config);
  const { mesAtualIdx, labels } = deck.meses;

  const allRows = useMemo(
    () => deck.rows.filter((r) => r.sku.regional === canal),
    [deck.rows, canal],
  );

  const futureMeses = useMemo(
    () => labels.map((label, i) => ({ label, i })).filter(({ i }) => i > mesAtualIdx),
    [labels, mesAtualIdx],
  );

  const rows = useMemo(() => {
    if (!reviewMode) return allRows;
    return allRows.filter(
      (r) => !edits[canal]?.[r.sku.cod] || Object.keys(edits[canal][r.sku.cod]).length === 0,
    );
  }, [allRows, reviewMode, edits, canal]);

  const [methodMap, setMethodMap] = useState<Record<number, MetodoSugestao>>({});
  const manualEdited = useRef<Set<string>>(new Set());
  const [pasteOrigin, setPasteOrigin] = useState<{ cod: number; mesIdx: number } | null>(null);
  const [flashedCells, setFlashedCells] = useState<Set<string>>(new Set());
  const [variationAlerts, setVariationAlerts] = useState<Record<string, { vsSugestao: number; vsInd4: number }>>({});
  const [confirmClear, setConfirmClear] = useState<{ cod: number; descricao: string } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const getMethod = useCallback(
    (cod: number): MetodoSugestao => methodMap[cod] ?? "sazonalidade",
    [methodMap],
  );

  const sugestoes = useMemo(() => {
    const out: Record<number, number[]> = {};
    for (const row of allRows) {
      out[row.sku.cod] = getRowSugestoes(row, getMethod(row.sku.cod), config.fatorCrescimento, config.mesesTendencia);
    }
    return out;
  }, [allRows, methodMap, config]);

  const scores = useMemo(() => {
    const out: Record<number, number | null> = {};
    for (const row of allRows) {
      out[row.sku.cod] = calcScoreMix(row.sku.cod, pricingRows, metric);
    }
    return out;
  }, [allRows, pricingRows, metric]);

  const riscos = useMemo(() => {
    const out: Record<number, RiscoBadge> = {};
    for (const row of allRows) {
      out[row.sku.cod] = calcRiscoBadge(row, mesAtualIdx, config.fatorCrescimento, config.mesesTendencia);
    }
    return out;
  }, [allRows, mesAtualIdx, config]);

  // Column totals
  const colTotals = useMemo(() => {
    const out: Record<number, number> = {};
    for (const { i } of futureMeses) {
      out[i] = rows.reduce(
        (sum, r) => sum + (edits[canal]?.[r.sku.cod]?.[i] ?? sugestoes[r.sku.cod]?.[i] ?? 0),
        0,
      );
    }
    return out;
  }, [rows, edits, sugestoes, futureMeses, canal]);

  const grandTotal = useMemo(
    () => Object.values(colTotals).reduce((a, b) => a + b, 0),
    [colTotals],
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, _cod: number, _mesIdx: number) => {
      if (e.key !== "Tab" && e.key !== "Enter") return;
      e.preventDefault();
      const allCells = document.querySelectorAll<HTMLInputElement>(`input[data-grid="${canal}"]`);
      const cells = Array.from(allCells);
      const idx = cells.indexOf(e.currentTarget);
      const next = cells[idx + 1];
      if (next) next.focus();
    },
    [canal],
  );

  // Stable callbacks for row handlers
  const handleEdit = useCallback(
    (cod: number, mesIdx: number, valor: number) => onEdit(canal, cod, mesIdx, valor),
    [canal, onEdit],
  );

  const handleFocus = useCallback(
    (cod: number, mesIdx: number) => setPasteOrigin({ cod, mesIdx }),
    [],
  );

  const handleSkuClick = useCallback((key: string) => onSkuClick(key), [onSkuClick]);

  const handleMethodChange = useCallback(
    (cod: number, met: MetodoSugestao) => {
      setMethodMap((prev) => ({ ...prev, [cod]: met }));
      for (const key of Array.from(manualEdited.current)) {
        if (key.startsWith(`${cod}:`)) manualEdited.current.delete(key);
      }
      onApplyMetodo(canal, cod, met);
    },
    [canal, onApplyMetodo],
  );

  const handleClearEdits = useCallback(
    (cod: number) => onClearSkuEdits(canal, cod),
    [canal, onClearSkuEdits],
  );

  const handleConfirmClear = useCallback(
    (cod: number, descricao: string) => setConfirmClear({ cod, descricao }),
    [],
  );

  const handleVariationAlert = useCallback(
    (key: string, alert: { vsSugestao: number; vsInd4: number } | null) => {
      setVariationAlerts((prev) => {
        if (alert === null) {
          if (!(key in prev)) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        }
        if (prev[key]?.vsSugestao === alert.vsSugestao && prev[key]?.vsInd4 === alert.vsInd4) return prev;
        return { ...prev, [key]: alert };
      });
    },
    [],
  );

  // ─── Ctrl+V paste from Excel ──────────────────────────────────────────────
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;

    const handlePaste = (e: ClipboardEvent) => {
      const active = document.activeElement as HTMLInputElement | null;
      const isGridInput = active?.dataset?.grid === canal;
      if (!isGridInput && !pasteOrigin) return;

      e.preventDefault();
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (!text.trim()) return;

      let originCod = pasteOrigin?.cod;
      let originMesIdx = pasteOrigin?.mesIdx;
      if (isGridInput && active) {
        const dc = parseInt(active.dataset.cod ?? "", 10);
        const dm = parseInt(active.dataset.mes ?? "", 10);
        if (!isNaN(dc) && !isNaN(dm)) { originCod = dc; originMesIdx = dm; }
      }
      if (originCod === undefined || originMesIdx === undefined) return;

      const pasteRows = text.trim().split(/\r?\n/).map((r) => r.split("\t"));
      const originRowIdx = rows.findIndex((r) => r.sku.cod === originCod);
      const originColPos = futureMeses.findIndex((f) => f.i === originMesIdx);
      if (originRowIdx === -1 || originColPos === -1) return;

      const newFlashed = new Set<string>();

      for (let ri = 0; ri < pasteRows.length; ri++) {
        const targetRow = rows[originRowIdx + ri];
        if (!targetRow) break;
        const cod = targetRow.sku.cod;

        for (let ci = 0; ci < pasteRows[ri].length; ci++) {
          const futureMesEntry = futureMeses[originColPos + ci];
          if (!futureMesEntry) continue;
          const mesIdx = futureMesEntry.i;

          const raw = pasteRows[ri][ci].trim().replace(/\./g, "").replace(",", ".");
          const cellVal = parseFloat(raw);
          if (isNaN(cellVal) || !isFinite(cellVal) || cellVal < 0) continue;

          manualEdited.current.add(`${cod}:${mesIdx}`);
          onEdit(canal, cod, mesIdx, cellVal);
          newFlashed.add(`${cod}:${mesIdx}`);
        }
      }

      if (newFlashed.size > 0) {
        setFlashedCells(newFlashed);
        setTimeout(() => setFlashedCells(new Set()), 300);
        toast.success(
          `${newFlashed.size} célula${newFlashed.size > 1 ? "s" : ""} preenchida${newFlashed.size > 1 ? "s" : ""} do clipboard.`,
        );
      }
    };

    el.addEventListener("paste", handlePaste as EventListener);
    return () => el.removeEventListener("paste", handlePaste as EventListener);
  }, [canal, pasteOrigin, rows, futureMeses, onEdit]);

  const stickyBg = "bg-card/95 backdrop-blur-sm";

  return (
    <div ref={gridRef} className="overflow-x-auto rounded-xl">
      {/* Confirm clear dialog */}
      <AlertDialog
        open={confirmClear !== null}
        onOpenChange={(o) => { if (!o) setConfirmClear(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar meses futuros?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os meses futuros de{" "}
              <strong>{confirmClear?.descricao?.slice(0, 40)}</strong> serão zerados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmClear) return;
                const idxs = futureMeses.map((f) => f.i);
                onZeroSkuFuture(canal, confirmClear.cod, idxs);
                for (const i of idxs) manualEdited.current.delete(`${confirmClear.cod}:${i}`);
                setConfirmClear(null);
              }}
            >
              Limpar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <table className="min-w-full text-[12px]">
        <thead>
          <tr className="border-b border-border/30 bg-muted/30">
            <th
              style={{ position: "sticky", left: 0, zIndex: 30 }}
              className={cn("min-w-[200px] max-w-[200px] px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground", stickyBg)}
            >
              SKU
            </th>
            <th
              style={{ position: "sticky", left: 200, zIndex: 30 }}
              className={cn("w-16 px-2 py-2 text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground", stickyBg)}
            >
              Score
            </th>
            <th
              style={{ position: "sticky", left: 264, zIndex: 30 }}
              className={cn("min-w-[140px] px-2 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground", stickyBg)}
            >
              Método
            </th>
            {futureMeses.map(({ label, i }) => (
              <th key={i} className="min-w-[88px] px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {label}
              </th>
            ))}
            <th className="min-w-[96px] px-3 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Total
            </th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row, rowIdx) => (
            <DemandaGridRow
              key={row.sku.cod}
              row={row}
              canal={canal}
              futureMeses={futureMeses}
              sugestoes={sugestoes[row.sku.cod] ?? []}
              score={scores[row.sku.cod] ?? null}
              risco={riscos[row.sku.cod] ?? null}
              method={getMethod(row.sku.cod)}
              rowIdx={rowIdx}
              manualEdited={manualEdited}
              flashedCells={flashedCells}
              variationAlerts={variationAlerts}
              onEdit={handleEdit}
              onFocus={handleFocus}
              onSkuClick={handleSkuClick}
              onMethodChange={handleMethodChange}
              onClearEdits={handleClearEdits}
              onConfirmClear={handleConfirmClear}
              handleKeyDown={handleKeyDown}
              onVariationAlert={handleVariationAlert}
            />
          ))}
        </tbody>

        <tfoot>
          <tr className="border-t border-border/40 bg-card font-semibold">
            <td
              style={{ position: "sticky", left: 0, zIndex: 20 }}
              className={cn("px-3 py-2 text-xs font-semibold text-muted-foreground", stickyBg)}
            >
              Total Canal
            </td>
            <td style={{ position: "sticky", left: 200, zIndex: 20 }} className={stickyBg} />
            <td style={{ position: "sticky", left: 264, zIndex: 20 }} className={stickyBg} />
            {futureMeses.map(({ i }) => (
              <td key={i} className="px-2 py-2 text-right text-xs tabular-nums text-foreground/80">
                {(colTotals[i] ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
              </td>
            ))}
            <td className="px-3 py-2 text-right text-xs tabular-nums">
              {grandTotal.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
