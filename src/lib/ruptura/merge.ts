// Junta dois modelos de ruptura mês a mês.
//
// A Base One traz, todo mês, só o mês corrente da pesquisa de ruptura. Trocar
// a base inteira por ela apagaria o histórico; então o modelo novo entra por
// cima do atual: os meses que ele traz substituem (ou, se a pessoa preferir
// manter o que já existe, são ignorados) e os demais meses ficam como estão.
//
// Os modelos são colunares com dicionários próprios, então tudo é remapeado:
// rótulos (mesma normalização do leitor — sem acento, maiúsculas), SKUs, lojas
// (Rede + Bandeira + PDV + Cidade + Estado) e meses.
import { RUPTURA_DIMS, type RupturaDim, type RupturaModel } from "./types";

export interface MergeRupturaOptions {
  /** true: os meses do modelo novo substituem os mesmos meses do atual. */
  replaceExisting: boolean;
}

function keyText(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}

class LabelIndex {
  readonly labels: string[] = [];
  private readonly index = new Map<string, number>();
  id(label: string): number {
    const key = keyText(label);
    let id = this.index.get(key);
    if (id === undefined) {
      id = this.labels.length;
      this.labels.push(label);
      this.index.set(key, id);
    }
    return id;
  }
}

export function mergeRupturaModels(
  current: RupturaModel,
  incoming: RupturaModel,
  { replaceExisting }: MergeRupturaOptions,
): RupturaModel {
  const incomingMonths = new Set(incoming.months);
  const currentMonths = new Set(current.months);
  const keepCurrent = (month: string) => !replaceExisting || !incomingMonths.has(month);
  const keepIncoming = (month: string) => replaceExisting || !currentMonths.has(month);

  // O modelo novo vem primeiro: em rótulos e atributos, o mais recente vale.
  const sources = [
    { model: incoming, keep: keepIncoming },
    { model: current, keep: keepCurrent },
  ];

  const monthSet = new Set<string>();
  for (const { model, keep } of sources) {
    for (let i = 0; i < model.cells.month.length; i++) {
      const month = model.months[model.cells.month[i]];
      if (keep(month)) monthSet.add(month);
    }
  }
  const months = [...monthSet].sort();
  const monthIndex = new Map(months.map((m, i) => [m, i]));

  const dims = Object.fromEntries(RUPTURA_DIMS.map((d) => [d, new LabelIndex()])) as Record<RupturaDim, LabelIndex>;
  const skus = { marca: [] as number[], categoria: [] as number[], linha: [] as number[] };
  const stores: RupturaModel["stores"] = {
    rede: [], bandeira: [], pdv: [], canal: [], regional: [], estado: [], cidade: [], uf: [],
  };
  const storeIndex = new Map<string, number>();

  const cells: RupturaModel["cells"] = { month: [], store: [], sku: [], result: [], evals: [], sims: [] };

  for (const { model, keep } of sources) {
    const label = (dim: RupturaDim, id: number) => dims[dim].id(model.dict[dim][id]);

    const skuMap = new Map<number, number>();
    const skuOf = (old: number) => {
      let id = skuMap.get(old);
      if (id !== undefined) return id;
      id = label("sku", old);
      if (id === skus.marca.length) {
        skus.marca.push(label("marca", model.skus.marca[old]));
        skus.categoria.push(label("categoria", model.skus.categoria[old]));
        skus.linha.push(label("linha", model.skus.linha[old]));
      }
      skuMap.set(old, id);
      return id;
    };

    const storeMap = new Map<number, number>();
    const storeOf = (old: number) => {
      let id = storeMap.get(old);
      if (id !== undefined) return id;
      const rede = label("rede", model.stores.rede[old]);
      const bandeira = label("bandeira", model.stores.bandeira[old]);
      const pdv = label("pdv", model.stores.pdv[old]);
      const cidade = label("cidade", model.stores.cidade[old]);
      const estado = label("estado", model.stores.estado[old]);
      const key = `${rede}|${bandeira}|${pdv}|${cidade}|${estado}`;
      id = storeIndex.get(key);
      if (id === undefined) {
        id = stores.rede.length;
        storeIndex.set(key, id);
        stores.rede.push(rede);
        stores.bandeira.push(bandeira);
        stores.pdv.push(pdv);
        stores.canal.push(label("canal", model.stores.canal[old]));
        stores.regional.push(label("regional", model.stores.regional[old]));
        stores.estado.push(estado);
        stores.cidade.push(cidade);
        stores.uf.push(model.stores.uf[old]);
      }
      storeMap.set(old, id);
      return id;
    };

    for (let i = 0; i < model.cells.month.length; i++) {
      const month = model.months[model.cells.month[i]];
      if (!keep(month)) continue;
      cells.month.push(monthIndex.get(month)!);
      cells.store.push(storeOf(model.cells.store[i]));
      cells.sku.push(skuOf(model.cells.sku[i]));
      cells.result.push(model.cells.result[i]);
      cells.evals.push(model.cells.evals[i]);
      cells.sims.push(model.cells.sims[i]);
    }
  }

  // Qualidade: contagens de leitura somadas; o que depende do modelo final é
  // recalculado.
  const q1 = incoming.quality;
  const q2 = current.quality;
  const pdvStores = new Map<number, Set<number>>();
  stores.pdv.forEach((pdv, store) => {
    let set = pdvStores.get(pdv);
    if (!set) pdvStores.set(pdv, (set = new Set()));
    set.add(store);
  });
  const negativeMonths = new Set<number>();
  for (let i = 0; i < cells.month.length; i++) if (cells.sims[i] < cells.evals[i]) negativeMonths.add(cells.month[i]);
  const minDate = [q1.firstDate, q2.firstDate].filter((d): d is string => !!d).sort()[0] ?? null;
  const maxDate = [q1.lastDate, q2.lastDate].filter((d): d is string => !!d).sort().pop() ?? null;

  return {
    version: incoming.version,
    fileName: incoming.fileName,
    sheetName: incoming.sheetName,
    months,
    dict: Object.fromEntries(RUPTURA_DIMS.map((d) => [d, dims[d].labels])) as Record<RupturaDim, string[]>,
    skus,
    stores,
    cells,
    quality: {
      rawRows: q1.rawRows + q2.rawRows,
      missingKey: q1.missingKey + q2.missingKey,
      invalidResult: q1.invalidResult + q2.invalidResult,
      sim: q1.sim + q2.sim,
      nao: q1.nao + q2.nao,
      mergedDuplicates: q1.mergedDuplicates + q2.mergedDuplicates,
      exactDuplicates: q1.exactDuplicates + q2.exactDuplicates,
      surveys: q1.surveys + q2.surveys,
      surveysInManyStores: q1.surveysInManyStores + q2.surveysInManyStores,
      pdvHomonyms: [...pdvStores.values()].filter((s) => s.size > 1).length,
      storesWithManyChannels: q1.storesWithManyChannels + q2.storesWithManyChannels,
      skusWithManyHierarchies: q1.skusWithManyHierarchies + q2.skusWithManyHierarchies,
      unknownStates: [...new Set([...q1.unknownStates, ...q2.unknownStates])].sort(),
      firstDate: minDate,
      lastDate: maxDate,
      monthsWithNegatives: [...negativeMonths].sort((a, b) => a - b),
    },
  };
}
