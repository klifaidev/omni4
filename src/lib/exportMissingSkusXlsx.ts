import * as XLSX from "xlsx";
import type { DeParaEntry } from "@/lib/depara";

export interface MissingSkuExportItem {
  sku: string;
  descricao?: string;
  entry?: Partial<DeParaEntry>;
  missingFields: (keyof DeParaEntry)[];
}

const HEADERS = [
  "SKU",
  "Descrição (referência)",
  "Categoria",
  "Subcategoria",
  "Marca",
  "Tecnologia",
  "Formato",
  "Mercado",
  "Faixa de Peso",
  "Sabor",
  "Descrição SKU (oficial)",
  "Status",
  "Campos faltantes",
];

const FIELDS: (keyof DeParaEntry)[] = [
  "categoria",
  "subcategoria",
  "marca",
  "tecnologia",
  "formato",
  "mercado",
  "faixaPeso",
  "sabor",
  "skuDesc",
];

const FIELD_LABELS: Record<keyof DeParaEntry, string> = {
  categoria: "Categoria",
  subcategoria: "Subcategoria",
  marca: "Marca",
  tecnologia: "Tecnologia",
  formato: "Formato",
  mercado: "Mercado",
  faixaPeso: "Faixa de Peso",
  sabor: "Sabor",
  skuDesc: "Descrição SKU",
};

const valOf = (entry: Partial<DeParaEntry> | undefined, key: keyof DeParaEntry) => {
  const v = entry?.[key];
  if (!v) return "";
  const s = String(v).trim();
  return s.toUpperCase() === "TBD" ? "" : s;
};

export function exportMissingSkusXlsx(missing: MissingSkuExportItem[]) {
  const rows: (string | number)[][] = [HEADERS];

  // Ordena: primeiro os com mais campos faltantes (mais urgentes)
  const sorted = [...missing].sort(
    (a, b) => b.missingFields.length - a.missingFields.length || a.sku.localeCompare(b.sku),
  );

  for (const m of sorted) {
    const entry = m.entry;
    const isFullyMissing = m.missingFields.length === FIELDS.length;
    const status = isFullyMissing
      ? "Ausente no De Para"
      : `Parcial (${m.missingFields.length}/${FIELDS.length})`;
    const missingLabels = m.missingFields.map((f) => FIELD_LABELS[f]).join(", ");

    rows.push([
      m.sku,
      m.descricao ?? valOf(entry, "skuDesc") ?? "",
      valOf(entry, "categoria"),
      valOf(entry, "subcategoria"),
      valOf(entry, "marca"),
      valOf(entry, "tecnologia"),
      valOf(entry, "formato"),
      valOf(entry, "mercado"),
      valOf(entry, "faixaPeso"),
      valOf(entry, "sabor"),
      valOf(entry, "skuDesc"),
      status,
      missingLabels,
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 12 },
    { wch: 38 },
    { wch: 16 },
    { wch: 22 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 38 },
    { wch: 22 },
    { wch: 40 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "SKUs pendentes");

  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `skus_pendentes_depara_${today}.xlsx`);
}
