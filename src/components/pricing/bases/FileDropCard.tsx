// Área de soltar arquivos da aba Bases: a mesma da Base One e do De/Para 360.
// Arraste ou clique; o arquivo só é entregue a quem usa (nada é lido aqui).
import { useRef, useState, type ReactNode } from "react";
import { Upload as UploadIcon, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileDropCardProps {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  /** Selos à direita (o que o arquivo traz). */
  chips?: ReactNode;
  hint: string;
  accept: string;
  multiple?: boolean;
  ariaLabel: string;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}

export function FileDropCard({
  icon: Icon,
  title,
  description,
  chips,
  hint,
  accept,
  multiple = false,
  ariaLabel,
  disabled = false,
  onFiles,
}: FileDropCardProps) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const deliver = (list: FileList | null | undefined) => {
    if (disabled || !list?.length) return;
    // Cópia antes de limpar o campo: a FileList é viva e esvazia junto com ele.
    const files = Array.from(list);
    if (inputRef.current) inputRef.current.value = "";
    onFiles(files);
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-disabled={disabled}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (!disabled) inputRef.current?.click(); } }}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        deliver(e.dataTransfer.files);
      }}
      onClick={() => { if (!disabled) inputRef.current?.click(); }}
      className={cn(
        "group relative cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed border-border/60 bg-secondary/20 px-6 py-7 transition-all",
        "hover:border-primary/50 hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        drag && "scale-[1.005] border-primary bg-primary/10",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => deliver(e.target.files)}
      />
      <div className="flex flex-col items-center gap-4 text-center md:flex-row md:text-left">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold tracking-tight">{title}</div>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        {chips && <div className="flex shrink-0 flex-wrap items-center justify-center gap-1.5">{chips}</div>}
      </div>
      <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground md:justify-start md:pl-[72px]">
        <UploadIcon className="h-3.5 w-3.5" /> {hint}
      </div>
    </div>
  );
}
