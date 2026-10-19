// A base de ruptura para os slides. Ela carrega sob demanda (store da
// Ruptura) e não faz parte do pré-carregamento das bases do KE30/Budget:
// quem desenha um visual da Ruptura pede a base aqui.
import { useEffect } from "react";
import type { CustomSlideConfig } from "@/lib/customSlide";
import type { RupturaModel } from "@/lib/ruptura/types";
import { useRuptura, type RupturaStatus } from "@/store/ruptura";

export function useRupturaModel(): { model: RupturaModel | null; status: RupturaStatus } {
  const model = useRuptura((s) => s.model);
  const status = useRuptura((s) => s.status);
  useEffect(() => {
    if (!model && status === "idle") void useRuptura.getState().loadSaved();
  }, [model, status]);
  return { model, status };
}

/** Antes de fotografar um slide (PPTX/PDF): espera a base de ruptura abrir, se ela existir. */
export async function ensureRupturaLoaded(): Promise<RupturaModel | null> {
  const state = useRuptura.getState();
  if (state.model) return state.model;
  await state.loadSaved();
  return useRuptura.getState().model;
}

/** O slide tem algum visual da Ruptura (que precisa da base aberta antes da captura)? */
export function configNeedsRuptura(config: CustomSlideConfig): boolean {
  return config.blocks.some((block) => block.kind === "ruptura_visual");
}
