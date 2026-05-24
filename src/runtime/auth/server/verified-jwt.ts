import { createLocalJWKSet, jwtVerify, type JWTPayload, type JWTVerifyResult } from 'jose'

import { fetchWithTimeout } from '../../convex/server/http.js'
import { decodeUserFromJwt } from '../../convex/shared/convex-shared.js'
import { SERVER_FETCH_TIMEOUT_MS } from '../../utils/constants.js'
import type { AuthSessionUser } from '../../utils/types.js'

const LOCAL_JWKS_BOOTSTRAP_SENTINEL = '__TRELLIS_LOCAL_JWKS_BOOTSTRAP__'
const JWKS_CACHE_TTL_MS = 5 * 60_000

type JsonWebKeySet = {
  keys: Record<string, unknown>[]
}

type CachedJwks = {
  expiresAt: number
  keySet: ReturnType<typeof createLocalJWKSet>
}

const jwksCache = new Map<string, CachedJwks>()

function normalizeJwks(value: unknown): JsonWebKeySet {
  if (Array.isArray(value)) {
    return { keys: value as Record<string, unknown>[] }
  }
  if (
    value &&
    typeof value === 'object' &&
    'keys' in value &&
    Array.isArray((value as { keys?: unknown }).keys)
  ) {
    return value as JsonWebKeySet
  }

  throw new Error('Auth JWKS payload is not a valid JSON Web Key Set.')
}

async function loadServerJwks(siteUrl: string): Promise<ReturnType<typeof createLocalJWKSet>> {
  const cached = jwksCache.get(siteUrl)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.keySet
  }

  const staticJwks = process.env.JWKS?.trim()
  let jwksValue: unknown

  if (staticJwks && staticJwks !== LOCAL_JWKS_BOOTSTRAP_SENTINEL) {
    try {
      jwksValue = JSON.parse(staticJwks)
    } catch (error) {
      throw new Error(
        `[serverConvex] Failed to parse static JWKS from process.env.JWKS: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  } else {
    const response = await fetchWithTimeout(`${siteUrl}/api/auth/convex/jwks`, {
      timeoutMs: SERVER_FETCH_TIMEOUT_MS,
    })

    if (!response.ok) {
      throw new Error(`[serverConvex] Failed to load auth JWKS (HTTP ${response.status}).`)
    }

    try {
      jwksValue = await response.json()
    } catch (error) {
      throw new Error(
        `[serverConvex] Auth JWKS endpoint returned invalid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  const keySet = createLocalJWKSet(normalizeJwks(jwksValue))
  jwksCache.set(siteUrl, {
    expiresAt: Date.now() + JWKS_CACHE_TTL_MS,
    keySet,
  })
  return keySet
}

export interface VerifiedServerJwt {
  payload: JWTPayload
  user: AuthSessionUser
}

export async function verifyServerJwt(
  token: string,
  siteUrl: string,
): Promise<VerifiedServerJwt & Pick<JWTVerifyResult, 'payload'>> {
  try {
    const keySet = await loadServerJwks(siteUrl)
    const verified = await jwtVerify(token, keySet, {
      algorithms: ['EdDSA', 'RS256'],
      audience: 'convex',
      clockTolerance: 5,
      issuer: siteUrl,
    })
    if (typeof verified.payload.sub !== 'string' || !verified.payload.sub.trim()) {
      throw new TypeError('Verified auth token is missing required subject.')
    }
    if (typeof verified.payload.exp !== 'number') {
      throw new TypeError('Verified auth token is missing required expiration.')
    }
    const user = decodeUserFromJwt(token)
    if (!user) {
      throw new Error('Verified auth token is missing required user claims.')
    }
    return {
      payload: verified.payload,
      user,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`[serverConvex] Invalid auth token: ${message}`)
  }
}

export function clearServerJwksCache(siteUrl?: string): void {
  if (siteUrl) {
    jwksCache.delete(siteUrl)
    return
  }
  jwksCache.clear()
}
