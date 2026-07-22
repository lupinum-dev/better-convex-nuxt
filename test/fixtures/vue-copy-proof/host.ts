import { shallowRef } from 'vue'

import { ConvexCallError } from '../../../packages/vue/src/errors'
import { createAttachedClientRuntime } from '../../../packages/vue/src/internal/attached-runtime'
import type { ClientIdentitySnapshot } from '../../../packages/vue/src/internal/identity-port'

export const hostVueIdentity = shallowRef

export function createHostRuntime(secret: string) {
  let snapshot = {
    authEnabled: true,
    settled: true,
    identityKey: 'user:alice',
    authEpoch: 1,
    identityGeneration: 1,
    error: new ConvexCallError({
      kind: 'authentication',
      message: 'Identity unavailable',
      cause: secret,
    }),
    token: secret,
  } as ClientIdentitySnapshot & { token: string }
  const listeners = new Set<() => void>()
  let detachCount = 0

  const client = {
    query: async () => 'query',
    mutation: async () => 'mutation',
    action: async () => 'action',
    onUpdate: () => () => {},
    rawClient: { secret },
  }

  const runtime = createAttachedClientRuntime({
    client: client as never,
    identity: {
      snapshot: () => snapshot,
      waitForInitialSettlement: async () => {},
      subscribe(listener) {
        listeners.add(listener)
        return () => {
          detachCount += 1
          listeners.delete(listener)
        }
      },
    },
  })

  return {
    runtime,
    emit(next: ClientIdentitySnapshot) {
      snapshot = { ...next, token: secret }
      for (const listener of [...listeners]) listener()
    },
    listenerCount: () => listeners.size,
    detachCount: () => detachCount,
  }
}
