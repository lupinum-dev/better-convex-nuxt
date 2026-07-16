import { computed, ref, type ComputedRef } from 'vue'

/**
 * Independent operation-progress accounting.
 *
 * `isPending` is derived from a COUNTER, never a boolean, because integrated
 * sign-in nests `refresh()` inside the sign-in operation and independent
 * `true`/`false` assignments would clear pending before the outer operation
 * finished. Deduplicated refresh callers await one shared promise, so the
 * underlying refresh is counted once (the coordinator runs `run()` around the
 * shared promise, not around each waiter).
 */
export interface PendingOperations {
  readonly isPending: ComputedRef<boolean>
  run<T>(operation: () => Promise<T>): Promise<T>
}

export function createPendingOperations(): PendingOperations {
  const activeCount = ref(0)
  const isPending = computed(() => activeCount.value > 0)

  async function run<T>(operation: () => Promise<T>): Promise<T> {
    activeCount.value += 1
    try {
      return await operation()
    } finally {
      activeCount.value -= 1
      // Self-heal a negative count (a symptom of unbalanced run() calls) rather
      // than throwing from `finally`, which would mask the operation's result.
      if (activeCount.value < 0) activeCount.value = 0
    }
  }

  return { isPending, run }
}
