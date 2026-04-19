<script setup lang="ts">
import { ref, computed } from 'vue'

import type {
  QueryRegistryEntry,
  MutationEntry,
  DevtoolsEvent,
  DevtoolsEventKind,
  DevtoolsEventPhase,
} from '../../../src/runtime/devtools/types'

const props = defineProps<{
  queries: QueryRegistryEntry[]
  mutations: MutationEntry[]
  events: DevtoolsEvent[]
}>()

const search = ref('')
const mode = ref<'live' | 'history'>('history')
const liveFilter = ref<'all' | 'queries' | 'mutations'>('all')
const historyFilter = ref<'all' | 'queries' | 'mutations' | 'actions' | 'errors'>('all')
const selectedQueryId = ref<string | null>(null)
const selectedMutationId = ref<string | null>(null)
const selectedEventId = ref<string | null>(null)

const filteredQueries = computed(() => {
  if (liveFilter.value === 'mutations') return []
  const term = search.value.toLowerCase()
  return props.queries.filter((q) => !term || q.name.toLowerCase().includes(term))
})

const filteredMutations = computed(() => {
  if (liveFilter.value === 'queries') return []
  const term = search.value.toLowerCase()
  return props.mutations.filter((m) => !term || m.name.toLowerCase().includes(term))
})

const filteredEvents = computed(() => {
  const term = search.value.toLowerCase()
  return [...props.events].reverse().filter((event) => {
    if (historyFilter.value === 'queries' && event.kind !== 'query') return false
    if (historyFilter.value === 'mutations' && event.kind !== 'mutation') return false
    if (historyFilter.value === 'actions' && event.kind !== 'action') return false
    if (historyFilter.value === 'errors' && event.phase !== 'error') return false
    if (!term) return true
    return (
      event.name.toLowerCase().includes(term) ||
      event.phase.toLowerCase().includes(term) ||
      event.kind.toLowerCase().includes(term) ||
      event.error?.toLowerCase().includes(term) === true
    )
  })
})

const selectedQuery = computed(() =>
  selectedQueryId.value ? props.queries.find((q) => q.id === selectedQueryId.value) : null,
)

const selectedMutation = computed(() =>
  selectedMutationId.value ? props.mutations.find((m) => m.id === selectedMutationId.value) : null,
)

const selectedEvent = computed(() =>
  selectedEventId.value ? props.events.find((event) => event.id === selectedEventId.value) : null,
)

function selectQuery(id: string) {
  selectedQueryId.value = id
  selectedMutationId.value = null
  selectedEventId.value = null
}

function selectMutation(id: string) {
  selectedMutationId.value = id
  selectedQueryId.value = null
  selectedEventId.value = null
}

function selectEvent(id: string) {
  selectedEventId.value = id
  selectedQueryId.value = null
  selectedMutationId.value = null
}

function getStatusClass(status: string): string {
  if (status === 'success') return 'green'
  if (status === 'error') return 'red'
  if (status === 'optimistic') return 'blue'
  return 'yellow'
}

function formatDuration(duration?: number): string {
  if (duration === undefined) return '...'
  return `${duration}ms`
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    month: 'short',
    day: 'numeric',
  })
}

function getEventKindClass(kind: DevtoolsEventKind): string {
  if (kind === 'query') return 'blue'
  if (kind === 'mutation') return 'amber'
  return 'purple'
}

function getEventPhaseClass(phase: DevtoolsEventPhase): string {
  if (phase === 'success' || phase === 'update' || phase === 'subscribe') return 'green'
  if (phase === 'error') return 'red'
  if (phase === 'optimistic' || phase === 'load-more') return 'blue'
  return 'yellow'
}
</script>

