export interface ConvexRouteProtectionConfig {
  redirectTo: string
  preserveReturnTo: boolean
}

export interface ConvexUnauthorizedConfig {
  enabled: boolean
  redirectTo: string
  includeQueries: boolean
}

export interface ConvexAuthConfig {
  enabled: boolean
  routeProtection: ConvexRouteProtectionConfig
  unauthorized: ConvexUnauthorizedConfig
}

export interface ConvexAuthConfigInput {
  enabled?: boolean
  routeProtection?: Partial<ConvexRouteProtectionConfig>
  unauthorized?: Partial<ConvexUnauthorizedConfig>
}

export const DEFAULT_CONVEX_AUTH_CONFIG: ConvexAuthConfig = {
  enabled: true,
  routeProtection: {
    redirectTo: '/auth/signin',
    preserveReturnTo: true,
  },
  unauthorized: {
    enabled: false,
    redirectTo: '/auth/signin',
    includeQueries: false,
  },
}

/**
 * Runtime-safe normalization for auth config.
 * Public API is object-based.
 */
export function normalizeConvexAuthConfig(input: unknown): ConvexAuthConfig {
  if (!input || typeof input !== 'object') {
    return { ...DEFAULT_CONVEX_AUTH_CONFIG }
  }

  const auth = input as ConvexAuthConfigInput

  return {
    enabled: auth.enabled ?? DEFAULT_CONVEX_AUTH_CONFIG.enabled,
    routeProtection: {
      redirectTo:
        auth.routeProtection?.redirectTo ?? DEFAULT_CONVEX_AUTH_CONFIG.routeProtection.redirectTo,
      preserveReturnTo:
        auth.routeProtection?.preserveReturnTo
        ?? DEFAULT_CONVEX_AUTH_CONFIG.routeProtection.preserveReturnTo,
    },
    unauthorized: {
      enabled: auth.unauthorized?.enabled ?? DEFAULT_CONVEX_AUTH_CONFIG.unauthorized.enabled,
      redirectTo:
        auth.unauthorized?.redirectTo ?? DEFAULT_CONVEX_AUTH_CONFIG.unauthorized.redirectTo,
      includeQueries:
        auth.unauthorized?.includeQueries ?? DEFAULT_CONVEX_AUTH_CONFIG.unauthorized.includeQueries,
    },
  }
}
