import type { FunctionReference } from 'convex/server'
import { watch } from 'vue'

import { useNuxtApp } from '#imports'

import { useConvexAuthController } from '../internal/useConvexAuthController.js'
import { useAuthBootstrapDevtoolsState } from '../../devtools/state.js'
import { toErrorMessage } from '../../utils/value-helpers.js'

export function setupConfiguredAuthBootstrap<TMutation extends FunctionReference<'mutation'>>(
  mutationRef: TMutation,
  configuredMutationName: string,
): void {
  if (import.meta.server) return

  const nuxtApp = useNuxtApp()
  const auth = useConvexAuthController()
  const state = useAuthBootstrapDevtoolsState()
  let lastEnsuredUserId: string | null = null
  let activeBootstrapRequestId = 0
  const setState = (input: {
    pending: boolean
    ensured: boolean
    lastUserId: string | null
    error: string | null
  }) => {
    state.value = {
      mutationName: configuredMutationName,
      pending: input.pending,
      ensured: input.ensured,
      lastUserId: input.lastUserId,
      error: input.error,
    }
  }

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
      const requestId = ++activeBootstrapRequestId
      if (!authenticated || !currentUser?.id) {
        lastEnsuredUserId = null
        setState({ pending: false, ensured: false, lastUserId: null, error: null })
        return
      }

      if (lastEnsuredUserId === currentUser.id) {
        setState({ pending: false, ensured: true, lastUserId: lastEnsuredUserId, error: null })
        return
      }

      if (!nuxtApp.$convex || typeof nuxtApp.$convex.mutation !== 'function') {
        setState({
          pending: false,
          ensured: false,
          lastUserId: currentUser.id,
          error: 'Convex client is not initialized.',
        })
        return
      }

      setState({ pending: true, ensured: false, lastUserId: currentUser.id, error: null })

      try {
        await nuxtApp.$convex.mutation(mutationRef, {} as never)
        if (requestId !== activeBootstrapRequestId) {
          return
        }
        lastEnsuredUserId = currentUser.id
        setState({ pending: false, ensured: true, lastUserId: currentUser.id, error: null })
      } catch (error) {
        if (requestId !== activeBootstrapRequestId) {
          return
        }
        setState({
          pending: false,
          ensured: false,
          lastUserId: currentUser.id,
          error: toErrorMessage(error),
        })
      }
    },
    { immediate: true },
  )
}
