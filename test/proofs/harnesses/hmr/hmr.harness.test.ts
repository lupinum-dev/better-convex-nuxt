import { afterEach, describe, expect, it } from 'vitest'

import { createHmrHarness, type HmrHarness } from './hmr-harness'

describe('HMR harness: real Vite dev server + browser HMR cycle', () => {
  let harness: HmrHarness | undefined

  afterEach(async () => {
    await harness?.dispose()
    harness = undefined
  })

  it('counts a deliberately-leaked listener across one HMR reload, and proves a disposed one does not leak', async () => {
    harness = await createHmrHarness()

    const countRegistry = () =>
      harness!.page.evaluate(
        () => (window as unknown as { __hmrRegistry: string[] }).__hmrRegistry.length,
      )
    const countKind = (kind: 'naive-listener' | 'good-listener') =>
      harness!.page.evaluate(
        (needle) =>
          (window as unknown as { __hmrRegistry: string[] }).__hmrRegistry.filter(
            (entry) => entry === needle,
          ).length,
        kind,
      )

    // Before: one of each, from the initial module evaluation.
    expect(await countRegistry()).toBe(2)
    expect(await countKind('naive-listener')).toBe(1)
    expect(await countKind('good-listener')).toBe(1)

    // Trigger one real HMR cycle by editing both watched files.
    await harness.editFile('naive-plugin.js', (content) => `${content}\n// bump ${Date.now()}`)
    await harness.editFile('good-plugin.js', (content) => `${content}\n// bump ${Date.now()}`)
    await harness.waitForHmrCycle()

    // After: the naive plugin leaked one more listener (no dispose hook);
    // the well-behaved plugin's `import.meta.hot.dispose` cleaned its old
    // listener up before re-registering, so its count is unchanged.
    expect(await countKind('naive-listener')).toBe(2)
    expect(await countKind('good-listener')).toBe(1)
    expect(await countRegistry()).toBe(3)
  })

  it('runs a second independent HMR cycle correctly (no cross-cycle interference)', async () => {
    harness = await createHmrHarness()

    await harness.editFile('good-plugin.js', (content) => `${content}\n// bump-1 ${Date.now()}`)
    await harness.waitForHmrCycle()

    const countKind = (kind: 'naive-listener' | 'good-listener') =>
      harness!.page.evaluate(
        (needle) =>
          (window as unknown as { __hmrRegistry: string[] }).__hmrRegistry.filter(
            (entry) => entry === needle,
          ).length,
        kind,
      )

    expect(await countKind('good-listener')).toBe(1)

    await harness.editFile('good-plugin.js', (content) => `${content}\n// bump-2 ${Date.now()}`)
    await harness.waitForHmrCycle()

    expect(await countKind('good-listener')).toBe(1)
    expect(await countKind('naive-listener')).toBe(1) // untouched across both cycles
  })
})
