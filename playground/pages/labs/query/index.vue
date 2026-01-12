<script setup lang="ts">
definePageMeta({
  layout: 'sidebar',
})
</script>

<template>
  <div data-testid="lazy-hub" class="query-hub">
    <h1>Query Lab</h1>
    <p class="description">Test useConvexQuery with different server and lazy options</p>

    <section class="section">
      <h2>Server + Lazy Combinations</h2>
      <nav class="nav-links">
        <NuxtLink
          to="/labs/query/server-false-lazy-true"
          data-testid="link-server-false-lazy-true"
          class="nav-link"
        >
          <span class="link-label">server: false, lazy: true</span>
          <span class="hint">No SSR, instant client nav</span>
        </NuxtLink>

        <NuxtLink
          to="/labs/query/server-false-lazy-false"
          data-testid="link-server-false-lazy-false"
          class="nav-link"
        >
          <span class="link-label">server: false, lazy: false</span>
          <span class="hint">No SSR, client nav blocked</span>
        </NuxtLink>

        <NuxtLink
          to="/labs/query/server-true-lazy-true"
          data-testid="link-server-true-lazy-true"
          class="nav-link best"
        >
          <span class="link-label">server: true, lazy: true</span>
          <span class="hint">SSR + instant client nav (recommended)</span>
        </NuxtLink>

        <NuxtLink
          to="/labs/query/server-true-lazy-false"
          data-testid="link-server-true-lazy-false"
          class="nav-link"
        >
          <span class="link-label">server: true, lazy: false</span>
          <span class="hint">SSR + client nav blocked (default)</span>
        </NuxtLink>
      </nav>
    </section>

    <section class="section">
      <h2>Expected Behaviors</h2>
      <table class="behavior-table">
        <thead>
          <tr>
            <th>server</th>
            <th>lazy</th>
            <th>SSR HTML</th>
            <th>Client Nav</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>false</td>
            <td>true</td>
            <td>pending=true</td>
            <td>instant, loading state</td>
          </tr>
          <tr>
            <td>false</td>
            <td>false</td>
            <td>pending=true</td>
            <td>blocked until data</td>
          </tr>
          <tr class="highlight">
            <td>true</td>
            <td>true</td>
            <td>hasData=true</td>
            <td>instant, loading state</td>
          </tr>
          <tr>
            <td>true</td>
            <td>false</td>
            <td>hasData=true</td>
            <td>blocked until data</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<style scoped>
.query-hub {
  max-width: 700px;
  margin: 0 auto;
}

.description {
  color: #6b7280;
  margin-bottom: 24px;
}

.section {
  margin-bottom: 32px;
}

.section h2 {
  font-size: 0.9rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 12px;
}

.nav-links {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nav-link {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
  transition: all 0.15s;
}

.nav-link:hover {
  border-color: #d1d5db;
  background: #f9fafb;
}

.nav-link.best {
  background: #ecfdf5;
  border-color: #a7f3d0;
}

.nav-link.best:hover {
  background: #d1fae5;
  border-color: #6ee7b7;
}

.link-label {
  font-weight: 500;
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
  color: #1f2937;
}

.hint {
  font-size: 0.85rem;
  color: #6b7280;
}

.behavior-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
  background: white;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #e5e7eb;
}

.behavior-table th,
.behavior-table td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid #e5e7eb;
}

.behavior-table th {
  background: #f9fafb;
  font-weight: 600;
  color: #374151;
}

.behavior-table tr.highlight {
  background: #ecfdf5;
}

.behavior-table tr:last-child td {
  border-bottom: none;
}
</style>
