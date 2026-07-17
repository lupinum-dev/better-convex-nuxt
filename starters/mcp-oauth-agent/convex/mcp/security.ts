import { verifyOAuthBearerToken } from 'better-convex-nuxt/convex-auth'

import { MCP_SCOPES, type McpScope, type OAuthPrincipal } from './policy'

const TOKEN_PATTERN = /^[\w-]+\.[\w-]+\.[\w-]+$/

export type McpTokenErrorCode = 'MCP_INVALID_TOKEN' | 'MCP_SCOPE_REQUIRED'

export class McpTokenError extends Error {
  readonly code: McpTokenErrorCode

  constructor(code: McpTokenErrorCode) {
    super(code)
    this.name = 'McpTokenError'
    this.code = code
  }
}

function invalidToken(): never {
  throw new McpTokenError('MCP_INVALID_TOKEN')
}

/** Strict header-only bearer transport. The raw value never leaves request memory. */
export function extractBearerToken(headers: Headers): string {
  const authorization = headers.get('authorization')
  if (!authorization || authorization.includes(',') || !authorization.startsWith('Bearer ')) {
    invalidToken()
  }
  const token = authorization.slice('Bearer '.length)
  if (token.length > 8192 || !TOKEN_PATTERN.test(token)) invalidToken()
  return token
}

export interface VerifyMcpAccessTokenOptions {
  issuer: string
  requiredScope?: McpScope
  resource: string
}

/**
 * Verify the pinned OAuth access-token class with the official Better Auth
 * resource client, then apply BCN's stricter exact-binding checks.
 */
export async function verifyMcpAccessToken(
  token: string,
  options: VerifyMcpAccessTokenOptions,
): Promise<OAuthPrincipal> {
  if (token.length > 8192 || !TOKEN_PATTERN.test(token)) invalidToken()
  let verified
  try {
    verified = await verifyOAuthBearerToken(token, {
      allowedScopes: MCP_SCOPES,
      audience: options.resource,
      issuer: options.issuer,
      jwksUrl: `${options.issuer}/jwks`,
      maxLifetimeSeconds: 600,
    })
  } catch {
    invalidToken()
  }
  if (options.requiredScope && !verified.scopes.includes(options.requiredScope)) {
    throw new McpTokenError('MCP_SCOPE_REQUIRED')
  }

  return Object.freeze({
    clientId: verified.clientId,
    resource: options.resource,
    scopes: new Set<string>(verified.scopes),
    sessionId: verified.sessionId,
    subject: verified.subject,
  })
}
