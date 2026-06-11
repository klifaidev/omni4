// ---------- SKU metadata ----------
export interface DemandaSku {
  join: string;
  bu: string;
  nacional: string;
  regional: string; // canal, ex: "CASH & CARRY"
  negocio: string;
  categoria: string;
  subcategoria: string;
  cod: number;
  descricao: string;
  status: string;
  tecnologia: string;
  formato: string;
  quemRevisa: string;
  obs?: string;
}

// ---------- One indicator row (Ind 1, 3, 4, 8 …) ----------
export interface DemandaIndicador {
  ind: number;
  indice: string;
  valores: number[]; // 12 monthly values aligned with DemandaMeses.labels
}

// ---------- All indicators for one SKU in one canal ----------
export interface DemandaRow {
  sku: DemandaSku;
  indicadores: Record<number, DemandaIndicador>;
}

// ---------- Month metadata for the cycle ----------
export interface DemandaMeses {
  labels: string[]; // ["Abr/26", "Mai/26", …] — 12 items
  datas: Date[];
  mesAtualIdx: number; // index of the current month (locked)
}

// ---------- Loaded deck ----------
export interface DemandaDeck {
  id: string;
  nomeArquivo: string;
  uploadedAt: number;
  meses: DemandaMeses;
  rows: DemandaRow[];
}

// ---------- Edits: canal -> cod -> mesIdx -> valor ----------
export type DemandaEdit = Record<string, Record<number, Record<number, number>>>;

export type MetodoSugestao = "sazonalidade" | "tendencia" | "anterior";

export interface DemandaConfig {
  fatorCrescimento: number; // default 1.05
  mesesTendencia: number;   // default 4
}
