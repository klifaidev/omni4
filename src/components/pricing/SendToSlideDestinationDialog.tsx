import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, FilePlus2, Lock, Presentation, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScaledPreview, warmSlideThumbnail } from "@/components/pricing/SlidePreview";
import {
  SEND_TO_SLIDE_EVENT,
  type SendToSlidePayload,
} from "@/lib/sendToSlide";
import {
  buildCustomBlockFromPayload,
  buildNativeSlideConfigFromPayload,
  canApplySendToSlideToExistingSlide,
  nativeSlideKindForPayload,
  sendToSlideCreatesNativeSlide,
} from "@/lib/sendToSlideInsert";
import { useSlidesFlow } from "@/store/slidesFlow";
import type { SlideItem } from "@/lib/slidesFlow";
import { cn } from "@/lib/utils";

type Destination = "new" | string;

function slideTypeLabel(item: SlideItem) {
  if (item.kind === "custom") return "Personalizado";
  if (item.kind === "budget_evo") return "Budget Evolutivo";
  if (item.kind === "bridge_pvm") return "Bridge PVM";
  return "Capa";
}

function makeVisualIndex(items: SlideItem[], selectedId: string | null) {
  const selectedIndex = selectedId ? items.findIndex((item) => item.id === selectedId) : -1;
  return selectedIndex >= 0 ? selectedIndex : 0;
}

export function SendToSlideDestinationDialog() {
  const navigate = useNavigate();
  const items = useSlidesFlow((s) => s.items);
  const selectedId = useSlidesFlow((s) => s.selectedId);
  const addItem = useSlidesFlow((s) => s.addItem);
  const updateItem = useSlidesFlow((s) => s.updateItem);
  const select = useSlidesFlow((s) => s.select);
  const [payload, setPayload] = useState<SendToSlidePayload | null>(null);
  const [destination, setDestination] = useState<Destination>("new");

  const recentSlideId = selectedId ?? items.find((item) => item.kind === "custom")?.id ?? null;
  const visualIndex = useMemo(() => makeVisualIndex(items, recentSlideId), [items, recentSlideId]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<SendToSlidePayload>).detail;
      if (!detail) return;
      setPayload(detail);
      const recent = useSlidesFlow.getState().selectedId;
      const currentItems = useSlidesFlow.getState().items;
      const canUseRecent = recent
        ? currentItems.some((item) => item.id === recent && canApplySendToSlideToExistingSlide(item, detail))
        : false;
      setDestination(canUseRecent && recent ? recent : "new");
    };
    window.addEventListener(SEND_TO_SLIDE_EVENT, handler);
    return () => window.removeEventListener(SEND_TO_SLIDE_EVENT, handler);
  }, []);

  useEffect(() => {
    if (!payload) return;
    items.slice(Math.max(0, visualIndex - 2), visualIndex + 5).forEach((item, index) => {
      window.setTimeout(() => { void warmSlideThumbnail(item); }, index * 60);
    });
  }, [items, payload, visualIndex]);

  if (!payload) return null;

  const close = () => setPayload(null);

  const confirm = () => {
    const state = useSlidesFlow.getState();
    let targetId: string | null = null;

    if (destination === "new") {
      const kind = nativeSlideKindForPayload(payload);
      addItem(kind);
      const created = useSlidesFlow.getState().items.at(-1);
      if (!created) return;
      targetId = created.id;
      if (kind === "custom") {
        updateItem(created.id, (item) => {
          if (item.kind !== "custom") return item;
          const block = buildCustomBlockFromPayload(payload, item.config);
          return {
            ...item,
            label: payload.source.visualization,
            config: { ...item.config, blocks: [...item.config.blocks, block] },
          };
        });
      } else {
        updateItem(created.id, (item) => buildNativeSlideConfigFromPayload(payload, item));
      }
    } else {
      const target = state.items.find((item) => item.id === destination);
      if (!target || !canApplySendToSlideToExistingSlide(target, payload)) {
        toast.error("Este slide não pode receber este elemento.");
        return;
      }
      targetId = target.id;
      if (target.kind === "custom") {
        updateItem(target.id, (item) => {
          if (item.kind !== "custom") return item;
          const block = buildCustomBlockFromPayload(payload, item.config);
          return { ...item, config: { ...item.config, blocks: [...item.config.blocks, block] } };
        });
      } else {
        updateItem(target.id, (item) => buildNativeSlideConfigFromPayload(payload, item));
      }
    }

    if (targetId) select(targetId);
    close();
    toast.success("Elemento enviado para Slides.", {
      action: {
        label: "Abrir Slides",
        onClick: () => navigate("/slides"),
      },
    });
  };

  return (
    <Dialog open={Boolean(payload)} onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Enviar para Slide</DialogTitle>
          <DialogDescription>
            Escolha onde inserir "{payload.source.visualization}". O app vai levar a configuração da visualização, não uma imagem.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[64vh] overflow-y-auto pr-1">
          <button
            type="button"
            onClick={() => setDestination("new")}
            className={cn(
              "mb-4 flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-colors",
              destination === "new" ? "border-primary bg-primary/10" : "border-border/60 bg-card hover:bg-secondary/40",
            )}
          >
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <FilePlus2 className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-semibold">
                Criar slide novo com este elemento
                {sendToSlideCreatesNativeSlide(payload) && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                    {payload.target.blockLabel}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Melhor opção quando você quer preservar o slide atual e criar uma nova página pronta para editar.
              </p>
            </div>
            {destination === "new" && <Check className="h-5 w-5 text-primary" />}
          </button>

          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <Presentation className="h-3.5 w-3.5" />
            Slides existentes
          </div>
          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 px-4 py-10 text-center text-sm text-muted-foreground">
              Nenhum slide no deck atual. Use a opção de criar slide novo.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {items.map((item, index) => {
                const canUse = canApplySendToSlideToExistingSlide(item, payload);
                const isRecent = item.id === recentSlideId;
                const selected = destination === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={!canUse}
                    onClick={() => canUse && setDestination(item.id)}
                    className={cn(
                      "group relative overflow-hidden rounded-xl border p-3 text-left transition-colors",
                      selected ? "border-primary bg-primary/10" : "border-border/60 bg-card hover:bg-secondary/40",
                      !canUse && "cursor-not-allowed opacity-55",
                    )}
                  >
                    <div className="relative overflow-hidden rounded-lg bg-muted/30">
                      <ScaledPreview item={item} targetWidth={260} deferUntilVisible />
                      {isRecent && (
                        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground shadow">
                          <Sparkles className="h-3 w-3" />
                          Recente
                        </span>
                      )}
                      {!canUse && (
                        <span className="absolute inset-0 flex items-center justify-center bg-background/70 text-xs font-medium text-muted-foreground backdrop-blur-sm">
                          <Lock className="mr-1.5 h-3.5 w-3.5" />
                          Tipo fechado
                        </span>
                      )}
                    </div>
                    <div className="mt-3 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">
                          {index + 1}. {item.label || slideTypeLabel(item)}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">{slideTypeLabel(item)}</div>
                      </div>
                      {selected && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancelar</Button>
          <Button onClick={confirm}>Enviar para Slide</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
