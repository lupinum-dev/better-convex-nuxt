import { describe, expect, it, vi } from 'vitest'

import type { ConvexClientOwner } from '../../src/runtime/client-core/client-owner'
import { createDevtoolsSink } from '../../src/runtime/devtools/sink'
import { createConvexRuntimeContext } from '../../src/runtime/runtime-context'
import { createLogger } from '../../src/runtime/utils/logger'

function createOwnerHarness() {
  const identityListeners = new Set<() => void>()
  const disposers = new Set<() => void>()
  const owner = {
    subscribeIdentityChange(listener: () => void) {
      identityListeners.add(listener)
      return () => identityListeners.delete(listener)
    },
    addDisposer(disposer: () => void) {
      disposers.add(disposer)
    },
  } as unknown as ConvexClientOwner

  return {
    owner,
    changeIdentity() {
      for (const listener of [...identityListeners]) listener()
    },
    dispose() {
      for (const disposer of [...disposers]) disposer()
    },
  }
}

describe('ConvexRuntimeContext diagnostics ownership', () => {
  it('clears identity-owned diagnostics through the owner event seam', () => {
    const harness = createOwnerHarness()
    const runtime = createConvexRuntimeContext(harness.owner, createLogger(false))
    const sink = createDevtoolsSink()
    runtime.attachDevtoolsSink(sink)
    sink.registerMutation({
      name: 'notes:create',
      type: 'mutation',
      args: {},
      state: 'pending',
      hasOptimisticUpdate: false,
      startedAt: 1,
    })

    harness.changeIdentity()

    expect(sink.getMutations()).toEqual([])
  })

  it('disposes replaced, detached, owner-disposed, and late sinks exactly once', () => {
    const harness = createOwnerHarness()
    const runtime = createConvexRuntimeContext(harness.owner, createLogger(false))
    const first = createDevtoolsSink()
    const firstDispose = vi.spyOn(first, 'dispose')
    const detachFirst = runtime.attachDevtoolsSink(first)
    const second = createDevtoolsSink()
    const secondDispose = vi.spyOn(second, 'dispose')

    expect(detachFirst).toBeTypeOf('function')
    expect(runtime.attachDevtoolsSink(second)).toBeTypeOf('function')
    expect(firstDispose).toHaveBeenCalledTimes(1)
    detachFirst?.()
    expect(firstDispose).toHaveBeenCalledTimes(1)

    harness.dispose()
    expect(secondDispose).toHaveBeenCalledTimes(1)
    expect(runtime.getDevtoolsSink()).toBeNull()

    const late = createDevtoolsSink()
    const lateDispose = vi.spyOn(late, 'dispose')
    expect(runtime.attachDevtoolsSink(late)).toBeNull()
    expect(lateDispose).toHaveBeenCalledTimes(1)
  })
})
