<template>
  <div class="page">
    <header class="hero">
      <div>
        <h1>Server Boundary Reference</h1>
        <p>
          One page showing the core Nuxt patterns around public realtime queries, authenticated
          client mutations, server helpers, and auth-required server failures.
        </p>
      </div>
      <div class="status-card">
        <div class="status-label">Auth state</div>
        <strong>{{ isAuthenticated ? user?.email || user?.name || 'Signed in' : 'Signed out' }}</strong>
        <div class="status-copy">
          {{ authStateMessage }}
        </div>
      </div>
    </header>

    <section class="section">
      <div class="section-head">
        <div>
          <h2>1. Public realtime query</h2>
          <p>Notes come from a live `useConvexQuery(api.notes.list, {})` subscription.</p>
        </div>
        <button class="button ghost" @click="refreshNotes">Refresh</button>
      </div>

      <div class="panel">
        <div class="panel-meta">
          <span>Status: {{ notesStatus }}</span>
          <span>Count: {{ notesCount }}</span>
        </div>
        <p v-if="notesError" class="error">{{ notesError.message }}</p>
        <pre v-else>{{ notesPreview }}</pre>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div>
          <h2>2. Authenticated client mutation</h2>
          <p>`useConvexMutation(api.tasks.add)` succeeds only with a valid Better Auth session.</p>
        </div>
      </div>

      <form class="mutation-form" @submit.prevent="createTask">
        <input v-model="taskTitle" type="text" placeholder="Task title" />
        <button class="button" :disabled="taskPending">
          {{ taskPending ? 'Creating…' : 'Create task' }}
        </button>
      </form>

      <div class="panel">
        <div class="panel-meta">
          <span>Status: {{ taskStatus }}</span>
          <NuxtLink v-if="!isAuthenticated" to="/auth/signin" class="inline-link">Sign in</NuxtLink>
        </div>
        <pre>{{ taskResultPreview }}</pre>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div>
          <h2>3. Server query helper</h2>
          <p>Fetches notes through a Nitro route that calls `serverConvexQuery`.</p>
        </div>
        <button class="button" :disabled="serverQueryPending" @click="runServerQuery">
          {{ serverQueryPending ? 'Running…' : 'Run server query' }}
        </button>
      </div>

      <div class="panel">
        <pre>{{ serverQueryPreview }}</pre>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div>
          <h2>4. Privileged backend-only query</h2>
          <p>
            Calls an app-local helper that injects `CONVEX_PRIVATE_BRIDGE_KEY` before querying
            `api['private/demo'].systemOverview`.
          </p>
        </div>
        <button class="button" :disabled="privateQueryPending" @click="runPrivateQuery">
          {{ privateQueryPending ? 'Running…' : 'Run privileged server query' }}
        </button>
      </div>

      <div class="panel">
        <pre>{{ privateQueryPreview }}</pre>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div>
          <h2>5. Auth-required server failure</h2>
          <p>
            Calls a Nitro route that uses `serverConvexQuery(..., { auth: 'required' })` so you
            can see the auth error surface when the request is unauthenticated.
          </p>
        </div>
        <button class="button" :disabled="serverAuthPending" @click="runServerAuthRequired">
          {{ serverAuthPending ? 'Running…' : 'Run auth-required server query' }}
        </button>
      </div>

      <div class="panel">
        <pre>{{ serverAuthPreview }}</pre>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { api } from '../../convex/_generated/api'

definePageMeta({
  layout: 'sidebar',
})

const { user, isAuthenticated, authError } = useConvexAuth()
const {
  data: notes,
  status: notesStatus,
  error: notesError,
  refresh: refreshNotes,
} = await useConvexQuery(api.notes.list, {}, { default: () => [] })

const {
  execute: addTask,
  pending: taskPending,
  status: taskStatus,
  error: taskError,
} = useConvexMutation(api.tasks.add)

const taskTitle = ref('')
const taskResult = ref<Record<string, unknown> | null>(null)
const serverQueryPending = ref(false)
const serverQueryResult = ref<Record<string, unknown> | null>(null)
const privateQueryPending = ref(false)
const privateQueryResult = ref<Record<string, unknown> | null>(null)
const serverAuthPending = ref(false)
const serverAuthResult = ref<Record<string, unknown> | null>(null)

