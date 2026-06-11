// Gerador de dados de demonstração — popula Real e Budget com números aleatórios
// realistas para apresentação ao cliente. Não substitui dados de produção.
import deparaJson from "@/data/depara.json";
import deparaComercialJson from "@/data/depara_comercial.json";
import type { PricingRow, LoadedFile } from "./types";
import type { BudgetRow, BudgetFile } from "./budget";
import { parsePeriod } from "./format";
import { getInovacao, getLegado } from "./deparaInovacao";

const DEPARA = deparaJson as Record<
  string,
  {
    categoria: string;
    subcategoria: string;
    marca: string;
    tecnologia: string;
    formato: string;
    mercado: string;
    faixaPeso: string;
    sabor: string;
    skuDesc: string;
  }
>;

const COMERCIAL = deparaComercialJson as {
  canalToCanalAjustado: Record<string, string>;
  regiaoToUf?: Record<string, string>;
  ufToRegional?: Record<string, string>;
};

// PRNG determinístico para resultados estáveis entre cliques
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Últimos N meses encerrados (referência: mês atual)
function lastMonths(n: number): { mes: number; ano: number }[] {
  const now = new Date();
  const out: { mes: number; ano: number }[] = [];
  // começa pelo mês anterior ao corrente (Real fecha mês anterior)
  let mes = now.getMonth(); // 0-11 = mês anterior em base 1
  let ano = now.getFullYear();
  if (mes === 0) {
    mes = 12;
    ano -= 1;
  }
  for (let i = 0; i < n; i++) {
    out.unshift({ mes, ano });
    mes -= 1;
    if (mes === 0) {
      mes = 12;
      ano -= 1;
    }
  }
  return out;
}

function pad3(n: number) {
  return String(n).padStart(3, "0");
}

const CANAIS = Object.keys(COMERCIAL.canalToCanalAjustado);
const REGIOES = ["SUDESTE", "SUL", "NORDESTE", "NORTE", "CENTRO-OESTE"];
const UFS_BY_REGIAO: Record<string, string[]> = {
  SUDESTE: ["SP", "RJ", "MG", "ES"],
  SUL: ["PR", "SC", "RS"],
  NORDESTE: ["BA", "PE", "CE"],
  NORTE: ["AM", "PA"],
  "CENTRO-OESTE": ["GO", "MT", "DF"],
};
const REGIONAL_BY_UF: Record<string, string> = {
  SP: "SP", RJ: "RJ/ES", ES: "RJ/ES", MG: "MG",
  PR: "SUL", SC: "SUL", RS: "SUL",
  BA: "NORDESTE", PE: "NORDESTE", CE: "NORDESTE",
  AM: "NORTE", PA: "NORTE",
  GO: "CENTRO-OESTE", MT: "CENTRO-OESTE", DF: "CENTRO-OESTE",
};

interface GenerateOpts {
  monthsBack?: number;
  skuSampleSize?: number;
  rowsPerMonth?: number;
  seed?: number;
}

export interface DemoBundle {
  realRows: PricingRow[];
  realFile: LoadedFile;
  budgetRows: BudgetRow[];
  budgetFile: BudgetFile;
}

