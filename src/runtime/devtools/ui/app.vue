<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useBridge } from './composables/useBridge'
import { useQueries } from './composables/useQueries'
import { useMutations } from './composables/useMutations'
import { useAuth } from './composables/useAuth'
import { useAuthProxy } from './composables/useAuthProxy'

// Initialize bridge
useBridge()

// Data composables
const { queries, selectedQueryId, selectQuery, getSelectedQuery } = useQueries()
const { mutations, toggleExpanded, isExpanded } = useMutations()
const { authState, connectionState, authWaterfall } = useAuth()
const { proxyStats, isLoading: proxyLoading, clear: clearProxyStats } = useAuthProxy()

// UI state
const activeTab = ref<'queries' | 'mutations' | 'auth'>('queries')
const loading = ref(true)

onMounted(() => {
  // Short delay to allow connection
  setTimeout(() => {
    loading.value = false
  }, 500)
})

function switchTab(tab: typeof activeTab.value) {
  activeTab.value = tab
}
</script>

<template>
  <div class="app-shell">
    <!-- Header -->
    <header class="header">
      <div class="header-left">
        <div class="logo">
          <img src="/convex-logo.svg" alt="Convex" width="18" height="18" class="logo-icon" />
          Convex DevTools
        </div>
      </div>
      <div class="status-bar">
        <div class="status-item">
          <span
            class="status-dot"
            :class="connectionState?.isConnected ? 'connected' : 'disconnected'"
          />
          <span>{{ connectionState?.isConnected ? 'Connected' : 'Disconnected' }}</span>
        </div>
        <div class="status-item">
          <span
            class="status-dot"
            :class="{
              'pending': authState?.isPending,
              'connected': authState?.isAuthenticated,
              'disconnected': !authState?.isPending && !authState?.isAuthenticated
            }"
          />
          <span>
            {{ authState?.isPending ? 'Loading...' : (authState?.isAuthenticated ? (authState.user?.name || 'Authenticated') : 'Not authenticated') }}
          </span>
        </div>
      </div>
    </header>

    <!-- Loading -->
    <div v-if="loading" class="loading">
      <div class="spinner" />
      <span>Connecting to application...</span>
    </div>

    <!-- Main Content -->
    <template v-else>
      <!-- Tabs -->
      <nav class="tabs">
        <button
          class="tab"
          :class="{ active: activeTab === 'queries' }"
          @click="switchTab('queries')"
        >
          Queries <span class="tab-badge">{{ queries.length }}</span>
        </button>
        <button
          class="tab"
          :class="{ active: activeTab === 'mutations' }"
          @click="switchTab('mutations')"
        >
          Mutations <span class="tab-badge">{{ mutations.length }}</span>
        </button>
        <button
          class="tab"
          :class="{ active: activeTab === 'auth' }"
          @click="switchTab('auth')"
        >
          Auth
        </button>
      </nav>

      <!-- Queries Tab -->
      <div v-show="activeTab === 'queries'" class="tab-content active">
        <div class="master-detail">
          <QueryList
            :queries="queries"
            :selected-id="selectedQueryId"
            @select="selectQuery"
          />
          <QueryDetail :query="getSelectedQuery()" />
        </div>
      </div>

      <!-- Mutations Tab -->
      <div v-show="activeTab === 'mutations'" class="tab-content active">
        <MutationTimeline
          :mutations="mutations"
          :is-expanded="isExpanded"
          @toggle="toggleExpanded"
        />
      </div>

      <!-- Auth Tab -->
      <div v-show="activeTab === 'auth'" class="tab-content active" style="overflow-y: auto;">
        <AuthPanel :auth-state="authState" :waterfall="authWaterfall" />
        <AuthProxyPanel
          :stats="proxyStats"
          :loading="proxyLoading"
          @clear="clearProxyStats"
        />
      </div>
    </template>
  </div>
</template>
