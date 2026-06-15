import { useRef, useState } from "react";
import JSZip from "jszip";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { FileUp, Loader2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface PptxSlide {
  index: number;
  numero: number;
  thumbnailDataUrl: string | null;
  titulo: string;
}

// ---------------------------------------------------------------------------
// PPTX parsing
// ---------------------------------------------------------------------------
async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result as string);
    reader.onerror = () => rej(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function parsePptxSlides(file: File): Promise<PptxSlide[]> {
  const zip = await JSZip.loadAsync(file);

  // Count slides
  const slideFiles = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)?.[0] ?? "0", 10);
      const nb = parseInt(b.match(/\d+/)?.[0] ?? "0", 10);
      return na - nb;
    });

  if (slideFiles.length === 0) {
    throw new Error("Nenhum slide encontrado no arquivo.");
  }

  // Try global cover thumbnail (docProps/ or ODP-style Thumbnails/)
  let coverDataUrl: string | null = null;
  for (const candidate of [
    "docProps/thumbnail.jpeg",
    "docProps/thumbnail.jpg",
    "docProps/thumbnail.png",
    "Thumbnails/thumbnail.png",
  ]) {
    const f = zip.files[candidate];
    if (f) {
      try {
        const blob = await f.async("blob");
        coverDataUrl = await blobToDataUrl(blob);
        break;
      } catch {}
    }
  }

  const slides: PptxSlide[] = [];

  for (let i = 0; i < slideFiles.length; i++) {
    const slideNum = i + 1;
    let thumbnailDataUrl: string | null = i === 0 ? coverDataUrl : null;

    // Try to extract first image from slide's .rels
    if (!thumbnailDataUrl) {
      const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`;
      const relsFile = zip.files[relsPath];
      if (relsFile) {
        try {
          const relsXml = await relsFile.async("text");
          const imgMatch = relsXml.match(/Target="\.\.\/media\/(image\d+\.[a-zA-Z]+)"/i);
          if (imgMatch) {
            const mediaPath = `ppt/media/${imgMatch[1]}`;
            const mediaFile = zip.files[mediaPath];
            if (mediaFile) {
              const blob = await mediaFile.async("blob");
              thumbnailDataUrl = await blobToDataUrl(blob);
            }
          }
        } catch {}
      }
    }

    slides.push({
      index: i,
      numero: slideNum,
      thumbnailDataUrl,
      titulo: `Slide ${slideNum}`,
    });
  }

  return slides;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface ImportPptxDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (slides: PptxSlide[], selectedIndices: number[]) => void;
}

export function ImportPptxDialog({ open, onOpenChange, onImport }: ImportPptxDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [slides, setSlides] = useState<PptxSlide[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [draggingOver, setDraggingOver] = useState(false);

  const reset = () => {
    setSlides(null);
    setLoading(false);
    setError(null);
    setSelected(new Set());
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const processFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pptx")) {
      setError("Selecione um arquivo .pptx válido.");
      return;
    }
    setLoading(true);
    setError(null);
    setSlides(null);
    try {
      const result = await parsePptxSlides(file);
      setSlides(result);
      setSelected(new Set(result.map((s) => s.index)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao ler o arquivo.");
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const toggleSlide = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(slides?.map((s) => s.index) ?? []));
  const clearAll = () => setSelected(new Set());

  const handleImport = () => {
    if (!slides || selected.size === 0) return;
    onImport(slides, Array.from(selected).sort((a, b) => a - b));
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[85vh] max-w-4xl flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border/40 px-6 py-4">
          <DialogTitle className="text-base">Importar slides do PowerPoint</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Os slides são importados como imagens. Elementos do PowerPoint não são editáveis
            individualmente — use como referência visual ou fundo de slide.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          {/* Estado 1: aguardando arquivo */}
          {!loading && !slides && (
            <div
              className={[
                "flex cursor-pointer flex-col items-center gap-4 rounded-xl border-2 border-dashed p-12 transition-all",
                draggingOver
                  ? "border-primary/60 bg-primary/10"
                  : "border-border/40 hover:border-primary/40 hover:bg-primary/5",
              ].join(" ")}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDraggingOver(true); }}
              onDragLeave={() => setDraggingOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDraggingOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) processFile(file);
              }}
            >
              <FileUp className="h-12 w-12 text-muted-foreground/50" />
              <p className="text-center text-sm text-muted-foreground">
                Arraste um arquivo .pptx ou clique para selecionar
              </p>
              <input
                ref={inputRef}
                type="file"
                accept=".pptx"
                className="hidden"
                onChange={handleFileSelect}
              />
              <Button variant="outline" onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>
                Selecionar arquivo
              </Button>
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
          )}

          {/* Estado 2: carregando */}
          {loading && (
            <div className="flex flex-col items-center gap-3 py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Lendo apresentação...</p>
            </div>
          )}

          {/* Estado 3: slides carregados */}
          {slides && !loading && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{selected.size}</span> de{" "}
                  <span className="font-medium text-foreground">{slides.length}</span> slides selecionados
                </p>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAll}>
                    Selecionar todos
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearAll}>
                    Limpar seleção
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={reset}>
                    Trocar arquivo
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {slides.map((slide) => {
                  const isSel = selected.has(slide.index);
                  return (
                    <div
                      key={slide.index}
                      className={[
                        "relative cursor-pointer overflow-hidden rounded-lg border-2 transition-all",
                        isSel
                          ? "border-primary shadow-sm shadow-primary/20"
                          : "border-border/40 hover:border-border",
                      ].join(" ")}
                      onClick={() => toggleSlide(slide.index)}
                    >
                      {/* Thumbnail */}
                      <div className="aspect-video bg-muted/30">
                        {slide.thumbnailDataUrl ? (
                          <img
                            src={slide.thumbnailDataUrl}
                            alt={slide.titulo}
                            className="h-full w-full object-cover"
                            draggable={false}
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <span className="text-xs font-medium text-muted-foreground">
                              {slide.titulo}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Checkbox (top-left) */}
                      <div
                        className="absolute left-2 top-2"
                        onClick={(e) => { e.stopPropagation(); toggleSlide(slide.index); }}
                      >
                        <Checkbox
                          checked={isSel}
                          className="h-4 w-4 border-white/80 bg-white/90 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        />
                      </div>

                      {/* Badge (bottom) */}
                      <div className="absolute bottom-0 left-0 right-0 bg-black/40 px-2 py-1">
                        <span className="text-[10px] font-medium text-white">{slide.titulo}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="border-t border-border/40 px-6 py-3">
          <Button variant="ghost" onClick={() => handleClose(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!slides || selected.size === 0}
            onClick={handleImport}
          >
            Importar {selected.size > 0 ? `${selected.size} slide${selected.size > 1 ? "s" : ""}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
