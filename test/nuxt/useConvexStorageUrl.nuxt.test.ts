import { describe, expect, it } from 'vitest'
import { ref } from 'vue'

import { useConvexStorageUrl } from '../../src/runtime/composables/useConvexStorageUrl'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'
import { waitFor } from '../helpers/wait-for'

describe('useConvexStorageUrl (Nuxt runtime)', () => {
  it('skips query when storageId is null and resolves url when storageId appears', async () => {
    const convex = new MockConvexClient()
    const getUrlQuery = mockFnRef<'query'>('files:getUrl')

    const { result, flush } = await captureInNuxt(() => {
      const storageId = ref<string | null>(null)
      const url = useConvexStorageUrl(getUrlQuery, storageId)
      return { storageId, url }
    }, { convex })

    expect(result.url.value).toBeNull()
    expect(convex.activeListenerCount()).toBe(0)

    result.storageId.value = 'storage_123'
    await flush()

    convex.emitQueryResultByPath('files:getUrl', 'https://files.example.com/123')
    await waitFor(() => result.url.value === 'https://files.example.com/123')
    expect(result.url.value).toBe('https://files.example.com/123')
  })
})

