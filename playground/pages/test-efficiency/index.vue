<template>
  <div class="container">
    <h1>Auth Efficiency Test</h1>
    <p class="subtitle">This page tests how many auth API calls are made during SSR</p>

    <div class="info-box">
      <h3>SSR Render Info</h3>
      <p><strong>Rendered at:</strong> {{ renderTime }}</p>
      <p><strong>Render mode:</strong> {{ isClient ? 'Client' : 'Server' }}</p>
    </div>

    <div class="queries-section">
      <h2>Queries on this page (5 total)</h2>

      <div class="query-card">
        <h4>Query 1: tasks.list</h4>
        <p v-if="tasksPending">Loading...</p>
        <p v-else-if="tasksError">Error: {{ tasksError.message }}</p>
        <p v-else>{{ tasks?.length ?? 0 }} tasks</p>
      </div>

      <div class="query-card">
        <h4>Query 2: tasks.publicStats</h4>
        <p v-if="statsPending">Loading...</p>
        <p v-else-if="statsError">Error: {{ statsError.message }}</p>
        <p v-else>Total: {{ stats?.total ?? 0 }}, Completed: {{ stats?.completed ?? 0 }}</p>
      </div>

      <div class="query-card">
        <h4>Query 3: users.getCurrentUser</h4>
        <p v-if="userPending">Loading...</p>
        <p v-else-if="userError">Error: {{ userError.message }}</p>
        <p v-else>
          {{ user?.displayName ?? 'No user' }}
        </p>
      </div>

      <div class="query-card">
        <h4>Query 4: auth.getPermissionContext</h4>
        <p v-if="permsPending">Loading...</p>
        <p v-else-if="permsError">Error: {{ permsError.message }}</p>
        <p v-else>Role: {{ perms?.role ?? 'none' }}</p>
      </div>

      <div class="query-card">
        <h4>Query 5: tasks.publicStats (again, different instance)</h4>
        <p v-if="stats2Pending">Loading...</p>
        <p v-else-if="stats2Error">Error: {{ stats2Error.message }}</p>
        <p v-else>Pending tasks: {{ stats2?.pending ?? 0 }}</p>
      </div>
    </div>

    <div class="auth-section">
      <h2>Auth State</h2>
      <p><strong>isAuthenticated:</strong> {{ isAuthenticated }}</p>
      <p><strong>Has Token:</strong> {{ !!token }}</p>
      <p><strong>Token Preview:</strong> {{ token ? token.substring(0, 30) + '...' : 'none' }}</p>
    </div>

    <div class="instructions">
      <h3>How to verify efficiency:</h3>
      <ol>
        <li>Check the Nuxt server terminal for <code>[useConvexQuery]</code> logs</li>
        <li>Look for: <code>"Reusing cached auth token from SSR plugin"</code></li>
        <li>Public queries show: <code>"Public query - skipping auth token lookup"</code></li>
        <li>You should see <strong>0</strong> "Attempting to get auth token" messages</li>
      </ol>
      <div class="success-box">
        <strong>Optimized:</strong> Token is fetched once by plugin.server.ts and reused by all
        queries!
      </div>
      <p class="note">
        Check Convex dashboard "Logs" tab to confirm only 5 query calls (not 8+ with auth overhead)
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { api } from '~/convex/_generated/api'

// Track render time and mode
const renderTime = new Date().toISOString()
const isClient = ref(false)

onMounted(() => {
  isClient.value = true
})

// Auth state
const { isAuthenticated, token } = useConvexAuth()

// Query 1: Authenticated query
const {
  data: tasks,
  pending: tasksPending,
  error: tasksError,
} = useConvexQuery(api.tasks.list, {}, { verbose: true })

// Query 2: Public stats (should skip auth)
const {
  data: stats,
  pending: statsPending,
  error: statsError,
} = useConvexQuery(api.tasks.publicStats, {}, { public: true, verbose: true })

// Query 3: Another authenticated query
const {
  data: user,
  pending: userPending,
  error: userError,
} = useConvexQuery(api.users.getCurrentUser, {}, { verbose: true })

// Query 4: Yet another authenticated query
const {
  data: perms,
  pending: permsPending,
  error: permsError,
} = useConvexQuery(api.auth.getPermissionContext, {}, { verbose: true })

// Query 5: Public stats again (different args key - should still skip auth)
const {
  data: stats2,
  pending: stats2Pending,
  error: stats2Error,
} = useConvexQuery(api.tasks.publicStats, {}, { public: true, verbose: true })
</script>

<style scoped>
.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  font-family: system-ui, -apple-system, sans-serif;
}

h1 {
  color: #333;
}

.subtitle {
  color: #666;
  margin-bottom: 20px;
}

.info-box {
  background: #e3f2fd;
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.info-box h3 {
  margin-top: 0;
  color: #1565c0;
}

.queries-section {
  margin-bottom: 30px;
}

.query-card {
  background: #f5f5f5;
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 10px;
  border-left: 4px solid #4caf50;
}

.query-card h4 {
  margin: 0 0 10px 0;
  color: #333;
}

.auth-section {
  background: #fff3e0;
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.auth-section h2 {
  margin-top: 0;
  color: #e65100;
}

.instructions {
  background: #fce4ec;
  padding: 15px;
  border-radius: 8px;
}

.instructions h3 {
  margin-top: 0;
  color: #c2185b;
}

.instructions ol {
  padding-left: 20px;
}

.instructions code {
  background: #f8bbd9;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: monospace;
}

.note {
  font-style: italic;
  color: #666;
  margin-top: 15px;
}

.success-box {
  background: #c8e6c9;
  padding: 10px 15px;
  border-radius: 6px;
  margin-top: 15px;
  color: #2e7d32;
}
</style>
