<script setup lang="ts">
import {
  App,
  type McpUiHostContext,
  type McpUiToolInputNotification,
  type McpUiToolResultNotification,
} from '@modelcontextprotocol/ext-apps'
import { computed, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'

interface DashboardNote {
  body: string
  id: string
  revision: number
  title: string
  uri: string
  workspaceId: string
}

interface SearchInput {
  limit?: number
  query: string
  workspaceId: string
}

let app: App | undefined
const hostContext = ref<McpUiHostContext>()
const input = ref<SearchInput>({ query: '', workspaceId: '' })
const linkAvailable = ref(false)
const notes = ref<DashboardNote[]>([])
const status = ref<'connecting' | 'ready' | 'refreshing' | 'tool-denied' | 'link-denied' | 'error'>(
  'connecting',
)

const canRefresh = computed(
  () => status.value !== 'connecting' && input.value.workspaceId.length > 0,
)

function safeInput(value: McpUiToolInputNotification['params']): SearchInput | undefined {
  const candidate = value.arguments
  if (!candidate || typeof candidate.workspaceId !== 'string') return undefined
  if (typeof candidate.query !== 'string') return undefined
  if (
    candidate.limit !== undefined &&
    (typeof candidate.limit !== 'number' || !Number.isInteger(candidate.limit))
  ) {
    return undefined
  }
  return {
    ...(candidate.limit === undefined ? {} : { limit: candidate.limit }),
    query: candidate.query,
    workspaceId: candidate.workspaceId,
  }
}

function safeNotes(value: McpUiToolResultNotification['params']): DashboardNote[] | undefined {
  const structured = value.structuredContent
  if (!structured || !Array.isArray(structured.matches)) return undefined

  const parsed: DashboardNote[] = []
  for (const candidate of structured.matches) {
    if (!candidate || typeof candidate !== 'object') return undefined
    const note = candidate as Partial<DashboardNote>
    if (
      typeof note.body !== 'string' ||
      typeof note.id !== 'string' ||
      typeof note.revision !== 'number' ||
      !Number.isInteger(note.revision) ||
      typeof note.title !== 'string' ||
      typeof note.uri !== 'string' ||
      typeof note.workspaceId !== 'string'
    ) {
      return undefined
    }
    parsed.push({
      body: note.body,
      id: note.id,
      revision: note.revision,
      title: note.title,
      uri: note.uri,
      workspaceId: note.workspaceId,
    })
  }
  return parsed
}

function handleToolInput(value: McpUiToolInputNotification['params']): void {
  const parsed = safeInput(value)
  if (parsed) input.value = parsed
}

function handleToolResult(value: McpUiToolResultNotification['params']): void {
  if (value.isError) {
    status.value = 'error'
    return
  }
  const parsed = safeNotes(value)
  if (!parsed) {
    status.value = 'error'
    return
  }
  notes.value = parsed
  status.value = 'ready'
}

function handleHostContext(value: Partial<McpUiHostContext>): void {
  hostContext.value = { ...hostContext.value, ...value }
}

async function refresh(): Promise<void> {
  if (!app || !canRefresh.value) return
  status.value = 'refreshing'
  try {
    const arguments_: Record<string, unknown> = {
      ...(input.value.limit === undefined ? {} : { limit: input.value.limit }),
      query: input.value.query,
      workspaceId: input.value.workspaceId,
    }
    const result = await app.callServerTool({
      arguments: arguments_,
      name: 'search_notes',
    })
    handleToolResult(result)
  } catch {
    status.value = 'error'
  }
}

async function tryDeniedTool(): Promise<void> {
  if (!app) return
  try {
    const result = await app.callServerTool({
      arguments: { noteId: notes.value[0]?.id ?? 'missing', requestKey: 'app', title: 'Denied' },
      name: 'rename_note',
    })
    status.value = result.isError ? 'tool-denied' : 'error'
  } catch {
    status.value = 'tool-denied'
  }
}

async function openDocumentation(): Promise<void> {
  if (!app || !linkAvailable.value) return
  try {
    const result = await app.openLink({ url: 'https://docs.example.invalid/notes' })
    status.value = result.isError ? 'link-denied' : 'error'
  } catch {
    status.value = 'link-denied'
  }
}

watchEffect(() => {
  document.documentElement.dataset.theme = hostContext.value?.theme ?? 'light'
})

onMounted(async () => {
  const instance = new App(
    { name: 'better-convex-notes-dashboard', version: '0.0.0' },
    {},
    { allowUnsafeEval: false, autoResize: false, strict: true },
  )
  app = instance
  instance.addEventListener('toolinput', handleToolInput)
  instance.addEventListener('toolresult', handleToolResult)
  instance.addEventListener('hostcontextchanged', handleHostContext)
  instance.onteardown = async () => {
    window.setTimeout(() => {
      window.dispatchEvent(new Event('better-convex:notes-dashboard-teardown'))
    }, 0)
    return {}
  }
  instance.onerror = () => {
    status.value = 'error'
  }

  try {
    await instance.connect()
    hostContext.value = instance.getHostContext()
    linkAvailable.value = instance.getHostCapabilities()?.openLinks !== undefined
    status.value = 'ready'
  } catch {
    status.value = 'error'
  }
})

onBeforeUnmount(() => {
  const instance = app
  app = undefined
  if (!instance) return
  instance.removeEventListener('toolinput', handleToolInput)
  instance.removeEventListener('toolresult', handleToolResult)
  instance.removeEventListener('hostcontextchanged', handleHostContext)
  instance.onteardown = undefined
  void instance.close()
})
</script>

<template>
  <main data-testid="notes-dashboard" :aria-busy="status === 'refreshing'">
    <header>
      <p class="eyebrow">Better Convex MCP App probe</p>
      <h1>Notes dashboard</h1>
      <p data-testid="status">{{ status }}</p>
    </header>

    <section aria-label="Search context">
      <p data-testid="workspace">{{ input.workspaceId || 'No workspace' }}</p>
      <p data-testid="query">{{ input.query }}</p>
    </section>

    <ul data-testid="notes">
      <li v-for="note in notes" :key="note.id">
        <strong>{{ note.title }}</strong>
        <p>{{ note.body }}</p>
        <small>revision {{ note.revision }}</small>
      </li>
    </ul>

    <nav aria-label="Dashboard actions">
      <button data-testid="refresh" type="button" :disabled="!canRefresh" @click="refresh">
        Refresh through host
      </button>
      <button data-testid="denied-tool" type="button" @click="tryDeniedTool">
        Try denied write
      </button>
      <button
        data-testid="open-link"
        type="button"
        :disabled="!linkAvailable"
        @click="openDocumentation"
      >
        Open documentation
      </button>
    </nav>
  </main>
</template>

<style scoped>
:global(*) {
  box-sizing: border-box;
}

:global(html) {
  color-scheme: light dark;
  font-family: ui-sans-serif, system-ui, sans-serif;
}

:global(body) {
  margin: 0;
  color: #171717;
  background: #fafafa;
}

:global(html[data-theme='dark'] body) {
  color: #f5f5f5;
  background: #171717;
}

main {
  display: grid;
  gap: 1rem;
  padding: 1rem;
}

h1,
p {
  margin: 0;
}

.eyebrow,
small {
  color: #737373;
}

ul {
  display: grid;
  gap: 0.75rem;
  padding: 0;
  margin: 0;
  list-style: none;
}

li {
  display: grid;
  gap: 0.25rem;
  padding-block: 0.75rem;
  border-block-start: 1px solid #d4d4d4;
}

nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

button {
  padding: 0.5rem 0.75rem;
}
</style>
