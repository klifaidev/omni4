export type StringInterner = (value: string) => string;

export function createStringInterner(): StringInterner {
  const seen = new Map<string, string>();
  return (value: string) => {
    const existing = seen.get(value);
    if (existing !== undefined) return existing;
    seen.set(value, value);
    return value;
  };
}

export function internTrimmed(value: unknown, intern: StringInterner): string {
  return intern((value ?? "").toString().trim());
}
