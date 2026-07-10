import { computed, ref, type ComputedRef, type Ref } from 'vue'

import type { ConvexCallError } from '../errors'
import type { ConvexCallStatus } from './types'

export interface ConvexCallState<Result> {
  data: Ref<Result | undefined>
  status: ComputedRef<ConvexCallStatus>
  pending: ComputedRef<boolean>
  error: Ref<ConvexCallError | null>
  start: () => number
  commitSuccess: (requestId: number, result: Result) => boolean
  commitError: (requestId: number, error: ConvexCallError) => boolean
  /** Synchronously mask retained data/error and retire pending (identity change). */
  mask: () => void
  reset: () => void
}

export function createConvexCallState<Result>(): ConvexCallState<Result> {
  let activeRequestId = 0
  const currentStatus = ref<ConvexCallStatus>('idle')
  const error = ref<ConvexCallError | null>(null) as Ref<ConvexCallError | null>
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

  const commitError = (requestId: number, err: ConvexCallError) => {
    if (requestId !== activeRequestId) return false
    currentStatus.value = 'error'
    error.value = err
    return true
  }

  // Identity change: drop retained data/error and retire any pending call so a
  // later stale completion cannot commit (its requestId is now superseded).
  const mask = () => {
    activeRequestId += 1
    currentStatus.value = 'idle'
    error.value = null
    data.value = undefined
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
    mask,
    reset,
  }
}
