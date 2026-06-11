import { useState, useMemo } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, X, Copy, Check, FileSpreadsheet, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePricing } from "@/store/pricing";
import { toast } from "sonner";
import { exportMissingSkusXlsx } from "@/lib/exportMissingSkusXlsx";
import { formatNum, formatPct } from "@/lib/format";

const isEmpty = (v?: string) => {
  const s = (v ?? "").trim();
  return !s || s.toUpperCase() === "TBD";
};

export function MissingMappingsAlert() {
  const missing = usePricing((s) => s.missing);
  const rows = usePricing((s) => s.rows);
  const dismiss = usePricing((s) => s.dismissMissing);
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  const volStats = useMemo(() => {
    if (rows.length === 0) return null;
    let totalKg = 0;
    let missingKg = 0;
    const skuSet = new Set<string>();
    for (const r of rows) {
      totalKg += r.volumeKg || 0;
      if (isEmpty(r.categoria) || isEmpty(r.subcategoria)) {
        missingKg += r.volumeKg || 0;
        if (r.sku) skuSet.add(r.sku);
      }
    }
    if (missingKg <= 0) return null;
    return {
      totalKg,
      missingKg,
      missingTon: missingKg / 1000,
      pct: totalKg > 0 ? missingKg / totalKg : 0,
      skuCount: skuSet.size,
    };
  }, [rows]);

  const total =
    missing.skus.length +
    missing.canais.length +
    missing.regioes.length +
    missing.ufs.length;

  if (total === 0 && !volStats) return null;

  const FIELDS_TOTAL = 9;
  const skuItems = missing.skus.map((s) => {
    const desc = s.descricao ?? s.entry?.skuDesc ?? "";
    const filled = FIELDS_TOTAL - s.missingFields.length;
    const tag =
      s.missingFields.length === FIELDS_TOTAL
        ? "ausente"
        : `${filled}/${FIELDS_TOTAL} preenchido${filled === 1 ? "" : "s"}`;
    return desc ? `${s.sku} — ${desc}  ·  ${tag}` : `${s.sku}  ·  ${tag}`;
  });

  const sections: { title: string; items: string[]; key: string }[] = [
    {
      key: "skus",
      title: "SKUs pendentes no De Para IA",
      items: skuItems,
    },
    {
      key: "canais",
      title: "Canal distrib. ausente no De Para Comercial",
      items: missing.canais,
    },
    {
      key: "regioes",
      title: "Região ausente no De Para Comercial",
      items: missing.regioes,
    },
    {
      key: "ufs",
      title: "UF ausente no De Para de Regional",
      items: missing.ufs,
    },
  ].filter((s) => s.items.length > 0);

  const handleCopy = async () => {
    const text = sections
      .map((s) => `## ${s.title} (${s.items.length})\n${s.items.map((i) => `- ${i}`).join("\n")}`)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Lista copiada para a área de transferência.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  return (
    <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/20 text-warning">
          <AlertTriangle className="h-4.5 w-4.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-warning">
                {missing.skus.length > 0
                  ? `${missing.skus.length} SKU${missing.skus.length > 1 ? "s" : ""} pendente${missing.skus.length > 1 ? "s" : ""} no De Para`
                  : total > 0
                    ? `${total} valor${total > 1 ? "es" : ""} sem mapeamento no De Para`
                    : "Pendências de hierarquia no De Para"}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Inclui SKUs ausentes e SKUs presentes com algum campo em branco (categoria, subcategoria, marca, faixa de peso, etc.).
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {missing.skus.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-warning hover:bg-warning/15 hover:text-warning"
                  onClick={() => {
                    try {
                      exportMissingSkusXlsx(missing.skus);
                      toast.success(`Planilha gerada com ${missing.skus.length} SKU(s).`);
                    } catch {
                      toast.error("Falha ao gerar planilha.");
                    }
                  }}
                >
                  <FileSpreadsheet className="mr-1 h-3 w-3" />
                  Exportar SKUs (.xlsx)
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-warning hover:bg-warning/15 hover:text-warning"
                onClick={handleCopy}
              >
                {copied ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}
                Copiar
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => setOpen((o) => !o)}
                aria-label={open ? "Recolher" : "Expandir"}
              >
                {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={dismiss}
                aria-label="Dispensar"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {volStats && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-warning/15 text-warning">
                <Scale className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-warning">
                  Impacto em volume — SKUs sem Categoria/Subcategoria
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  No período total carregado, esses SKUs movimentaram volume relevante.
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Volume</div>
                  <div className="text-sm font-semibold tabular-nums">
                    {formatNum(volStats.missingTon, 1)} t
                  </div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    {formatNum(volStats.missingKg, 0)} kg
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">% do total</div>
                  <div className="text-sm font-semibold tabular-nums text-warning">
                    {formatPct(volStats.pct, 2)}
                  </div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    {volStats.skuCount} SKU(s)
                  </div>
                </div>
              </div>
            </div>
          )}

          {open && (
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              {sections.map((s) => (
                <MissingSection key={s.key} title={s.title} items={s.items} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MissingSection({ title, items }: { title: string; items: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const PREVIEW = 8;
  const visible = expanded ? items : items.slice(0, PREVIEW);
  const hidden = items.length - visible.length;

  return (
    <div className="rounded-lg border border-warning/25 bg-background/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-warning">
          {title}
        </h4>
        <span className="rounded-full bg-warning/20 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-warning">
          {items.length}
        </span>
      </div>
      <ul className="space-y-1 text-xs text-foreground/90">
        {visible.map((it) => (
          <li
            key={it}
            className="truncate rounded border border-border/40 bg-secondary/30 px-2 py-1 font-mono text-[11px]"
            title={it}
          >
            {it}
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2 text-[11px] font-medium text-warning hover:underline"
        >
          + ver mais {hidden}
        </button>
      )}
      {expanded && items.length > PREVIEW && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="mt-2 text-[11px] font-medium text-warning hover:underline"
        >
          recolher
        </button>
      )}
    </div>
  );
}
