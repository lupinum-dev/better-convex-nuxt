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
  const message = rawMessage.trim()
  const lower = message.toLowerCase()

  if (lower.includes('unauthorized') || lower.includes('invalid session')) {
    return 'Not signed in'
  }

  return prefix(
    'Authentication failed. Check your Nuxt auth proxy route and Convex auth configuration.',
  )
}
