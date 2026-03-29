import { ConvexCallError } from './call-result'
import { getSiteUrlResolutionHint } from './convex-config'

const PREFIX = 'NuxtConvexError'

function prefix(message: string): string {
  return `${PREFIX}: ${message}`
}

export function buildMissingSiteUrlMessage(url?: string | null): string {
  return prefix(
    `Auth proxy requires a Convex HTTP Actions host (\`convex.siteUrl\`). ${getSiteUrlResolutionHint(url)}`,
  )
}

export function buildBlockedOriginMessage(origin: string | null, requestHost: string): string {
  const originLabel = origin || '(missing origin header)'
  return prefix(
    `Cross-origin auth request blocked from ${originLabel}. Add the origin to \`convex.trustedOrigins\` in \`nuxt.config.ts\` or use same-origin requests via the Nuxt auth proxy on ${requestHost}.`,
  )
}

export function buildAuthProxyUnreachableMessage(siteUrl: string, error?: unknown): string {
  const detail = error instanceof Error ? ` (${error.message})` : ''
  return prefix(
    `Auth proxy could not reach Convex at ${siteUrl}. Check \`convex.siteUrl\`, confirm your Convex HTTP router is deployed, and verify Better Auth routes are registered in \`convex/http.ts\`.${detail}`,
  )
}

export function buildAuthProxyUpstreamStatusMessage(
  siteUrl: string,
  path: string,
  status: number,
): string {
  const hint =
    status === 404
      ? 'This usually means Better Auth routes are not registered in `convex/http.ts` or `convex.siteUrl` points to the wrong host.'
      : 'Check your Convex deployment health and Better Auth setup.'
  return prefix(`Auth proxy upstream returned ${status} for ${siteUrl}/api/auth${path}. ${hint}`)
}

export function buildTokenExchangeFailureMessage(options: {
  siteUrl: string
  status?: number
  error?: unknown
}): string {
  const statusText = options.status ? ` (HTTP ${options.status})` : ''
  const detail = options.error instanceof Error ? ` ${options.error.message}` : ''
  return prefix(
    `Token exchange failed via ${options.siteUrl}/api/auth/convex/token${statusText}. Did you set \`BETTER_AUTH_SECRET\` in the Convex Dashboard, register Better Auth routes in \`convex/http.ts\`, and configure the correct \`convex.siteUrl\`?${detail}`,
  )
}

export function buildClientAuthRequestFailureMessage(error: unknown): string {
  if (error instanceof Error) {
    const lower = error.message.toLowerCase()
    if (lower.includes('fetch') || lower.includes('network')) {
      return prefix(
        `Auth request failed due to a network/proxy error. Check your Nuxt auth proxy route, \`convex.siteUrl\`, and Convex HTTP Actions availability. (${error.message})`,
      )
    }
    return prefix(`Auth request failed. ${error.message}`)
  }
  return prefix(
    'Auth request failed. Check your Nuxt auth proxy route and Convex auth configuration.',
  )
}

export function buildClientAuthResponseErrorMessage(rawMessage: string): string {
  const message = sanitizeAuthErrorMessage(rawMessage)
  const lower = message.toLowerCase()

  if (lower.includes('unauthorized') || lower.includes('invalid session')) {
    return 'Not signed in'
  }

  if (message.length > 0) {
    return prefix(`Authentication failed. ${message}`)
  }

  return prefix(
    'Authentication failed. Check your Nuxt auth proxy route and Convex auth configuration.',
  )
}

export function buildClientAuthDecodeFailureMessage(): string {
  return prefix(
    'Authentication failed. Received an invalid auth token.',
  )
}

function sanitizeAuthErrorMessage(rawMessage: string): string {
  return rawMessage
    .replace(/^NuxtConvexError:\s*/i, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Wrap a Better Auth error response into a ConvexCallError.
 *
 * Better Auth methods return `{ data, error }` where error is typically
 * `{ message: string; status?: number; code?: string }`.
 * The category is auto-derived by ConvexCallError's constructor.
 */
export function wrapBetterAuthError(error: unknown, operation: string): ConvexCallError {
  const record = error && typeof error === 'object' ? (error as Record<string, unknown>) : null
  return new ConvexCallError(
    (typeof record?.message === 'string' ? record.message : null) || `${operation} failed`,
    {
      code: typeof record?.code === 'string' ? record.code : undefined,
      status: typeof record?.status === 'number' ? record.status : undefined,
      operation,
      cause: error,
    },
  )
}
