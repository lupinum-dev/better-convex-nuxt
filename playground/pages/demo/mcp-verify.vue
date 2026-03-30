<template>
  <div class="container">
    <div class="card">
      <header class="header">
        <div>
          <h1>MCP Verification</h1>
          <p class="description">
            Use real `mcp_*` keys against the live <code>/mcp</code> route. The commands below are
            generated from your current origin and the keys remembered in this browser.
          </p>
        </div>
        <div class="header-actions">
          <NuxtLink to="/demo/mcp-keys" class="btn btn-secondary">Manage Keys</NuxtLink>
          <NuxtLink to="/demo/permissions" class="btn btn-secondary">Permissions</NuxtLink>
        </div>
      </header>

      <div v-if="authPending || keysPending" class="loading">Loading verification state...</div>

      <div v-else-if="!isAuthenticated" class="not-auth">
        <p>Sign in first, then create keys on the MCP Keys page.</p>
        <NuxtLink to="/auth/signin" class="btn btn-primary">Sign In</NuxtLink>
      </div>

      <template v-else>
        <div class="setup-grid">
          <section class="panel">
            <h2>Setup</h2>
            <div class="meta-list">
              <div><span>Endpoint</span><code>{{ endpoint }}</code></div>
              <div><span>Current user</span><code>{{ currentUser?.authId ?? 'unknown' }}</code></div>
              <div>
                <span>Current org</span>
                <code>{{ currentUser?.organizationId ?? 'create or join an org first' }}</code>
              </div>
              <div><span>jq required</span><code>yes</code></div>
            </div>
          </section>

          <section class="panel">
            <h2>Prerequisites</h2>
            <ul class="checklist">
              <li :class="{ ok: Boolean(currentUser?.organizationId) }">
                <span>{{ currentUser?.organizationId ? 'Ready' : 'Missing' }}</span>
                Create or join an organization on <NuxtLink to="/demo/permissions">Permissions</NuxtLink>.
              </li>
              <li :class="{ ok: Boolean(roleKeys.admin.secret) }">
                <span>{{ roleKeys.admin.secret ? 'Ready' : 'Missing' }}</span>
                Remember an admin key in this browser.
              </li>
              <li :class="{ ok: Boolean(roleKeys.member.secret) }">
                <span>{{ roleKeys.member.secret ? 'Ready' : 'Missing' }}</span>
                Remember a member key in this browser.
              </li>
              <li :class="{ ok: Boolean(roleKeys.viewer.secret) }">
                <span>{{ roleKeys.viewer.secret ? 'Ready' : 'Missing' }}</span>
                Remember a viewer key in this browser.
              </li>
            </ul>
          </section>
        </div>

        <section class="section">
          <h2>Role Keys</h2>
          <div class="role-grid">
            <div v-for="role in roles" :key="role" class="role-card">
              <div class="role-head">
                <span class="role-title">{{ roleLabels[role] }}</span>
                <span class="role-badge" :class="role">{{ role }}</span>
              </div>

              <label class="field">
                <span>Key</span>
                <select v-model="selectedKeyIds[role]">
                  <option value="">Select a {{ role }} key</option>
                  <option
                    v-for="key in keysByRole[role]"
                    :key="key._id"
                    :value="key._id"
                  >
                    {{ key.name }} · {{ key.prefix }}
                  </option>
                </select>
              </label>

              <div v-if="selectedKeys[role]" class="key-summary">
                <div><span>Name</span><strong>{{ selectedKeys[role]?.name }}</strong></div>
                <div><span>User</span><code>{{ selectedKeys[role]?.userId }}</code></div>
                <div><span>Org</span><code>{{ selectedKeys[role]?.organizationId ?? 'none' }}</code></div>
                <div><span>Last used</span><code>{{ formatLastUsed(selectedKeys[role]?.lastUsedAt) }}</code></div>
              </div>

              <div v-if="roleKeys[role].secret" class="remembered">
                <span>Saved in this browser</span>
                <button class="btn btn-sm" @click="copyText(roleKeys[role].secret ?? '')">Copy</button>
                <button class="btn btn-sm btn-secondary" @click="forgetRoleSecret(role)">Forget local secret</button>
              </div>

              <div v-else class="remember-form">
                <label class="field">
                  <span>Paste full key once</span>
                  <input
                    v-model="secretInputs[role]"
                    type="password"
                    placeholder="mcp_..."
                    :disabled="!selectedKeys[role]"
                  />
                </label>
                <button class="btn btn-primary btn-sm" :disabled="!canRemember(role)" @click="rememberRoleSecret(role)">
                  Remember locally
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="section">
          <h2>Shell Setup</h2>
          <p class="hint">
            Run this once in a fresh shell. It exports your live endpoint and whichever selected
            keys are available in this browser.
          </p>
          <div class="code-card">
            <button class="btn btn-sm" @click="copyText(shellSetup)">Copy</button>
            <pre><code>{{ shellSetup }}</code></pre>
          </div>
        </section>

        <section class="section">
          <h2>Verification Recipes</h2>
          <div class="recipe-list">
            <article v-for="recipe in recipes" :key="recipe.title" class="recipe-card">
              <div class="recipe-head">
                <div>
                  <h3>{{ recipe.title }}</h3>
                  <p class="recipe-concept">{{ recipe.concept }}</p>
                </div>
                <span class="status-pill" :class="recipe.ready ? 'ready' : 'blocked'">
                  {{ recipe.ready ? 'Ready' : 'Needs setup' }}
                </span>
              </div>
              <p class="recipe-meta"><strong>Prereqs:</strong> {{ recipe.prereqs }}</p>
              <p class="recipe-meta"><strong>Expected:</strong> {{ recipe.expected }}</p>
              <div class="code-card">
                <button class="btn btn-sm" :disabled="!recipe.ready" @click="copyText(recipe.command)">Copy</button>
                <pre><code>{{ recipe.command }}</code></pre>
              </div>
            </article>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Doc } from '../../convex/_generated/dataModel'
