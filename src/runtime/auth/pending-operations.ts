import { computed, ref, type ComputedRef } from 'vue'

/**
 * Per-Nuxt-app identity-operation coordinator.
 *
 * Sign-in, sign-up, sign-out, and refresh share one invocation-order queue.
 * Rejection never wedges the tail. Refresh is deduplicated by the identity
 * generation visible when it was requested.
 */
export interface AuthOperationCoordinator {
  readonly isPending: ComputedRef<boolean>
  run<T>(operation: () => Promise<T>): Promise<T>
  refresh(identityGeneration: number, operation: () => Promise<void>): Promise<void>
}

export function createAuthOperationCoordinator(): AuthOperationCoordinator {
  const pendingCount = ref(0)
  const isPending = computed(() => pendingCount.value > 0)
  const refreshes = new Map<number, Promise<void>>()
  let tail: Promise<unknown> = Promise.resolve()

  function run<T>(operation: () => Promise<T>): Promise<T> {
    pendingCount.value += 1
    const result = tail.then(operation, operation)
    tail = result.then(
      () => {},
      () => {},
    )
    return result.finally(() => {
      pendingCount.value -= 1
    })
  }

  function refresh(identityGeneration: number, operation: () => Promise<void>): Promise<void> {
    const existing = refreshes.get(identityGeneration)
    if (existing) return existing
    const pending = run(operation).finally(() => {
      if (refreshes.get(identityGeneration) === pending) {
        refreshes.delete(identityGeneration)
      }
    })
    refreshes.set(identityGeneration, pending)
    return pending
  }

  return { isPending, run, refresh }
}
