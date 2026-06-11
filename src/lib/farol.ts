import type { PricingRow } from "./types";

export interface FarolSku {
  sku: string;
  skuDesc: string;
  clientesAtivos: number;
  volumeKgTotal: number;
  rolTotal: number;
  margemMedia: number; // metric / rol — percentage (e.g. 0.23 = 23%)
  clientesUnicos: string[];
}

export interface FarolComparacao {
  skuRef: FarolSku;
  skuComp: FarolSku;
  indicePositivacao: number; // 0..1
  clientesApenasRef: string[];
  clientesAmbos: string[];
  clientesApenasComp: string[];
  oportunidadeClientes: number;
  oportunidadeVolumeKg: number;
  oportunidadeRol: number;
  oportunidadeCM: number;
  oportunidadeVolumeKgPct: number;
  oportunidadeCMPct: number;
}

export interface FarolFiltros {
  canal: string | null;
  categoria: string | null;
  periodoMeses: number; // default 3
}

// Extract client id: first token before the first space
export function clienteId(cliente: string | undefined): string | null {
  if (!cliente) return null;
  const tok = cliente.split(" ")[0];
  return tok && /^\d+$/.test(tok) ? tok : null;
}

function buildFarolSku(
  sku: string,
  skuRows: PricingRow[],
  metric: "cm" | "mb",
): FarolSku | null {
  if (skuRows.length === 0) return null;

  const clienteIds = new Set<string>();
  let volumeKgTotal = 0;
  let rolTotal = 0;
  let metricTotal = 0;

  for (const r of skuRows) {
    const id = clienteId(r.cliente);
    if (id) clienteIds.add(id);
    volumeKgTotal += r.volumeKg;
    rolTotal += r.rol;
    metricTotal += metric === "cm" ? r.contribMarginal : r.margemBruta;
  }

  const margemMedia = rolTotal > 0 ? metricTotal / rolTotal : 0;

  return {
    sku,
    skuDesc: skuRows[0].skuDesc ?? sku,
    clientesAtivos: clienteIds.size,
    volumeKgTotal,
    rolTotal,
    margemMedia,
    clientesUnicos: Array.from(clienteIds),
  };
}

export function calcFarol(
  rows: PricingRow[],
  skuRef: string,
  skuComp: string,
  filtros: FarolFiltros,
  metric: "cm" | "mb",
): FarolComparacao | null {
  if (!skuRef || !skuComp || skuRef === skuComp) return null;

  // Step 1 — last N months from all rows
  const allPeriodos = Array.from(new Set(rows.map((r) => r.periodo))).sort();
  const periodos = new Set(allPeriodos.slice(-filtros.periodoMeses));
  if (periodos.size === 0) return null;

  // Step 2 — filter by period, canal, categoria
  let filtered = rows.filter((r) => periodos.has(r.periodo));
  if (filtros.canal) {
    filtered = filtered.filter(
      (r) => r.canal === filtros.canal || r.canalAjustado === filtros.canal,
    );
  }
  if (filtros.categoria) {
    filtered = filtered.filter((r) => r.categoria === filtros.categoria);
  }

  // Step 3 — build FarolSku for each side
  const refRows = filtered.filter((r) => r.sku === skuRef);
  const compRows = filtered.filter((r) => r.sku === skuComp);

  const farolRef = buildFarolSku(skuRef, refRows, metric);
  const farolComp = buildFarolSku(skuComp, compRows, metric);

  // Step 4 — require both sides to have data and at least some clients on ref
  if (!farolRef || !farolComp || farolRef.clientesAtivos === 0) return null;

  // Step 5 — client set operations
  const setRef = new Set(farolRef.clientesUnicos);
  const setComp = new Set(farolComp.clientesUnicos);

  const clientesAmbos = farolRef.clientesUnicos.filter((c) => setComp.has(c));
  const clientesApenasRef = farolRef.clientesUnicos.filter((c) => !setComp.has(c));
  const clientesApenasComp = farolComp.clientesUnicos.filter((c) => !setRef.has(c));

  // Step 6 — positivation index and opportunity estimates
  const indicePositivacao = farolComp.clientesAtivos / farolRef.clientesAtivos;

  const oportunidadeClientes = clientesApenasRef.length;
  const avgVol = farolComp.clientesAtivos > 0 ? farolComp.volumeKgTotal / farolComp.clientesAtivos : 0;
  const avgRol = farolComp.clientesAtivos > 0 ? farolComp.rolTotal / farolComp.clientesAtivos : 0;

  const oportunidadeVolumeKg = oportunidadeClientes * avgVol;
  const oportunidadeRol = oportunidadeClientes * avgRol;
  const oportunidadeCM = oportunidadeRol * farolComp.margemMedia;

  const oportunidadeVolumeKgPct =
    farolComp.volumeKgTotal > 0 ? oportunidadeVolumeKg / farolComp.volumeKgTotal : 0;

  const currentCM = farolComp.rolTotal * farolComp.margemMedia;
  const oportunidadeCMPct =
    Math.abs(currentCM) > 0 ? Math.abs(oportunidadeCM) / Math.abs(currentCM) : 0;

  return {
    skuRef: farolRef,
    skuComp: farolComp,
    indicePositivacao,
    clientesApenasRef,
    clientesAmbos,
    clientesApenasComp,
    oportunidadeClientes,
    oportunidadeVolumeKg,
    oportunidadeRol,
    oportunidadeCM,
    oportunidadeVolumeKgPct,
    oportunidadeCMPct,
  };
}
