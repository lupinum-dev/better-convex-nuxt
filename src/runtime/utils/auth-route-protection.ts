import type { RouteLocationRaw } from 'vue-router'

export type ConvexAuthPageMeta = boolean | { redirectTo?: RouteLocationRaw }

export interface RouteProtectionDecisionInput {
  meta: ConvexAuthPageMeta | undefined
  defaultRedirectTo: string
  preserveReturnTo: boolean
  currentPath: string
  currentFullPath?: string
}

export interface RouteProtectionDecision {
  redirectTo: RouteLocationRaw
}

export function resolveRouteProtectionDecision(
  input: RouteProtectionDecisionInput,
): RouteProtectionDecision | null {
  const { meta, defaultRedirectTo, preserveReturnTo, currentPath } = input
  const currentFullPath = input.currentFullPath ?? currentPath

  if (meta === undefined || meta === false) return null

  const redirectBase = typeof meta === 'object' && meta !== null && meta.redirectTo
    ? meta.redirectTo
    : defaultRedirectTo

  if (!redirectBase) return null
  if (typeof redirectBase !== 'string') {
    return { redirectTo: redirectBase }
  }
  const redirectPathOnly = redirectBase.split('?')[0] || redirectBase
  if (currentPath === redirectPathOnly) return null

  if (!preserveReturnTo) {
    return { redirectTo: redirectBase }
  }

  const hasQuery = redirectBase.includes('?')
  const separator = hasQuery ? '&' : '?'
  return {
    redirectTo: `${redirectBase}${separator}redirect=${encodeURIComponent(currentFullPath)}`,
  }
}
