// Shared cross-filter helpers — field resolution with dimension aliases.
// Ensures that a filter emitted on dimension X matches rows whose actual
// field is one of X's known synonyms (e.g. "marca" vs "marcaDesc").

export const DIM_ALIASES: Record<string, string[]> = {
  marca:         ["marca", "marcaDesc", "marca_id"],
  canal:         ["canal", "canalAjustado", "canalDesc"],
  canalAjustado: ["canalAjustado", "canal", "canalDesc"],
  categoria:     ["categoria", "categoriaDesc"],
  subcategoria:  ["subcategoria", "subcategoriaDesc"],
  cliente:       ["cliente", "clienteDesc", "clienteNome"],
  sku:           ["sku", "skuDesc", "skuCod"],
  skuDesc:       ["skuDesc", "sku", "skuCod"],
  uf:            ["uf", "estado"],
  regiao:        ["regiao", "região", "regiaoDesc"],
};

export function resolveFieldValue(
  row: Record<string, unknown>,
  dimension: string,
): string {
  const candidates = DIM_ALIASES[dimension] ?? [dimension];
  for (const key of candidates) {
    const v = row[key];
    if (v !== undefined && v !== null && String(v) !== "") return String(v);
  }
  return "";
}
