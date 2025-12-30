<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

/**
 * Test page for public: true option
 *
 * Uses public: true to skip auth token lookup during SSR.
 * Expected behavior:
 * - Query runs without authentication
 * - No auth token is fetched or sent
 * - Faster SSR for public pages
 *
 * Compare with the authenticated query to see the difference.
 */

// Public query - skips auth token lookup
const {
  data: publicStats,
  pending: publicPending,
  status: publicStatus,
  error: publicError,
} = useConvexQuery(
  api.tasks.publicStats,
  {},
  {
    public: true,
    verbose: true,
  },
)

// Authenticated query (default behavior) - for comparison
const {
  data: authTasks,
  pending: authPending,
  status: authStatus,
} = useConvexQuery(
  api.tasks.list,
  {},
  {
    verbose: true,
  },
)

// Auth state to show current user
const { isAuthenticated, user } = useConvexAuth()
</script>

<template>
  <div data-testid="public-query-page" class="test-page">
    <h1>public: true (Skip Auth)</h1>
    <p>Query skips auth token lookup during SSR for better performance.</p>

    <NuxtLink to="/test-features/hub" class="back-link">Back to Hub</NuxtLink>

    <!-- Auth Status -->
    <section class="auth-section">
      <h2>Auth Status</h2>
      <div class="state-grid">
        <div class="state-item">
          <span class="label">authenticated:</span>
          <span data-testid="is-authenticated" class="value">{{ isAuthenticated }}</span>
        </div>
        <div v-if="user" class="state-item">
          <span class="label">user:</span>
          <span class="value">{{ user.email || user.name || 'Unknown' }}</span>
        </div>
      </div>
    </section>

    <!-- Public Query Section -->
    <section class="state-section public">
      <h2>Public Query (public: true)</h2>
      <p class="section-desc">This query does NOT send auth tokens - it's for public data.</p>
      <div class="state-grid">
        <div class="state-item">
          <span class="label">status:</span>
          <span data-testid="public-status" class="value">{{ publicStatus }}</span>
        </div>
        <div class="state-item">
          <span class="label">pending:</span>
          <span data-testid="public-pending" class="value">{{ publicPending }}</span>
        </div>
        <div class="state-item">
          <span class="label">has data:</span>
          <span data-testid="public-has-data" class="value">{{ publicStats !== undefined }}</span>
        </div>
        <div v-if="publicStats" class="state-item">
          <span class="label">data:</span>
          <span
            data-testid="public-data"
            class="value data"
            >{{ JSON.stringify(publicStats) }}</span
          >
        </div>
        <div v-if="publicError" class="state-item">
          <span class="label">error:</span>
          <span data-testid="public-error" class="value error">{{ publicError.message }}</span>
        </div>
      </div>
    </section>

    <!-- Authenticated Query Section -->
    <section class="state-section auth">
      <h2>Authenticated Query (default)</h2>
      <p class="section-desc">This query sends auth tokens if user is logged in.</p>
      <div class="state-grid">
        <div class="state-item">
          <span class="label">status:</span>
          <span data-testid="auth-status" class="value">{{ authStatus }}</span>
        </div>
        <div class="state-item">
          <span class="label">pending:</span>
          <span data-testid="auth-pending" class="value">{{ authPending }}</span>
        </div>
        <div class="state-item">
          <span class="label">has data:</span>
          <span data-testid="auth-has-data" class="value">{{ authTasks !== undefined }}</span>
        </div>
        <div v-if="authTasks" class="state-item">
          <span class="label">task count:</span>
          <span data-testid="auth-task-count" class="value">{{ authTasks.length }}</span>
        </div>
      </div>
    </section>

    <!-- Info Section -->
    <section class="info-section">
      <h2>How to Verify</h2>
      <ol>
        <li>Open browser DevTools Network tab</li>
        <li>Filter by "convex" or "token"</li>
        <li>Reload the page (hard refresh)</li>
        <li><strong>Public query:</strong> Should NOT have auth token in request</li>
        <li><strong>Auth query:</strong> Should have auth token if logged in</li>
      </ol>
      <p class="tip">
        Check the server console for verbose logs showing "Public query - skipping auth token
        lookup"
      </p>
    </section>

    <!-- Expected Behavior -->
    <section class="info-section">
      <h2>Expected Behavior</h2>
      <div class="expected-grid">
        <div class="expected-col">
          <h3>public: true</h3>
          <ul>
            <li>No auth token lookup</li>
            <li>Faster SSR</li>
            <li>Works for all users</li>
            <li>Returns same data for everyone</li>
          </ul>
        </div>
        <div class="expected-col">
          <h3>default (public: false)</h3>
          <ul>
            <li>Auth token lookup if logged in</li>
            <li>User-specific data</li>
            <li>Returns empty if not logged in</li>
          </ul>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.test-page {
  max-width: 700px;
  margin: 0 auto;
  padding: 20px;
}

.back-link {
  display: inline-block;
  margin-bottom: 20px;
  color: #0066cc;
}

.auth-section {
  margin: 20px 0;
  padding: 15px;
  background: #f0f0f0;
  border-radius: 8px;
}

.state-section {
  margin: 20px 0;
  padding: 15px;
  border-radius: 8px;
}

.state-section.public {
  background: #e8f5e9;
  border: 2px solid #4caf50;
}

.state-section.auth {
  background: #e3f2fd;
  border: 2px solid #2196f3;
}

.section-desc {
  font-size: 0.9rem;
  color: #666;
  margin: 0 0 15px;
}

.state-section h2,
.auth-section h2 {
  margin: 0 0 10px;
  font-size: 1.1rem;
}

.state-grid {
  display: grid;
  gap: 8px;
}

.state-item {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.label {
  font-weight: 500;
  min-width: 100px;
}

.value {
  font-family: monospace;
  background: #fff;
  padding: 2px 6px;
  border-radius: 4px;
}

.value.data {
  word-break: break-all;
  max-width: 400px;
}

.value.error {
  background: #fee;
  color: #c00;
}

.info-section {
  margin-top: 20px;
  padding: 15px;
  background: #fff3e0;
  border-radius: 8px;
}

.info-section h2 {
  margin: 0 0 10px;
  font-size: 1rem;
}

.info-section ol {
  margin: 0;
  padding-left: 20px;
}

.info-section li {
  margin: 5px 0;
}

.tip {
  margin-top: 10px;
  padding: 10px;
  background: #fffde7;
  border-radius: 4px;
  font-size: 0.9rem;
}

.expected-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
}

.expected-col h3 {
  font-size: 0.9rem;
  margin: 0 0 8px;
}

.expected-col ul {
  margin: 0;
  padding-left: 20px;
  font-size: 0.9rem;
}
</style>
