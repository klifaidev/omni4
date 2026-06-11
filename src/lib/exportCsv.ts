import type { PVMResult } from "./analytics";

const fmt = (n: number) =>
  Number.isFinite(n) ? n.toFixed(2).replace(".", ",") : "0,00";

const esc = (v: string | number) => {
  const s = String(v);
  if (/[;"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

function triggerDownload(csv: string, filename: string) {
  // BOM for Excel BR compatibility
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exporta uma tabela genérica para CSV (separador ";", BOM, números pt-BR).
 * - rows: registros tabulares
 * - columns: ordem + label de cada coluna a exportar (key acessa rows[key])
 * - fileName: nome do arquivo (com ou sem extensão .csv)
 */
export function exportTableCsv(
  rows: Record<string, unknown>[],
  columns: { key: string; label: string }[],
  fileName: string,
): void {
  const sep = ";";
  const lines: string[] = [];
  lines.push(columns.map((c) => esc(c.label)).join(sep));
  for (const r of rows) {
    lines.push(
      columns
        .map((c) => {
          const v = r[c.key];
          if (v === null || v === undefined || v === "") return "";
          if (typeof v === "number") return Number.isFinite(v) ? fmt(v) : "";
          return esc(String(v));
        })
        .join(sep),
    );
  }
  const name = /\.csv$/i.test(fileName) ? fileName : `${fileName}.csv`;
  triggerDownload(lines.join("\n"), name);
}

export function exportPvmCsv(result: PVMResult, filenameHint = "bridge_pvm") {
  const sep = ";";
  const lines: string[] = [];

  // Section 1 — Totais da bridge
  lines.push(["Secao", "Periodo Base", "Periodo Comparacao"].map(esc).join(sep));
  lines.push(["Resumo", result.baseLabel, result.currentLabel].map(esc).join(sep));
  lines.push("");
  lines.push(["Metrica", "Valor"].map(esc).join(sep));
  lines.push(["Margem Base (A)", fmt(result.base)].join(sep));
  lines.push(["Efeito Volume", fmt(result.volume)].join(sep));
  lines.push(["Efeito Preco", fmt(result.price)].join(sep));
  lines.push(["Efeito Custo Variavel", fmt(result.cost)].join(sep));
  lines.push(["Efeito Frete", fmt(result.freight)].join(sep));
  lines.push(["Efeito Comissao", fmt(result.commission)].join(sep));
  lines.push(["Efeito Outros (Mix + Residuo)", fmt(result.others)].join(sep));
  lines.push(["Margem Atual (B)", fmt(result.current)].join(sep));
  lines.push(["Variacao Total", fmt(result.current - result.base)].join(sep));
  lines.push("");
  lines.push("");

  // Section 2 — Decomposição por SKU
  const header = [
    "SKU",
    "Status",
    "Volume A (kg)",
    "Volume B (kg)",
    "ROL A",
    "ROL B",
    "CPV A",
    "CPV B",
    "Frete A",
    "Frete B",
    "Comissao A",
    "Comissao B",
    "Margem A",
    "Margem B",
    "Delta Margem",
    "Preco Unit A",
    "Preco Unit B",
    "Custo Unit A",
    "Custo Unit B",
    "Margem Unit A",
    "Margem Unit B",
    "Efeito Volume",
    "Efeito Preco",
    "Efeito Custo",
    "Efeito Frete",
    "Efeito Comissao",
    "Efeito Outros",
  ];
  lines.push(header.map(esc).join(sep));

  const sorted = [...result.skuDetails].sort((x, y) => {
    const ax = Math.abs(
      x.volumeEffect + x.priceEffect + x.costEffect + x.freightEffect + x.commissionEffect + x.othersEffect,
    );
    const ay = Math.abs(
      y.volumeEffect + y.priceEffect + y.costEffect + y.freightEffect + y.commissionEffect + y.othersEffect,
    );
    return ay - ax;
  });

  for (const d of sorted) {
    const priceA = d.volA > 0 ? d.rolA / d.volA : 0;
    const priceB = d.volB > 0 ? d.rolB / d.volB : 0;
    const costA = d.volA > 0 ? d.cogsA / d.volA : 0;
    const costB = d.volB > 0 ? d.cogsB / d.volB : 0;
    const margUnitA = d.volA > 0 ? d.margemA / d.volA : 0;
    const margUnitB = d.volB > 0 ? d.margemB / d.volB : 0;

    lines.push(
      [
        esc(d.sku),
        esc(
          d.status === "both"
            ? "Ambos"
            : d.status === "only_base"
              ? "Apenas Base (descontinuado)"
              : "Apenas Comparacao (novo)",
        ),
        fmt(d.volA),
        fmt(d.volB),
        fmt(d.rolA),
        fmt(d.rolB),
        fmt(d.cogsA),
        fmt(d.cogsB),
        fmt(d.freteA),
        fmt(d.freteB),
        fmt(d.comissaoA),
        fmt(d.comissaoB),
        fmt(d.margemA),
        fmt(d.margemB),
        fmt(d.margemB - d.margemA),
        fmt(priceA),
        fmt(priceB),
        fmt(costA),
        fmt(costB),
        fmt(margUnitA),
        fmt(margUnitB),
        fmt(d.volumeEffect),
        fmt(d.priceEffect),
        fmt(d.costEffect),
        fmt(d.freightEffect),
        fmt(d.commissionEffect),
        fmt(d.othersEffect),
      ].join(sep),
    );
  }

  const safe = (s: string) => s.replace(/[^a-zA-Z0-9_-]+/g, "_");
  const filename = `${filenameHint}_${safe(result.baseLabel)}_vs_${safe(result.currentLabel)}.csv`;
  triggerDownload(lines.join("\n"), filename);
}
