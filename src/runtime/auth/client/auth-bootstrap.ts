import type { FunctionReference } from 'convex/server'
import { watch } from 'vue'

import { useNuxtApp } from '#imports'

import { useAuthBootstrapDevtoolsState } from '../../devtools/state.js'
import { toErrorMessage } from '../../utils/value-helpers.js'
import { useConvexAuthController } from '../internal/useConvexAuthController.js'

export function setupConfiguredAuthBootstrap<TMutation extends FunctionReference<'mutation'>>(
  mutationRef: TMutation,
  configuredMutationName: string,
): void {
  if (import.meta.server) return

  const nuxtApp = useNuxtApp()
  const auth = useConvexAuthController()
  const state = useAuthBootstrapDevtoolsState()
  let lastEnsuredToken: string | null = null
  let activeBootstrapRequestId = 0
  const setState = (input: { pending: boolean; ensured: boolean; error: string | null }) => {
    state.value = {
      mutationName: configuredMutationName,
      pending: input.pending,
      ensured: input.ensured,
      error: input.error,
    }
  }

  state.value = {
    mutationName: configuredMutationName,
    pending: false,
    ensured: false,
    error: null,
  }

  watch(
    [auth.isAuthenticated, auth.token],
    async ([authenticated, token]) => {
      const requestId = ++activeBootstrapRequestId
      if (!authenticated || !token) {
        lastEnsuredToken = null
        setState({ pending: false, ensured: false, error: null })
        return
      }

      if (lastEnsuredToken === token) {
        setState({ pending: false, ensured: true, error: null })
        return
      }

      if (!nuxtApp.$convex || typeof nuxtApp.$convex.mutation !== 'function') {
        setState({
          pending: false,
          ensured: false,
          error: 'Convex client is not initialized.',
        })
        return
      }

      setState({ pending: true, ensured: false, error: null })

      try {
        await nuxtApp.$convex.mutation(mutationRef, {} as never)
        if (requestId !== activeBootstrapRequestId) {
          return
        }
        lastEnsuredToken = token
        setState({ pending: false, ensured: true, error: null })
      } catch (error) {
        if (requestId !== activeBootstrapRequestId) {
          return
        }
        setState({
          pending: false,
          ensured: false,
          error: toErrorMessage(error),
        })
      }
    },
    { immediate: true },
  )
}
