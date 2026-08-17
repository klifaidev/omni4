import { useEffect, useState } from "react";
import type * as Y from "yjs";

export function useYTextValue(yText: Y.Text | null | undefined, fallback: string): string {
  const [value, setValue] = useState(() => yText?.toString() ?? fallback);

  useEffect(() => {
    if (!yText) {
      setValue(fallback);
      return;
    }

    const sync = () => setValue(yText.toString());
    sync();
    yText.observe(sync);
    return () => yText.unobserve(sync);
  }, [fallback, yText]);

  return value;
}