<template>
  <NSplitPane storage-key="devtools:convex:data" class="h-full" :min-size="25">
    <template #left>
      <NNavbar v-model:search="search">
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-2 text-xs">
            <button
              v-for="nextMode in ['history', 'live'] as const"
              :key="nextMode"
              class="px-2 py-0.5 rounded text-xs capitalize"
              :class="mode === nextMode ? 'bg-active font-medium' : 'op-50 hover:op-80'"
              @click="mode = nextMode"
            >
              {{ nextMode }}
            </button>
          </div>

          <div v-if="mode === 'live'" class="flex items-center gap-2 text-xs">
            <button
              v-for="f in ['all', 'queries', 'mutations'] as const"
              :key="f"
              class="px-2 py-0.5 rounded text-xs capitalize"
              :class="liveFilter === f ? 'bg-active font-medium' : 'op-50 hover:op-80'"
              @click="liveFilter = f"
            >
              {{ f }}
            </button>
          </div>

          <div v-else class="flex items-center gap-2 text-xs" flex="~ wrap">
            <button
              v-for="f in ['all', 'queries', 'mutations', 'actions', 'errors'] as const"
              :key="f"
              class="px-2 py-0.5 rounded text-xs capitalize"
              :class="historyFilter === f ? 'bg-active font-medium' : 'op-50 hover:op-80'"
              @click="historyFilter = f"
            >
              {{ f }}
            </button>
          </div>
        </div>
      </NNavbar>

      <div class="overflow-y-auto">
        <template v-if="mode === 'live'">
          <template v-if="filteredQueries.length > 0">
            <div class="px-3 py-1.5 text-xs font-medium op-40 uppercase tracking-wide">
              Queries ({{ filteredQueries.length }})
            </div>
            <div
              v-for="q in filteredQueries"
              :key="q.id"
              class="px-3 py-2 cursor-pointer border-b border-base hover:bg-hover"
              :class="{ 'bg-active': selectedQueryId === q.id }"
              @click="selectQuery(q.id)"
            >
              <div class="flex items-center justify-between">
                <span class="text-xs font-mono truncate">{{ q.name }}</span>
                <NBadge :n="`xs ${getStatusClass(q.status)}`">{{ q.status }}</NBadge>
              </div>
              <div class="flex items-center gap-2 text-xs op-40 mt-0.5">
                <span>{{
                  q.dataSource === 'ssr' ? 'SSR' : q.dataSource === 'websocket' ? 'WS' : 'Cache'
                }}</span>
                <span>{{ q.updateCount }} updates</span>
              </div>
            </div>
          </template>

          <template v-if="filteredMutations.length > 0">
            <div class="px-3 py-1.5 text-xs font-medium op-40 uppercase tracking-wide">
              Mutations ({{ filteredMutations.length }})
            </div>
            <div
              v-for="m in filteredMutations"
              :key="m.id"
              class="px-3 py-2 cursor-pointer border-b border-base hover:bg-hover"
              :class="{ 'bg-active': selectedMutationId === m.id }"
              @click="selectMutation(m.id)"
            >
              <div class="flex items-center justify-between">
                <span class="text-xs font-mono truncate">
                  <template v-if="m.type === 'action'">[Action] </template>
                  {{ m.name }}
                </span>
                <NBadge :n="`xs ${getStatusClass(m.state)}`">{{ m.state }}</NBadge>
              </div>
              <div class="flex items-center gap-2 text-xs op-40 mt-0.5">
                <span>{{ formatDuration(m.duration) }}</span>
                <span>{{ formatTime(m.startedAt) }}</span>
              </div>
            </div>
          </template>
        </template>

        <template v-else-if="filteredEvents.length > 0">
          <div class="px-3 py-1.5 text-xs font-medium op-40 uppercase tracking-wide">
            Timeline ({{ filteredEvents.length }})
          </div>
          <div
            v-for="event in filteredEvents"
            :key="event.id"
            class="px-3 py-2 cursor-pointer border-b border-base hover:bg-hover"
            :class="{ 'bg-active': selectedEventId === event.id }"
            @click="selectEvent(event.id)"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-mono truncate">{{ event.name }}</span>
              <div class="flex items-center gap-1">
                <NBadge :n="`xs ${getEventKindClass(event.kind)}`">{{ event.kind }}</NBadge>
                <NBadge :n="`xs ${getEventPhaseClass(event.phase)}`">{{ event.phase }}</NBadge>
              </div>
            </div>
            <div class="flex items-center gap-2 text-xs op-40 mt-0.5">
              <span>{{ formatTime(event.timestamp) }}</span>
              <span v-if="event.duration !== undefined">{{ formatDuration(event.duration) }}</span>
              <span v-if="event.reason">{{ event.reason }}</span>
              <span v-if="event.error" class="truncate">{{ event.error }}</span>
            </div>
          </div>
        </template>

        <!-- Empty state -->
        <div
          v-if="
            (mode === 'live' && filteredQueries.length === 0 && filteredMutations.length === 0) ||
            (mode === 'history' && filteredEvents.length === 0)
          "
          class="flex items-center justify-center py-12 op-40"
        >
          <div class="text-center text-xs">
            <NIcon icon="i-carbon-search" class="text-2xl mb-2" />
            <div>No matching items</div>
          </div>
        </div>
      </div>
    </template>

    <template #right>
      <div v-if="selectedEvent" class="p-4 overflow-y-auto h-full">
        <SectionBlock
          text="Event Info"
          icon="i-carbon-information"
          container-class="font-mono text-xs"
        >
          <div class="space-y-2">
            <div class="flex gap-2">
              <span class="op-60 w-24">Name</span
              ><span class="text-green-500">{{ selectedEvent.name }}</span>
            </div>
            <div class="flex gap-2">
              <span class="op-60 w-24">Kind</span
              ><NBadge :n="`xs ${getEventKindClass(selectedEvent.kind)}`">{{
                selectedEvent.kind
              }}</NBadge>
            </div>
            <div class="flex gap-2">
              <span class="op-60 w-24">Phase</span
              ><NBadge :n="`xs ${getEventPhaseClass(selectedEvent.phase)}`">{{
                selectedEvent.phase
              }}</NBadge>
            </div>
            <div class="flex gap-2">
              <span class="op-60 w-24">Time</span
              ><span>{{ formatTimestamp(selectedEvent.timestamp) }}</span>
            </div>
            <div class="flex gap-2">
              <span class="op-60 w-24">Operation</span
              ><span class="truncate">{{ selectedEvent.operationId }}</span>
            </div>
            <div v-if="selectedEvent.dataSource" class="flex gap-2">
              <span class="op-60 w-24">Source</span><span>{{ selectedEvent.dataSource }}</span>
            </div>
            <div v-if="selectedEvent.reason" class="flex gap-2">
              <span class="op-60 w-24">Reason</span><span>{{ selectedEvent.reason }}</span>
            </div>
            <div v-if="selectedEvent.duration !== undefined" class="flex gap-2">
              <span class="op-60 w-24">Duration</span
              ><span>{{ formatDuration(selectedEvent.duration) }}</span>
            </div>
          </div>
        </SectionBlock>

        <SectionBlock text="Arguments" icon="i-carbon-code">
          <NCodeBlock
            :code="JSON.stringify(selectedEvent.args ?? null, null, 2)"
            lang="json"
            class="text-xs"
          />
        </SectionBlock>

        <SectionBlock v-if="selectedEvent.meta" text="Meta" icon="i-carbon-settings">
          <NCodeBlock
            :code="JSON.stringify(selectedEvent.meta, null, 2)"
            lang="json"
            class="text-xs"
          />
        </SectionBlock>

        <SectionBlock
          v-if="selectedEvent.payload !== undefined"
          text="Payload"
          icon="i-carbon-data-vis-1"
        >
          <NCodeBlock
            :code="JSON.stringify(selectedEvent.payload, null, 2)"
            lang="json"
            class="text-xs"
          />
        </SectionBlock>

        <SectionBlock v-if="selectedEvent.error" text="Error" icon="i-carbon-warning">
          <div class="text-red-500 text-xs font-mono p-2 rounded bg-red-500/10">
            {{ selectedEvent.error }}
          </div>
        </SectionBlock>
      </div>

      <div v-else-if="selectedQuery" class="p-4 overflow-y-auto h-full">
        <SectionBlock
          text="Query Info"
          icon="i-carbon-information"
          container-class="font-mono text-xs"
        >
          <div class="space-y-2">
            <div class="flex gap-2">
              <span class="op-60 w-24">Name</span
              ><span class="text-green-500">{{ selectedQuery.name }}</span>
            </div>
            <div class="flex gap-2">
              <span class="op-60 w-24">Status</span
              ><NBadge :n="`xs ${getStatusClass(selectedQuery.status)}`">{{
                selectedQuery.status
              }}</NBadge>
            </div>
            <div class="flex gap-2">
              <span class="op-60 w-24">Source</span><span>{{ selectedQuery.dataSource }}</span>
            </div>
            <div class="flex gap-2">
              <span class="op-60 w-24">Updates</span><span>{{ selectedQuery.updateCount }}</span>
            </div>
            <div class="flex gap-2">
              <span class="op-60 w-24">Updated</span
              ><span>{{ formatTime(selectedQuery.lastUpdated) }}</span>
            </div>
          </div>
        </SectionBlock>

        <SectionBlock
          v-if="selectedQuery.options"
          text="Options"
          icon="i-carbon-settings"
          container-class="text-xs"
        >
          <div class="flex gap-3">
            <span
              v-for="(val, key) in selectedQuery.options"
              :key="key"
              class="flex items-center gap-1"
            >
              <NIcon
                :icon="val ? 'i-carbon-checkmark' : 'i-carbon-close'"
                :class="val ? 'text-green-500' : 'text-red-500'"
              />
              <span class="op-60">{{ key }}</span>
            </span>
          </div>
        </SectionBlock>

        <SectionBlock text="Arguments" icon="i-carbon-code">
          <NCodeBlock
            :code="JSON.stringify(selectedQuery.args, null, 2)"
            lang="json"
            class="text-xs"
          />
        </SectionBlock>

        <SectionBlock text="Result" icon="i-carbon-data-vis-1">
          <template v-if="selectedQuery.error">
            <div class="text-red-500 text-xs font-mono p-2 rounded bg-red-500/10">
              {{ selectedQuery.error }}
            </div>
          </template>
          <NCodeBlock
            v-else
            :code="JSON.stringify(selectedQuery.data, null, 2)"
            lang="json"
            class="text-xs"
          />
        </SectionBlock>
      </div>

      <!-- Mutation Detail -->
      <div v-else-if="selectedMutation" class="p-4 overflow-y-auto h-full">
        <SectionBlock
          text="Mutation Info"
          icon="i-carbon-information"
          container-class="font-mono text-xs"
        >
          <div class="space-y-2">
            <div class="flex gap-2">
              <span class="op-60 w-24">Name</span
              ><span class="text-green-500">{{ selectedMutation.name }}</span>
            </div>
            <div class="flex gap-2">
              <span class="op-60 w-24">Type</span><span>{{ selectedMutation.type }}</span>
            </div>
            <div class="flex gap-2">
              <span class="op-60 w-24">State</span
              ><NBadge :n="`xs ${getStatusClass(selectedMutation.state)}`">{{
                selectedMutation.state
              }}</NBadge>
            </div>
            <div class="flex gap-2">
              <span class="op-60 w-24">Duration</span
              ><span>{{ formatDuration(selectedMutation.duration) }}</span>
            </div>
            <div class="flex gap-2">
              <span class="op-60 w-24">Started</span
              ><span>{{ formatTime(selectedMutation.startedAt) }}</span>
            </div>
            <div v-if="selectedMutation.hasOptimisticUpdate" class="flex gap-2">
              <span class="op-60 w-24">Optimistic</span><NBadge n="xs blue">Yes</NBadge>
            </div>
          </div>
        </SectionBlock>

        <SectionBlock text="Arguments" icon="i-carbon-code">
          <NCodeBlock
            :code="JSON.stringify(selectedMutation.args, null, 2)"
            lang="json"
            class="text-xs"
          />
        </SectionBlock>

        <SectionBlock
          v-if="selectedMutation.state === 'success'"
          text="Result"
          icon="i-carbon-data-vis-1"
        >
          <NCodeBlock
            :code="JSON.stringify(selectedMutation.result, null, 2)"
            lang="json"
            class="text-xs"
          />
        </SectionBlock>

        <SectionBlock
          v-if="selectedMutation.state === 'error'"
          text="Error"
          icon="i-carbon-warning"
        >
          <div class="text-red-500 text-xs font-mono p-2 rounded bg-red-500/10">
            {{ selectedMutation.error || 'Unknown error' }}
          </div>
        </SectionBlock>
      </div>

      <!-- No selection -->
      <div v-else class="flex items-center justify-center h-full op-40">
        <div class="text-center text-xs">
          <NIcon icon="i-carbon-touch-1" class="text-2xl mb-2" />
          <div>
            {{
              mode === 'history'
                ? 'Select an event to inspect the timeline'
                : 'Select an item to view details'
            }}
          </div>
        </div>
      </div>
    </template>
  </NSplitPane>
</template>