import { api } from '../../convex/_generated/api'

definePageMeta({
  layout: 'sidebar',
})

type McpKeyDoc = Doc<'mcpKeys'>
type KeyRole = 'admin' | 'member' | 'viewer'

interface Recipe {
  title: string
  concept: string
  prereqs: string
  expected: string
  command: string
  ready: boolean
}

const roles = ['admin', 'member', 'viewer'] as const
const roleLabels: Record<KeyRole, string> = {
  admin: 'Admin Key',
  member: 'Member Key',
  viewer: 'Viewer Key',
}

const route = useRoute()
const { isAuthenticated, isPending: authPending } = useConvexAuth()
const { rememberSecret, forgetSecret, getSecret } = useStoredMcpSecrets()

const { data: currentUser } = await useConvexQuery(api.users.getCurrentUser, {})
const keyQueryArgs = computed(() => (authPending.value || !isAuthenticated.value ? undefined : {}))
const { data: keys, pending: keysPending } = await useConvexQuery(api.mcpKeys.list, keyQueryArgs)

const endpoint = computed(() => {
  if (import.meta.client) return `${window.location.origin}/mcp`
  return 'http://localhost:3000/mcp'
})

const activeKeys = computed(() =>
  (keys.value ?? []).filter((key: McpKeyDoc) => key.status === 'active'),
)

const keysByRole = computed<Record<KeyRole, McpKeyDoc[]>>(() => ({
  admin: activeKeys.value.filter(key => key.role === 'admin'),
  member: activeKeys.value.filter(key => key.role === 'member'),
  viewer: activeKeys.value.filter(key => key.role === 'viewer'),
}))

const selectedKeyIds = reactive<Record<KeyRole, string>>({
  admin: '',
  member: '',
  viewer: '',
})

const secretInputs = reactive<Record<KeyRole, string>>({
  admin: '',
  member: '',
  viewer: '',
})

const selectedKeys = computed<Record<KeyRole, McpKeyDoc | null>>(() => ({
  admin: activeKeys.value.find(key => key._id === selectedKeyIds.admin) ?? null,
  member: activeKeys.value.find(key => key._id === selectedKeyIds.member) ?? null,
  viewer: activeKeys.value.find(key => key._id === selectedKeyIds.viewer) ?? null,
}))

