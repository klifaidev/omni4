// Pricing Analytics — domain types

export type Metric = "cm" | "mb"; // Contribuição Marginal | Margem Bruta

export interface PricingRow {
  // Period
  periodo: string;       // "005.2025"
  mes: number;           // 1-12 calendar
  ano: number;
  fy: string;            // "FY25/26" (April–March)
  fyNum: number;         // sortable: e.g. 2526
  // Dimensions
  marca?: string;
  canal?: string;
  categoria?: string;
  subcategoria?: string;
  formato?: string;
  sku?: string;
  skuDesc?: string;
  cliente?: string;
  regiao?: string;
  uf?: string;
  regional?: string;
  canalAjustado?: string;
  mercadoAjustado?: string;
  mercado?: string;
  sabor?: string;
  tecnologia?: string;
  faixaPeso?: string;
  inovacao?: string; // "Inovação" | "Regular" — derivado do De Para de Inovação por SKU
  legado?: string;   // ex.: "1A", "2A", "3A" — derivado do De Para de Inovação por SKU
  // Measures (R$, kg)
  rol: number;        // Receita Operacional Líquida
  volumeKg: number;
  cogs: number;       // Custo (CMV / CPV)
  custoVariavel: number;
  custoFixo: number;
  margemBruta: number;
  contribMarginal: number;
  frete: number;      // Frete sobre vendas
  comissao: number;   // Comissão representante
  materiaPrima?: number; // Matéria Prima Ajustado (componente do CPV)
  embalagem?: number;    // Embalagem Ajustado (componente do CPV)
  mod?: number;          // MOD (componente do custo fixo)
  cif?: number;          // CIF (componente do custo fixo)
}

export interface LoadedFile {
  name: string;
  rowCount: number;
  months: string[]; // periods like "005.2025"
}

export interface MonthInfo {
  periodo: string;
  mes: number;
  ano: number;
  fy: string;
  fyNum: number;
  rowCount: number;
  label: string; // "Mai/25"
}

export type FilterKey =
  | "marca"
  | "canal"
  | "canalAjustado"
  | "categoria"
  | "subcategoria"
  | "formato"
  | "sku"
  | "regiao"
  | "uf"
  | "regional"
  | "mercado"
  | "mercadoAjustado"
  | "sabor"
  | "tecnologia"
  | "faixaPeso"
  | "inovacao"
  | "legado";

export type Filters = Partial<Record<FilterKey, string[]>>;
