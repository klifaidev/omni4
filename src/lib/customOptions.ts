// Opções criadas à mão nos menus de classificação (De/Paras). Uma opção nova
// — que ainda não existe no De/Para nem nas bases — passa a aparecer nos
// menus do mesmo campo para todos os SKUs, mesmo antes de ser usada.
// Guardadas neste computador, por campo ("sku.marca", "comercial.ufToRegional").
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "omni4.depara.customOptions.v1";

type Store = Record<string, string[]>;

let store: Store = load();
const listeners = new Set<() => void>();

function load(): Store {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Store;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function save() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Sem armazenamento: a opção vale nesta sessão.
  }
  for (const l of listeners) l();
}

/** Comparação que ignora maiúsculas, acentos e espaços extras. */
export function foldOption(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Limpa o texto digitado: sem espaços nas pontas nem espaços repetidos. */
export function cleanOption(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

const EMPTY: string[] = [];

export function getCustomOptions(key: string): string[] {
  return store[key] ?? EMPTY;
}

/** Cadastra a opção (se já houver uma igual, ignorando acentos/maiúsculas, mantém a existente). */
export function addCustomOption(key: string, value: string): string {
  const clean = cleanOption(value);
  if (!clean) return clean;
  const list = store[key] ?? [];
  const same = list.find((v) => foldOption(v) === foldOption(clean));
  if (same) return same;
  store = { ...store, [key]: [...list, clean].sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" })) };
  save();
  return clean;
}

export function removeCustomOption(key: string, value: string): void {
  const list = store[key];
  if (!list?.includes(value)) return;
  store = { ...store, [key]: list.filter((v) => v !== value) };
  save();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Opções manuais do campo, atualizadas na hora em todos os menus abertos. */
export function useCustomOptions(key: string | undefined): string[] {
  return useSyncExternalStore(
    subscribe,
    () => (key ? getCustomOptions(key) : EMPTY),
    () => EMPTY,
  );
}

/** Só para testes. */
export function resetCustomOptions(): void {
  store = {};
  save();
}
