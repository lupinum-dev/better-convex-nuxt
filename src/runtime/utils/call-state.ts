import { computed, ref, type ComputedRef, type Ref } from 'vue'

import type { ConvexCallStatus } from './types'

export interface ConvexCallState<Result> {
  data: Ref<Result | undefined>
  status: ComputedRef<ConvexCallStatus>
  pending: ComputedRef<boolean>
  error: Ref<Error | null>
  start: () => number
  commitSuccess: (requestId: number, result: Result) => boolean
  commitError: (requestId: number, error: Error) => boolean
  reset: () => void
}

export function createConvexCallState<Result>(): ConvexCallState<Result> {
  let activeRequestId = 0
  const currentStatus = ref<ConvexCallStatus>('idle')
  const error = ref<Error | null>(null) as Ref<Error | null>
  const data = ref<Result | undefined>(undefined) as Ref<Result | undefined>

  const status = computed(() => currentStatus.value)
  const pending = computed(() => currentStatus.value === 'pending')

  const start = () => {
    const requestId = ++activeRequestId
    currentStatus.value = 'pending'
    error.value = null
    return requestId
  }

  const commitSuccess = (requestId: number, result: Result) => {
    if (requestId !== activeRequestId) return false
    currentStatus.value = 'success'
    data.value = result
    return true
  }

  const commitError = (requestId: number, err: Error) => {
    if (requestId !== activeRequestId) return false
    currentStatus.value = 'error'
    error.value = err
    return true
  }

  const reset = () => {
    activeRequestId += 1
    currentStatus.value = 'idle'
    error.value = null
    data.value = undefined
  }

  return {
    data,
    status,
    pending,
    error,
    start,
    commitSuccess,
    commitError,
    reset,
  }
}
