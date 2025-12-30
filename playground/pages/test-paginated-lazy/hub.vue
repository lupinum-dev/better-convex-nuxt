<script setup lang="ts">
/**
 * Navigation hub for paginated lazy behavior tests
 * Use this as the starting point for client-side navigation tests
 */
</script>

<template>
  <div data-testid="paginated-lazy-hub" class="lazy-hub">
    <h1>Paginated Query Lazy Behavior Test Hub</h1>
    <p>Click a link to test client-side navigation behavior:</p>

    <h2>Server + Lazy Combinations</h2>
    <nav class="nav-links">
      <NuxtLink
        to="/test-paginated-lazy/server-false-lazy-true"
        data-testid="link-server-false-lazy-true"
        class="nav-link"
      >
        server: false, lazy: true
        <span class="hint">No SSR, instant client nav</span>
      </NuxtLink>

      <NuxtLink
        to="/test-paginated-lazy/server-false-lazy-false"
        data-testid="link-server-false-lazy-false"
        class="nav-link"
      >
        server: false, lazy: false
        <span class="hint">No SSR, client nav blocked</span>
      </NuxtLink>

      <NuxtLink
        to="/test-paginated-lazy/server-true-lazy-true"
        data-testid="link-server-true-lazy-true"
        class="nav-link best"
      >
        server: true, lazy: true
        <span class="hint">SSR + instant client nav (best of both worlds)</span>
      </NuxtLink>

      <NuxtLink
        to="/test-paginated-lazy/server-true-lazy-false"
        data-testid="link-server-true-lazy-false"
        class="nav-link"
      >
        server: true, lazy: false
        <span class="hint">SSR + client nav blocked (default)</span>
      </NuxtLink>
    </nav>

    <div class="info">
      <h2>Expected Behaviors:</h2>
      <table>
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
            <td>status=LoadingFirstPage</td>
            <td>instant, loading state</td>
          </tr>
          <tr>
            <td>false</td>
            <td>false</td>
            <td>status=LoadingFirstPage</td>
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
    </div>

    <NuxtLink to="/" class="back-link"> Back to Home </NuxtLink>
  </div>
</template>

<style scoped>
.lazy-hub {
  max-width: 700px;
  margin: 0 auto;
  padding: 20px;
}

.lazy-hub h2 {
  margin-top: 30px;
  margin-bottom: 10px;
  font-size: 1.1rem;
  color: #666;
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
  color: #0066cc;
}
</style>
