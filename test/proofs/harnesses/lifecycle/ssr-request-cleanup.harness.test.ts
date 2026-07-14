/**
 * Lifecycle fixture: SSR request cleanup (internal §16, "SSR does not rely
 * on Vue unmount. Prefer allocating no detached SSR scope: queries use
 * one-shot request execution and no WebSocket client. If an app-level
 * abstraction must create a detached scope during SSR, Internal Phase 0
 * must first prove one request-completion path that runs for successful
 * and failed renders; until that proof exists, the detached server scope is
 * forbidden.").
 *
 * This fixture proves that ONE request-completion path can run for both a
 * successful and a failed render and still balance every effect it opened
 * (no leaked resource depends on `onUnmounted`, which SSR never fires). It
 * uses mock counters — no live Convex client or Nuxt app needed, matching
 * the ask to keep this deterministic and to reserve the live harness (§20
 * port range 4640-4649) for where a real client is essential.
 *
 * IMPORTANT SCOPE NOTE for whoever consumes this fixture in a later phase:
 * this proves the GENERIC one-shot-completion mechanic requested by internal
 * §16's proof gate. It does not itself authorize adding a detached SSR
 * scope to production code — internal §16 is explicit that the default is
 * "allocate no detached SSR scope" and this proof is the prerequisite gate,
 * not a green light.
 */
import { describe, expect, it } from 'vitest'

import { createResourceCounter } from './resource-counter'

/**
 * Models "one request-completion path" as a single function that always
 * runs its cleanup in a `finally`, regardless of whether the render inside
 * succeeded or threw — the shape internal §16 requires before any detached
 * SSR scope is allowed to exist at all.
 */
async function runRequestWithCleanup<T>(
  counter: ReturnType<typeof createResourceCounter>,
  render: () => Promise<T>,
): Promise<T> {
  const resource = counter.create()
  try {
    return await render()
  } finally {
    resource.dispose()
  }
}

describe('lifecycle fixture: SSR request cleanup (one path, success and failure)', () => {
  it('disposes the request-scoped resource after a SUCCESSFUL render', async () => {
    const counter = createResourceCounter()

    const result = await runRequestWithCleanup(counter, async () => 'rendered-html')

    expect(result).toBe('rendered-html')
    expect(counter.live()).toBe(0) // no leak on the success path
    expect(counter.created).toBe(1)
    expect(counter.disposed).toBe(1)
  })

  it('disposes the request-scoped resource after a FAILED render (same code path)', async () => {
    const counter = createResourceCounter()

    await expect(
      runRequestWithCleanup(counter, async () => {
        throw new Error('render failed')
      }),
    ).rejects.toThrow('render failed')

    expect(counter.live()).toBe(0) // no leak on the failure path either
    expect(counter.created).toBe(1)
    expect(counter.disposed).toBe(1)
  })

  it('proves it is the SAME path for both outcomes: interleaved successes and failures never accumulate live resources', async () => {
    const counter = createResourceCounter()
    const outcomes = [true, false, true, true, false, false, true]

    for (const shouldSucceed of outcomes) {
      if (shouldSucceed) {
        await runRequestWithCleanup(counter, async () => 'ok')
      } else {
        await runRequestWithCleanup(counter, async () => {
          throw new Error('boom')
        }).catch(() => {})
      }
      expect(counter.live()).toBe(0) // zero after every single request, success or failure
    }

    expect(counter.created).toBe(outcomes.length)
    expect(counter.disposed).toBe(outcomes.length)
  })
})
