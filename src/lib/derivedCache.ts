// Memória de cálculos derivados das bases.
//
// As bases (rows de Real, Budget…) são imutáveis: toda mudança nas stores cria
// um array novo. Então um cálculo puro sobre elas pode ser guardado pela
// identidade do array — e reaproveitado por qualquer tela, em qualquer visita.
// Antes, cada tela refazia as mesmas varreduras de todas as linhas a cada vez
// que abria (com 1,5 milhão de linhas, de 0,3 a 1 s por varredura).
//
// Regras de uso:
//  - a função precisa ser pura, e o primeiro argumento, o array de linhas;
//  - quem recebe o resultado não pode alterá-lo (ele é compartilhado);
//  - argumentos extras: valores simples ou objetos (identificados por
//    identidade, nunca pelo conteúdo).
// Quando o array antigo sai da store, o WeakMap libera tudo dele sozinho. Sob
// pressão de memória, `clearDerivedCaches` (guarda de memória) zera tudo.

type Arg = object | string | number | boolean | null | undefined;

const clearers: Array<() => void> = [];
const objectIds = new WeakMap<object, number>();
let nextObjectId = 1;

function argKey(value: Arg): string {
  if (value !== null && typeof value === "object") {
    let id = objectIds.get(value);
    if (id === undefined) {
      id = nextObjectId++;
      objectIds.set(value, id);
    }
    return `#${id}`;
  }
  return `${typeof value}:${String(value)}`;
}

/**
 * Envolve `fn(rows, ...args)` numa memória por identidade de `rows`, com até
 * `maxPerRows` combinações de argumentos guardadas por array (a mais antiga sai).
 */
export function memoizeByRows<Rows extends object, Rest extends Arg[], R>(
  fn: (rows: Rows, ...rest: Rest) => R,
  maxPerRows = 8,
): (rows: Rows, ...rest: Rest) => R {
  let cache = new WeakMap<Rows, Map<string, R>>();
  clearers.push(() => {
    cache = new WeakMap();
  });
  return (rows: Rows, ...rest: Rest): R => {
    let byArgs = cache.get(rows);
    if (!byArgs) {
      byArgs = new Map();
      cache.set(rows, byArgs);
    }
    const key = rest.map(argKey).join("|");
    if (byArgs.has(key)) {
      const hit = byArgs.get(key) as R;
      // Reinsere para marcar como usado por último.
      byArgs.delete(key);
      byArgs.set(key, hit);
      return hit;
    }
    const value = fn(rows, ...rest);
    byArgs.set(key, value);
    if (byArgs.size > maxPerRows) byArgs.delete(byArgs.keys().next().value as string);
    return value;
  };
}

/** Esquece tudo o que foi guardado (guarda de memória e testes). */
export function clearDerivedCaches(): void {
  for (const clear of clearers) clear();
}
