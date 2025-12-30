<template>
  <div class="container">
    <h1>Auth Components Test</h1>
    <p class="description">
      This page tests the <code>&lt;ConvexAuthenticated&gt;</code>,
      <code>&lt;ConvexUnauthenticated&gt;</code>, and
      <code>&lt;ConvexAuthLoading&gt;</code> components.
    </p>

    <div class="current-state">
      <h2>Current Auth State</h2>
      <div class="state-grid">
        <div class="state-item">
          <span class="label">isAuthenticated</span>
          <span class="value" :class="{ positive: isAuthenticated }">
            {{ isAuthenticated }}
          </span>
        </div>
        <div class="state-item">
          <span class="label">isPending</span>
          <span class="value" :class="{ active: isPending }">
            {{ isPending }}
          </span>
        </div>
        <div class="state-item">
          <span class="label">token</span>
          <span class="value">{{ token ? '(present)' : '(none)' }}</span>
        </div>
        <div class="state-item">
          <span class="label">user</span>
          <span class="value">{{ user?.name || user?.email || '(none)' }}</span>
        </div>
      </div>
    </div>

    <div class="component-demos">
      <h2>Component Demos</h2>

      <div class="demo-card">
        <h3>&lt;ConvexAuthLoading&gt;</h3>
        <p class="demo-description">Shows content only while auth is loading</p>
        <div class="demo-output">
          <ConvexAuthLoading>
            <div class="loading-indicator">
              <span class="spinner" />
              Checking authentication...
            </div>
          </ConvexAuthLoading>
          <span v-if="!isPending" class="not-shown"
            >(Auth check complete - loading content hidden)</span
          >
        </div>
      </div>

      <div class="demo-card">
        <h3>&lt;ConvexAuthenticated&gt;</h3>
        <p class="demo-description">Shows content only when user is authenticated</p>
        <div class="demo-output">
          <ConvexAuthenticated>
            <div class="auth-content authenticated">
              <span class="icon">&#x2714;</span>
              <div>
                <strong>Welcome, {{ user?.name || user?.email || 'User' }}!</strong>
                <p>You are authenticated and can access protected content.</p>
              </div>
            </div>
          </ConvexAuthenticated>
          <span v-if="!isAuthenticated && !isPending" class="not-shown"
            >(Not authenticated - content hidden)</span
          >
        </div>
      </div>

      <div class="demo-card">
        <h3>&lt;ConvexUnauthenticated&gt;</h3>
        <p class="demo-description">Shows content only when user is NOT authenticated</p>
        <div class="demo-output">
          <ConvexUnauthenticated>
            <div class="auth-content unauthenticated">
              <span class="icon">&#x1F512;</span>
              <div>
                <strong>Please log in</strong>
                <p>You need to authenticate to access this feature.</p>
                <NuxtLink to="/auth/login" class="login-link"> Go to Login &rarr; </NuxtLink>
              </div>
            </div>
          </ConvexUnauthenticated>
          <span v-if="isAuthenticated && !isPending" class="not-shown"
            >(Authenticated - unauthenticated content hidden)</span
          >
        </div>
      </div>
    </div>

    <div class="combined-example">
      <h2>Combined Example (Real-World Pattern)</h2>
      <div class="demo-output">
        <ConvexAuthLoading>
          <div class="loading-indicator">
            <span class="spinner" />
            Loading...
          </div>
        </ConvexAuthLoading>
        <ConvexAuthenticated>
          <div class="dashboard-preview">
            <h4>Dashboard</h4>
            <p>Your personalized content here.</p>
          </div>
        </ConvexAuthenticated>
        <ConvexUnauthenticated>
          <div class="login-prompt">
            <h4>Welcome to the App</h4>
            <p>Please sign in to continue.</p>
          </div>
        </ConvexUnauthenticated>
      </div>
    </div>

    <div class="auth-actions">
      <h2>Test Authentication</h2>
      <div class="button-group">
        <NuxtLink v-if="!isAuthenticated" to="/auth/login" class="btn btn-primary">
          Log In
        </NuxtLink>
        <button v-else class="btn btn-secondary" @click="signOut">Sign Out</button>
      </div>
    </div>

    <NuxtLink to="/" class="back-link"> &larr; Back to Home </NuxtLink>
  </div>
