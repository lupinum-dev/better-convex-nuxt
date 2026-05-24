<script setup lang="ts">
import { ref, computed } from 'vue'

import { useConvexDevtools } from './composables/useConvexDevtools'
import { useServerRpc } from './composables/useServerRpc'

const { snapshot } = useConvexDevtools()
const { proxyStats, isLoading: proxyLoading, fetchStats, clearStats } = useServerRpc()

const activeTab = ref<'overview' | 'data' | 'auth' | 'advanced'>('overview')

// Derived data
const queries = computed(() => snapshot.value?.queries ?? [])
const mutations = computed(() => snapshot.value?.mutations ?? [])
const events = computed(() => snapshot.value?.events ?? [])
const authState = computed(() => snapshot.value?.authState ?? null)
const connectionState = computed(() => snapshot.value?.connectionState ?? null)
const authWaterfall = computed(() => snapshot.value?.authWaterfall ?? null)
const accessState = computed(() => snapshot.value?.accessContextState ?? null)
const authBootstrapState = computed(() => snapshot.value?.authBootstrapState ?? null)
const observations = computed(() => snapshot.value?.observations ?? [])
const decisionTrace = computed(() => snapshot.value?.decisionTrace ?? null)

const errorCount = computed(() => {
  const queryErrors = queries.value.filter((q) => q.status === 'error').length
  const mutationErrors = mutations.value.filter((m) => m.state === 'error').length
  return queryErrors + mutationErrors
})

function onTabAuth() {
  activeTab.value = 'auth'
  fetchStats()
}
</script>

<template>
  <div class="h-screen min-h-0 flex flex-col bg-base text-base">
    <div class="flex-shrink-0 border-b border-base px-4 py-3">
      <div class="flex items-center justify-between gap-4">
        <div class="flex items-center gap-2 font-bold">
          <NIcon icon="i-carbon-data-connected" class="text-lg" />
          Convex
        </div>
        <div class="flex items-center gap-3 text-xs">
          <div class="flex items-center gap-1.5">
            <span
              class="w-2 h-2 rounded-full"
              :class="connectionState?.isConnected ? 'bg-green-500' : 'bg-red-500'"
            />
            <span class="op-60">{{
              connectionState?.isConnected ? 'Connected' : 'Disconnected'
            }}</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span
              class="w-2 h-2 rounded-full"
              :class="authState?.isAuthenticated ? 'bg-green-500' : 'bg-gray-400'"
            />
            <span class="op-60">
              {{
                authState?.isAuthenticated
                  ? authState.sessionUser?.displayName || 'Authenticated'
                  : 'Not authenticated'
              }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex flex-shrink-0 border-b border-base px-2">
      <button
        v-for="tab in ['overview', 'data', 'auth', 'advanced'] as const"
        :key="tab"
        class="px-3 py-2 text-xs font-medium border-b-2 transition-colors capitalize"
        :class="
          activeTab === tab
            ? 'border-green-500 text-green-500'
            : 'border-transparent op-50 hover:op-80'
        "
        @click="tab === 'auth' ? onTabAuth() : (activeTab = tab)"
      >
        {{ tab }}
        <NBadge v-if="tab === 'data'" class="ml-1" n="xs">
          {{ queries.length + mutations.length }}
        </NBadge>
        <NBadge v-if="tab === 'overview' && errorCount > 0" class="ml-1" n="xs red">
          {{ errorCount }}
        </NBadge>
      </button>
    </div>

    <!-- Content -->
    <div class="flex-1 min-h-0">
      <!-- No connection -->
      <div v-if="!snapshot" class="flex items-center justify-center h-full op-50">
        <div class="text-center">
          <NIcon icon="i-carbon-connect" class="text-3xl mb-2" />
          <div class="text-sm">Waiting for connection...</div>
        </div>
      </div>

      <template v-else>
        <!-- Overview Tab -->
        <OverviewPanel
          v-show="activeTab === 'overview'"
          :queries="queries"
          :mutations="mutations"
          :auth-state="authState"
          :connection-state="connectionState"
          :error-count="errorCount"
          :decision-trace="decisionTrace"
        />

        <!-- Data Tab -->
        <DataPanel
          v-show="activeTab === 'data'"
          class="h-full"
          :queries="queries"
          :mutations="mutations"
          :events="events"
        />

        <!-- Auth Tab -->
        <AuthPanel
          v-show="activeTab === 'auth'"
          :auth-state="authState"
          :waterfall="authWaterfall"
          :access-state="accessState"
          :auth-bootstrap-state="authBootstrapState"
          :decision-trace="decisionTrace"
          :observations="observations"
          :proxy-stats="proxyStats"
          :proxy-loading="proxyLoading"
          @clear-proxy="clearStats"
        />

        <!-- Advanced Tab -->
        <AdvancedPanel v-show="activeTab === 'advanced'" :snapshot="snapshot" />
      </template>
    </div>
  </div>
</template>
