import type { Filters } from "@/lib/types";

const FILTERS_PARAM = "filters";
const PERIODS_PARAM = "periods";
const MAX_URL_LENGTH = 2000;

function encode(value: unknown): string {
  const json = JSON.stringify(value);
  // btoa não aceita UTF-8 fora do range latin1 — converter com encodeURIComponent
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decode<T>(raw: string): T | null {
  try {
    const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(escape(atob(padded)));
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export interface ShareableState {
  filters: Filters;
  selectedPeriods: string[] | null;
}

export function parseShareParams(search: string): Partial<ShareableState> {
  const params = new URLSearchParams(search);
  const result: Partial<ShareableState> = {};
  const f = params.get(FILTERS_PARAM);
  const p = params.get(PERIODS_PARAM);
  if (f) {
    const parsed = decode<Filters>(f);
    if (parsed) result.filters = parsed;
  }
  if (p) {
    const parsed = decode<string[] | null>(p);
    if (parsed !== null) result.selectedPeriods = parsed;
  }
  return result;
}

export function hasShareParams(search: string): boolean {
  const params = new URLSearchParams(search);
  return params.has(FILTERS_PARAM) || params.has(PERIODS_PARAM);
}

export interface BuildShareUrlResult {
  ok: boolean;
  url: string;
  error?: string;
}

export function buildShareUrl(
  pathname: string,
  filters: Filters,
  selectedPeriods: string[] | null,
): BuildShareUrlResult {
  const params = new URLSearchParams();
  const cleanFilters = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v && v.length > 0),
  );
  if (Object.keys(cleanFilters).length > 0) {
    params.set(FILTERS_PARAM, encode(cleanFilters));
  }
  if (selectedPeriods !== null) {
    params.set(PERIODS_PARAM, encode(selectedPeriods));
  }
  const qs = params.toString();
  const url = `${window.location.origin}${pathname}${qs ? `?${qs}` : ""}`;
  if (url.length > MAX_URL_LENGTH) {
    return {
      ok: false,
      url,
      error:
        "Os filtros aplicados são muito complexos para compartilhar via URL. Simplifique os filtros e tente novamente.",
    };
  }
  return { ok: true, url };
}