export function generateDemoData(opts: GenerateOpts = {}): DemoBundle {
  const monthsBack = opts.monthsBack ?? 12;
  const skuSampleSize = opts.skuSampleSize ?? 120;
  const rowsPerMonth = opts.rowsPerMonth ?? 600;
  const rand = mulberry32(opts.seed ?? 20260501);

  const allSkus = Object.keys(DEPARA);
  // amostra estável: pega 1 a cada N
  const stride = Math.max(1, Math.floor(allSkus.length / skuSampleSize));
  const skus = allSkus.filter((_, i) => i % stride === 0).slice(0, skuSampleSize);

  const months = lastMonths(monthsBack);
  const realRows: PricingRow[] = [];
  const budgetRows: BudgetRow[] = [];

  // Sazonalidade leve por mês (índice 1..12)
  const sazon = (m: number) => 1 + 0.18 * Math.sin(((m - 4) / 12) * Math.PI * 2);

  for (const { mes, ano } of months) {
    const periodoStr = `${pad3(mes)}.${ano}`;
    const p = parsePeriod(periodoStr);
    if (!p) continue;
    const seasonMul = sazon(mes);

    for (let i = 0; i < rowsPerMonth; i++) {
      const sku = skus[Math.floor(rand() * skus.length)];
      const dep = DEPARA[sku];
      const canal = CANAIS[Math.floor(rand() * CANAIS.length)];
      const canalAjustado = COMERCIAL.canalToCanalAjustado[canal];
      const regiao = REGIOES[Math.floor(rand() * REGIOES.length)];
      const ufList = UFS_BY_REGIAO[regiao];
      const uf = ufList[Math.floor(rand() * ufList.length)];
      const regional = REGIONAL_BY_UF[uf] ?? regiao;

      // Volume base (kg) por linha
      const volumeBase = 50 + rand() * 950; // 50–1000 kg
      const volumeKg = +(volumeBase * seasonMul * (0.85 + rand() * 0.3)).toFixed(2);

      // Preço médio R$/kg (varia por categoria)
      const precoBase =
        dep.categoria === "Chocolate" ? 32 :
        dep.categoria === "Cobertura" ? 26 :
        dep.categoria === "Acabamento" ? 22 : 24;
      const preco = precoBase * (0.85 + rand() * 0.35);
      const rol = +(volumeKg * preco).toFixed(2);

      // CPV ~ 55-72% da ROL
      const cpvPct = 0.55 + rand() * 0.17;
      const cogs = +(rol * cpvPct).toFixed(2);
      const materiaPrima = +(cogs * (0.62 + rand() * 0.1)).toFixed(2);
      const embalagem = +(cogs - materiaPrima).toFixed(2);
      const mod = +(rol * (0.04 + rand() * 0.02)).toFixed(2);
      const cif = +(rol * (0.05 + rand() * 0.025)).toFixed(2);

      const margemBruta = +(rol - cogs).toFixed(2);
      const frete = +(rol * (0.03 + rand() * 0.02)).toFixed(2);
      const comissao = +(rol * (0.015 + rand() * 0.015)).toFixed(2);
      const contribMarginal = +(margemBruta - frete - comissao).toFixed(2);

      realRows.push({
        periodo: p.periodo,
        mes: p.mes,
        ano: p.ano,
        fy: p.fy,
        fyNum: p.fyNum,
        marca: dep.marca,
        canal,
        canalAjustado,
        categoria: dep.categoria,
        subcategoria: dep.subcategoria,
        formato: dep.formato,
        sku,
        skuDesc: dep.skuDesc,
        cliente: undefined,
        regiao,
        uf,
        regional,
        mercado: dep.mercado,
        mercadoAjustado: regiao,
        sabor: dep.sabor,
        tecnologia: dep.tecnologia,
        faixaPeso: dep.faixaPeso,
        inovacao: getInovacao(sku),
        legado: getLegado(sku),
        rol,
        volumeKg,
        cogs,
        custoVariavel: +(materiaPrima + embalagem).toFixed(2),
        custoFixo: +(mod + cif).toFixed(2),
        margemBruta,
        contribMarginal,
        frete,
        comissao,
        materiaPrima,
        embalagem,
        mod,
        cif,
      });
    }

    // REAL na base Budget: replica a Real do mês com pequena variação
    // (necessário para o comparativo Real vs Budget na aba Budget,
    //  que filtra ambos por STATUS na MESMA base).
    const realBudgetRowsThisMonth = Math.floor(rowsPerMonth * 0.6);
    for (let i = 0; i < realBudgetRowsThisMonth; i++) {
      const sku = skus[Math.floor(rand() * skus.length)];
      const dep = DEPARA[sku];
      const canal = CANAIS[Math.floor(rand() * CANAIS.length)];
      const canalAjustado = COMERCIAL.canalToCanalAjustado[canal];

      const volumeBase = 55 + rand() * 1050;
      const volumeKg = +(volumeBase * seasonMul * (0.92 + rand() * 0.16)).toFixed(2);
      const precoBase =
        dep.categoria === "Chocolate" ? 32 :
        dep.categoria === "Cobertura" ? 26 :
        dep.categoria === "Acabamento" ? 22 : 24;
      const preco = precoBase * (0.88 + rand() * 0.28);
      const receita = +(volumeKg * preco).toFixed(2);
      const cpv = +(receita * (0.56 + rand() * 0.16)).toFixed(2);
      const cm = +(receita * (0.27 + rand() * 0.1)).toFixed(2);

      budgetRows.push({
        periodo: p.periodo,
        mes: p.mes,
        ano: p.ano,
        fy: p.fy,
        fyNum: p.fyNum,
        status: "2.Real Vendas",
        kind: "real",
        canal,
        canalAjustado,
        sku,
        skuDesc: dep.skuDesc,
        categoria: dep.categoria,
        subcategoria: dep.subcategoria,
        marca: dep.marca,
        tecnologia: dep.tecnologia,
        formato: dep.formato,
        mercado: dep.mercado,
        faixaPeso: dep.faixaPeso,
        sabor: dep.sabor,
        inovacao: getInovacao(sku),
        legado: getLegado(sku),
        volumeKg,
        receita,
        cm,
        cpv,
      });
    }

    // BUDGET: ~8% acima da Real, agregado por SKU+canal (menos linhas)
    const budgetRowsThisMonth = Math.floor(rowsPerMonth * 0.6);
    for (let i = 0; i < budgetRowsThisMonth; i++) {
      const sku = skus[Math.floor(rand() * skus.length)];
      const dep = DEPARA[sku];
      const canal = CANAIS[Math.floor(rand() * CANAIS.length)];
      const canalAjustado = COMERCIAL.canalToCanalAjustado[canal];

      const volumeBase = 60 + rand() * 1100;
      const volumeKg = +(volumeBase * seasonMul * 1.08).toFixed(2);
      const precoBase =
        dep.categoria === "Chocolate" ? 33 :
        dep.categoria === "Cobertura" ? 27 :
        dep.categoria === "Acabamento" ? 23 : 25;
      const preco = precoBase * (0.9 + rand() * 0.25);
      const receita = +(volumeKg * preco).toFixed(2);
      const cpv = +(receita * (0.55 + rand() * 0.15)).toFixed(2);
      const cm = +(receita * (0.28 + rand() * 0.1)).toFixed(2);

      budgetRows.push({
        periodo: p.periodo,
        mes: p.mes,
        ano: p.ano,
        fy: p.fy,
        fyNum: p.fyNum,
        status: "1.Budget Vendas",
        kind: "budget",
        canal,
        canalAjustado,
        sku,
        skuDesc: dep.skuDesc,
        categoria: dep.categoria,
        subcategoria: dep.subcategoria,
        marca: dep.marca,
        tecnologia: dep.tecnologia,
        formato: dep.formato,
        mercado: dep.mercado,
        faixaPeso: dep.faixaPeso,
        sabor: dep.sabor,
        inovacao: getInovacao(sku),
        legado: getLegado(sku),
        volumeKg,
        receita,
        cm,
        cpv,
      });
    }
  }

  const periods = Array.from(new Set(realRows.map((r) => r.periodo))).sort();
  const budgetPeriods = Array.from(new Set(budgetRows.map((r) => r.periodo))).sort();

  return {
    realRows,
    realFile: {
      name: "DEMO_Real_Vendas.csv",
      rowCount: realRows.length,
      months: periods,
    },
    budgetRows,
    budgetFile: {
      name: "DEMO_Budget_Vendas.xlsx",
      rowCount: budgetRows.length,
      months: budgetPeriods,
      uploadedAt: Date.now(),
    },
  };
}
