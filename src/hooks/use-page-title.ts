import { useEffect } from "react";

export function usePageTitle(title?: string, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    document.title = title ? `${title} - OMNI4` : "OMNI4";
    return () => {
      document.title = "OMNI4";
    };
  }, [title, enabled]);
}

