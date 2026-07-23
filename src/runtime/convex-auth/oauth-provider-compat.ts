import type { BetterAuthPlugin } from 'better-auth'
import { APIError } from 'better-auth/api'

import {
  OAuthSecurityError,
  validateOAuthRedirectUris,
  type hardenOAuthProviderCallbacks,
  type PinnedOAuthProviderProfile,
} from './oauth-security'

const DISABLED_PINNED_PROVIDER_PATHS = new Set([
  '/get-access-token',
  '/refresh-token',
  '/.well-known/openid-configuration',
  '/oauth2/client/rotate-secret',
  '/oauth2/create-client',
  '/oauth2/delete-client',
  '/oauth2/end-session',
  '/oauth2/get-client',
  '/oauth2/get-clients',
  '/oauth2/introspect',
  '/oauth2/register',
  '/oauth2/update-client',
  '/oauth2/userinfo',
  '/token',
])

interface InstalledOAuthProviderPlugin extends BetterAuthPlugin {
  options?: Record<string, unknown>
}

function invalidConfiguration(): never {
  throw new OAuthSecurityError('AUTH_OAUTH_CONFIG_INVALID')
}

export function validatePinnedOAuthProviderRuntime(
  context: Parameters<NonNullable<BetterAuthPlugin['init']>>[0],
  options: PinnedOAuthProviderProfile,
  hardened: ReturnType<typeof hardenOAuthProviderCallbacks>,
): InstalledOAuthProviderPlugin['options'] {
  const configuredPlugins = context.options.plugins ?? []
  const jwtIndexes = configuredPlugins
    .map((plugin, index) => (plugin.id === 'jwt' ? index : -1))
    .filter((index) => index >= 0)
  const convexIndexes = configuredPlugins
    .map((plugin, index) => (plugin.id === 'better-convex-nuxt' ? index : -1))
    .filter((index) => index >= 0)
  const oauthIndexes = configuredPlugins
    .map((plugin, index) => (plugin.id === 'oauth-provider' ? index : -1))
    .filter((index) => index >= 0)
  if (
    jwtIndexes.length !== 1 ||
    convexIndexes.length !== 1 ||
    oauthIndexes.length !== 1 ||
    !(jwtIndexes[0]! < convexIndexes[0]! && convexIndexes[0]! < oauthIndexes[0]!)
  ) {
    invalidConfiguration()
  }

  const disabledPaths = new Set(context.options.disabledPaths ?? [])
  if ([...DISABLED_PINNED_PROVIDER_PATHS].some((path) => !disabledPaths.has(path))) {
    invalidConfiguration()
  }
  if (
    context.options.account?.encryptOAuthTokens !== true ||
    context.options.account.storeAccountCookie !== false ||
    context.options.verification?.storeIdentifier !== 'hashed'
  ) {
    invalidConfiguration()
  }

  const issuer = context.baseURL
  let issuerUrl: URL
  try {
    issuerUrl = new URL(issuer)
  } catch {
    invalidConfiguration()
  }
  if (
    issuerUrl.pathname !== '/api/auth' ||
    issuerUrl.search ||
    issuerUrl.hash ||
    issuerUrl.username ||
    issuerUrl.password
  ) {
    invalidConfiguration()
  }

  const jwtPlugin = configuredPlugins[jwtIndexes[0]!] as InstalledOAuthProviderPlugin
  const jwtOptions = jwtPlugin.options?.jwt
  const jwksOptions = jwtPlugin.options?.jwks
  if (
    !jwtOptions ||
    typeof jwtOptions !== 'object' ||
    (jwtOptions as Record<string, unknown>).issuer !== issuer ||
    (jwtOptions as Record<string, unknown>).audience !== issuer ||
    (jwtOptions as Record<string, unknown>).expirationTime !== '10m' ||
    !jwksOptions ||
    typeof jwksOptions !== 'object' ||
    ((jwksOptions as Record<string, unknown>).keyPairConfig as Record<string, unknown> | undefined)
      ?.alg !== 'RS256' ||
    (jwksOptions as Record<string, unknown>).disablePrivateKeyEncryption !== false
  ) {
    invalidConfiguration()
  }

  const oauthPlugin = configuredPlugins[oauthIndexes[0]!] as InstalledOAuthProviderPlugin
  const providerOptions = oauthPlugin.options
  if (
    !providerOptions ||
    providerOptions.clientPrivileges !== hardened.clientPrivileges ||
    providerOptions.resourcePrivileges !== hardened.resourcePrivileges ||
    providerOptions.customAccessTokenClaims !== hardened.customAccessTokenClaims ||
    providerOptions.accessTokenExpiresIn !== options.accessTokenExpiresIn ||
    providerOptions.codeExpiresIn !== options.codeExpiresIn ||
    !Array.isArray(providerOptions.grantTypes) ||
    providerOptions.grantTypes.length !== 1 ||
    providerOptions.grantTypes[0] !== 'authorization_code'
  ) {
    invalidConfiguration()
  }

  if (process.env.NODE_ENV === 'production') {
    const proxySecret = process.env.BCN_AUTH_PROXY_IP_SECRET
    if (typeof proxySecret !== 'string' || proxySecret.length < 32) {
      invalidConfiguration()
    }
  }
  return providerOptions
}

