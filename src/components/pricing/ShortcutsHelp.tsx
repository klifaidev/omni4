import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const SHORTCUTS: Array<{ keys: string; label: string }> = [
  { keys: "G H", label: "Ir para Home" },
  { keys: "G V", label: "Visão Geral" },
  { keys: "G B", label: "Bridge PVM" },
  { keys: "G D", label: "DRE" },
  { keys: "G C", label: "Canais" },
  { keys: "G P", label: "Portfólio de SKUs" },
  { keys: "G U", label: "Budget" },
  { keys: "G S", label: "Slides" },
  { keys: "G F", label: "Focar nos filtros" },
  { keys: "Ctrl + K", label: "Busca global" },
  { keys: "Esc", label: "Limpar filtros" },
  { keys: "?", label: "Mostrar esta ajuda" },
];

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded border border-border/60 bg-secondary/60 px-1.5 font-mono text-[11px] font-medium text-foreground">
      {children}
    </kbd>
  );
}

export function ShortcutsHelp({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Atalhos de teclado</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {SHORTCUTS.map((s) => (
            <div
              key={s.keys}
              className="flex items-center justify-between gap-3 rounded-md border border-border/40 bg-secondary/20 px-3 py-2"
            >
              <span className="text-sm text-foreground/90">{s.label}</span>
              <div className="flex shrink-0 items-center gap-1">
                {s.keys.split(" ").map((k, i) => (
                  <Kbd key={i}>{k}</Kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Atalhos ficam inativos quando você está digitando em um campo de texto.
        </p>
      </DialogContent>
    </Dialog>
  );
}
