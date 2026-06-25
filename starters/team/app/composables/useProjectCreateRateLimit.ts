import {
  computed,
  getCurrentScope,
  onScopeDispose,
  toValue,
  watch,
  type MaybeRefOrGetter,
} from 'vue'

import { api } from '#convex/api'

export async function useProjectCreateRateLimit(teamId: MaybeRefOrGetter<string>) {
  const currentScope = getCurrentScope()
  const resolvedTeamId = computed(() => toValue(teamId).trim())
  const rateLimitQuery = useConvexQuery(api.projects.getCreateRateLimit, () =>
    resolvedTeamId.value ? { teamId: resolvedTeamId.value } : 'skip',
  )

  let refreshTimer: ReturnType<typeof setTimeout> | undefined
  let stopRefreshWatch: (() => void) | undefined
  let disposed = false

  function clearRefreshTimer() {
    if (!refreshTimer) return
    clearTimeout(refreshTimer)
    refreshTimer = undefined
  }

  if (currentScope) {
    onScopeDispose(() => {
      disposed = true
      clearRefreshTimer()
      stopRefreshWatch?.()
    })
  }

  const { data, refresh } = await rateLimitQuery

  const startRefreshWatch = () =>
    watch(
      () => [resolvedTeamId.value, data.value?.retryAfterMs] as const,
      ([, retryAfterMs]) => {
        clearRefreshTimer()
        if (!retryAfterMs) return

        refreshTimer = setTimeout(
          () => {
            refreshTimer = undefined
            void refresh()
          },
          Math.max(0, retryAfterMs),
        )
      },
      { immediate: true },
    )

  if (!disposed) {
    stopRefreshWatch = currentScope?.run(startRefreshWatch) ?? startRefreshWatch()
  }

  return {
    rateLimit: data,
    canSubmit: computed(() => data.value?.allowed !== false),
    message: computed(() => data.value?.message ?? null),
    refresh,
  }
}
