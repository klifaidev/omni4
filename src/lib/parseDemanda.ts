import * as XLSX from "xlsx";
import type { DemandaDeck, DemandaMeses, DemandaRow, DemandaSku, DemandaIndicador } from "./demanda";

const MES_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// English month names for header parsing
const MES_EN = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MES_PT_LOW = MES_PT.map((m) => m.toLowerCase());

function parseMesHeader(cell: unknown): { label: string; data: Date } | null {
  if (cell == null) return null;

  // Excel numeric date serial
  if (typeof cell === "number") {
    try {
      const parsed = XLSX.SSF.parse_date_code(cell as number);
      if (parsed && parsed.m && parsed.y) {
        const mes = parsed.m - 1;
        return {
          label: `${MES_PT[mes]}/${String(parsed.y).slice(-2)}`,
          data: new Date(parsed.y, mes, 1),
        };
      }
    } catch {
      // fall through
    }
  }

  const str = String(cell).trim();

  // "Apr-26", "Apr/26", "Abr/26", "Abr-26"
  const m1 = str.match(/^([A-Za-z]{3,4})[-/](\d{2,4})$/);
  if (m1) {
    const mLow = m1[1].toLowerCase().slice(0, 3);
    let mesIdx = MES_EN.indexOf(mLow);
    if (mesIdx === -1) mesIdx = MES_PT_LOW.indexOf(mLow);
    if (mesIdx !== -1) {
      const yearStr = m1[2];
      const ano = yearStr.length === 2 ? 2000 + parseInt(yearStr, 10) : parseInt(yearStr, 10);
      return {
        label: `${MES_PT[mesIdx]}/${String(ano).slice(-2)}`,
        data: new Date(ano, mesIdx, 1),
      };
    }
  }

  // "04/2026" or "4/2026"
  const m2 = str.match(/^(\d{1,2})\/(\d{4})$/);
  if (m2) {
    const mes = parseInt(m2[1], 10) - 1;
    const ano = parseInt(m2[2], 10);
    if (mes >= 0 && mes < 12) {
      return { label: `${MES_PT[mes]}/${String(ano).slice(-2)}`, data: new Date(ano, mes, 1) };
    }
  }

  return { label: str, data: new Date() };
}

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return isNaN(v) ? 0 : v;
  const n = parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? 0 : n;
}

function toStr(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

export async function parseDemandaXlsx(file: File): Promise<DemandaDeck> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: false, raw: true });

  const SHEET = "Base Geral Com Fórmula";
  if (!wb.SheetNames.includes(SHEET)) {
    throw new Error(
      `Aba "${SHEET}" não encontrada. Verifique se o arquivo correto foi selecionado.`,
    );
  }

  const ws = wb.Sheets[SHEET];
  // Parse without header (returns array of arrays)
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    raw: true,
  });

  // Row 29 in Excel = index 28 in 0-based array
  const headerRow = (aoa[28] ?? []) as unknown[];

  // Columns 18-29 (1-based) = indices 17-28 (0-based) = 12 months
  const labels: string[] = [];
  const datas: Date[] = [];
  for (let c = 17; c <= 28; c++) {
    const parsed = parseMesHeader(headerRow[c]);
    if (parsed) {
      labels.push(parsed.label);
      datas.push(parsed.data);
    } else {
      labels.push(`Mês ${c - 16}`);
      datas.push(new Date());
    }
  }

  // Find mesAtualIdx: month closest to today
  const nowYM = new Date().getFullYear() * 12 + new Date().getMonth();
  let mesAtualIdx = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < datas.length; i++) {
    const d = datas[i];
    const diff = Math.abs(d.getFullYear() * 12 + d.getMonth() - nowYM);
    if (diff < bestDiff) {
      bestDiff = diff;
      mesAtualIdx = i;
    }
  }

  const meses: DemandaMeses = { labels, datas, mesAtualIdx };

  // --- Parse data rows starting at index 29 (Excel row 30) ---
  type GroupMap = Map<string, { sku: DemandaSku; indicadores: Record<number, DemandaIndicador> }>;
  const groups: GroupMap = new Map();

  for (let r = 29; r < aoa.length; r++) {
    const row = (aoa[r] ?? []) as unknown[];

    // Col B (idx 1) = JOIN; Col E (idx 4) = Regional (canal)
    const join = toStr(row[1]);
    if (!join) break; // end of data

    const regional = toStr(row[4]);
    const codRaw = row[8]; // Col I (idx 8) = Cód
    const cod = typeof codRaw === "number" ? codRaw : parseInt(toStr(codRaw), 10);
    if (!regional || isNaN(cod) || cod === 0) continue;

    const indRaw = row[15]; // Col P (idx 15) = Indicador
    const ind = typeof indRaw === "number" ? Math.round(indRaw) : parseInt(toStr(indRaw), 10);
    const indice = toStr(row[16]); // Col Q (idx 16) = Índice

    const key = `${regional}::${cod}`;

    if (!groups.has(key)) {
      const sku: DemandaSku = {
        join,
        bu: toStr(row[2]),
        nacional: toStr(row[3]),
        regional,
        negocio: toStr(row[5]),
        categoria: toStr(row[6]),
        subcategoria: toStr(row[7]),
        cod,
        descricao: toStr(row[9]),
        status: toStr(row[10]),
        tecnologia: toStr(row[11]),
        formato: toStr(row[12]),
        quemRevisa: toStr(row[13]),
        obs: row[14] ? toStr(row[14]) : undefined,
      };
      groups.set(key, { sku, indicadores: {} });
    }

    const group = groups.get(key)!;

    if (!isNaN(ind) && ind > 0) {
      // Cols 18-29 (1-based) = idx 17-28
      const valores: number[] = [];
      for (let c = 17; c <= 28; c++) {
        valores.push(toNum(row[c]));
      }
      group.indicadores[ind] = { ind, indice, valores };
    }
  }

  const rows: DemandaRow[] = Array.from(groups.values());

  if (rows.length === 0) {
    throw new Error(
      "Nenhuma linha de dados encontrada na aba. Verifique se a estrutura do arquivo está correta.",
    );
  }

  return {
    id: crypto.randomUUID(),
    nomeArquivo: file.name,
    uploadedAt: Date.now(),
    meses,
    rows,
  };
}
