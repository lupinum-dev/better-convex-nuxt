export function normalizeAuthCacheTtl(input: unknown): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) return 60
  const normalized = Math.trunc(input)
  if (normalized < 1) return 1
  if (normalized > 60) return 60
  return normalized
}

const SHARED_HOST_WILDCARD_SUFFIXES = ['vercel.app', 'netlify.app', 'pages.dev', 'github.io']

function hasWildcardHostname(hostname: string): boolean {
  return hostname.includes('*')
}

function isBlockedSharedHostWildcard(hostname: string): boolean {
  return SHARED_HOST_WILDCARD_SUFFIXES.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
  )
}

function validateTrustedOriginPattern(pattern: string): string {
  const normalized = pattern.trim()
  if (!normalized) return normalized

  try {
    const url = new URL(normalized)
    if (hasWildcardHostname(url.hostname) && isBlockedSharedHostWildcard(url.hostname)) {
      throw new Error(
        `Wildcard trusted origin "${normalized}" is not allowed on shared-host preview domains. Use exact origins instead.`,
      )
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('Wildcard trusted origin')) {
      throw error
    }
  }

  return normalized
}

export function normalizeTrustedOrigins(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return value
    .filter((entry: unknown): entry is string => typeof entry === 'string')
    .map(validateTrustedOriginPattern)
    .filter(Boolean)
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
