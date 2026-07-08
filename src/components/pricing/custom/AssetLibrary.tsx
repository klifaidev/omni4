// AssetLibrary — biblioteca persistida de assets de imagem reutilizáveis.
// Exibida em um Dialog acionado pelo editor de slides.
import { useMemo, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, Trash2, Plus, Image as ImageIcon, Layers, Search } from "lucide-react";
import { toast } from "sonner";
import {
  useAllSlideAssets, useSlideAssets,
  type AssetCategory, type SlideAsset,
} from "@/lib/slideAssets";
import { cn } from "@/lib/utils";
import {
  addBlockAction, patchBlockAction, setSelection,
  setBackgroundImageAction,
} from "./editorStore";
import type { CustomBlock } from "@/lib/customSlide";

const CATEGORY_TABS: { id: AssetCategory; label: string }[] = [
  { id: "logo", label: "Logos" },
  { id: "background", label: "Fundos" },
  { id: "icon", label: "Ícones" },
  { id: "other", label: "Outros" },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function AssetLibrary({ open, onOpenChange }: Props) {
  const [tab, setTab] = useState<AssetCategory>("logo");
  const [query, setQuery] = useState("");
  const all = useAllSlideAssets();
  const inputRef = useRef<HTMLInputElement>(null);
  const addAsset = useSlideAssets((s) => s.addAsset);

  const normalizedQuery = query.trim().toLowerCase();
  const list = useMemo(
    () => all.filter((a) => {
      const matchesTab = a.category === tab;
      const matchesQuery = !normalizedQuery || `${a.name} ${a.category}`.toLowerCase().includes(normalizedQuery);
      return matchesTab && matchesQuery;
    }),
    [all, normalizedQuery, tab],
  );

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (const f of Array.from(files)) {
      // eslint-disable-next-line no-await-in-loop
      await addAsset(f, tab);
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  const insertAsImageBlock = (asset: SlideAsset) => {
    const id = addBlockAction("image");
    if (!id) return;
    patchBlockAction(
      id,
      { src: asset.src, w: 360, h: 220, x: 487, y: 265 } as Partial<CustomBlock>,
      "Alterar dados",
    );
    setSelection([id]);
    toast.success(`"${asset.name}" inserido no slide.`);
    onOpenChange(false);
  };

  const setAsBackground = (asset: SlideAsset) => {
    setBackgroundImageAction(asset.src);
    toast.success("Fundo do slide atualizado.");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[720px] p-0 gap-0">
        <DialogHeader className="border-b border-border/40 px-5 py-3">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <ImageIcon className="h-4 w-4" /> Biblioteca de assets
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 px-5 pb-5 pt-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar assets..."
              className="h-9 pl-8 text-sm"
            />
          </div>
          <Button
            size="lg"
            className="h-12 w-full justify-start gap-3 rounded-lg"
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            <span className="flex flex-col items-start leading-tight">
              <span className="text-sm font-semibold">Adicionar asset</span>
              <span className="text-[11px] font-normal opacity-80">Faça upload de logos, fundos, icones e imagens.</span>
            </span>
          </Button>
          <Tabs value={tab} onValueChange={(v) => setTab(v as AssetCategory)}>
            <div className="flex items-center justify-between gap-2">
              <TabsList className="h-8">
                {CATEGORY_TABS.map((c) => (
                  <TabsTrigger key={c.id} value={c.id} className="h-7 text-xs">
                    {c.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              <Button size="sm" variant="outline" className="h-8 gap-1.5"
                onClick={() => inputRef.current?.click()}>
                <Upload className="h-3.5 w-3.5" /> Upload
              </Button>
              <input
                ref={inputRef} type="file" accept="image/*" multiple hidden
                onChange={(e) => handleUpload(e.target.files)}
              />
            </div>

            {CATEGORY_TABS.map((c) => (
              <TabsContent key={c.id} value={c.id} className="mt-3">
                <ScrollArea className="h-[420px] pr-2">
                  {list.length === 0 ? (
                    <EmptyState onUpload={() => inputRef.current?.click()} />
                  ) : (
                    <div className="grid grid-cols-3 gap-3">
                      {list.map((a) => (
                        <AssetCard
                          key={a.id} asset={a}
                          onInsert={() => insertAsImageBlock(a)}
                          onSetBackground={
                            a.category === "background"
                              ? () => setAsBackground(a)
                              : undefined
                          }
                        />
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="flex h-[300px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 text-center">
      <Layers className="h-8 w-8 text-muted-foreground/50" />
      <p className="text-xs text-muted-foreground">Nenhum asset nesta categoria.</p>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={onUpload}>
        <Plus className="h-3.5 w-3.5" /> Adicionar
      </Button>
    </div>
  );
}

function AssetCard({
  asset, onInsert, onSetBackground,
}: {
  asset: SlideAsset;
  onInsert: () => void;
  onSetBackground?: () => void;
}) {
  const remove = useSlideAssets((s) => s.removeAsset);

  return (
    <div className="group relative overflow-hidden rounded-lg border border-border/60 bg-card">
      <div
        className="flex aspect-[16/10] items-center justify-center bg-secondary/30 p-2"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("application/x-slide-asset", asset.src);
          e.dataTransfer.effectAllowed = "copy";
        }}
      >
        <img
          src={asset.src} alt={asset.name}
          className="max-h-full max-w-full object-contain"
          draggable={false}
        />
      </div>
      <div className="flex items-center justify-between gap-1 border-t border-border/40 px-2 py-1.5">
        <span className="truncate text-[11px]" title={asset.name}>{asset.name}</span>
        {asset.builtIn && <Badge variant="secondary" className="h-4 px-1 text-[9px]">Built-in</Badge>}
      </div>
      <div className={cn(
        "absolute inset-x-0 top-0 flex items-center justify-end gap-1 bg-gradient-to-b from-background/90 to-transparent p-1.5 opacity-0 transition group-hover:opacity-100",
      )}>
        <Button size="sm" variant="default" className="h-6 px-2 text-[10px]"
          onClick={onInsert}>
          Usar
        </Button>
        {onSetBackground && (
          <Button size="sm" variant="secondary" className="h-6 px-2 text-[10px]"
            onClick={onSetBackground}>
            Fundo
          </Button>
        )}
        {!asset.builtIn && (
          <Button size="icon" variant="destructive" className="h-6 w-6"
            onClick={() => remove(asset.id)} title="Excluir">
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}
