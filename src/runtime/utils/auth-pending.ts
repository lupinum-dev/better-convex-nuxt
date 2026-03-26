import { watch, type Ref } from 'vue'

import { AUTH_REFRESH_TIMEOUT_MS } from './constants'

export interface WaitForPendingClearOptions {
  timeoutMs?: number
  onTimeout?: () => void
}

/**
 * Wait for an auth pending ref to settle to false.
 * Returns false on timeout, true when settled.
 */
export async function waitForPendingClear(
  pending: Ref<boolean>,
  options: WaitForPendingClearOptions = {},
): Promise<boolean> {
  if (!pending.value) {
    return true
  }

  const timeoutMs = options.timeoutMs ?? AUTH_REFRESH_TIMEOUT_MS

  return await new Promise<boolean>((resolve) => {
    let settled = false
    let stopWatch: (() => void) | null = null
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const finish = (value: boolean) => {
      if (settled) return
      settled = true
      stopWatch?.()
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      resolve(value)
    }

    stopWatch = watch(pending, (isPending) => {
      if (!isPending) {
        finish(true)
      }
    })

    timeoutId = setTimeout(() => {
      options.onTimeout?.()
      finish(false)
    }, timeoutMs)
  })
}
