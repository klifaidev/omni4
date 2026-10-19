import type { ReactNode } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { captureSendToSlide, type SendToSlidePayload } from "@/lib/sendToSlide";
import { isSendToSlideEnabledForPage } from "@/lib/sendToSlideRollout";
import { cn } from "@/lib/utils";

interface SendToSlideHoverProps {
  payload: SendToSlidePayload;
  children: ReactNode;
  className?: string;
}

/**
 * Visuais do catálogo (iguais à aba) valem em qualquer aba; os envios antigos
 * (tradução para outro elemento) seguem a liberação por aba.
 */
function isSendEnabled(payload: SendToSlidePayload): boolean {
  return payload.target.blockKind === "tab_visual" || payload.target.blockKind === "ruptura_visual"
    || isSendToSlideEnabledForPage(payload.source.page);
}

export function SendToSlideHover({ payload, children, className }: SendToSlideHoverProps) {
  if (!isSendEnabled(payload)) {
    return <>{children}</>;
  }

  return (
    <div className={cn("group/send-slide relative", className)}>
      {children}
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="absolute right-3 top-3 z-20 h-8 gap-1.5 border border-border/60 bg-popover/95 px-2.5 text-[11px] font-semibold opacity-0 shadow-lg backdrop-blur transition-opacity duration-150 group-hover/send-slide:opacity-100 focus-visible:opacity-100"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          captureSendToSlide(payload);
        }}
      >
        <Send className="h-3.5 w-3.5" />
        Enviar para Slide
      </Button>
    </div>
  );
}

/**
 * Botão discreto de "Enviar para Slide" para cartões cujo canto já tem
 * controles (filtros, alternância de métrica): fica no cabeçalho, aparece ao
 * passar o mouse ou focar o cartão (que precisa da classe `group/send-slide`)
 * e nunca cobre nada.
 */
export function SendToSlideIconButton({ payload, className }: { payload: SendToSlidePayload; className?: string }) {
  if (!isSendEnabled(payload)) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Enviar para Slide: ${payload.source.visualization}`}
          className={cn(
            "h-8 w-8 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-150 hover:text-foreground",
            "focus-visible:opacity-100 group-hover/send-slide:opacity-100 group-focus-within/send-slide:opacity-100",
            className,
          )}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            captureSendToSlide(payload);
          }}
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="text-xs">Enviar para Slide</TooltipContent>
    </Tooltip>
  );
}
