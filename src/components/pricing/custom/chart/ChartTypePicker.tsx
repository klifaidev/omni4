// Visual chart type picker — pinned at top of the inspector panel.
// Main types always visible; advanced types revealed via toggle.

import { useState } from "react";
import type { ChartBlock } from "@/lib/customSlide";
import {
  LineChart, AreaChart, BarChart3, BarChartHorizontal,
  PieChart, Donut, ScatterChart, Circle, Filter,
  Hexagon, Radar, BarChart, BarChart2, Layers, ChevronsRight,
  ChartNoAxesColumn, AlignJustify, BoxSelect, LayoutList, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type CT = ChartBlock["chartType"];
type Item = { value: CT; label: string; icon: React.ReactNode };

const MAIN_TYPES: Item[] = [
  { value: "line",      label: "Linha",            icon: <LineChart className="h-4 w-4" /> },
  { value: "bar",       label: "Coluna",            icon: <BarChart3 className="h-4 w-4" /> },
  { value: "hbar",      label: "Barra horizontal",  icon: <BarChartHorizontal className="h-4 w-4" /> },
  { value: "area",      label: "Área",              icon: <AreaChart className="h-4 w-4" /> },
  { value: "pie",       label: "Pizza",             icon: <PieChart className="h-4 w-4" /> },
  { value: "donut",     label: "Rosca",             icon: <Donut className="h-4 w-4" /> },
  { value: "waterfall", label: "Waterfall",         icon: <ChevronsRight className="h-4 w-4" /> },
  { value: "combo",     label: "Combo",             icon: <BarChart className="h-4 w-4" /> },
];

const ADVANCED_TYPES: Item[] = [
  { value: "stackedArea",   label: "Área empilhada",   icon: <Layers className="h-4 w-4" /> },
  { value: "column",        label: "Coluna agrupada",  icon: <ChartNoAxesColumn className="h-4 w-4" /> },
  { value: "stackedColumn", label: "Coluna empilhada", icon: <LayoutList className="h-4 w-4" /> },
  { value: "stackedBar",    label: "Barra empilhada",  icon: <AlignJustify className="h-4 w-4" /> },
  { value: "bubble",        label: "Bolha",            icon: <Circle className="h-4 w-4" /> },
  { value: "scatter",       label: "Dispersão",        icon: <ScatterChart className="h-4 w-4" /> },
  { value: "funnel",        label: "Funil",            icon: <Filter className="h-4 w-4" /> },
  { value: "treemap",       label: "Mapa de árvore",   icon: <Hexagon className="h-4 w-4" /> },
  { value: "radar",         label: "Radar",            icon: <Radar className="h-4 w-4" /> },
  { value: "histogram",     label: "Histograma",       icon: <BarChart2 className="h-4 w-4" /> },
  { value: "boxplot",       label: "Caixa (Box)",      icon: <BoxSelect className="h-4 w-4" /> },
];

function TypeButton({ item, selected, onChange }: { item: Item; selected: boolean; onChange: (v: CT) => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onChange(item.value)}
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors",
            selected
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground",
          )}
        >
          {item.icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-[11px]">{item.label}</TooltipContent>
    </Tooltip>
  );
}

export function ChartTypePicker({
  value, onChange,
}: { value: CT; onChange: (v: CT) => void }) {
  const [showAdvanced, setShowAdvanced] = useState(
    () => ADVANCED_TYPES.some((t) => t.value === value),
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-1">
        {/* Main types — always visible */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {MAIN_TYPES.map((it) => (
            <TypeButton key={it.value} item={it} selected={value === it.value} onChange={onChange} />
          ))}
        </div>

        {/* Toggle button */}
        <button
          type="button"
          onClick={() => setShowAdvanced((s) => !s)}
          className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronDown className={cn("h-3 w-3 transition-transform", showAdvanced && "rotate-180")} />
          {showAdvanced ? "Menos tipos" : "Mais tipos"}
        </button>

        {/* Advanced types — collapsible */}
        {showAdvanced && (
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {ADVANCED_TYPES.map((it) => (
              <TypeButton key={it.value} item={it} selected={value === it.value} onChange={onChange} />
            ))}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
