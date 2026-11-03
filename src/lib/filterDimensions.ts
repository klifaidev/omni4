// Dimensões filtráveis, agrupadas como aparecem na página Filtros e no painel
// "Mais filtros" da barra de filtros ativos.
import type { FilterKey } from "./types";

export type DimensionField = { key: FilterKey; label: string };

export const DIMENSION_GROUPS: { title: string; fields: DimensionField[] }[] = [
  {
    title: "Comercial",
    fields: [
      { key: "canal", label: "Canal" },
      { key: "canalAjustado", label: "Canal Ajustado" },
      { key: "mercadoAjustado", label: "Mercado Ajustado" },
      { key: "regional", label: "Regional" },
    ],
  },
  {
    title: "Produto",
    fields: [
      { key: "marca", label: "Marca" },
      { key: "sku", label: "SKU" },
      { key: "categoria", label: "Categoria" },
      { key: "subcategoria", label: "Subcategoria" },
      { key: "formato", label: "Formato" },
      { key: "mercado", label: "Mercado" },
      { key: "sabor", label: "Sabor" },
      { key: "tecnologia", label: "Tecnologia" },
      { key: "faixaPeso", label: "Faixa de Peso" },
      { key: "inovacao", label: "Inovação / Regular" },
      { key: "legado", label: "Legado" },
    ],
  },
];

export const DIMENSION_KEYS: FilterKey[] = DIMENSION_GROUPS.flatMap((group) => group.fields.map((field) => field.key));
