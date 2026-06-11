import * as XLSX from "xlsx";
import { toast } from "sonner";
import type { DemandaDeck, DemandaEdit } from "./demanda";

function toStr(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return isNaN(v) ? 0 : v;
  const n = parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? 0 : n;
}

export async function exportDemandaXlsx(
  originalFile: File,
  deck: DemandaDeck,
  edits: DemandaEdit,
): Promise<void> {
  const buffer = await originalFile.arrayBuffer();
  const wb = XLSX.read(buffer, {
    type: "array",
    cellStyles: true,
    bookVBA: true,
    raw: true,
  });

  const SHEET = "Base Geral Com Fórmula";
  if (!wb.SheetNames.includes(SHEET)) {
    throw new Error(`Aba "${SHEET}" não encontrada no arquivo.`);
  }

  const ws = wb.Sheets[SHEET];
  if (!ws["!ref"]) throw new Error("Planilha vazia.");

  const range = XLSX.utils.decode_range(ws["!ref"]);

  // Iterate all data rows (Excel row 30 = r index 29)
  for (let r = 29; r <= range.e.r; r++) {
    const getCell = (c: number) => ws[XLSX.utils.encode_cell({ r, c })];

    // Col E (idx 4) = Regional/Canal
    const regionalCell = getCell(4);
    const canal = toStr(regionalCell?.v);

    // Col I (idx 8) = Cód
    const codCell = getCell(8);
    const codRaw = codCell?.v;
    const cod = typeof codRaw === "number" ? codRaw : parseInt(toStr(codRaw), 10);

    // Col P (idx 15) = Indicador
    const indCell = getCell(15);
    const ind = toNum(indCell?.v);

    if (!canal || isNaN(cod) || ind !== 8) continue;

    const skuEdits = edits[canal]?.[cod];
    if (!skuEdits) continue;

    // Columns R-AC (idx 17-28) = 12 months
    let total = 0;
    for (let c = 17; c <= 28; c++) {
      const mesIdx = c - 17;
      const cellRef = XLSX.utils.encode_cell({ r, c });

      // Get existing value (for total calculation when no edit)
      const existing = toNum(ws[cellRef]?.v ?? 0);

      if (mesIdx in skuEdits) {
        const val = skuEdits[mesIdx];
        if (!ws[cellRef]) {
          ws[cellRef] = { t: "n", v: val };
        } else {
          ws[cellRef].v = val;
          ws[cellRef].t = "n";
          // Remove formula if present so value takes effect
          delete ws[cellRef].f;
        }
        total += val;
      } else {
        total += existing;
      }
    }

    // Column AD (idx 29) = Total Ano
    const totalRef = XLSX.utils.encode_cell({ r, c: 29 });
    if (!ws[totalRef]) {
      ws[totalRef] = { t: "n", v: total };
    } else {
      ws[totalRef].v = total;
      ws[totalRef].t = "n";
      delete ws[totalRef].f;
    }
  }

  // Generate file and trigger download
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const baseName = deck.nomeArquivo.replace(/\.xlsx$/i, "");
  const outName = `${baseName}_revisado.xlsx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = outName;
  a.click();
  URL.revokeObjectURL(url);

  toast.success(`Exportado: ${outName}`);
}
