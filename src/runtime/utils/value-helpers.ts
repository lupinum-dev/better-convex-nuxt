export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
