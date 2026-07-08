import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSlidesFlow } from "@/store/slidesFlow";

export function TransitionSelect() {
  const transition = useSlidesFlow((s) => s.transition);
  const setTransition = useSlidesFlow((s) => s.setTransition);
  return (
    <Select value={transition} onValueChange={(v) => setTransition(v as never)}>
      <SelectTrigger className="h-8 w-[140px] text-xs" aria-label="Transição entre slides">
        <SelectValue placeholder="Transição" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Sem transição</SelectItem>
        <SelectItem value="fade">Fade</SelectItem>
        <SelectItem value="slide-left">Deslizar (←)</SelectItem>
        <SelectItem value="slide-up">Subir (↑)</SelectItem>
        <SelectItem value="zoom">Zoom</SelectItem>
      </SelectContent>
    </Select>
  );
}