</template>

<script setup lang="ts">
const { isAuthenticated, isPending, token, user } = useConvexAuth()
const authClient = useAuthClient()

async function signOut() {
  if (authClient) {
    await authClient.signOut()
    // Reload to clear state
    window.location.reload()
  }
}
</script>

<style scoped>
.container {
  max-width: 800px;
  margin: 40px auto;
  padding: 20px;
  font-family: system-ui, -apple-system, sans-serif;
}

h1 {
  margin-bottom: 8px;
}

h2 {
  margin-top: 32px;
  margin-bottom: 16px;
  font-size: 1.3em;
  border-bottom: 2px solid #eee;
  padding-bottom: 8px;
}

.description {
  color: #666;
  margin-bottom: 24px;
}

code {
  background: #f0f0f0;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.9em;
}

.current-state {
  background: #f5f5f5;
  padding: 16px;
  border-radius: 8px;
}

.current-state h2 {
  margin-top: 0;
  border: none;
}

.state-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.state-item {
  background: white;
  padding: 12px;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.state-item .label {
  font-size: 0.85em;
  color: #666;
}

.state-item .value {
  font-weight: 600;
  font-family: monospace;
}

.state-item .value.positive { color: #4caf50; }
.state-item .value.active { color: #ff9800; }

.demo-card {
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.demo-card h3 {
  margin: 0 0 4px 0;
  font-family: monospace;
  font-size: 1em;
  color: #1976d2;
}

.demo-description {
  margin: 0 0 12px 0;
  font-size: 0.9em;
  color: #666;
}

.demo-output {
  background: #fafafa;
  border: 1px dashed #ccc;
  border-radius: 6px;
  padding: 16px;
  min-height: 60px;
}

.not-shown {
  color: #999;
  font-style: italic;
  font-size: 0.9em;
}

.loading-indicator {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #666;
}

.spinner {
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 2px solid #e0e0e0;
  border-top-color: #2196f3;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.auth-content {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border-radius: 6px;
}

.auth-content.authenticated {
  background: #e8f5e9;
  border: 1px solid #c8e6c9;
}

.auth-content.unauthenticated {
  background: #fff3e0;
  border: 1px solid #ffe0b2;
}

.auth-content .icon {
  font-size: 1.5em;
}

.auth-content p {
  margin: 4px 0 8px 0;
  font-size: 0.9em;
  color: #666;
}

.login-link {
  color: #1976d2;
  text-decoration: none;
  font-size: 0.9em;
}

.login-link:hover {
  text-decoration: underline;
}

.combined-example .demo-output {
  background: linear-gradient(135deg, #f5f5f5 0%, #e8e8e8 100%);
}

.dashboard-preview,
.login-prompt {
  text-align: center;
  padding: 20px;
}

.dashboard-preview {
  background: #e3f2fd;
  border-radius: 8px;
}

.login-prompt {
  background: #fff8e1;
  border-radius: 8px;
}

.dashboard-preview h4,
.login-prompt h4 {
  margin: 0 0 8px 0;
}

.dashboard-preview p,
.login-prompt p {
  margin: 0;
  color: #666;
}

.auth-actions {
  background: #f0f7ff;
  padding: 16px;
  border-radius: 8px;
  text-align: center;
}

.auth-actions h2 {
  margin-top: 0;
  border: none;
}

.button-group {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.btn {
  display: inline-block;
  padding: 10px 24px;
  border-radius: 6px;
  font-size: 1em;
  text-decoration: none;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.btn-primary {
  background: #2196f3;
  color: white;
}

.btn-primary:hover {
  background: #1976d2;
}

.btn-secondary {
  background: #757575;
  color: white;
}

.btn-secondary:hover {
  background: #616161;
}

.back-link {
  display: inline-block;
  margin-top: 24px;
  color: #2196f3;
  text-decoration: none;
}

.back-link:hover {
  text-decoration: underline;
}
</style>
