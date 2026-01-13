<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useBridge, callBridge } from './composables/useBridge'
import { useQueries } from './composables/useQueries'
import { useMutations } from './composables/useMutations'
import { useAuth } from './composables/useAuth'
import { useEvents } from './composables/useEvents'

// Initialize bridge
useBridge()

// Data composables
const { queries, selectedQueryId, selectQuery, getSelectedQuery } = useQueries()
const { mutations, toggleExpanded, isExpanded } = useMutations()
const { authState, connectionState, authWaterfall } = useAuth()
const { events, clearEvents } = useEvents()

// UI state
const activeTab = ref<'queries' | 'mutations' | 'auth' | 'events'>('queries')
const loading = ref(true)
const dashboardUrl = ref<string | null>(null)

onMounted(async () => {
  // Short delay to allow connection
  setTimeout(() => {
    loading.value = false
  }, 500)

  // Get dashboard URL
  try {
    dashboardUrl.value = await callBridge<string | null>('getDashboardUrl')
  } catch {
    // Ignore
  }
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
          <svg class="logo-icon" width="18" height="18" viewBox="0 0 32 32" fill="currentColor">
            <path d="M16 2L4 9v14l12 7 12-7V9L16 2zm0 2.5l9.5 5.5v11L16 26.5 6.5 21V10L16 4.5z"/>
          </svg>
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
        <button
          class="tab"
          :class="{ active: activeTab === 'events' }"
          @click="switchTab('events')"
        >
          Events <span class="tab-badge">{{ events.length }}</span>
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
      </div>

      <!-- Events Tab -->
      <div v-show="activeTab === 'events'" class="tab-content active">
        <EventLog
          :events="events"
          :dashboard-url="dashboardUrl"
          @clear="clearEvents"
        />
      </div>
    </template>
  </div>
</template>
