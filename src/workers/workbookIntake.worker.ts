// Lê uma planilha (Base One ou base avulsa) fora da thread da interface:
// abre o XLSX, reconhece cada aba pelo conteúdo, converte as abas úteis para a
// tabela compacta (.omnib) e já consolida a ruptura. A interface só recebe
// colunas tipadas (transferidas, sem cópia) e os arquivos .omnib prontos.
import * as XLSX from "xlsx";
import { classifySheet, type SheetClassification } from "@/lib/intake/classify";
import { encodeCompactTable, toCompactTable, type CompactTable } from "@/lib/intake/compactTable";
import { buildRupturaModel, detectRupturaHeader } from "@/lib/ruptura/parse";
import type { RupturaModel } from "@/lib/ruptura/types";

export type IntakeWorkerRequest = { buffer: ArrayBuffer; fileName: string; fileBytes: number };

export interface IntakeWorkerSheet {
  sheetName: string;
  classification: SheetClassification;
  /** Linhas de dados (sem cabeçalho). */
  dataRows: number;
  /** Tabela compacta — ausente quando a aba não lembra nenhuma base. */
  table?: CompactTable;
  /** .omnib já codificado para o tipo detectado. */
  stored?: Uint8Array;
  ruptura?: RupturaModel;
}

export type IntakeWorkerResponse =
  | { type: "progress"; label: string; fraction: number | null }
  | { type: "done"; sheets: IntakeWorkerSheet[] }
  | { type: "error"; message: string };

const post = (message: IntakeWorkerResponse, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(message, transfer);

function buffersOf(table: CompactTable): ArrayBuffer[] {
  return table.columns.map((c) => (c.type === "num" ? c.values.buffer : c.codes.buffer) as ArrayBuffer);
}

self.onmessage = async (event: MessageEvent<IntakeWorkerRequest>) => {
  const { buffer, fileName, fileBytes } = event.data;
  try {
    post({ type: "progress", label: "Abrindo a planilha", fraction: null });
    const wb = XLSX.read(new Uint8Array(buffer), { type: "array", dense: true });
    const sheets: IntakeWorkerSheet[] = [];
    const transfer: Transferable[] = [];
    const total = wb.SheetNames.length;

    for (let i = 0; i < total; i++) {
      const sheetName = wb.SheetNames[i];
      post({ type: "progress", label: `Reconhecendo a aba "${sheetName}"`, fraction: i / total });
      const ws = wb.Sheets[sheetName];
      const rows = ws?.["!ref"]
        ? XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: false })
        : [];
      // Libera a aba do workbook assim que vira linhas: a Base One inteira
      // aberta ao mesmo tempo pesa mais de 1 GB.
      delete wb.Sheets[sheetName];

      const classification = classifySheet(rows);
      if (classification.candidates.length === 0) {
        sheets.push({ sheetName, classification, dataRows: rows.length });
        continue;
      }

      post({ type: "progress", label: `Convertendo a aba "${sheetName}"`, fraction: (i + 0.5) / total });
      const table = toCompactTable(rows, classification.headerRow);
      const sheet: IntakeWorkerSheet = { sheetName, classification, dataRows: table.rowCount, table };

      if (classification.kind) {
        sheet.stored = await encodeCompactTable(table, {
          kind: classification.kind,
          sourceName: fileName,
          sheetName,
          sourceBytes: fileBytes,
          createdAt: new Date().toISOString(),
        });
        transfer.push(sheet.stored.buffer as ArrayBuffer);
      }

      if (classification.kind === "ruptura") {
        post({ type: "progress", label: "Consolidando a ruptura por mês × loja × SKU", fraction: (i + 0.75) / total });
        const header = detectRupturaHeader(rows.slice(0, 30));
        if (!("error" in header)) {
          sheet.ruptura = buildRupturaModel(rows, header, { fileName, sheetName });
        }
      }
      transfer.push(...buffersOf(table));
      sheets.push(sheet);
    }
    post({ type: "done", sheets }, transfer);
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : "Falha ao ler a planilha." });
  }
};
