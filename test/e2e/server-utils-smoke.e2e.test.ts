import { fileURLToPath } from 'node:url'

import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { afterAll, describe, expect, it } from 'vitest'

import { ensureLocalConvex } from '../helpers/local-convex'

let local: Awaited<ReturnType<typeof ensureLocalConvex>> | null = null
try {
  local = await ensureLocalConvex({
    cwd: fileURLToPath(new URL('../../playground', import.meta.url)),
  })
} catch (error) {
  console.warn(
    `[e2e] Skipping server-utils smoke suite: ${error instanceof Error ? error.message : String(error)}`,
  )
}

const maybeDescribe = local ? describe : describe.skip
const fetchUnknown = $fetch as (
  request: string,
  options?: { method?: string; body?: unknown },
) => Promise<unknown>

maybeDescribe('Server caller smoke (serverConvex query/mutation)', async () => {
  afterAll(async () => {
    if (local) {
      await local.release()
    }
  })

  await setup({
    rootDir: fileURLToPath(new URL('../../playground', import.meta.url)),
    env: local?.env,
    nuxtConfig: local
      ? {
          convex: {
            url: local.env.NUXT_PUBLIC_CONVEX_URL,
            siteUrl: local.env.NUXT_PUBLIC_CONVEX_SITE_URL,
          },
        }
      : undefined,
  })

  it('round-trips through Nitro API endpoints backed by server fetch helpers', async () => {
    const queryResponse = (await fetchUnknown('/api/test-server-query?limit=1')) as {
      success: boolean
      count: number
      totalAvailable: number
      notes: unknown[]
      executedOn: string
      message?: string
      error?: string
    }

    expect(queryResponse.success, JSON.stringify(queryResponse)).toBe(true)
    expect(queryResponse.executedOn).toBe('server')
    expect(Array.isArray(queryResponse.notes)).toBe(true)
    expect(queryResponse.count).toBeLessThanOrEqual(1)

    const uniqueTitle = `Server smoke ${Date.now()}`
    const mutationResponse = (await fetchUnknown('/api/test-server-mutation', {
      method: 'POST',
      body: {
        title: uniqueTitle,
        content: 'Created by server-utils-smoke.e2e.test.ts',
      },
    })) as {
      success: boolean
      noteId?: string
      meta?: { title?: string; executedOn?: string }
      message?: string
      error?: string
    }

    expect(mutationResponse.success, JSON.stringify(mutationResponse)).toBe(true)
    expect(mutationResponse.noteId).toBeTruthy()
    expect(mutationResponse.meta?.title).toBe(uniqueTitle)
    expect(mutationResponse.meta?.executedOn).toBe('server')
  })
})
