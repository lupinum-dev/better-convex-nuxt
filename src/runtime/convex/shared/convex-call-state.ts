import { ref, computed, type Ref } from 'vue'

import type { NuxtApp } from '#app'

import { handleUnauthorizedAuthFailure } from '../../auth/shared/auth-unauthorized.js'
import {
  registerDevtoolsEntry,
  updateDevtoolsEntrySuccess,
  updateDevtoolsEntryError,
} from '../../devtools/runtime.js'
import type { RuntimeObserver } from '../../observability/runtime-observer.js'
import { ConvexCallError, toConvexError } from '../../utils/call-result.js'
import { resolveSchema, runValidation, type ValidateOption } from '../../utils/resolve-validator.js'
import type {
  ConvexCallErrorPayload,
  ConvexCallOperation,
  ConvexCallSuccessPayload,
  MutationStatus,
} from '../../utils/types.js'
import type { UseConvexMutationReturn } from './command-types.js'

function shouldEmitDevWarning(): boolean {
  return import.meta.dev || process.env.NODE_ENV !== 'production'
}

type ConvexCallHookHandlers<TCallType extends ConvexCallOperation, Result> = {
  error: (payload: ConvexCallErrorPayload<TCallType>) => void
  success: (payload: ConvexCallSuccessPayload<TCallType, Result>) => void
}

function createConvexCallHookHandlers<TCallType extends ConvexCallOperation, Result>(
  nuxtApp: NuxtApp,
  callType: TCallType,
): ConvexCallHookHandlers<TCallType, Result> {
  if (callType === 'mutation') {
    return {
      error: (payload: ConvexCallErrorPayload<'mutation'>) => {
        void nuxtApp.callHook('trellis:mutation:error', payload)
      },
      success: (payload: ConvexCallSuccessPayload<'mutation', Result>) => {
        void nuxtApp.callHook('trellis:mutation:success', payload)
      },
    } as ConvexCallHookHandlers<TCallType, Result>
  }

  return {
    error: (payload: ConvexCallErrorPayload<'action'>) => {
      void nuxtApp.callHook('trellis:action:error', payload)
    },
    success: (payload: ConvexCallSuccessPayload<'action', Result>) => {
      void nuxtApp.callHook('trellis:action:success', payload)
    },
  } as ConvexCallHookHandlers<TCallType, Result>
}

interface ConvexCallStateOptions<
  Args extends Record<string, unknown>,
  Result,
  TCallType extends ConvexCallOperation,
> {
  fnName: string
  callType: TCallType
  logger: RuntimeObserver
  nuxtApp: NuxtApp
  hasOptimisticUpdate: boolean
  callFn: (args: Args) => Promise<Result>
  onSuccess?: (result: Result, args: Args) => void
  onError?: (error: Error, args: Args) => void
  validate?: ValidateOption
}

export function createConvexCallState<
  Args extends Record<string, unknown>,
  Result,
  TCallType extends ConvexCallOperation,