const roleKeys = computed<Record<KeyRole, { key: McpKeyDoc | null; secret: string | null }>>(() => ({
  admin: {
    key: selectedKeys.value.admin,
    secret: getSecret(selectedKeyIds.admin)?.key ?? null,
  },
  member: {
    key: selectedKeys.value.member,
    secret: getSecret(selectedKeyIds.member)?.key ?? null,
  },
  viewer: {
    key: selectedKeys.value.viewer,
    secret: getSecret(selectedKeyIds.viewer)?.key ?? null,
  },
}))

function pickDefaultKey(role: KeyRole): string {
  const remembered = keysByRole.value[role].find(key => Boolean(getSecret(key._id)))
  return remembered?._id ?? keysByRole.value[role][0]?._id ?? ''
}

watchEffect(() => {
  for (const role of roles) {
    if (!selectedKeyIds[role]) {
      selectedKeyIds[role] = pickDefaultKey(role)
    }
  }

  const requestedId = typeof route.query.keyId === 'string' ? route.query.keyId : null
  if (!requestedId) return

  const requestedKey = activeKeys.value.find(key => key._id === requestedId)
  if (!requestedKey) return
  if (requestedKey.role === 'admin' || requestedKey.role === 'member' || requestedKey.role === 'viewer') {
    selectedKeyIds[requestedKey.role] = requestedKey._id
  }
})

function canRemember(role: KeyRole) {
  return Boolean(selectedKeys.value[role] && secretInputs[role].trim().startsWith('mcp_'))
}

function rememberRoleSecret(role: KeyRole) {
  const key = selectedKeys.value[role]
  const secret = secretInputs[role].trim()
  if (!key || !secret) return

  rememberSecret(key._id, {
    key: secret,
    name: key.name,
    role: key.role,
    prefix: key.prefix,
  })
  secretInputs[role] = ''
}

function forgetRoleSecret(role: KeyRole) {
  if (!selectedKeyIds[role]) return
  forgetSecret(selectedKeyIds[role])
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value)
}

function formatLastUsed(timestamp: number | undefined) {
  if (!timestamp) return 'never'
  return new Date(timestamp).toLocaleString()
}

const shellSetup = computed(() => [
  `export MCP_ENDPOINT='${endpoint.value}'`,
  roleKeys.value.admin.secret
    ? `export MCP_ADMIN_KEY='${roleKeys.value.admin.secret}'`
    : '# export MCP_ADMIN_KEY=\'mcp_...\'',
  roleKeys.value.member.secret
    ? `export MCP_MEMBER_KEY='${roleKeys.value.member.secret}'`
    : '# export MCP_MEMBER_KEY=\'mcp_...\'',
  roleKeys.value.viewer.secret
    ? `export MCP_VIEWER_KEY='${roleKeys.value.viewer.secret}'`
    : '# export MCP_VIEWER_KEY=\'mcp_...\'',
].join('\n'))

function initializeCommand(sessionVar: string, keyVar?: string) {
  return [
    `${sessionVar}=$(curl -s "$MCP_ENDPOINT" \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -H 'Accept: application/json, text/event-stream' \\`,
    ...(keyVar ? [`  -H "Authorization: Bearer $${keyVar}" \\`] : []),
    `  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"1.0.0"}}}' \\`,
    `  | jq -r '.result.meta.sessionId // empty')`,
    `echo "$${sessionVar}"`,
  ].join('\n')
}

function callToolsListCommand(sessionVar: string) {
  return [
    `curl -s "$MCP_ENDPOINT" \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -H 'Accept: application/json, text/event-stream' \\`,
    `  -H "Mcp-Session-Id: $${sessionVar}" \\`,
    `  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | jq .`,
  ].join('\n')
}

