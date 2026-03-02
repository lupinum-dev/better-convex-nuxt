<script setup lang="ts">
definePageMeta({
  layout: 'sidebar',
})

/**
 * Navigation hub for paginated execution-mode behavior tests.
 *
 * This hub does NOT fetch any pagination data to ensure
 * clean Convex client cache for testing execution-mode behavior.
 */
</script>

<template>
  <div data-testid="paginated-lazy-hub" class="lazy-hub">
    <h1>Paginated Query API Mode Test Hub</h1>
    <p>Click a link to test client-side navigation behavior:</p>

    <h2>Server + API Mode Combinations</h2>
    <nav class="nav-links">
      <NuxtLink
        to="/labs/pagination/server-false-lazy-true"
        data-testid="link-server-false-lazy-true"
        class="nav-link"
      >
        server: false + useConvexPaginatedQueryLazy
        <span class="hint">No SSR, non-blocking client nav</span>
      </NuxtLink>

      <NuxtLink
        to="/labs/pagination/server-false-lazy-false"
        data-testid="link-server-false-lazy-false"
        class="nav-link"
      >
        server: false + await useConvexPaginatedQuery
        <span class="hint">No SSR, client nav blocked</span>
      </NuxtLink>

      <NuxtLink
        to="/labs/pagination/server-true-lazy-true"
        data-testid="link-server-true-lazy-true"
        class="nav-link best"
      >
        server: true + useConvexPaginatedQueryLazy
        <span class="hint">SSR + non-blocking client nav (recommended)</span>
      </NuxtLink>

      <NuxtLink
        to="/labs/pagination/server-true-lazy-false"
        data-testid="link-server-true-lazy-false"
        class="nav-link"
      >
        server: true + await useConvexPaginatedQuery
        <span class="hint">SSR + client nav blocked</span>
      </NuxtLink>
    </nav>

    <div class="info">
      <h2>Expected Behaviors:</h2>
      <table>
        <thead>
          <tr>
            <th>server</th>
            <th>API mode</th>
            <th>SSR HTML</th>
            <th>Client Nav</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>false</td>
            <td><code>useConvexPaginatedQueryLazy</code></td>
            <td>status=LoadingFirstPage</td>
            <td>instant, loading state</td>
          </tr>
          <tr>
            <td>false</td>
            <td><code>await useConvexPaginatedQuery</code></td>
            <td>status=LoadingFirstPage</td>
            <td>blocked until data</td>
          </tr>
          <tr class="highlight">
            <td>true</td>
            <td><code>useConvexPaginatedQueryLazy</code></td>
            <td>hasData=true</td>
            <td>instant, loading state</td>
          </tr>
          <tr>
            <td>true</td>
            <td><code>await useConvexPaginatedQuery</code></td>
            <td>hasData=true</td>
            <td>blocked until data</td>
          </tr>
        </tbody>
      </table>
    </div>

    <NuxtLink to="/labs/pagination" class="back-link">Back to Pagination Lab</NuxtLink>
  </div>
</template>

<style scoped>
.lazy-hub {
  max-width: 700px;
  margin: 0 auto;
}

.lazy-hub h2 {
  margin-top: 30px;
  margin-bottom: 10px;
  font-size: 1.1rem;
  color: #374151;
}

.nav-links {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 10px 0 20px;
}

.nav-link {
  padding: 12px 16px;
  background: #f0f0f0;
  border-radius: 8px;
  text-decoration: none;
  color: #333;
  transition: background 0.2s;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-link:hover {
  background: #e0e0e0;
}

.nav-link.best {
  background: #e8f5e9;
  border: 2px solid #4caf50;
}

.nav-link.best:hover {
  background: #c8e6c9;
}

.nav-link .hint {
  font-size: 0.8rem;
  color: #666;
}

.info {
  margin-top: 30px;
  padding: 15px;
  background: #f8f8f8;
  border-radius: 8px;
}

.info table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.info th,
.info td {
  padding: 8px;
  text-align: left;
  border-bottom: 1px solid #ddd;
}

.info th {
  background: #eee;
  font-weight: 600;
}

.info tr.highlight {
  background: #e8f5e9;
}

.back-link {
  display: inline-block;
  margin-top: 20px;
  color: #3b82f6;
  text-decoration: none;
}

.back-link:hover {
  text-decoration: underline;
}
</style>
