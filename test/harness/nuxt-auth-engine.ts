import { useNuxtApp, useState } from '#imports'

import {
  getOrCreateSharedAuthEngine,
  type AuthTransport,
  type ClientAuthStateResult,
} from '../../src/runtime/client/auth-engine'
import { STATE_KEY_AUTH_ERROR, STATE_KEY_PENDING, STATE_KEY_TOKEN, STATE_KEY_USER } from '../../src/runtime/utils/constants'
import type { ConvexUser } from '../../src/runtime/utils/types'

export interface InstallMockAuthEngineOptions {
  initialToken?: string | null
  initialUser?: ConvexUser | null
  initialPending?: boolean
  initialAuthError?: string | null
  initialWasAuthenticated?: boolean
  signOut?: () => Promise<void>
  fetchAuthState?: (input: {
    forceRefreshToken: boolean
    signal?: AbortSignal
  }) => Promise<ClientAuthStateResult>
  invalidate?: () => Promise<void>
}

export function installMockAuthEngine(
  options: InstallMockAuthEngineOptions = {},
) {
  const nuxtApp = useNuxtApp()
  const token = useState<string | null>(STATE_KEY_TOKEN)
  const user = useState<ConvexUser | null>(STATE_KEY_USER)
  const pending = useState<boolean>(STATE_KEY_PENDING)
  const rawAuthError = useState<string | null>(STATE_KEY_AUTH_ERROR)
  const wasAuthenticated = useState<boolean>(
    'better-convex:was-authenticated',
    () => Boolean(options.initialToken && options.initialUser),
  )

  token.value = options.initialToken ?? null
  user.value = options.initialUser ?? null
  pending.value = options.initialPending ?? false
  rawAuthError.value = options.initialAuthError ?? null
  wasAuthenticated.value = options.initialWasAuthenticated ?? Boolean(token.value && user.value)

  const transport: AuthTransport = {
    client: {
      signOut: options.signOut ?? (async () => {}),
    } as never,
    fetchAuthState: options.fetchAuthState ?? (async () => ({
      token: 'refreshed.jwt.token',
      user: { id: 'u-auth' },
      error: null,
      source: 'exchange',
    })),
    install() {
    },
    async refresh(fetchToken, onChange) {
      const nextToken = await fetchToken({ forceRefreshToken: true })
      onChange(Boolean(nextToken))
    },
    async invalidate() {
      await options.invalidate?.()
    },
  }

  const engine = getOrCreateSharedAuthEngine({
    nuxtApp,
    token,
    user,
    pending,
    rawAuthError,
    wasAuthenticated,
    transport,
  })

  engine.initialize()

  return {
    engine,
    token,
    user,
    pending,
    rawAuthError,
    wasAuthenticated,
    nuxtApp,
  }
}
