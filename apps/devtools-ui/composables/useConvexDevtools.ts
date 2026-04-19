import { useDevtoolsClient } from '@nuxt/devtools-kit/iframe-client'
import { shallowRef, watchEffect } from 'vue'

import type { ConvexDevtoolsSnapshot } from '../../../src/runtime/devtools/types'

export function useConvexDevtools() {
  const client = useDevtoolsClient()
  const snapshot = shallowRef<ConvexDevtoolsSnapshot | null>(null)

  watchEffect(() => {
    if (!client.value?.host) return
    const store = (client.value.host.nuxt as Record<string, unknown>).$convexDevtoolsStore as
      | { getSnapshot(): ConvexDevtoolsSnapshot }
      | undefined
    snapshot.value = store?.getSnapshot() ?? null
  })

  return { snapshot, client }
}
