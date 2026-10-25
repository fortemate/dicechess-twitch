/** Canonical technical strings use UTF-16 order, independent of the host locale. */
export function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}
