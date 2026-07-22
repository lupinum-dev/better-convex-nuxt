import type {
  CallableControllerHandlers,
  CallableOperation,
} from '../client-core/callable-controller'
import type { DevtoolsSink } from '../devtools/sink'

interface CallableDevtoolsEvent {
  sink: DevtoolsSink
  id: string
}

export function createCallableDevtoolsEvents<Args, Result>(input: {
  operation: CallableOperation
  fnName: string
  hasOptimisticUpdate: boolean
  getSink: () => DevtoolsSink | null
}): Pick<CallableControllerHandlers<Args, Result>, 'startEvent' | 'finishEvent' | 'failEvent'> {
  return {
    startEvent(args, startedAt): CallableDevtoolsEvent | undefined {
      const sink = input.getSink()
      if (!sink) return undefined
      const id = sink.registerMutation({
        name: input.fnName,
        type: input.operation,
        args,
        state:
          input.operation === 'mutation' && input.hasOptimisticUpdate ? 'optimistic' : 'pending',
        hasOptimisticUpdate: input.hasOptimisticUpdate,
        startedAt,
      })
      return id ? { sink, id } : undefined
    },
    finishEvent(rawEvent, result, startedAt) {
      const event = rawEvent as CallableDevtoolsEvent | undefined
      if (!event) return
      const settledAt = Date.now()
      event.sink.updateMutation(event.id, {
        state: 'success',
        result,
        settledAt,
        duration: settledAt - startedAt,
      })
    },
    failEvent(rawEvent, error, startedAt) {
      const event = rawEvent as CallableDevtoolsEvent | undefined
      if (!event) return
      const settledAt = Date.now()
      event.sink.updateMutation(event.id, {
        state: 'error',
        error: error.message,
        settledAt,
        duration: settledAt - startedAt,
      })
    },
  }
}
