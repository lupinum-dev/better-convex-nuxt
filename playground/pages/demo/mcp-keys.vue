<template>
  <div class="container">
    <div class="card">
      <header class="header">
        <div>
          <h1>MCP API Keys</h1>
          <p class="description">
            Create real `mcp_*` keys, keep the full secret in this browser, and use them in the
            curl-based verification worksheet.
          </p>
        </div>
        <div class="header-actions">
          <NuxtLink to="/demo/permissions" class="btn btn-secondary">Permissions</NuxtLink>
          <NuxtLink to="/demo/mcp-verify" class="btn btn-primary">MCP Verify</NuxtLink>
        </div>
      </header>

      <div v-if="isPending || (pending && isAuthenticated)" class="loading">Loading keys...</div>

      <div v-else-if="!isAuthenticated" class="not-auth">
        <p>Sign in to create real MCP keys and run the verification flow.</p>
        <NuxtLink to="/auth/signin" class="btn btn-primary">Sign In</NuxtLink>
      </div>

      <template v-else>
        <div v-if="errorMessage" class="error-box">
          {{ errorMessage }}
        </div>

        <div v-if="createdKey" class="created-key-banner">
          <div class="created-key-header">
            <strong>Key created and saved in this browser.</strong>
            <button class="btn btn-sm" @click="createdKey = null">Dismiss</button>
          </div>
          <div class="key-display">
            <code class="key-value">{{ createdKey }}</code>
            <button class="btn btn-sm btn-primary" @click="copyKey(createdKey)">
              {{ copied ? 'Copied!' : 'Copy' }}
            </button>
          </div>
          <p class="key-usage-hint">
            Use as <code>Authorization: Bearer {{ createdKey }}</code> or open the verification page
            for generated curl snippets.
          </p>
        </div>

        <section class="section">
          <h2>Recommended Verification Set</h2>
          <p class="hint">
            The verification worksheet is easiest with one remembered key per role.
          </p>
          <div class="preset-grid">
            <button
              v-for="preset in presets"
              :key="preset.role"
              class="preset-card"
              :disabled="isCreating"
              @click="handlePresetCreate(preset.role, preset.name)"
            >
              <span class="preset-title">{{ preset.name }}</span>
              <span class="role-badge" :class="preset.role">{{ preset.role }}</span>
              <span class="preset-state">
                {{ hasRememberedRole(preset.role) ? 'Ready in this browser' : 'Create key' }}
              </span>
            </button>
          </div>
        </section>

        <section class="section">
          <h2>Create Custom Key</h2>
          <form class="create-form" @submit.prevent="handleCreate">
            <div class="form-row">
              <div class="form-group">
                <label for="key-name">Name</label>
                <input
                  id="key-name"
                  v-model="newKey.name"
                  type="text"
                  placeholder="e.g. Claude Desktop, CI pipeline"
                  :disabled="isCreating"
                  required
                />
              </div>
              <div class="form-group">
                <label for="key-role">Role</label>
                <select id="key-role" v-model="newKey.role" :disabled="isCreating">
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

        <section class="section">
          <h2>Connection Info</h2>
          <div class="connection-info">
            <div class="info-row">
              <label>MCP endpoint</label>
              <code>{{ mcpEndpoint }}</code>
            </div>
            <div class="info-row">
              <label>Header</label>
              <code>Authorization: Bearer &lt;your-key&gt;</code>
            </div>
            <div class="info-row">
              <label>Next step</label>
              <NuxtLink to="/demo/mcp-verify" class="inline-link"
                >Open the generated curl worksheet</NuxtLink
              >
            </div>
          </div>
        </section>

        <section class="section">
          <h2>Keys ({{ activeKeys.length }} active)</h2>

          <div v-if="!keys || keys.length === 0" class="empty">
            <p>No keys yet. Create one above to get started.</p>
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
                  <span v-if="hasSecret(key._id)" class="saved-badge">Secret saved locally</span>
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

              <div class="key-actions">
                <button
                  v-if="key.status === 'active'"
                  class="btn btn-sm"
                  :disabled="!hasSecret(key._id)"
                  @click="goToVerification(key._id)"
                >
                  Verify
                </button>
                <button
                  v-if="key.status === 'active' && hasSecret(key._id)"
                  class="btn btn-sm btn-secondary"
                  @click="copyKey(getSecret(key._id)?.key ?? '')"
                >
                  Copy
                </button>
                <button
                  v-if="key.status === 'active'"
                  class="btn btn-sm btn-danger"
                  :disabled="isRevoking === key._id"
                  @click="handleRevoke(key._id)"
                >
                  {{ isRevoking === key._id ? 'Revoking...' : 'Revoke' }}
                </button>
                <span v-else class="revoked-date">Revoked {{ formatDate(key.revokedAt!) }}</span>
              </div>
            </div>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'

