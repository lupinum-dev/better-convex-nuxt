import { oauthProviderResourceClient } from '@better-auth/oauth-provider/resource-client'

import {
  OAuthSecurityError,
  assertOAuthAccessTokenClaims,
  installUrlCanParseCompatibility,
  type OAuthAccessTokenExpectations,
  type OAuthPrincipal,
} from './oauth-security'

export interface VerifyOAuthBearerTokenOptions extends OAuthAccessTokenExpectations {
  jwksUrl: string
}

export type BetterAuthMcpAccessVerifierOptions = Omit<
  VerifyOAuthBearerTokenOptions,
  'audience' | 'nowSeconds'
>

const COMPACT_JWT_PATTERN = /^[\w-]+\.[\w-]+\.[\w-]+$/u
const MAX_COMPACT_JWT_BYTES = 8192

function invalidToken(): never {
  throw new OAuthSecurityError('AUTH_OAUTH_TOKEN_INVALID')
}

function decodeVerifiedPayload(token: string): Record<string, unknown> {
  if (token.length > MAX_COMPACT_JWT_BYTES || !COMPACT_JWT_PATTERN.test(token)) invalidToken()
  const encodedPayload = token.split('.')[1]
  if (!encodedPayload || encodedPayload.length % 4 === 1) invalidToken()
  try {
    const base64 = encodedPayload.replaceAll('-', '+').replaceAll('_', '/')
    const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) invalidToken()
    return value as Record<string, unknown>
  } catch {
    invalidToken()
  }
}

function requireCanonicalJwksUrl(issuer: string, jwksUrl: string): void {
  let parsedIssuer: URL
  let parsedJwks: URL
  try {
    parsedIssuer = new URL(issuer)
    parsedJwks = new URL(jwksUrl)
  } catch {
    throw new OAuthSecurityError('AUTH_OAUTH_TOKEN_INVALID')
  }
  if (
    parsedIssuer.href !== issuer ||
    parsedJwks.href !== jwksUrl ||
    parsedJwks.origin !== parsedIssuer.origin ||
    jwksUrl !== `${issuer}/jwks`
  ) {
    throw new OAuthSecurityError('AUTH_OAUTH_TOKEN_INVALID')
  }
}

/**
 * Uses the pinned provider's resource client for JOSE/JWKS processing, then
 * applies BCN's stricter beta token-class and exact-binding checks. Live
 * session, client, consent, membership, and operation authorization remain a
 * separate Convex transaction and are deliberately not derived from claims.
 */
export async function verifyOAuthBearerToken(
  token: string | undefined,
  options: VerifyOAuthBearerTokenOptions,
): Promise<OAuthPrincipal> {
  // The resource verifier runs in its own Convex HTTP-action isolate, so the
  // auth-plugin initialization that installs this missing runtime primitive is
  // not guaranteed to have executed here.
  installUrlCanParseCompatibility()
  requireCanonicalJwksUrl(options.issuer, options.jwksUrl)
  if (typeof token !== 'string') invalidToken()
  // Reject malformed/oversized compact values before the verifier performs a
  // JWKS lookup. The decoded value is deliberately not trusted until after the
  // official verifier succeeds below.
  decodeVerifiedPayload(token)
  const maxLifetimeSeconds = options.maxLifetimeSeconds ?? 600
  const verifyBearerToken = oauthProviderResourceClient().getActions().verifyBearerToken
  await verifyBearerToken(token, {
    jwksUrl: options.jwksUrl,
    verifyOptions: {
      algorithms: ['RS256'],
      audience: options.audience,
      clockTolerance: 0,
      currentDate:
        options.nowSeconds === undefined ? undefined : new Date(options.nowSeconds * 1000),
      issuer: options.issuer,
      maxTokenAge: `${maxLifetimeSeconds}s`,
      typ: 'at+jwt',
    },
  })

  // The pinned resource client normalizes `client_id` from `azp` on its
  // returned payload. Re-read the now signature-verified compact bytes so a
  // conflicting signed client_id (or another raw unknown claim) cannot be
  // hidden by that normalization.
  return assertOAuthAccessTokenClaims(decodeVerifiedPayload(token), options)
}

/**
 * Adapts BCN's strict Better Auth OAuth access-token profile to the provider-neutral MCP verifier
 * contract without importing the MCP package or exposing provider-private session state.
 */
export function createBetterAuthMcpAccessVerifier(options: BetterAuthMcpAccessVerifierOptions) {
  const fixedOptions: BetterAuthMcpAccessVerifierOptions = Object.freeze({
    allowedScopes: Object.freeze([...options.allowedScopes]),
    issuer: options.issuer,
    jwksUrl: options.jwksUrl,
    ...(options.clientId === undefined ? {} : { clientId: options.clientId }),
    ...(options.maxLifetimeSeconds === undefined
      ? {}
      : { maxLifetimeSeconds: options.maxLifetimeSeconds }),
    ...(options.requiredScopes === undefined
      ? {}
      : { requiredScopes: Object.freeze([...options.requiredScopes]) }),
    ...(options.subject === undefined ? {} : { subject: options.subject }),
  })

  return Object.freeze({
    async verifyAccessToken(token: string, expectedResource: URL) {
      if (
        !(expectedResource instanceof URL) ||
        expectedResource.protocol !== 'https:' ||
        expectedResource.username ||
        expectedResource.password ||
        expectedResource.hash
      ) {
        invalidToken()
      }
      const resource = expectedResource.href
      const principal = await verifyOAuthBearerToken(token, {
        ...fixedOptions,
        audience: resource,
      })
      return Object.freeze({
        access: Object.freeze({
          issuer: fixedOptions.issuer,
          subject: principal.subject,
          clientId: principal.clientId,
          resource,
          scopes: Object.freeze([...principal.scopes]),
        }),
        expiresAt: principal.expiresAt,
      })
    },
  })
}
