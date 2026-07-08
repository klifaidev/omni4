export function canRunSlideMutation(readOnly: boolean): boolean {
  return !readOnly;
}

export function guardSlideReadOnly(readOnly: boolean, onBlocked: () => void): boolean {
  if (canRunSlideMutation(readOnly)) return false;
  onBlocked();
  return true;
}
