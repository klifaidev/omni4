import { useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePricing } from "@/store/pricing";
import { useMonthsInfo } from "@/store/selectors";
import { useBookmarks, matchesCurrent } from "@/store/bookmarks";
import { PAGE_LABELS, NON_HISTORY_PATHS } from "@/lib/pageMeta";
import { cn } from "@/lib/utils";

function buildSummary(
  filters: Record<string, string[] | undefined>,
  selectedPeriods: string[] | null,
  months: { periodo: string; label: string }[],
): string {
  const parts: string[] = [];
  const filterEntries = Object.entries(filters).filter(([, v]) => v && v.length > 0);
  for (const [key, vals] of filterEntries.slice(0, 2)) {
    const list = vals as string[];
    parts.push(list.length === 1 ? list[0] : `${list[0]} +${list.length - 1}`);
  }
  if (selectedPeriods && selectedPeriods.length > 0) {
    const labels = selectedPeriods
      .map((p) => months.find((m) => m.periodo === p)?.label ?? p)
      .slice(0, 2);
    parts.push(
      selectedPeriods.length > 2 ? `${labels.join(", ")} +${selectedPeriods.length - 2}` : labels.join(", "),
    );
  }
  return parts.join(" · ");
}

export function BookmarkButton() {
  const { pathname } = useLocation();
  const filters = usePricing((s) => s.filters);
  const selectedPeriods = usePricing((s) => s.selectedPeriods);
  const months = useMonthsInfo();
  const bookmarks = useBookmarks((s) => s.bookmarks);
  const addBookmark = useBookmarks((s) => s.addBookmark);
  const removeBookmark = useBookmarks((s) => s.removeBookmark);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const pageMeta = PAGE_LABELS[pathname];
  const eligible = !!pageMeta && !NON_HISTORY_PATHS.has(pathname);

  const existing = useMemo(
    () => bookmarks.find((b) => matchesCurrent(b, pathname, filters, selectedPeriods)),
    [bookmarks, pathname, filters, selectedPeriods],
  );

  useEffect(() => {
    if (!open) return;
    const summary = buildSummary(filters, selectedPeriods, months);
    setName(summary ? `${pageMeta?.label} — ${summary}` : pageMeta?.label ?? "Análise");
  }, [open, pageMeta, filters, selectedPeriods, months]);

  if (!eligible) return null;

  if (existing) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 text-amber-400 hover:text-amber-300"
        onClick={() => {
          removeBookmark(existing.id);
          toast.success("Favorito removido.");
        }}
        title="Remover dos favoritos"
        aria-label="Remover dos favoritos"
      >
        <Star className="h-4 w-4 fill-current" />
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-9 w-9 text-muted-foreground hover:text-amber-300")}
          title="Salvar como favorito"
          aria-label="Salvar como favorito"
        >
          <Star className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <div>
          <div className="text-xs font-medium text-foreground">Salvar análise</div>
          <p className="text-[11px] text-muted-foreground">
            Nomeie esta combinação de página, filtros e período.
          </p>
        </div>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do favorito"
          className="h-9 text-sm"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSave();
            }
          }}
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!name.trim()}>
            Salvar favorito
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );

  function handleSave() {
    addBookmark(name.trim() || pageMeta?.label || "Análise", pathname, filters, selectedPeriods);
    toast.success("Favorito salvo.");
    setOpen(false);
  }
}
