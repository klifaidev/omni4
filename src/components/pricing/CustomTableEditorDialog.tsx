import { Fragment, useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { CustomCellValue, CustomTable } from "@/store/customTables";
import { normalizeCustomTable } from "@/store/customTables";
import { cn } from "@/lib/utils";

type CellCoord = { row: number; col: number };

interface CustomTableEditorDialogProps {
  open: boolean;
  table: CustomTable | null;
  onOpenChange: (open: boolean) => void;
  onSave: (table: CustomTable) => void;
}

function columnName(index: number) {
  let value = "";
  let n = index + 1;
  while (n > 0) {
    const mod = (n - 1) % 26;
    value = String.fromCharCode(65 + mod) + value;
    n = Math.floor((n - mod) / 26);
  }
  return value;
}

function parseBrazilianNumber(value: string): string | number {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const compact = trimmed.replace(/\s/g, "");
  const brNumber = /^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(compact);
  const plainNumber = /^-?\d+([.,]\d+)?$/.test(compact);
  if (!brNumber && !plainNumber) return trimmed;
  const normalized = compact.includes(",")
    ? compact.replace(/\./g, "").replace(",", ".")
    : compact;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : trimmed;
}

function displayValue(value: CustomCellValue) {
  return typeof value === "number" ? String(value).replace(".", ",") : value;
}

function ensureSize(table: CustomTable, minRows: number, minCols: number): CustomTable {
  const cols = Math.max(minCols, table.columns.length);
  const rows = Math.max(minRows, table.rows.length);
  return normalizeCustomTable({
    ...table,
    columns: Array.from({ length: cols }, (_, index) => table.columns[index] ?? `Coluna ${index + 1}`),
    rows: Array.from({ length: rows }, (_, rowIndex) => (
      Array.from({ length: cols }, (_, colIndex) => table.rows[rowIndex]?.[colIndex] ?? "")
    )),
  });
}

export function CustomTableEditorDialog({ open, table, onOpenChange, onSave }: CustomTableEditorDialogProps) {
  const [draft, setDraft] = useState<CustomTable | null>(null);
  const [active, setActive] = useState<CellCoord>({ row: 0, col: 0 });
  const inputRefs = useRef(new Map<string, HTMLInputElement>());

  useEffect(() => {
    if (open && table) {
      setDraft(ensureSize(table, 8, 3));
      setActive({ row: 0, col: 0 });
    }
  }, [open, table]);

  const stats = useMemo(() => {
    if (!draft) return { filledRows: 0, filledCells: 0 };
    let filledCells = 0;
    let filledRows = 0;
    for (const row of draft.rows) {
      const hasData = row.some((cell) => String(cell ?? "").trim() !== "");
      if (hasData) filledRows++;
      filledCells += row.filter((cell) => String(cell ?? "").trim() !== "").length;
    }
    return { filledRows, filledCells };
  }, [draft]);

  if (!draft) return null;

  const focusCell = (row: number, col: number) => {
    const nextRow = Math.max(0, Math.min(row, draft.rows.length - 1));
    const nextCol = Math.max(0, Math.min(col, draft.columns.length - 1));
    setActive({ row: nextRow, col: nextCol });
    window.setTimeout(() => inputRefs.current.get(`${nextRow}:${nextCol}`)?.focus(), 0);
  };

  const updateCell = (row: number, col: number, value: CustomCellValue) => {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        rows: current.rows.map((line, rowIndex) => (
          rowIndex === row ? line.map((cell, colIndex) => (colIndex === col ? value : cell)) : line
        )),
      };
    });
  };

  const updateHeader = (col: number, value: string) => {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        columns: current.columns.map((header, index) => (index === col ? value : header)),
      };
    });
  };

  const addRow = () => {
    setDraft((current) => current && ({
      ...current,
      rows: [...current.rows, Array.from({ length: current.columns.length }, () => "")],
    }));
  };

  const addColumn = () => {
    setDraft((current) => current && ({
      ...current,
      columns: [...current.columns, `Coluna ${current.columns.length + 1}`],
      rows: current.rows.map((row) => [...row, ""]),
    }));
  };

  const removeRow = (row: number) => {
    setDraft((current) => {
      if (!current || current.rows.length <= 1) return current;
      return { ...current, rows: current.rows.filter((_, index) => index !== row) };
    });
  };

  const removeColumn = (col: number) => {
    setDraft((current) => {
      if (!current || current.columns.length <= 1) return current;
      return {
        ...current,
        columns: current.columns.filter((_, index) => index !== col),
        rows: current.rows.map((row) => row.filter((_, index) => index !== col)),
      };
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>, row: number, col: number) => {
    if (event.key === "Tab") {
      event.preventDefault();
      focusCell(row, col + (event.shiftKey ? -1 : 1));
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      focusCell(row + 1, col);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusCell(row - 1, col);
    } else if (event.key === "ArrowRight" && event.currentTarget.selectionStart === event.currentTarget.value.length) {
      focusCell(row, col + 1);
    } else if (event.key === "ArrowLeft" && event.currentTarget.selectionStart === 0) {
      focusCell(row, col - 1);
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>, startRow: number, startCol: number) => {
    const text = event.clipboardData.getData("text/plain");
    if (!text.includes("\t") && !text.includes("\n")) return;
    event.preventDefault();
    const pasted = text.replace(/\r/g, "").split("\n").filter((line, index, arr) => line !== "" || index < arr.length - 1)
      .map((line) => line.split("\t").map(parseBrazilianNumber));
    const rowCount = startRow + pasted.length;
    const colCount = startCol + Math.max(...pasted.map((row) => row.length));
    setDraft((current) => {
      if (!current) return current;
      const expanded = ensureSize(current, rowCount, colCount);
      const rows = expanded.rows.map((row) => [...row]);
      pasted.forEach((line, rowOffset) => {
        line.forEach((cell, colOffset) => {
          rows[startRow + rowOffset][startCol + colOffset] = cell;
        });
      });
      return { ...expanded, rows };
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] max-w-[96vw] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border/50 px-6 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <DialogTitle>Base personalizada</DialogTitle>
              <DialogDescription>
                Cole uma seleção do Excel ou edite célula por célula. Esta tabela é livre e não altera os filtros globais.
              </DialogDescription>
            </div>
            <div className="flex min-w-[260px] flex-col gap-1">
              <label className="text-[11px] font-medium uppercase text-muted-foreground">Nome da tabela</label>
              <Input
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                className="h-9"
              />
            </div>
          </div>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 border-b border-border/40 px-6 py-3">
          <div className="text-xs text-muted-foreground">
            {draft.columns.length} coluna(s) · {draft.rows.length} linha(s) · {stats.filledCells} célula(s) preenchida(s)
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-2" onClick={addRow}>
              <Plus className="h-4 w-4" /> Linha
            </Button>
            <Button size="sm" variant="outline" className="gap-2" onClick={addColumn}>
              <Plus className="h-4 w-4" /> Coluna
            </Button>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1 bg-muted/20">
          <div className="min-w-max p-5">
            <div
              className="grid overflow-hidden rounded-xl border border-border/60 bg-background shadow-sm"
              style={{ gridTemplateColumns: `48px repeat(${draft.columns.length}, minmax(150px, 1fr)) 44px` }}
            >
              <div className="sticky left-0 top-0 z-20 border-b border-r border-border/60 bg-muted/80" />
              {draft.columns.map((header, colIndex) => (
                <div key={colIndex} className="group sticky top-0 z-10 border-b border-r border-border/60 bg-muted/80 p-1">
                  <div className="mb-1 flex items-center justify-between px-1 text-[10px] font-semibold text-muted-foreground">
                    <span>{columnName(colIndex)}</span>
                    <button
                      type="button"
                      className="rounded p-0.5 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                      onClick={() => removeColumn(colIndex)}
                      aria-label={`Remover coluna ${columnName(colIndex)}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <Input
                    value={header}
                    onChange={(event) => updateHeader(colIndex, event.target.value)}
                    className="h-8 border-border/50 bg-background px-2 text-xs font-semibold"
                  />
                </div>
              ))}
              <div className="sticky right-0 top-0 z-20 border-b border-border/60 bg-muted/80" />

              {draft.rows.map((row, rowIndex) => (
                <Fragment key={rowIndex}>
                  <div key={`row-${rowIndex}`} className="sticky left-0 z-10 flex items-center justify-center border-b border-r border-border/50 bg-muted/70 text-[11px] font-medium text-muted-foreground">
                    {rowIndex + 1}
                  </div>
                  {row.map((cell, colIndex) => (
                    <div key={`${rowIndex}:${colIndex}`} className="border-b border-r border-border/40 bg-background">
                      <input
                        ref={(node) => {
                          const key = `${rowIndex}:${colIndex}`;
                          if (node) inputRefs.current.set(key, node);
                          else inputRefs.current.delete(key);
                        }}
                        value={displayValue(cell)}
                        onFocus={() => setActive({ row: rowIndex, col: colIndex })}
                        onChange={(event) => updateCell(rowIndex, colIndex, event.target.value)}
                        onBlur={(event) => updateCell(rowIndex, colIndex, parseBrazilianNumber(event.target.value))}
                        onPaste={(event) => handlePaste(event, rowIndex, colIndex)}
                        onKeyDown={(event) => handleKeyDown(event, rowIndex, colIndex)}
                        className={cn(
                          "h-9 w-full bg-transparent px-2 text-sm outline-none transition-colors",
                          active.row === rowIndex && active.col === colIndex && "bg-primary/10 ring-1 ring-inset ring-primary/50",
                        )}
                      />
                    </div>
                  ))}
                  <div key={`remove-${rowIndex}`} className="sticky right-0 flex items-center justify-center border-b border-border/40 bg-muted/60">
                    <button
                      type="button"
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => removeRow(rowIndex)}
                      aria-label={`Remover linha ${rowIndex + 1}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </Fragment>
              ))}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="border-t border-border/50 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => {
              onSave(normalizeCustomTable({ ...draft, updatedAt: new Date().toISOString() }));
              onOpenChange(false);
            }}
          >
            Salvar tabela
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
