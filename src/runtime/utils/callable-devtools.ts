import type { DevtoolsSink } from '../devtools/sink'
import type { ConvexCallError } from '../errors'

interface CallableDevtoolsEvent {
  sink: DevtoolsSink
  id: string
}

export function createCallableDevtoolsEvents<Args, Result>(input: {
  operation: 'mutation' | 'action'
  fnName: string
  hasOptimisticUpdate: boolean
  getSink: () => DevtoolsSink | null
}): {
  startEvent(args: Args, startedAt: number): CallableDevtoolsEvent | undefined
  finishEvent(event: unknown, result: Result, startedAt: number): void
  failEvent(event: unknown, error: ConvexCallError, startedAt: number): void
} {
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
