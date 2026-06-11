import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandItem,
  CommandGroup,
  CommandEmpty,
  CommandSeparator,
} from "@/components/ui/command";
import {
  CornerDownRight,
  Package,
  Network,
  Tag,
  Zap,
  Trash2,
  Database,
  KanbanSquare,
  Presentation,
} from "lucide-react";
import { usePricing } from "@/store/pricing";
import { useBudget } from "@/store/budget";
import { generateDemoData } from "@/lib/demoData";
import { PAGE_LABELS } from "@/lib/pageMeta";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const NAV_ITEMS: { path: string; label: string }[] = [
  { path: "/", label: "Início" },
  { path: "/visao-geral", label: "Visão Geral" },
  { path: "/bridge-pvm", label: "Bridge PVM" },
  { path: "/dre", label: "DRE" },
  { path: "/canais", label: "Canais" },
  { path: "/custos", label: "Custos" },
  { path: "/abc", label: "Portfólio de SKUs" },
  { path: "/budget", label: "Budget" },
  { path: "/detalhe", label: "Tabela Dinâmica" },
  { path: "/slides", label: "Slides" },
  { path: "/atividades", label: "Atividades" },
  { path: "/upload", label: "Upload" },
];

export function CommandPalette({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const rows = usePricing((s) => s.rows);
  const setFilter = usePricing((s) => s.setFilter);
  const clearFilters = usePricing((s) => s.clearFilters);
  const setAllPeriods = usePricing((s) => s.setAllPeriods);
  const clearAll = usePricing((s) => s.clearAll);
  const addParsed = usePricing((s) => s.addParsed);
  const setDemoMode = usePricing((s) => s.setDemoMode);
  const clearBudget = useBudget((s) => s.clearBudget);
  const addBudget = useBudget((s) => s.addBudget);

  const { skus, canais, marcas } = useMemo(() => {
    const sk = new Set<string>();
    const ca = new Set<string>();
    const ma = new Set<string>();
    for (const r of rows) {
      if (r.skuDesc) sk.add(r.skuDesc);
      if (r.canal) ca.add(r.canal);
      if (r.marca) ma.add(r.marca);
    }
    return {
      skus: Array.from(sk).sort().slice(0, 200),
      canais: Array.from(ca).sort(),
      marcas: Array.from(ma).sort(),
    };
  }, [rows]);

  const run = (fn: () => void) => {
    fn();
    onOpenChange(false);
  };

  const go = (path: string) => run(() => navigate(path));

  const filterAndGo = (key: "sku" | "canal" | "marca", value: string) =>
    run(() => {
      setFilter(key, [value]);
      navigate("/visao-geral");
    });

  const handleLoadDemo = () =>
    run(() => {
      clearAll();
      clearBudget();
      const demo = generateDemoData();
      addParsed(demo.realRows, demo.realFile, true, {
        skus: [],
        canais: [],
        regioes: [],
        ufs: [],
      });
      addBudget(demo.budgetRows, demo.budgetFile, true);
      setDemoMode(true);
      toast.success("Dados de demonstração carregados");
      navigate("/visao-geral");
    });

  const handleClearFilters = () =>
    run(() => {
      clearFilters();
      setAllPeriods();
      toast.info("Filtros limpos");
    });

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Buscar páginas, SKUs, canais, marcas ou ações…" />
      <CommandList>
        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>

        <CommandGroup heading="Navegar">
          {NAV_ITEMS.map((item) => {
            const Icon = PAGE_LABELS[item.path]?.icon ?? CornerDownRight;
            return (
              <CommandItem
                key={item.path}
                value={`nav ${item.label} ${item.path}`}
                onSelect={() => go(item.path)}
              >
                <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>{item.label}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">{item.path}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>

        {skus.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Filtrar por SKU">
              {skus.map((sku) => (
                <CommandItem
                  key={`sku-${sku}`}
                  value={`sku ${sku}`}
                  onSelect={() => filterAndGo("sku", sku)}
                >
                  <Package className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{sku}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {canais.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Filtrar por Canal">
              {canais.map((canal) => (
                <CommandItem
                  key={`canal-${canal}`}
                  value={`canal ${canal}`}
                  onSelect={() => filterAndGo("canal", canal)}
                >
                  <Network className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{canal}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {marcas.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Filtrar por Marca">
              {marcas.map((marca) => (
                <CommandItem
                  key={`marca-${marca}`}
                  value={`marca ${marca}`}
                  onSelect={() => filterAndGo("marca", marca)}
                >
                  <Tag className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{marca}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Ações">
          <CommandItem value="acao limpar filtros" onSelect={handleClearFilters}>
            <Trash2 className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Limpar todos os filtros</span>
          </CommandItem>
          <CommandItem value="acao carregar dados demo" onSelect={handleLoadDemo}>
            <Database className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Carregar dados demo</span>
          </CommandItem>
          <CommandItem value="acao nova atividade" onSelect={() => go("/atividades")}>
            <KanbanSquare className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Nova atividade</span>
          </CommandItem>
          <CommandItem value="acao nova apresentacao" onSelect={() => go("/slides")}>
            <Presentation className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Nova apresentação</span>
          </CommandItem>
          <CommandItem value="acao zap" className="hidden">
            <Zap className="mr-2 h-4 w-4" />
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
