import type { ReactNode } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { captureSendToSlide, type SendToSlidePayload } from "@/lib/sendToSlide";
import { cn } from "@/lib/utils";

interface SendToSlideHoverProps {
  payload: SendToSlidePayload;
  children: ReactNode;
  className?: string;
}

export function SendToSlideHover({ payload, children, className }: SendToSlideHoverProps) {
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
          const detail = captureSendToSlide(payload);
          toast.info(`Configuração capturada: ${detail.source.visualization}`);
        }}
      >
        <Send className="h-3.5 w-3.5" />
        Enviar para Slide
      </Button>
    </div>
  );
}
