// Lê a planilha de ruptura fora da thread da interface: a base de referência
// tem ~550 mil linhas e leva dezenas de segundos só no XLSX.read.
import * as XLSX from "xlsx";
import { compactAllRows, decodeCompactTable, isCompactTableName } from "@/lib/intake/compactTable";
import { buildRupturaModel, detectRupturaHeader, pickRupturaSheet } from "@/lib/ruptura/parse";
import type { RupturaModel } from "@/lib/ruptura/types";

export type RupturaWorkerRequest = { buffer: ArrayBuffer; fileName: string };

export type RupturaWorkerResponse =
  | { type: "progress"; stage: "reading" | "consolidating"; done?: number; total?: number }
  | { type: "done"; model: RupturaModel }
  | { type: "error"; message: string };

const post = (message: RupturaWorkerResponse) => (self as unknown as Worker).postMessage(message);

/** Arquivo .omnib (parte de Ruptura de uma Base One já convertida). */
async function modelFromCompact(buffer: ArrayBuffer, fileName: string): Promise<RupturaModel | string> {
  const { table, meta } = await decodeCompactTable(buffer);
  const rows = compactAllRows(table);
  const header = detectRupturaHeader(rows.slice(0, 30));
  if ("error" in header) return header.error;
  post({ type: "progress", stage: "consolidating", done: 0, total: rows.length });
  return buildRupturaModel(rows, header, {
    fileName,
    sheetName: meta.sheetName,
    onProgress: (done, total) => post({ type: "progress", stage: "consolidating", done, total }),
  });
}

self.onmessage = async (event: MessageEvent<RupturaWorkerRequest>) => {
  const { buffer, fileName } = event.data;
  try {
    post({ type: "progress", stage: "reading" });
    if (isCompactTableName(fileName)) {
      const model = await modelFromCompact(buffer, fileName);
      if (typeof model === "string") post({ type: "error", message: model });
      else post({ type: "done", model });
      return;
    }
    const wb = XLSX.read(new Uint8Array(buffer), { type: "array", dense: true });
    const picked = pickRupturaSheet(wb.SheetNames, (name) => {
      const ws = wb.Sheets[name];
      if (!ws?.["!ref"]) return [];
      const range = XLSX.utils.decode_range(ws["!ref"]);
      range.e.r = Math.min(range.e.r, range.s.r + 29);
      return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, range });
    });
    if ("error" in picked) {
      post({ type: "error", message: picked.error });
      return;
    }
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[picked.sheetName], { header: 1, raw: true, defval: null });
    post({ type: "progress", stage: "consolidating", done: 0, total: rows.length });
    const model = buildRupturaModel(rows, picked.header, {
      fileName,
      sheetName: picked.sheetName,
      onProgress: (done, total) => post({ type: "progress", stage: "consolidating", done, total }),
    });
    if (model.cells.month.length === 0) {
      post({ type: "error", message: "Nenhuma avaliação válida (Sim/Não com SKU, PDV e data) foi encontrada." });
      return;
    }
    post({ type: "done", model });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : "Falha ao ler a planilha." });
  }
};
