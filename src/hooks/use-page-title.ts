import { useEffect } from "react";

export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} — OMNI4` : "OMNI4";
    return () => {
      document.title = "OMNI4";
    };
  }, [title]);
}

