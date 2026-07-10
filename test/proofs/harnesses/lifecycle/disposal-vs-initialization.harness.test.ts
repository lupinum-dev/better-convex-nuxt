/**
 * Lifecycle fixture: disposal-versus-initialization ordering (internal
 * §17.2/§17.3).
 *
 * Proves the ordering invariant a primary-client replacement (vNext.md
 * §5.4 "the owner rebinds every active `onUpdate` listener to the fresh
 * primary client during A→B before publishing B") depends on: the OLD
 * resource's disposal must be observably complete before the NEW resource
 * is initialized and published, not merely "eventually both happen" or
 * "new one created, then old one cleaned up later." Counts effects at each
 * step rather than only asserting the final state, so a fixture that
 * accidentally reorders init-before-dispose is caught even if the final
 * counts alone would look identical.
 */
import { describe, expect, it } from 'vitest'

import { createResourceCounter } from './resource-counter'

interface OrderedStep {
  op: 'create' | 'dispose'
  id: number
}

describe('lifecycle fixture: disposal-versus-initialization ordering', () => {
  it('a correct A-to-B replacement disposes A fully before creating B', () => {
    const counter = createResourceCounter()
    const order: OrderedStep[] = []

    function createTracked() {
      const resource = counter.create()
      order.push({ op: 'create', id: resource.id })
      return {
        id: resource.id,
        dispose: () => {
          resource.dispose()
          order.push({ op: 'dispose', id: resource.id })
        },
      }
    }

    // Correct replacement: dispose-then-create, matching vNext.md §5.4's
    // "rebinds ... to the fresh primary client during A→B before publishing B".
    const a = createTracked()
    a.dispose()
    const b = createTracked()

    expect(order).toEqual([
      { op: 'create', id: 1 },
      { op: 'dispose', id: 1 },
      { op: 'create', id: 2 },
    ])
    expect(counter.live()).toBe(1) // only B live
    expect(order.findIndex((step) => step.op === 'dispose' && step.id === 1)).toBeLessThan(
      order.findIndex((step) => step.op === 'create' && step.id === 2),
    ) // A's disposal strictly precedes B's creation

    b.dispose()
    expect(counter.live()).toBe(0)
  })

  it('DEMONSTRATES a misordered replacement (create-before-dispose) is distinguishable even though final counts match', () => {
    const counter = createResourceCounter()
    const order: OrderedStep[] = []

    function createTracked() {
      const resource = counter.create()
      order.push({ op: 'create', id: resource.id })
      return {
        id: resource.id,
        dispose: () => {
          resource.dispose()
          order.push({ op: 'dispose', id: resource.id })
        },
      }
    }

    // Misordered: B is created (and could already be publishing results)
    // before A is disposed — a transient window where both are live, which
    // is exactly what vNext.md §5.4 forbids ("before publishing B").
    const a = createTracked()
    const b = createTracked() // created while A is still live
    a.dispose()

    // Final live count looks identical to the correct ordering (1 live, B).
    expect(counter.live()).toBe(1)

    // But the ORDER reveals the defect: B's creation did not wait for A's disposal.
    const disposeAIndex = order.findIndex((step) => step.op === 'dispose' && step.id === a.id)
    const createBIndex = order.findIndex((step) => step.op === 'create' && step.id === b.id)
    expect(createBIndex).toBeLessThan(disposeAIndex) // proves misordering, not visible from final counts alone

    b.dispose()
    expect(counter.live()).toBe(0)
  })
})