const recipes = computed<Recipe[]>(() => {
  const hasAdmin = Boolean(roleKeys.value.admin.secret)
  const hasMember = Boolean(roleKeys.value.member.secret)
  const hasViewer = Boolean(roleKeys.value.viewer.secret)

  return [
    {
      title: 'Anonymous discovery',
      concept: 'Initialize a public MCP session and confirm only public/optional tools are listed.',
      prereqs: 'None',
      expected: '`list-notes`, `create-note`, `search-notes`, and `delete-note` appear. Auth-required tools do not.',
      ready: true,
      command: [
        initializeCommand('PUBLIC_SESSION'),
        '',
        callToolsListCommand('PUBLIC_SESSION'),
      ].join('\n\n'),
    },
    {
      title: 'Public create and list notes',
      concept: 'Verify public mutation + public query through the live route.',
      prereqs: 'Run the shell setup block once.',
      expected: 'The command prints a note id, then `list-notes` includes that note.',
      ready: true,
      command: [
        initializeCommand('PUBLIC_SESSION'),
        '',
        `NOTE_ID=$(curl -s "$MCP_ENDPOINT" \\`,
        `  -H 'Content-Type: application/json' \\`,
        `  -H 'Accept: application/json, text/event-stream' \\`,
        `  -H "Mcp-Session-Id: $PUBLIC_SESSION" \\`,
        `  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"create-note","arguments":{"title":"MCP public note","content":"Created from curl"}}}' \\`,
        `  | jq -r '.result.structuredContent.data.id // empty')`,
        `echo "$NOTE_ID"`,
        '',
        `curl -s "$MCP_ENDPOINT" \\`,
        `  -H 'Content-Type: application/json' \\`,
        `  -H 'Accept: application/json, text/event-stream' \\`,
        `  -H "Mcp-Session-Id: $PUBLIC_SESSION" \\`,
        `  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"list-notes","arguments":{}}}' | jq .`,
      ].join('\n'),
    },
    {
      title: 'Optional auth on a public tool',
      concept: 'Call `search-notes` with a real key and confirm public functions still work via MCP.',
      prereqs: 'Remember a member key locally.',
      expected: 'The search succeeds with the member key and returns note matches.',
      ready: hasMember,
      command: hasMember
        ? [
            initializeCommand('MEMBER_SESSION', 'MCP_MEMBER_KEY'),
            '',
            `curl -s "$MCP_ENDPOINT" \\`,
            `  -H 'Content-Type: application/json' \\`,
            `  -H 'Accept: application/json, text/event-stream' \\`,
            `  -H "Authorization: Bearer $MCP_MEMBER_KEY" \\`,
            `  -H "Mcp-Session-Id: $MEMBER_SESSION" \\`,
            `  -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"search-notes","arguments":{"query":"MCP"}}}' | jq .`,
          ].join('\n')
        : '# Remember a member key on this page first.',
    },
    {
      title: 'User-scoped tasks',
      concept: 'Verify auth-required, user-scoped tool calls with no org-specific DB proxying.',
      prereqs: 'Remember a member key locally.',
      expected: '`add-task` creates a task for the caller and `list-tasks` returns it.',
      ready: hasMember,
      command: hasMember
        ? [
            initializeCommand('MEMBER_SESSION', 'MCP_MEMBER_KEY'),
            '',
            `TASK_ID=$(curl -s "$MCP_ENDPOINT" \\`,
            `  -H 'Content-Type: application/json' \\`,
            `  -H 'Accept: application/json, text/event-stream' \\`,
            `  -H "Authorization: Bearer $MCP_MEMBER_KEY" \\`,
            `  -H "Mcp-Session-Id: $MEMBER_SESSION" \\`,
            `  -d '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"add-task","arguments":{"title":"Verify user-scoped MCP flow"}}}' \\`,
            `  | jq -r '.result.structuredContent.data.id // empty')`,
            `echo "$TASK_ID"`,
            '',
            `curl -s "$MCP_ENDPOINT" \\`,
            `  -H 'Content-Type: application/json' \\`,
            `  -H 'Accept: application/json, text/event-stream' \\`,
            `  -H "Authorization: Bearer $MCP_MEMBER_KEY" \\`,
            `  -H "Mcp-Session-Id: $MEMBER_SESSION" \\`,
            `  -d '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"list-tasks","arguments":{}}}' | jq .`,
          ].join('\n')
        : '# Remember a member key on this page first.',
    },
    {
      title: 'Org-scoped posts and comments',
      concept: 'Create a post, list org posts, create a comment, and list comments for the post.',
      prereqs: 'Remember a member key and belong to an org.',
      expected: 'The created post/comment ids come back and the list calls only show org data.',
      ready: hasMember && Boolean(currentUser.value?.organizationId),
      command: hasMember
        ? [
            initializeCommand('MEMBER_SESSION', 'MCP_MEMBER_KEY'),
            '',
            `POST_ID=$(curl -s "$MCP_ENDPOINT" \\`,
            `  -H 'Content-Type: application/json' \\`,
            `  -H 'Accept: application/json, text/event-stream' \\`,
            `  -H "Authorization: Bearer $MCP_MEMBER_KEY" \\`,
            `  -H "Mcp-Session-Id: $MEMBER_SESSION" \\`,
            `  -d '{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"create-post","arguments":{"title":"MCP org post","content":"Created from curl"}}}' \\`,
            `  | jq -r '.result.structuredContent.data.id // empty')`,
            `echo "$POST_ID"`,
            '',
            `curl -s "$MCP_ENDPOINT" \\`,
            `  -H 'Content-Type: application/json' \\`,
            `  -H 'Accept: application/json, text/event-stream' \\`,
            `  -H "Authorization: Bearer $MCP_MEMBER_KEY" \\`,
            `  -H "Mcp-Session-Id: $MEMBER_SESSION" \\`,
            `  -d '{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"list-posts","arguments":{}}}' | jq .`,
            '',
            `COMMENT_ID=$(curl -s "$MCP_ENDPOINT" \\`,
            `  -H 'Content-Type: application/json' \\`,
            `  -H 'Accept: application/json, text/event-stream' \\`,
            `  -H "Authorization: Bearer $MCP_MEMBER_KEY" \\`,
            `  -H "Mcp-Session-Id: $MEMBER_SESSION" \\`,
            `  -d "$(cat <<JSON`,
            `{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"create-comment","arguments":{"postId":"$POST_ID","content":"Comment from curl"}}}`,
            `JSON`,
            `)" | jq -r '.result.structuredContent.data.id // empty')`,
            `echo "$COMMENT_ID"`,
            '',
            `curl -s "$MCP_ENDPOINT" \\`,
            `  -H 'Content-Type: application/json' \\`,
            `  -H 'Accept: application/json, text/event-stream' \\`,
            `  -H "Authorization: Bearer $MCP_MEMBER_KEY" \\`,
            `  -H "Mcp-Session-Id: $MEMBER_SESSION" \\`,
            `  -d "$(cat <<JSON`,
            `{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"list-comments","arguments":{"postId":"$POST_ID"}}}`,
            `JSON`,
            `)" | jq .`,
          ].join('\n')
        : '# Remember a member key on this page first.',
    },
    {
      title: 'Permission denial with viewer role',
      concept: 'Confirm a viewer cannot create posts.',
      prereqs: 'Remember a viewer key and belong to an org.',
      expected: 'The tool returns `ok: false` with an auth-style failure.',
      ready: hasViewer && Boolean(currentUser.value?.organizationId),
      command: hasViewer
        ? [
            initializeCommand('VIEWER_SESSION', 'MCP_VIEWER_KEY'),
            '',
            `curl -s "$MCP_ENDPOINT" \\`,
            `  -H 'Content-Type: application/json' \\`,
            `  -H 'Accept: application/json, text/event-stream' \\`,
            `  -H "Authorization: Bearer $MCP_VIEWER_KEY" \\`,
            `  -H "Mcp-Session-Id: $VIEWER_SESSION" \\`,
            `  -d '{"jsonrpc":"2.0","id":12,"method":"tools/call","params":{"name":"create-post","arguments":{"title":"Viewer should fail","content":"Nope"}}}' | jq .`,
          ].join('\n')
        : '# Remember a viewer key on this page first.',
    },
    {
      title: 'Destructive note preview + confirm',
      concept: 'Show the two-call destructive flow for a public tool.',
      prereqs: 'None',
      expected: 'First call returns preview/awaitingConfirmation, second call deletes the note.',
      ready: true,
      command: [
        initializeCommand('PUBLIC_SESSION'),
        '',
        `NOTE_ID=$(curl -s "$MCP_ENDPOINT" \\`,
        `  -H 'Content-Type: application/json' \\`,
        `  -H 'Accept: application/json, text/event-stream' \\`,
        `  -H "Mcp-Session-Id: $PUBLIC_SESSION" \\`,
        `  -d '{"jsonrpc":"2.0","id":13,"method":"tools/call","params":{"name":"create-note","arguments":{"title":"Delete me","content":"Temporary note"}}}' \\`,
        `  | jq -r '.result.structuredContent.data.id // empty')`,
        `echo "$NOTE_ID"`,
        '',
        `curl -s "$MCP_ENDPOINT" \\`,
        `  -H 'Content-Type: application/json' \\`,
        `  -H 'Accept: application/json, text/event-stream' \\`,
        `  -H "Mcp-Session-Id: $PUBLIC_SESSION" \\`,
        `  -d "$(cat <<JSON`,
        `{"jsonrpc":"2.0","id":14,"method":"tools/call","params":{"name":"delete-note","arguments":{"id":"$NOTE_ID"}}}`,
        `JSON`,
        `)" | jq .`,
        '',
        `curl -s "$MCP_ENDPOINT" \\`,
        `  -H 'Content-Type: application/json' \\`,
        `  -H 'Accept: application/json, text/event-stream' \\`,
        `  -H "Mcp-Session-Id: $PUBLIC_SESSION" \\`,
        `  -d "$(cat <<JSON`,
        `{"jsonrpc":"2.0","id":15,"method":"tools/call","params":{"name":"delete-note","arguments":{"id":"$NOTE_ID","_confirmed":true}}}`,
        `JSON`,
        `)" | jq .`,
      ].join('\n')
    },
    {
      title: 'Destructive post preview + confirm',
      concept: 'Verify destructive preview and execution for an org-scoped auth tool.',
      prereqs: 'Remember a member key.',
      expected: 'First call previews the post deletion. Second call deletes it.',
      ready: hasMember && Boolean(currentUser.value?.organizationId),
      command: hasMember
        ? [
            initializeCommand('MEMBER_SESSION', 'MCP_MEMBER_KEY'),
            '',
            `POST_ID=$(curl -s "$MCP_ENDPOINT" \\`,
            `  -H 'Content-Type: application/json' \\`,
            `  -H 'Accept: application/json, text/event-stream' \\`,
            `  -H "Authorization: Bearer $MCP_MEMBER_KEY" \\`,
            `  -H "Mcp-Session-Id: $MEMBER_SESSION" \\`,
            `  -d '{"jsonrpc":"2.0","id":16,"method":"tools/call","params":{"name":"create-post","arguments":{"title":"Delete this post","content":"Temporary"}}}' \\`,
            `  | jq -r '.result.structuredContent.data.id // empty')`,
            `echo "$POST_ID"`,
            '',
            `curl -s "$MCP_ENDPOINT" \\`,
            `  -H 'Content-Type: application/json' \\`,
            `  -H 'Accept: application/json, text/event-stream' \\`,
            `  -H "Authorization: Bearer $MCP_MEMBER_KEY" \\`,
            `  -H "Mcp-Session-Id: $MEMBER_SESSION" \\`,
            `  -d "$(cat <<JSON`,
            `{"jsonrpc":"2.0","id":17,"method":"tools/call","params":{"name":"delete-post","arguments":{"id":"$POST_ID"}}}`,
            `JSON`,
            `)" | jq .`,
            '',
            `curl -s "$MCP_ENDPOINT" \\`,
            `  -H 'Content-Type: application/json' \\`,
            `  -H 'Accept: application/json, text/event-stream' \\`,
            `  -H "Authorization: Bearer $MCP_MEMBER_KEY" \\`,
            `  -H "Mcp-Session-Id: $MEMBER_SESSION" \\`,
            `  -d "$(cat <<JSON`,
            `{"jsonrpc":"2.0","id":18,"method":"tools/call","params":{"name":"delete-post","arguments":{"id":"$POST_ID","_confirmed":true}}}`,
            `JSON`,
            `)" | jq .`,
          ].join('\n')
        : '# Remember a member key on this page first.',
    },
    {
      title: 'Bulk delete with preview and guardrails',
      concept: 'Verify destructive preview plus multi-id payload handling.',
      prereqs: 'Remember a member key.',
      expected: 'Preview lists both notes. Confirmed run reports `deleted: 2`.',
      ready: hasMember,
      command: hasMember
        ? [
            initializeCommand('MEMBER_SESSION', 'MCP_MEMBER_KEY'),
            '',
            `NOTE_A=$(curl -s "$MCP_ENDPOINT" \\`,
            `  -H 'Content-Type: application/json' \\`,
            `  -H 'Accept: application/json, text/event-stream' \\`,
            `  -H "Mcp-Session-Id: $MEMBER_SESSION" \\`,
            `  -d '{"jsonrpc":"2.0","id":19,"method":"tools/call","params":{"name":"create-note","arguments":{"title":"Bulk A","content":"A"}}}' \\`,
            `  | jq -r '.result.structuredContent.data.id // empty')`,
            `NOTE_B=$(curl -s "$MCP_ENDPOINT" \\`,
            `  -H 'Content-Type: application/json' \\`,
            `  -H 'Accept: application/json, text/event-stream' \\`,
            `  -H "Mcp-Session-Id: $MEMBER_SESSION" \\`,
            `  -d '{"jsonrpc":"2.0","id":20,"method":"tools/call","params":{"name":"create-note","arguments":{"title":"Bulk B","content":"B"}}}' \\`,
            `  | jq -r '.result.structuredContent.data.id // empty')`,
            `echo "$NOTE_A $NOTE_B"`,
            '',
            `curl -s "$MCP_ENDPOINT" \\`,
            `  -H 'Content-Type: application/json' \\`,
            `  -H 'Accept: application/json, text/event-stream' \\`,
            `  -H "Authorization: Bearer $MCP_MEMBER_KEY" \\`,
            `  -H "Mcp-Session-Id: $MEMBER_SESSION" \\`,
            `  -d "$(cat <<JSON`,
            `{"jsonrpc":"2.0","id":21,"method":"tools/call","params":{"name":"bulk-delete-notes","arguments":{"ids":["$NOTE_A","$NOTE_B"]}}}`,
            `JSON`,
            `)" | jq .`,
            '',
            `curl -s "$MCP_ENDPOINT" \\`,
            `  -H 'Content-Type: application/json' \\`,
            `  -H 'Accept: application/json, text/event-stream' \\`,
            `  -H "Authorization: Bearer $MCP_MEMBER_KEY" \\`,
            `  -H "Mcp-Session-Id: $MEMBER_SESSION" \\`,
            `  -d "$(cat <<JSON`,
            `{"jsonrpc":"2.0","id":22,"method":"tools/call","params":{"name":"bulk-delete-notes","arguments":{"ids":["$NOTE_A","$NOTE_B"],"_confirmed":true}}}`,
            `JSON`,
            `)" | jq .`,
          ].join('\n')
        : '# Remember a member key on this page first.',
    },
    {
      title: 'Action output and enabled guard',
      concept: 'Verify an action tool with output schema using an authenticated admin key.',
      prereqs: 'Remember an admin key.',
      expected: '`export-notes` returns `format`, `content`, `noteCount`, and `exportedAt`.',
      ready: hasAdmin,
      command: hasAdmin
        ? [
            initializeCommand('ADMIN_SESSION', 'MCP_ADMIN_KEY'),
            '',
            `curl -s "$MCP_ENDPOINT" \\`,
            `  -H 'Content-Type: application/json' \\`,
            `  -H 'Accept: application/json, text/event-stream' \\`,
            `  -H "Authorization: Bearer $MCP_ADMIN_KEY" \\`,
            `  -H "Mcp-Session-Id: $ADMIN_SESSION" \\`,
            `  -d '{"jsonrpc":"2.0","id":23,"method":"tools/call","params":{"name":"export-notes","arguments":{"format":"json"}}}' | jq .`,
          ].join('\n')
        : '# Remember an admin key on this page first.',
    },
    {
      title: 'Revoke and prove auth failure',
      concept: 'Use the UI to revoke a key, then rerun the same authenticated MCP call.',
      prereqs: 'Remember a viewer or member key and revoke it on the MCP Keys page.',
      expected: 'After revocation, the call fails with an auth-style error or the session cannot access auth-only tools.',
      ready: hasViewer,
      command: hasViewer
        ? [
            '# First revoke the selected viewer key on /demo/mcp-keys, then run:',
            initializeCommand('REVOKED_SESSION', 'MCP_VIEWER_KEY'),
            '',
            `curl -s "$MCP_ENDPOINT" \\`,
            `  -H 'Content-Type: application/json' \\`,
            `  -H 'Accept: application/json, text/event-stream' \\`,
            `  -H "Authorization: Bearer $MCP_VIEWER_KEY" \\`,
            `  -H "Mcp-Session-Id: $REVOKED_SESSION" \\`,
            `  -d '{"jsonrpc":"2.0","id":24,"method":"tools/call","params":{"name":"list-posts","arguments":{}}}' | jq .`,
          ].join('\n')
        : '# Remember a viewer key on this page first.',
    },
  ]
})
</script>

