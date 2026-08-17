import type { CustomSlideConfig } from "@/lib/customSlide";
import { newId } from "@/lib/slidesFlow";
import { useSlidesFlow } from "@/store/slidesFlow";

export function applyTemplateDeckToSlidesFlow({
  currentSlideId,
  configs,
  mode,
  name,
}: {
  currentSlideId: string;
  configs: CustomSlideConfig[];
  mode: "replace" | "insert";
  name: string;
}): CustomSlideConfig | null {
  const state = useSlidesFlow.getState();
  const items = [...state.items];
  const idx = items.findIndex((item) => item.id === currentSlideId);
  if (idx < 0) return null;

  const newItems = configs.map((config, i) => ({
    id: newId(),
    kind: "custom" as const,
    label: `${name} · ${i + 1}`,
    config,
  }));

  if (newItems.length === 0) return null;

  if (mode === "replace") {
    const first = newItems[0];
    const rest = newItems.slice(1);
    items.splice(idx, 1, first, ...rest);
    useSlidesFlow.setState({ items, selectedId: first.id });
    return first.config;
  }

  items.splice(idx + 1, 0, ...newItems);
  useSlidesFlow.setState({ items, selectedId: newItems[0].id });
  return null;
}
