export function withCan<T extends Record<string, unknown>, C extends Record<string, boolean>>(
  doc: T,
  checks: C,
): T & { _can: C } {
  return {
    ...doc,
    _can: checks,
  }
}