function parseScope(value: string): string[] {
  const scopes = value.split(' ')
  if (scopes.some((scope) => scope.length === 0) || new Set(scopes).size !== scopes.length) {
    invalidConfiguration()
  }
  return scopes
}

function invalidClientProfile(): never {
  throw new APIError('BAD_REQUEST', {
    message: 'AUTH_OAUTH_CLIENT_PROFILE_INVALID',
  })
}

export function assertSafePinnedClientProvisioning(
  body: unknown,
  allowedScopes: readonly string[],
): void {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalidClientProfile()
  const input = body as Record<string, unknown>
  const scopes = typeof input.scope === 'string' ? parseScope(input.scope) : []
  try {
    validateOAuthRedirectUris(input.redirect_uris)
    const publicClient =
      input.token_endpoint_auth_method === 'none' &&
      (input.type === 'native' || input.type === 'user-agent-based')
    const confidentialClient =
      input.token_endpoint_auth_method === 'client_secret_basic' && input.type === 'web'
    if (
      (!publicClient && !confidentialClient) ||
      input.require_pkce !== true ||
      input.skip_consent !== false ||
      input.enable_end_session !== false ||
      input.dpop_bound_access_tokens !== false ||
      !Array.isArray(input.grant_types) ||
      input.grant_types.length !== 1 ||
      input.grant_types[0] !== 'authorization_code' ||
      !Array.isArray(input.response_types) ||
      input.response_types.length !== 1 ||
      input.response_types[0] !== 'code' ||
      input.jwks !== undefined ||
      input.jwks_uri !== undefined ||
      input.metadata !== undefined ||
      input.software_statement !== undefined ||
      input.backchannel_logout_uri !== undefined ||
      input.backchannel_logout_session_required !== undefined ||
      input.post_logout_redirect_uris !== undefined ||
      scopes.length === 0 ||
      scopes.some((scope) => !allowedScopes.includes(scope))
    ) {
      invalidConfiguration()
    }
  } catch {
    invalidClientProfile()
  }
}

export function assertSafePinnedClientUpdate(
  body: unknown,
  allowedScopes: readonly string[],
): void {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalidClientProfile()
  const input = body as Record<string, unknown>
  try {
    if (input.redirect_uris !== undefined) validateOAuthRedirectUris(input.redirect_uris)
    const scopes = typeof input.scope === 'string' ? parseScope(input.scope) : undefined
    if (
      (scopes !== undefined && scopes.some((scope) => !allowedScopes.includes(scope))) ||
      input.token_endpoint_auth_method !== undefined ||
      input.type !== undefined ||
      input.require_pkce !== undefined ||
      (input.skip_consent !== undefined && input.skip_consent !== false) ||
      (input.enable_end_session !== undefined && input.enable_end_session !== false) ||
      (input.dpop_bound_access_tokens !== undefined && input.dpop_bound_access_tokens !== false) ||
      (input.grant_types !== undefined &&
        (!Array.isArray(input.grant_types) ||
          input.grant_types.length !== 1 ||
          input.grant_types[0] !== 'authorization_code')) ||
      (input.response_types !== undefined &&
        (!Array.isArray(input.response_types) ||
          input.response_types.length !== 1 ||
          input.response_types[0] !== 'code')) ||
      input.jwks !== undefined ||
      input.jwks_uri !== undefined ||
      input.metadata !== undefined ||
      input.software_statement !== undefined ||
      input.backchannel_logout_uri !== undefined ||
      input.backchannel_logout_session_required !== undefined ||
      input.post_logout_redirect_uris !== undefined
    ) {
      invalidConfiguration()
    }
  } catch {
    invalidClientProfile()
  }
}

function invalidResourceProfile(): never {
  throw new APIError('BAD_REQUEST', {
    message: 'AUTH_OAUTH_RESOURCE_PROFILE_INVALID',
  })
}

export function assertSafePinnedResourceProvisioning(
  body: unknown,
  allowedScopes: readonly string[],
): void {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalidResourceProfile()
  const input = body as Record<string, unknown>
  try {
    if (
      input.dpopBoundAccessTokensRequired === true ||
      input.refreshTokenTtl !== undefined ||
      input.signingKeyId !== undefined ||
      input.customClaims !== undefined ||
      (input.signingAlgorithm !== undefined && input.signingAlgorithm !== 'RS256') ||
      (input.accessTokenTtl !== undefined &&
        (!Number.isSafeInteger(input.accessTokenTtl) ||
          (input.accessTokenTtl as number) <= 0 ||
          (input.accessTokenTtl as number) > 600)) ||
      (input.allowedScopes !== undefined &&
        (!Array.isArray(input.allowedScopes) ||
          input.allowedScopes.some(
            (scope) => typeof scope !== 'string' || !allowedScopes.includes(scope),
          )))
    ) {
      invalidConfiguration()
    }
  } catch {
    invalidResourceProfile()
  }
}