definePageMeta({
  layout: 'sidebar',
})

type McpKeyDoc = Doc<'mcpKeys'>
type KeyRole = 'admin' | 'member' | 'viewer'

const presets = [
  { role: 'admin' as const, name: 'Verification Admin Key' },
  { role: 'member' as const, name: 'Verification Member Key' },
  { role: 'viewer' as const, name: 'Verification Viewer Key' },
]

const { isAuthenticated, isPending } = useConvexAuth()
const nuxtApp = useNuxtApp()
const router = useRouter()
const { rememberSecret, forgetSecret, getSecret, hasSecret, secrets } = useStoredMcpSecrets()

const queryArgs = computed(() => (isPending.value || !isAuthenticated.value ? undefined : {}))
const { data: keys, pending, error } = await useConvexQuery(api.mcpKeys.list, queryArgs)

const activeKeys = computed(() =>
  (keys.value ?? []).filter((key: McpKeyDoc) => key.status === 'active'),
)

const newKey = ref({ name: '', role: 'member' as KeyRole })
const isCreating = ref(false)
const isRevoking = ref<Id<'mcpKeys'> | null>(null)
const createdKey = ref<string | null>(null)
const copied = ref(false)
const actionError = ref<string | null>(null)

const mcpEndpoint = computed(() => {
  if (import.meta.client) {
    return `${window.location.origin}/mcp`
  }
  return 'http://localhost:3000/mcp'
})

const errorMessage = computed(() => actionError.value ?? error.value?.message ?? null)

function getConvexClient() {
  const client = nuxtApp.$convex
  if (!client) throw new Error('Convex client unavailable')
  return client
}

async function createKey(name: string, role: KeyRole) {
  const client = getConvexClient()
  const result = await client.mutation(api.mcpKeys.create, { name, role })
  rememberSecret(result.id, {
    key: result.key,
    name,
    role,
    prefix: result.key.slice(0, 12) + '...',
  })
  createdKey.value = result.key
  copied.value = false
  return result
}

async function handleCreate() {
  if (!newKey.value.name.trim()) return

  isCreating.value = true
  actionError.value = null
  try {
    await createKey(newKey.value.name.trim(), newKey.value.role)
    newKey.value = { name: '', role: 'member' }
  } catch (e) {
    console.error('Failed to create key:', e)
    actionError.value = toErrorMessage(e, 'Failed to create key.')
  } finally {
    isCreating.value = false
  }
}

async function handlePresetCreate(role: KeyRole, name: string) {
  isCreating.value = true
  actionError.value = null
  try {
    await createKey(name, role)
  } catch (e) {
    console.error('Failed to create preset key:', e)
    actionError.value = toErrorMessage(e, 'Failed to create key.')
  } finally {
    isCreating.value = false
  }
}

async function handleRevoke(id: Id<'mcpKeys'>) {
  isRevoking.value = id
  actionError.value = null
  try {
    const client = getConvexClient()
    await client.mutation(api.mcpKeys.revoke, { id })
    forgetSecret(id)
  } catch (e) {
    console.error('Failed to revoke key:', e)
    actionError.value = toErrorMessage(e, 'Failed to revoke key.')
  } finally {
    isRevoking.value = null
  }
}

function hasRememberedRole(role: KeyRole) {
  return activeKeys.value.some((key) => key.role === role && hasSecret(key._id))
}

function goToVerification(id: Id<'mcpKeys'>) {
  router.push({
    path: '/demo/mcp-verify',
    query: { keyId: id },
  })
}

