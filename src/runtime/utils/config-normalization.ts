export function normalizeAuthCacheTtl(input: unknown): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) return 60
  const normalized = Math.trunc(input)
  if (normalized < 1) return 1
  if (normalized > 60) return 60
  return normalized
}

export function normalizeConfiguredFunctionPath(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  if (!normalized) return undefined
  return normalized
}

export function normalizePermissionQueryPath(value: unknown): string | null {
  if (typeof value === 'string') {
    return normalizeConfiguredFunctionPath(value) ?? null
  }

  if (typeof value !== 'object' || value === null) {
    return null
  }

  return normalizeConfiguredFunctionPath((value as Record<string, unknown>).query) ?? null
}
