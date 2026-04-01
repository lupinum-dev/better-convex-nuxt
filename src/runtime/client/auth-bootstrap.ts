import type { FunctionReference } from 'convex/server'
import { watch } from 'vue'

import { useNuxtApp } from '#imports'

import { useConvexAuthController } from '../composables/internal/useConvexAuthController'
import { useAuthBootstrapDevtoolsState } from '../devtools/state'

function isHarmlessBootstrapError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /already|duplicate|exists/i.test(message)
}

export function setupConfiguredAuthBootstrap<TMutation extends FunctionReference<'mutation'>>(
  mutationRef: TMutation,
  configuredMutationName: string,
): void {
  if (import.meta.server) return

  const nuxtApp = useNuxtApp()
  const auth = useConvexAuthController()
  const state = useAuthBootstrapDevtoolsState()
  let lastEnsuredUserId: string | null = null

  state.value = {
    mutationName: configuredMutationName,
    pending: false,
    ensured: false,
    lastUserId: null,
    error: null,
  }

  watch(
    [auth.isAuthenticated, auth.user],
    async ([authenticated, currentUser]) => {
      if (!authenticated || !currentUser?.id) {
        lastEnsuredUserId = null
        state.value = {
          ...state.value,
          pending: false,
          ensured: false,
          lastUserId: null,
          error: null,
        }
        return
      }

      if (lastEnsuredUserId === currentUser.id || state.value.pending) {
        state.value = {
          ...state.value,
          ensured: lastEnsuredUserId === currentUser.id,
          lastUserId: lastEnsuredUserId,
        }
        return
      }

      state.value = {
        ...state.value,
        pending: true,
        ensured: false,
        lastUserId: currentUser.id,
        error: null,
      }

      try {
        await nuxtApp.$convex?.mutation(mutationRef, {} as never)
        lastEnsuredUserId = currentUser.id
        state.value = {
          ...state.value,
          pending: false,
          ensured: true,
          lastUserId: currentUser.id,
          error: null,
        }
      } catch (error) {
        if (isHarmlessBootstrapError(error)) {
          lastEnsuredUserId = currentUser.id
          state.value = {
            ...state.value,
            pending: false,
            ensured: true,
            lastUserId: currentUser.id,
            error: null,
          }
          return
        }

        state.value = {
          ...state.value,
          pending: false,
          ensured: false,
          lastUserId: currentUser.id,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    },
    { immediate: true },
  )
}