async function copyKey(key: string) {
  if (!key) return

  try {
    await navigator.clipboard.writeText(key)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch {
    const el = document.querySelector('.key-value') as HTMLElement | null
    if (!el) return
    const range = document.createRange()
    range.selectNodeContents(el)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
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

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

watch(keys, (value) => {
  if (!value) return

  const activeIds = new Set(value.filter((key) => key.status === 'active').map((key) => key._id))
  for (const id of Object.keys(secrets.value)) {
    if (!activeIds.has(id as Id<'mcpKeys'>)) {
      forgetSecret(id)
    }
  }
})
</script>

<style scoped>
.container {
  max-width: 980px;
  margin: 0 auto;
  padding: 24px;
}

.card {
  background: white;
  border-radius: 14px;
  padding: 32px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.1);
}

.header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 24px;
}

.header h1 {
  margin: 0 0 8px;
  font-size: 1.85rem;
}

.description {
  margin: 0;
  color: #64748b;
  line-height: 1.5;
}

.header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.loading,
.not-auth,
.empty {
  text-align: center;
  padding: 40px 24px;
  color: #64748b;
}

.section {
  margin-bottom: 32px;
}

.section h2 {
  margin: 0 0 10px;
  font-size: 1.2rem;
  color: #0f172a;
}

.hint {
  margin: 0 0 14px;
  color: #64748b;
}

.error-box {
  margin-bottom: 24px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid #fecaca;
  background: #fef2f2;
  color: #991b1b;
}

.created-key-banner {
  background: #ecfeff;
  border: 1px solid #a5f3fc;
  border-radius: 12px;
  padding: 16px 20px;
  margin-bottom: 24px;
}

.created-key-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
  color: #155e75;
}

.key-display {
  display: flex;
  align-items: center;
  gap: 12px;
  background: white;
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid #cffafe;
}

.key-value {
  flex: 1;
  word-break: break-all;
  font-family: 'SF Mono', 'Fira Code', monospace;
}

.key-usage-hint {
  margin: 10px 0 0;
  color: #0f766e;
}

.key-usage-hint code {
  background: rgba(255, 255, 255, 0.8);
  padding: 2px 6px;
  border-radius: 4px;
}

.preset-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.preset-card {
  display: grid;
  gap: 10px;
  padding: 14px;
  border: 1px solid #dbeafe;
  border-radius: 12px;
  background: linear-gradient(180deg, #f8fbff 0%, #eff6ff 100%);
  text-align: left;
  cursor: pointer;
}

.preset-card:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.preset-title {
  font-weight: 600;
  color: #0f172a;
}

.preset-state {
  font-size: 0.85rem;
  color: #475569;
}

.create-form,
.connection-info {
  background: #f8fafc;
  border-radius: 12px;
  padding: 18px;
  border: 1px solid #e2e8f0;
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
  font-weight: 600;
  color: #334155;
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: white;
  font-size: 16px;
}

.create-btn {
  white-space: nowrap;
}

.connection-info {
  display: grid;
  gap: 10px;
}

.info-row {
  display: flex;
  gap: 12px;
  align-items: center;
}

.info-row label {
  min-width: 110px;
  font-weight: 600;
  color: #334155;
}

.info-row code {
  font-family: 'SF Mono', 'Fira Code', monospace;
  word-break: break-all;
}

.inline-link {
  color: #2563eb;
  text-decoration: none;
  font-weight: 600;
}

.keys-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.key-card {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: white;
}

.key-card.revoked {
  opacity: 0.6;
}

.key-info {
  flex: 1;
  min-width: 0;
}

.key-name-row,
.key-meta,
.key-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.key-name-row {
  margin-bottom: 8px;
}

.key-name {
  font-weight: 700;
  color: #0f172a;
}

.key-prefix {
  padding: 2px 8px;
  border-radius: 999px;
  background: #e2e8f0;
  font-family: 'SF Mono', 'Fira Code', monospace;
}

.key-date {
  color: #64748b;
  font-size: 0.9rem;
}

.never-used {
  font-style: italic;
}

.saved-badge,
.status-badge,
.role-badge {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
}

.saved-badge {
  background: #dcfce7;
  color: #166534;
}

.status-badge.active {
  background: #dbeafe;
  color: #1d4ed8;
}

.status-badge.revoked {
  background: #fee2e2;
  color: #b91c1c;
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
  background: #f1f5f9;
  color: #475569;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  padding: 8px 14px;
  border: 1px solid #d1d5db;
  background: white;
  color: #1f2937;
  text-decoration: none;
  cursor: pointer;
  font-weight: 600;
}

.btn:hover:not(:disabled) {
  background: #f8fafc;
}

.btn-primary {
  background: #2563eb;
  border-color: #2563eb;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #1d4ed8;
}

.btn-secondary {
  background: white;
}

.btn-danger {
  color: #b91c1c;
  border-color: #fecaca;
}

.btn-danger:hover:not(:disabled) {
  background: #fef2f2;
}

.btn-sm {
  padding: 6px 10px;
  font-size: 0.82rem;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.revoked-date {
  color: #94a3b8;
  font-size: 0.9rem;
}

@media (max-width: 720px) {
  .header,
  .form-row,
  .key-card {
    flex-direction: column;
  }

  .key-display {
    flex-direction: column;
    align-items: stretch;
  }

  .info-row {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