>(config: ConvexCallStateOptions<Args, Result, TCallType>): UseConvexMutationReturn<Args, Result> {
  const {
    fnName,
    callType,
    logger,
    nuxtApp,
    hasOptimisticUpdate,
    callFn,
    onSuccess,
    onError,
    validate: validateOption,
  } = config
  const hookHandlers = createConvexCallHookHandlers<TCallType, Result>(nuxtApp, callType)

  let activeRequestId = 0
  const _status = ref<MutationStatus>('idle')
  const rawError = ref<Error | null>(null)
  const data = ref<Result | undefined>(undefined) as Ref<Result | undefined>
  let errorVersion = 0
  let lastReadErrorVersion = 0
  let unreadErrorTimer: ReturnType<typeof setTimeout> | null = null

  const clearUnreadErrorTimer = () => {
    if (unreadErrorTimer) {
      clearTimeout(unreadErrorTimer)
      unreadErrorTimer = null
    }
  }

  const scheduleUnreadErrorWarning = (nextError: Error | null) => {
    clearUnreadErrorTimer()
    if (!import.meta.client || !shouldEmitDevWarning() || !nextError) return

    const scheduledVersion = errorVersion
    unreadErrorTimer = setTimeout(() => {
      if (rawError.value !== nextError) return
      if (lastReadErrorVersion >= scheduledVersion) return
      console.warn(
        `[trellis] ${callType} "${fnName}" failed, but \`.error.value\` was never read. Surface mutation errors explicitly in the UI or script.`,
      )
    }, 2000)
  }

  const setTrackedError = (nextError: Error | null) => {
    rawError.value = nextError
    if (nextError) {
      errorVersion += 1
      scheduleUnreadErrorWarning(nextError)
      return
    }
    clearUnreadErrorTimer()
  }

  const error = {
    get value() {
      lastReadErrorVersion = errorVersion
      return rawError.value
    },
    set value(nextValue: Error | null) {
      setTrackedError(nextValue)
    },
  } as Ref<Error | null>

  const status = computed(() => _status.value)
  const pending = computed(() => _status.value === 'pending')

  const reset = () => {
    activeRequestId += 1
    _status.value = 'idle'
    setTrackedError(null)
    data.value = undefined
  }

  const execute = async (args: Args): Promise<Result> => {
    const startTime = Date.now()
    const currentRequestId = ++activeRequestId

    _status.value = 'pending'
    setTrackedError(null)

    const callId = registerDevtoolsEntry(fnName, callType, args, hasOptimisticUpdate)

    if (hasOptimisticUpdate) {
      logger.mutation({ name: fnName, event: 'optimistic', args })
    }

    if (validateOption) {
      try {
        const schema = resolveSchema(validateOption)
        const check = await runValidation(schema, args)
        if (!check.valid) {
          const err = new ConvexCallError('Validation failed', {
            code: 'VALIDATION_ERROR',
            category: 'validation',
            operation: callType,
            functionPath: fnName,
            issues: check.issues,
          })
          if (currentRequestId === activeRequestId) {
            _status.value = 'error'
            setTrackedError(err)
          }
          try {
            onError?.(err, args)
          } catch (callbackError) {
            if (import.meta.dev) {
              console.warn(
                `[trellis] ${callType} onError callback threw in ${fnName}:`,
                callbackError,
              )
            }
          }
          updateDevtoolsEntryError(callId, startTime, err.message)
          const duration = Date.now() - startTime
          if (callType === 'mutation') {
            logger.mutation({ name: fnName, event: 'error', args, duration, error: err })
          } else {
            logger.action({ name: fnName, event: 'error', duration, error: err })
          }
          hookHandlers.error({
            functionPath: fnName,
            operation: callType,
            args,
            error: err,
            duration,
          })
          throw err
        }
      } catch (e) {
        if (e instanceof ConvexCallError) throw e
        const err = new ConvexCallError(
          e instanceof Error ? e.message : 'Pre-validation failed unexpectedly',
          {
            code: 'VALIDATION_ERROR',
            category: 'validation',
            operation: callType,
            functionPath: fnName,
            cause: e,
          },
        )
        if (currentRequestId === activeRequestId) {
          _status.value = 'error'
          setTrackedError(err)
        }
        try {
          onError?.(err, args)
        } catch (callbackError) {
          if (import.meta.dev) {
            console.warn(
              `[trellis] ${callType} onError callback threw in ${fnName}:`,
              callbackError,
            )
          }
        }
        updateDevtoolsEntryError(callId, startTime, err.message)
        const duration = Date.now() - startTime
        if (callType === 'mutation') {
          logger.mutation({ name: fnName, event: 'error', args, duration, error: err })
        } else {
          logger.action({ name: fnName, event: 'error', duration, error: err })
        }
        hookHandlers.error({
          functionPath: fnName,
          operation: callType,
          args,
          error: err,
          duration,
        })
        throw err
      }
    }

    try {
      const result = await callFn(args)
      if (currentRequestId === activeRequestId) {
        _status.value = 'success'
        data.value = result
      }

      try {
        onSuccess?.(result, args)
      } catch (callbackError) {
        if (import.meta.dev) {
          console.warn(
            `[trellis] ${callType} onSuccess callback threw in ${fnName}:`,
            callbackError,
          )
        }
      }

      updateDevtoolsEntrySuccess(callId, startTime, result)
      const duration = Date.now() - startTime
      if (callType === 'mutation') {
        logger.mutation({ name: fnName, event: 'success', args, duration })
      } else {
        logger.action({ name: fnName, event: 'success', duration })
      }

      hookHandlers.success({
        functionPath: fnName,
        operation: callType,
        args,
        result,
        duration,
      })

      return result
    } catch (e) {
      const err = toConvexError(e)
      if (currentRequestId === activeRequestId) {
        _status.value = 'error'
        setTrackedError(err)
      }

      try {
        onError?.(err, args)
      } catch (callbackError) {
        if (import.meta.dev) {
          console.warn(`[trellis] ${callType} onError callback threw in ${fnName}:`, callbackError)
        }
      }

      updateDevtoolsEntryError(callId, startTime, err.message)
      const duration = Date.now() - startTime
      if (callType === 'mutation') {
        logger.mutation({ name: fnName, event: 'error', args, duration, error: err })
      } else {
        logger.action({ name: fnName, event: 'error', duration, error: err })
      }
      hookHandlers.error({
        functionPath: fnName,
        operation: callType,
        args,
        error: err,
        duration,
      })
      void handleUnauthorizedAuthFailure({ error: err, source: callType, functionName: fnName })

      throw err
    }
  }

  const callable = ((args: Args) => execute(args)) as UseConvexMutationReturn<Args, Result>
  callable.data = data
  callable.status = status
  callable.pending = pending
  callable.error = error
  callable.reset = reset
  return callable
}
