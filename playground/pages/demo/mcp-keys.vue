<template>
  <div class="container">
    <div class="card">
      <header class="header">
        <h1>MCP API Keys</h1>
        <div class="header-actions">
          <NuxtLink to="/demo/permissions" class="btn btn-secondary">Permissions</NuxtLink>
        </div>
      </header>

      <p class="description">
        Create and manage API keys for MCP tool integrations.
        Keys are scoped to your organization and carry a role identity.
      </p>

      <!-- Loading -->
      <div v-if="pending && isAuthenticated" class="loading">Loading keys...</div>

      <!-- Not authenticated -->
      <div v-else-if="!isAuthenticated" class="not-auth">
        <p>Sign in to manage MCP API keys.</p>
        <NuxtLink to="/auth/signin" class="btn btn-primary">Sign In</NuxtLink>
      </div>

      <!-- Main content -->
      <template v-else>
        <!-- Created key banner -->
        <div v-if="createdKey" class="created-key-banner">
          <div class="created-key-header">
            <strong>Key created — copy it now, it won't be shown again.</strong>
            <button class="btn btn-sm" @click="createdKey = null">Dismiss</button>
          </div>
          <div class="key-display">
            <code class="key-value">{{ createdKey }}</code>
            <button class="btn btn-sm btn-primary" @click="copyKey(createdKey!)">
              {{ copied ? 'Copied!' : 'Copy' }}
            </button>
          </div>
          <p class="key-usage-hint">
            Use as: <code>Authorization: Bearer {{ createdKey }}</code>
          </p>
        </div>

        <!-- Create form -->
        <section class="section">
          <h2>Create New Key</h2>
          <form class="create-form" @submit.prevent="handleCreate">
            <div class="form-row">
              <div class="form-group">
                <label for="key-name">Name</label>
                <input
                  id="key-name"
                  v-model="newKey.name"
                  type="text"
                  placeholder="e.g. Claude Desktop, CI Pipeline"
                  :disabled="isCreating"
                  required
                />
              </div>
              <div class="form-group">
                <label for="key-role">Role</label>
                <select
                  id="key-role"
                  v-model="newKey.role"
                  :disabled="isCreating"
                >
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
              <button
                type="submit"
                class="btn btn-primary create-btn"
                :disabled="!newKey.name.trim() || isCreating"
              >
                {{ isCreating ? 'Creating...' : 'Create Key' }}
              </button>
            </div>
          </form>
        </section>

        <!-- Keys list -->
        <section class="section">
          <h2>Keys ({{ activeKeys.length }} active)</h2>

          <div v-if="!keys || keys.length === 0" class="empty">
            <p>No API keys yet. Create one above to get started.</p>
          </div>

          <div v-else class="keys-list">
            <div
              v-for="key in keys"
              :key="key._id"
              class="key-card"
              :class="{ revoked: key.status === 'revoked' }"
            >
              <div class="key-info">
                <div class="key-name-row">
                  <span class="key-name">{{ key.name }}</span>
                  <span class="status-badge" :class="key.status">{{ key.status }}</span>
                  <span class="role-badge" :class="key.role">{{ key.role }}</span>
                </div>
                <div class="key-meta">
                  <code class="key-prefix">{{ key.prefix }}</code>
                  <span class="key-date">Created {{ formatDate(key.createdAt) }}</span>
                  <span v-if="key.lastUsedAt" class="key-date">
                    Last used {{ formatDate(key.lastUsedAt) }}
                  </span>
                  <span v-else class="key-date never-used">Never used</span>
                </div>
              </div>
              <div v-if="key.status === 'active'" class="key-actions">
                <button
                  class="btn btn-sm btn-danger"
                  :disabled="isRevoking === key._id"
                  @click="handleRevoke(key._id)"
                >
                  {{ isRevoking === key._id ? 'Revoking...' : 'Revoke' }}
                </button>
              </div>
              <div v-else class="key-actions">
                <span class="revoked-date">Revoked {{ formatDate(key.revokedAt!) }}</span>
              </div>
            </div>
          </div>
        </section>

        <!-- MCP connection info -->
        <section class="section">
          <h2>Connection Info</h2>
          <div class="connection-info">
            <div class="info-row">
              <label>MCP Endpoint</label>
              <code>{{ mcpEndpoint }}</code>
            </div>
            <div class="info-row">
              <label>Header</label>
              <code>Authorization: Bearer &lt;your-key&gt;</code>
            </div>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Id } from '../convex/_generated/dataModel'
import { api } from '../convex/_generated/api'

definePageMeta({
  layout: 'sidebar',
})

const { isAuthenticated } = useConvexAuth()
const nuxtApp = useNuxtApp()

// Query keys
const queryArgs = computed(() => (isAuthenticated.value ? {} : undefined))
const { data: keys, pending } = await useConvexQuery(api.mcpKeys.list, queryArgs)

const activeKeys = computed(() =>
  (keys.value ?? []).filter((k: { status: string }) => k.status === 'active'),
)

// Create form
const newKey = ref({ name: '', role: 'member' as string })
const isCreating = ref(false)
const createdKey = ref<string | null>(null)
const copied = ref(false)

// Revoke state
const isRevoking = ref<Id<'mcpKeys'> | null>(null)

// MCP endpoint
const mcpEndpoint = computed(() => {
  if (import.meta.client) {
    return `${window.location.origin}/mcp`
  }
  return 'http://localhost:3000/mcp'
})

function getConvexClient() {
  const client = nuxtApp.$convex
  if (!client) throw new Error('Convex client unavailable')
  return client
}

