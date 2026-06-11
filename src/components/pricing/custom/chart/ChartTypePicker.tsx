// Visual chart type picker — pinned at top of the inspector panel.
// Scrollable horizontal row of icon tiles, grouped by family.

import type { ChartBlock } from "@/lib/customSlide";
import {
  LineChart, AreaChart, BarChart3, BarChartHorizontal,
  PieChart, Donut, ScatterChart, Circle, Filter,
  Hexagon, Radar, BarChart, Layers, ChevronsRight,
  ChartNoAxesColumn, AlignJustify, BoxSelect,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type CT = ChartBlock["chartType"];
type Item = { value: CT; label: string; icon: React.ReactNode };

const GROUPS: Item[][] = [
  [
    { value: "line", label: "Linha", icon: <LineChart className="h-4 w-4" /> },
    { value: "area", label: "Área", icon: <AreaChart className="h-4 w-4" /> },
    { value: "stackedArea", label: "Área empilhada", icon: <Layers className="h-4 w-4" /> },
    { value: "combo", label: "Combo", icon: <BarChart className="h-4 w-4" /> },
  ],
  [
    { value: "bar", label: "Coluna", icon: <BarChart3 className="h-4 w-4" /> },
    { value: "column", label: "Coluna agrupada", icon: <BarChart3 className="h-4 w-4" /> },
    { value: "stackedColumn", label: "Coluna empilhada", icon: <ChartNoAxesColumn className="h-4 w-4" /> },
    { value: "hbar", label: "Barra", icon: <BarChartHorizontal className="h-4 w-4" /> },
    { value: "stackedBar", label: "Barra empilhada", icon: <AlignJustify className="h-4 w-4" /> },
  ],
  [
    { value: "pie", label: "Pizza", icon: <PieChart className="h-4 w-4" /> },
    { value: "donut", label: "Rosca", icon: <Donut className="h-4 w-4" /> },
    { value: "funnel", label: "Funil", icon: <Filter className="h-4 w-4" /> },
    { value: "treemap", label: "Mapa de árvore", icon: <Hexagon className="h-4 w-4" /> },
  ],
  [
    { value: "scatter", label: "Dispersão", icon: <ScatterChart className="h-4 w-4" /> },
    { value: "bubble", label: "Bolha", icon: <Circle className="h-4 w-4" /> },
  ],
  [
    { value: "waterfall", label: "Waterfall", icon: <ChevronsRight className="h-4 w-4" /> },
    { value: "radar", label: "Radar", icon: <Radar className="h-4 w-4" /> },
    { value: "histogram", label: "Histograma", icon: <BarChart className="h-4 w-4" /> },
    { value: "boxplot", label: "Caixa", icon: <BoxSelect className="h-4 w-4" /> },
  ],
];

export function ChartTypePicker({
  value, onChange,
}: { value: CT; onChange: (v: CT) => void }) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {GROUPS.map((group, gi) => (
          <div key={gi} className="flex items-center gap-1">
            {gi > 0 && <div className="mx-1 h-5 w-px bg-border/60" aria-hidden />}
            {group.map((it) => (
              <Tooltip key={it.value}>
                <TooltipTrigger asChild>
                  <button type="button"
                    onClick={() => onChange(it.value)}
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors",
                      value === it.value
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                    )}>
                    {it.icon}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[11px]">{it.label}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
}
