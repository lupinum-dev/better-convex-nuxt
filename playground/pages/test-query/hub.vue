<script setup lang="ts">
/**
 * Navigation hub for useConvexQuery server/lazy tests with artificial delay
 */
</script>

<template>
  <div data-testid="query-hub" class="query-hub">
    <h1>useConvexQuery Server/Lazy Test Hub</h1>
    <p>Test pages using an 800ms delayed query to observe loading behavior:</p>

    <nav class="nav-links">
      <NuxtLink
        to="/test-query/server-true-lazy-true"
        data-testid="link-server-true-lazy-true"
        class="nav-link best"
      >
        server: true, lazy: true
        <span class="hint">SSR + instant client nav (best of both worlds)</span>
      </NuxtLink>

      <NuxtLink
        to="/test-query/server-true-lazy-false"
        data-testid="link-server-true-lazy-false"
        class="nav-link"
      >
        server: true, lazy: false
        <span class="hint">SSR + client nav blocked (default)</span>
      </NuxtLink>

      <NuxtLink
        to="/test-query/server-false-lazy-true"
        data-testid="link-server-false-lazy-true"
        class="nav-link"
      >
        server: false, lazy: true
        <span class="hint">No SSR, instant client nav</span>
      </NuxtLink>

      <NuxtLink
        to="/test-query/server-false-lazy-false"
        data-testid="link-server-false-lazy-false"
        class="nav-link"
      >
        server: false, lazy: false
        <span class="hint">No SSR, client nav blocked</span>
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
          <tr class="highlight">
            <td>true</td>
            <td>true</td>
            <td>hasData=true (waits 800ms)</td>
            <td>instant, shows skeleton</td>
          </tr>
          <tr>
            <td>true</td>
            <td>false</td>
            <td>hasData=true (waits 800ms)</td>
            <td>blocked 800ms until data</td>
          </tr>
          <tr>
            <td>false</td>
            <td>true</td>
            <td>pending=true</td>
            <td>instant, shows skeleton</td>
          </tr>
          <tr>
            <td>false</td>
            <td>false</td>
            <td>pending=true</td>
            <td>blocked 800ms until data</td>
          </tr>
        </tbody>
      </table>
    </div>

    <NuxtLink to="/" class="back-link">Back to Home</NuxtLink>
  </div>
</template>

<style scoped>
.query-hub {
  max-width: 700px;
  margin: 0 auto;
  padding: 20px;
}

.nav-links {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 20px 0;
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

.info h2 {
  margin: 0 0 15px;
  font-size: 1.1rem;
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
