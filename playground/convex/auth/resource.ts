export function withCan<T extends Record<string, unknown>>(
  doc: T,
  checks: Record<string, boolean>,
): T & { _can: Record<string, boolean> } {
  return {
    ...doc,
    _can: checks,
  }
}
