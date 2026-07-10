import { ref, onMounted, onUnmounted, watch } from 'vue'

import type { MutationEntry } from '../../types'
import type { DevtoolsBridgeController } from './useBridge'

function mergeMutationsById(current: MutationEntry[], nextItems: MutationEntry[]): MutationEntry[] {
  const currentById = new Map(current.map((item) => [item.id, item]))
  return nextItems.map((incoming) => {
    const existing = currentById.get(incoming.id)
    if (!existing) return incoming
    Object.assign(existing, incoming)
    return existing
  })
}

/**
 * Composable for managing mutation data from the DevTools bridge.
 */
export function useMutations(bridge: DevtoolsBridgeController) {
  const mutations = ref<MutationEntry[]>([])
  const expandedIds = ref<Set<string>>(new Set())
  let cleanup: (() => void) | null = null

  const refresh = async () => {
    if (!bridge.boundInstanceId.value) return
    try {
      const initial = (await bridge.call<MutationEntry[]>('getMutations')) || []
      mutations.value = mergeMutationsById(mutations.value, initial)
    } catch {
      // Ignore initial fetch errors
    }
  }

  onMounted(() => {
    const transport = bridge.getTransport()
    if (transport) {
      const handler = (event: { data: unknown }) => {
        const data = event.data
        if (!data || typeof data !== 'object') return
        const message = data as {
          type?: string
          mutations?: MutationEntry[]
          instanceId?: string | null
        }
        if (message.type === 'CONVEX_DEVTOOLS_MUTATIONS') {
          if (message.instanceId !== bridge.boundInstanceId.value) return
          mutations.value = mergeMutationsById(mutations.value, message.mutations || [])
        }
      }
      transport.addEventListener('message', handler)
      cleanup = () => transport.removeEventListener('message', handler)
    }
  })

  watch(
    bridge.boundInstanceId,
    () => {
      mutations.value = []
      expandedIds.value = new Set()
      void refresh()
    },
    { flush: 'post' },
  )

  onUnmounted(() => {
    cleanup?.()
  })

  function toggleExpanded(id: string) {
    const newSet = new Set(expandedIds.value)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    expandedIds.value = newSet
  }

  function isExpanded(id: string): boolean {
    return expandedIds.value.has(id)
  }

  return {
    mutations,
    expandedIds,
    toggleExpanded,
    isExpanded,
  }
}
