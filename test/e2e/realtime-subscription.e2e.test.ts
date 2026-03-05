import { fileURLToPath } from 'node:url'

import { setup, createPage } from '@nuxt/test-utils/e2e'
import { afterAll, describe, expect, it } from 'vitest'

import { ensureLocalConvex } from '../helpers/local-convex'

let local: Awaited<ReturnType<typeof ensureLocalConvex>> | null = null
try {
  local = await ensureLocalConvex({
    cwd: fileURLToPath(new URL('../../playground', import.meta.url)),
  })
} catch (error) {
  console.warn(
    '[e2e] Skipping realtime subscription suite: local Convex backend unavailable.',
    error,
  )
}

const maybeDescribe = local ? describe : describe.skip

maybeDescribe('Realtime subscription (full stack)', async () => {
  afterAll(async () => {
    if (local) {
      await local.release()
    }
  })

  await setup({
    rootDir: fileURLToPath(new URL('../../playground', import.meta.url)),
    env: local ? local.env : undefined,
  })

  it('syncs added note across tabs', async () => {
    const page1 = await createPage('/labs/realtime')
    const page2 = await createPage('/labs/realtime')

    const initialCount = Number.parseInt(
      (await page2.textContent('[data-testid="count"]')) || '0',
      10,
    )

    await page1.click('[data-testid="add-btn"]')

    await page2.waitForFunction(
      (count) => {
        const el = document.querySelector('[data-testid="count"]')
        return Number.parseInt(el?.textContent || '0', 10) >= count + 1
      },
      initialCount,
      {
        timeout: 15000,
      },
    )

    const updatedCount = Number.parseInt(
      (await page2.textContent('[data-testid="count"]')) || '0',
      10,
    )
    expect(updatedCount).toBeGreaterThanOrEqual(initialCount + 1)
  })
})
