import { create } from "zustand";

export type CustomCellValue = string | number;

export interface CustomTable {
  id: string;
  name: string;
  columns: string[];
  rows: CustomCellValue[][];
  updatedAt: string;
}

interface CustomTablesState {
  tables: CustomTable[];
  setTables: (tables: CustomTable[]) => void;
  createTable: (table: CustomTable) => void;
  renameTable: (id: string, name: string) => void;
  updateTable: (id: string, patch: Partial<Omit<CustomTable, "id">>) => void;
  deleteTable: (id: string) => void;
  clearTables: () => void;
}

export const CUSTOM_TABLES_FILE = "tabelas-personalizadas.json";
export const CUSTOM_TABLES_SCHEMA_VERSION = 1;

export function createCustomTableDraft(name = "Nova tabela personalizada"): CustomTable {
  const now = new Date().toISOString();
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    columns: ["Coluna 1", "Coluna 2", "Coluna 3"],
    rows: Array.from({ length: 8 }, () => ["", "", ""]),
    updatedAt: now,
  };
}

function normalizeRow(row: CustomCellValue[], columnCount: number): CustomCellValue[] {
  return Array.from({ length: columnCount }, (_, index) => row[index] ?? "");
}

export function normalizeCustomTable(table: CustomTable): CustomTable {
  const columns = table.columns.length ? table.columns.map((col, index) => col || `Coluna ${index + 1}`) : ["Coluna 1"];
  return {
    ...table,
    name: table.name?.trim() || "Tabela personalizada",
    columns,
    rows: (table.rows.length ? table.rows : [[""]]).map((row) => normalizeRow(row, columns.length)),
    updatedAt: table.updatedAt || new Date().toISOString(),
  };
}

export function serializeCustomTables(tables: CustomTable[]) {
  return JSON.stringify({
    schemaVersion: CUSTOM_TABLES_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    tables: tables.map(normalizeCustomTable),
  }, null, 2);
}

export function parseCustomTablesPayload(text: string): CustomTable[] {
  const parsed = JSON.parse(text);
  const tables = Array.isArray(parsed) ? parsed : parsed?.tables;
  if (!Array.isArray(tables)) return [];
  return tables.map(normalizeCustomTable);
}

export const useCustomTables = create<CustomTablesState>((set) => ({
  tables: [],

  setTables: (tables) => set({ tables: tables.map(normalizeCustomTable) }),

  createTable: (table) =>
    set((state) => ({ tables: [...state.tables, normalizeCustomTable(table)] })),

  renameTable: (id, name) =>
    set((state) => ({
      tables: state.tables.map((table) => (
        table.id === id ? { ...table, name: name.trim() || table.name, updatedAt: new Date().toISOString() } : table
      )),
    })),

  updateTable: (id, patch) =>
    set((state) => ({
      tables: state.tables.map((table) => (
        table.id === id ? normalizeCustomTable({ ...table, ...patch, updatedAt: new Date().toISOString() }) : table
      )),
    })),

  deleteTable: (id) =>
    set((state) => ({ tables: state.tables.filter((table) => table.id !== id) })),

  clearTables: () => set({ tables: [] }),
}));