<style scoped>
.container {
  max-width: 1120px;
  margin: 0 auto;
  padding: 24px;
}

.card {
  background: white;
  border-radius: 14px;
  padding: 32px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.12);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 28px;
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

.description code {
  background: #eff6ff;
  color: #1d4ed8;
  padding: 2px 6px;
  border-radius: 6px;
}

.header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.loading,
.not-auth {
  text-align: center;
  padding: 48px 24px;
  color: #64748b;
}

.setup-grid,
.role-grid {
  display: grid;
  gap: 16px;
}

.setup-grid {
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  margin-bottom: 24px;
}

.role-grid {
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.panel,
.role-card,
.recipe-card,
.code-card {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
}

.panel,
.role-card,
.recipe-card {
  padding: 18px;
}

.panel h2,
.section h2 {
  margin: 0 0 12px;
}

.meta-list {
  display: grid;
  gap: 10px;
}

.meta-list div {
  display: flex;
  gap: 10px;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: #f8fafc;
  border-radius: 10px;
}

.meta-list span {
  color: #475569;
  font-weight: 600;
}

.meta-list code {
  max-width: 60%;
  word-break: break-all;
  text-align: right;
}

.checklist {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 10px;
}

.checklist li {
  color: #475569;
}

.checklist li.ok span {
  color: #166534;
}

.checklist li span {
  display: inline-block;
  min-width: 64px;
  font-weight: 700;
  color: #b45309;
}

.section {
  margin-bottom: 28px;
}

.hint {
  margin: 0 0 12px;
  color: #64748b;
}

.role-head,
.recipe-head,
.remembered {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
}

.role-title {
  font-weight: 700;
  color: #0f172a;
}

.role-badge,
.status-pill {
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 700;
}

.role-badge.admin {
  background: #dbeafe;
  color: #1d4ed8;
}

.role-badge.member {
  background: #e0e7ff;
  color: #4338ca;
}

.role-badge.viewer {
  background: #f1f5f9;
  color: #475569;
}

.field {
  display: grid;
  gap: 6px;
  margin-top: 14px;
}

.field span {
  font-weight: 600;
  color: #334155;
}

.field input,
.field select {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  font-size: 16px;
}

.key-summary {
  display: grid;
  gap: 8px;
  margin-top: 14px;
  padding: 12px;
  background: #f8fafc;
  border-radius: 10px;
}

.key-summary div {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.key-summary span {
  color: #64748b;
}

.remembered,
.remember-form {
  margin-top: 14px;
}

.remembered {
  padding: 12px;
  border-radius: 10px;
  background: #ecfdf5;
  color: #166534;
  align-items: center;
  flex-wrap: wrap;
}

.recipe-list {
  display: grid;
  gap: 16px;
}

.recipe-head h3 {
  margin: 0 0 4px;
}

.recipe-concept,
.recipe-meta {
  margin: 0;
  color: #475569;
  line-height: 1.5;
}

.recipe-meta {
  margin-top: 10px;
}

.status-pill.ready {
  background: #dcfce7;
  color: #166534;
}

.status-pill.blocked {
  background: #fef3c7;
  color: #92400e;
}

.code-card {
  margin-top: 14px;
  padding: 12px;
  background: #0f172a;
  color: #e2e8f0;
}

.code-card pre {
  margin: 12px 0 0;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.9rem;
  line-height: 1.55;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: white;
  color: #0f172a;
  cursor: pointer;
  text-decoration: none;
  font-weight: 600;
}

.btn-primary {
  background: #2563eb;
  border-color: #2563eb;
  color: white;
}

.btn-secondary {
  background: white;
}

.btn-sm {
  padding: 6px 10px;
  font-size: 0.82rem;
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

@media (max-width: 720px) {
  .header,
  .recipe-head,
  .role-head,
  .remembered {
    flex-direction: column;
    align-items: flex-start;
  }

  .meta-list div,
  .key-summary div {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
