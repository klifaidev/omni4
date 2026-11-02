import { useEffect } from "react";
import { usePageScope } from "@/lib/pageFreeze";

export function usePageTitle(title?: string, enabled = true) {
  const scope = usePageScope();
  useEffect(() => {
    if (!enabled) return;
    const text = title ? `${title} - OMNI4` : "OMNI4";
    // Aba oculta só guarda o título; ele vale quando ela aparecer.
    if (scope) scope.title = text;
    if (!scope?.frozen) document.title = text;
    return () => {
      if (scope) scope.title = null;
      if (!scope?.frozen) document.title = "OMNI4";
    };
  }, [title, enabled, scope]);
}