const notesCount = computed(() => notes.value?.length ?? 0)
const notesPreview = computed(() => JSON.stringify((notes.value ?? []).slice(0, 5), null, 2))
const authStateMessage = computed(() => authError.value ?? 'Client auth composables are healthy.')
const taskResultPreview = computed(() =>
  JSON.stringify(
    taskResult.value ?? {
      ok: null,
      message: taskError.value?.message ?? 'Run the mutation to see client-side auth behavior.',
    },
    null,
    2,
  ),
)
const serverQueryPreview = computed(() =>
  JSON.stringify(
    serverQueryResult.value ?? { ok: null, message: 'Run the server query to inspect the result.' },
    null,
    2,
  ),
)
const privateQueryPreview = computed(() =>
  JSON.stringify(
    privateQueryResult.value ?? {
      ok: null,
      message: 'Run the privileged server query to inspect the backend-only path.',
    },
    null,
    2,
  ),
)
const serverAuthPreview = computed(() =>
  JSON.stringify(
    serverAuthResult.value ?? {
      ok: null,
      message: 'Run the auth-required server query to inspect success or failure.',
    },
    null,
    2,
  ),
)

async function createTask() {
  const title = taskTitle.value.trim() || `Reference task ${new Date().toISOString()}`

  try {
    const taskId = await addTask({ title })
    taskResult.value = {
      ok: true,
      taskId,
      title,
      message: 'Task created through client mutation.',
    }
    taskTitle.value = ''
  } catch (error) {
    taskResult.value = {
      ok: false,
      title,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

async function runServerQuery() {
  serverQueryPending.value = true
  try {
    serverQueryResult.value = (await $fetch('/api/references/server-query')) as Record<
      string,
      unknown
    >
  } catch (error) {
    serverQueryResult.value = {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }
  } finally {
    serverQueryPending.value = false
  }
}

async function runPrivateQuery() {
  privateQueryPending.value = true
  try {
    privateQueryResult.value = (await $fetch('/api/references/private-system')) as Record<
      string,
      unknown
    >
  } catch (error) {
    privateQueryResult.value = {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }
  } finally {
    privateQueryPending.value = false
  }
}

async function runServerAuthRequired() {
  serverAuthPending.value = true
  try {
    serverAuthResult.value = (await $fetch('/api/references/server-auth-required')) as Record<
      string,
      unknown
    >
  } catch (error) {
    serverAuthResult.value = {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }
  } finally {
    serverAuthPending.value = false
  }
}
</script>

<style scoped>
.page {
  display: grid;
  gap: 24px;
}

.hero {
  display: grid;
  gap: 16px;
}

.hero h1 {
  margin: 0 0 8px;
}

.hero p {
  margin: 0;
  color: #52606d;
  max-width: 72ch;
}

.status-card,
.section,
.panel {
  border: 1px solid #d8dee6;
  border-radius: 16px;
  background: #fff;
}

.status-card {
  padding: 16px 18px;
}

.status-label,
.panel-meta {
  color: #6b7280;
  font-size: 0.9rem;
}

.status-copy {
  margin-top: 6px;
  color: #374151;
}

.section {
  padding: 20px;
}

.section-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 16px;
}

.section-head h2 {
  margin: 0 0 6px;
}

.section-head p {
  margin: 0;
  color: #52606d;
  max-width: 72ch;
}

.mutation-form {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.mutation-form input {
  flex: 1 1 260px;
  padding: 10px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
}

.button {
  border: none;
  border-radius: 10px;
  padding: 10px 14px;
  background: #0f766e;
  color: white;
  cursor: pointer;
}

.button.ghost {
  background: #e6fffb;
  color: #0f766e;
}

.button:disabled {
  cursor: wait;
  opacity: 0.7;
}

.panel {
  padding: 14px 16px;
}

.panel-meta {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
}

.inline-link {
  color: #0f766e;
  text-decoration: none;
}

.error {
  color: #b91c1c;
}

pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