async function handleCreate() {
  if (!newKey.value.name.trim()) return

  isCreating.value = true
  try {
    const client = getConvexClient()
    const result = await client.mutation(api.mcpKeys.create, {
      name: newKey.value.name.trim(),
      role: newKey.value.role as 'owner' | 'admin' | 'member' | 'viewer',
    })
    createdKey.value = result.key
    newKey.value = { name: '', role: 'member' }
    copied.value = false
  }
  catch (e) {
    console.error('Failed to create key:', e)
  }
  finally {
    isCreating.value = false
  }
}

async function handleRevoke(id: Id<'mcpKeys'>) {
  isRevoking.value = id
  try {
    const client = getConvexClient()
    await client.mutation(api.mcpKeys.revoke, { id })
  }
  catch (e) {
    console.error('Failed to revoke key:', e)
  }
  finally {
    isRevoking.value = null
  }
}

async function copyKey(key: string) {
  try {
    await navigator.clipboard.writeText(key)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  }
  catch {
    // Fallback: select the text
    const el = document.querySelector('.key-value') as HTMLElement
    if (el) {
      const range = document.createRange()
      range.selectNodeContents(el)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
  }
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString()
}
</script>

<style scoped>
.container {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px;
}

.card {
  background: white;
  border-radius: 12px;
  padding: 32px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.header h1 {
  margin: 0;
  font-size: 1.75rem;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.description {
  color: #6b7280;
  margin-bottom: 24px;
  line-height: 1.5;
}

.loading {
  text-align: center;
  padding: 40px;
  color: #6b7280;
}

.not-auth {
  text-align: center;
  padding: 40px;
  color: #6b7280;
}

.not-auth .btn {
  margin-top: 12px;
}

/* Created key banner */
.created-key-banner {
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 8px;
  padding: 16px 20px;
  margin-bottom: 24px;
}

.created-key-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  color: #065f46;
}

.key-display {
  display: flex;
  align-items: center;
  gap: 12px;
  background: white;
  padding: 10px 14px;
  border-radius: 6px;
  border: 1px solid #d1fae5;
}

.key-value {
  flex: 1;
  font-size: 0.95rem;
  font-family: 'SF Mono', 'Fira Code', monospace;
  color: #1f2937;
  word-break: break-all;
}

.key-usage-hint {
  margin-top: 10px;
  font-size: 0.85rem;
  color: #059669;
}

.key-usage-hint code {
  background: rgba(255, 255, 255, 0.7);
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.85rem;
}

/* Sections */
.section {
  margin-bottom: 32px;
}

.section h2 {
  font-size: 1.25rem;
  margin-bottom: 16px;
  color: #1f2937;
}

/* Create form */
.create-form {
  background: #f9fafb;
  padding: 20px;
  border-radius: 8px;
}

.form-row {
  display: flex;
  gap: 16px;
  align-items: flex-end;
}

.form-group {
  flex: 1;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
  color: #374151;
  font-size: 0.9rem;
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 16px;
  background: white;
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.create-btn {
  white-space: nowrap;
  height: fit-content;
}

/* Keys list */
.empty {
  text-align: center;
  padding: 40px;
  background: #f9fafb;
  border-radius: 8px;
  color: #6b7280;
}

.keys-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.key-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px 20px;
  transition: box-shadow 0.15s;
}

.key-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.key-card.revoked {
  opacity: 0.55;
}

.key-info {
  flex: 1;
}

.key-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.key-name {
  font-weight: 600;
  color: #1f2937;
}

.key-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.85rem;
  color: #6b7280;
}

.key-prefix {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 0.85rem;
  background: #e5e7eb;
  padding: 2px 8px;
  border-radius: 4px;
  color: #4b5563;
}

.key-date {
  color: #9ca3af;
}

.never-used {
  color: #d1d5db;
  font-style: italic;
}

.key-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 16px;
}

.revoked-date {
  font-size: 0.85rem;
  color: #9ca3af;
}

/* Badges */
.status-badge {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.75rem;
  font-weight: 500;
}

.status-badge.active {
  background: #d1fae5;
  color: #065f46;
}

.status-badge.revoked {
  background: #fee2e2;
  color: #991b1b;
}

.role-badge {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.75rem;
  font-weight: 500;
}

.role-badge.owner {
  background: #fef3c7;
  color: #92400e;
}

.role-badge.admin {
  background: #dbeafe;
  color: #1e40af;
}

.role-badge.member {
  background: #e0e7ff;
  color: #3730a3;
}

.role-badge.viewer {
  background: #f3f4f6;
  color: #4b5563;
}

/* Connection info */
.connection-info {
  background: #f9fafb;
  border-radius: 8px;
  padding: 20px;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
}

.info-row:not(:last-child) {
  border-bottom: 1px solid #e5e7eb;
}

.info-row label {
  font-weight: 500;
  color: #374151;
  min-width: 100px;
  font-size: 0.9rem;
}

.info-row code {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 0.9rem;
  color: #1f2937;
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
  border: 1px solid #e5e7eb;
  background: white;
  color: #374151;
  transition: all 0.15s;
}

.btn:hover:not(:disabled) {
  background: #f9fafb;
  border-color: #d1d5db;
}

.btn-primary {
  background: #3b82f6;
  color: white;
  border-color: #3b82f6;
}

.btn-primary:hover:not(:disabled) {
  background: #2563eb;
  border-color: #2563eb;
}

.btn-secondary {
  background: white;
  color: #374151;
  border-color: #d1d5db;
}

.btn-danger {
  background: white;
  color: #dc2626;
  border-color: #fecaca;
}

.btn-danger:hover:not(:disabled) {
  background: #fef2f2;
  border-color: #dc2626;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 0.8rem;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 640px) {
  .form-row {
    flex-direction: column;
  }

  .key-card {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .key-actions {
    margin-left: 0;
  }
}
</style>
