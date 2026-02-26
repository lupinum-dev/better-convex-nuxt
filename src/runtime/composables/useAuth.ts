import type { createAuthClient } from 'better-auth/vue'

import { useNuxtApp } from '#imports'

import { useConvexAuth, type UseConvexAuthReturn } from './useConvexAuth'

type AuthClient = ReturnType<typeof createAuthClient>

function createClientOnlyMethodProxy<T>(name: 'signIn' | 'signUp'): T {
  const buildProxy = (path: string[]): unknown => {
    const fn = () => {}
    return new Proxy(fn, {
      get(_target, prop) {
        if (prop === 'then') return undefined
        if (typeof prop === 'symbol') return undefined
        return buildProxy([...path, prop])
      },
      apply() {
        const methodPath = path.join('.')
        const message
          = `[useAuth] \`${methodPath}\` is client-only. Call it from a browser event handler and ensure auth is enabled.`
        if (import.meta.dev) {
          console.warn(message)
        }
        return Promise.resolve({
          data: null,
          error: { message },
        })
      },
    })
  }

  return buildProxy([name]) as T
}

export interface UseAuthReturn extends UseConvexAuthReturn {
  /**
   * Raw Better Auth client for advanced/plugin-specific APIs.
   * Returns null on SSR.
   */
  client: AuthClient | null
  /**
   * Better Auth sign-in methods (client-only).
   * Example: `signIn.email({ email, password })`
   */
  signIn: AuthClient['signIn']
  /**
   * Better Auth sign-up methods (client-only).
   * Example: `signUp.email({ name, email, password })`
   */
  signUp: AuthClient['signUp']
}

/**
 * Primary auth composable for better-convex-nuxt.
 *
 * Combines Convex-authenticated reactive state (`user`, `isAuthenticated`, etc.)
 * with Better Auth auth actions (`signIn`, `signUp`) in a single API.
 */
export function useAuth(): UseAuthReturn {
  const convexAuth = useConvexAuth()
  const nuxtApp = useNuxtApp()
  const client = (nuxtApp.$auth as AuthClient | undefined) ?? null

  return {
    ...convexAuth,
    client,
    signIn: client?.signIn ?? createClientOnlyMethodProxy<AuthClient['signIn']>('signIn'),
    signUp: client?.signUp ?? createClientOnlyMethodProxy<AuthClient['signUp']>('signUp'),
  }
}

