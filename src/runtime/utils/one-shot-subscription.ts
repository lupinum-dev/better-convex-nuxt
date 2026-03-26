import type { ConvexClient } from 'convex/browser'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'

import { SUBSCRIPTION_TIMEOUT_MS } from './constants'

export function executeQueryViaSubscriptionOnce<Query extends FunctionReference<'query'>>(
  convex: ConvexClient,
  query: Query,
  args: FunctionArgs<Query>,
  options?: { timeoutMs?: number },
): Promise<FunctionReturnType<Query>> {
  const timeoutMs = options?.timeoutMs ?? SUBSCRIPTION_TIMEOUT_MS

  return new Promise((resolve, reject) => {
    let settled = false
    let timeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      finishReject(
        new Error(
          `[useConvexQuery] Timed out waiting for subscription result after ${timeoutMs}ms`,
        ),
      )
    }, timeoutMs)

    let unsubscribe: (() => void) | null = null

    const cleanup = () => {
      if (timeout) {
        clearTimeout(timeout)
        timeout = null
      }
      if (unsubscribe) {
        unsubscribe()
        unsubscribe = null
      }
    }

    const finishResolve = (result: FunctionReturnType<Query>) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(result)
    }

    const finishReject = (error: unknown) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error instanceof Error ? error : new Error(String(error)))
    }

    try {
      unsubscribe = convex.onUpdate(
        query,
        args,
        (result: FunctionReturnType<Query>) => finishResolve(result),
        (error: Error) => finishReject(error),
      )
    } catch (error) {
      finishReject(error)
    }
  })
}
