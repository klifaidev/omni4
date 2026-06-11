export const formatBRL = (v: number, opts?: { compact?: boolean; digits?: number }) => {
  if (!isFinite(v)) return "—";
  const { digits = 0 } = opts ?? {};
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

export const formatNum = (v: number, digits = 0, compact = false) => {
  if (!isFinite(v)) return "—";
  return v.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

export const formatPct = (v: number, digits = 1) => {
  if (!isFinite(v)) return "—";
  return `${(v * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
};

export const formatTon = (tons: number) => `${formatNum(tons, 0)} t`;

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export const monthLabel = (mes: number, ano: number) =>
  `${MONTH_LABELS[mes - 1] ?? "?"}/${String(ano).slice(-2)}`;

/**
 * Parse a period string into {mes, ano, fy, fyNum}.
 * Aceita: "005.2025", "5.2025", "05/2025", "05/25", "2025-05", "202505",
 *         "2025 05", "2025/05", "mai/25", "Mai/2025", "mai-25",
 *         "01/05/2025", "2025-05-01", serial Excel como "45748".
 * Fiscal year: Apr–Mar. FY25/26 = Apr 2025 → Mar 2026.
 */
export function parsePeriod(raw: string | number): {
  periodo: string;
  mes: number;
  ano: number;
  fy: string;
  fyNum: number;
} | null {
  const s = String(raw ?? "").trim().replace(/^['"]|['"]$/g, "");
  if (!s) return null;

  let mes = 0;
  let ano = 0;

  const finish = () => {
    if (ano < 100) ano += 2000;
    if (mes < 1 || mes > 12 || ano < 2000 || ano > 2099) return null;
    const fyStart = mes >= 4 ? ano : ano - 1;
    const fyEnd = fyStart + 1;
    const fy = `FY${String(fyStart).slice(-2)}/${String(fyEnd).slice(-2)}`;
    const fyNum = fyStart * 100 + (fyEnd % 100);
    const periodo = `${String(mes).padStart(3, "0")}.${ano}`;
    return { periodo, mes, ano, fy, fyNum };
  };

  // Composite format: "005.2025 Maio 2025" — pick the leading MM.YYYY token
  const composite = s.match(/^0*(\d{1,2})[.\/-](\d{4})\b/);
  if (composite) {
    mes = parseInt(composite[1], 10);
    ano = parseInt(composite[2], 10);
    const r = finish();
    if (r) return r;
  }

  // Excel serial date, e.g. 45748
  if (/^\d{5}$/.test(s)) {
    const serial = parseInt(s, 10);
    if (serial > 30000 && serial < 80000) {
      const utc = new Date(Date.UTC(1899, 11, 30 + serial));
      mes = utc.getUTCMonth() + 1;
      ano = utc.getUTCFullYear();
      return finish();
    }
  }

  // Compact YYYYMM
  const compactYm = s.match(/^(\d{4})(\d{2})$/);
  if (compactYm) {
    ano = parseInt(compactYm[1], 10);
    mes = parseInt(compactYm[2], 10);
    return finish();
  }

  // Numeric formats
  const m1 = s.match(/^0*(\d{1,2})[./-](\d{2,4})$/);                 // 5.2025 / 05/25
  const m2 = s.match(/^(\d{4})[./\-\s]0*(\d{1,2})$/);             // 2025-05 / 2025 05
  const m3 = s.match(/^0*(\d{1,2})[./-]0*(\d{1,2})[./-](\d{2,4})$/); // 01/05/2025 (dd/mm/yyyy)
  const m4 = s.match(/^(\d{4})[./-]0*(\d{1,2})[./-]0*(\d{1,2})$/);   // 2025-05-01
  const m5n = s.match(/^p?\s*0*(\d{1,2})[./\-\s]?m?[./\-\s]?(\d{2,4})$/i); // P03/2025 / 03 2025
  const m6n = s.match(/^(\d{2,4})[./\-\s]?m?0*(\d{1,2})$/i);       // 2025M03

  // Month-name formats (PT/EN abbreviations)
  const monthMap: Record<string, number> = {
    jan: 1, fev: 2, feb: 2, mar: 3, abr: 4, apr: 4, mai: 5, may: 5,
    jun: 6, jul: 7, ago: 8, aug: 8, set: 9, sep: 9, out: 10, oct: 10,
    nov: 11, dez: 12, dec: 12,
  };
  const m5 = s.toLowerCase().match(/^([a-zç]{3,12})[\s./-]+(\d{2,4})$/);
  const m6 = s.toLowerCase().match(/^(\d{2,4})[\s./-]+([a-zç]{3,12})$/);

  if (m1) { mes = parseInt(m1[1], 10); ano = parseInt(m1[2], 10); }
  else if (m2) { ano = parseInt(m2[1], 10); mes = parseInt(m2[2], 10); }
  else if (m3) { mes = parseInt(m3[2], 10); ano = parseInt(m3[3], 10); }
  else if (m4) { ano = parseInt(m4[1], 10); mes = parseInt(m4[2], 10); }
  else if (m5n) { mes = parseInt(m5n[1], 10); ano = parseInt(m5n[2], 10); }
  else if (m6n) { ano = parseInt(m6n[1], 10); mes = parseInt(m6n[2], 10); }
  else if (m5) {
    const mn = monthMap[m5[1].slice(0, 3).normalize("NFD").replace(/[\u0300-\u036f]/g, "")];
    if (mn) { mes = mn; ano = parseInt(m5[2], 10); }
  }
  else if (m6) {
    const mn = monthMap[m6[2].slice(0, 3).normalize("NFD").replace(/[\u0300-\u036f]/g, "")];
    if (mn) { mes = mn; ano = parseInt(m6[1], 10); }
  } else {
    return null;
  }

  return finish();
}

/** normalize header: lowercase, strip accents/spaces/punct */
export const normHeader = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

/** parse "1.234,56" or "1,234.56" or "123.45" → number */
export function parseDecimal(raw: unknown): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  if (typeof raw === "number") return raw;
  let s = String(raw).trim().replace(/\s/g, "").replace(/R\$/i, "");
  if (!s) return 0;
  const negative = /^\(.*\)$/.test(s) || s.startsWith("-");
  s = s.replace(/^[-(]+|[)]+$/g, "");
  // BR: "1.234,56" → "1234.56"
  if (s.includes(",") && s.lastIndexOf(",") > s.lastIndexOf(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",") && !s.includes(".")) {
    // "1234,56"
    s = s.replace(",", ".");
  } else {
    // "1,234.56" — strip thousand commas
    s = s.replace(/,/g, "");
  }
  const n = parseFloat(s);
  if (!isFinite(n)) return 0;
  return negative ? -n : n;
}
