<script setup lang="ts">
import type { MutationEntry } from '../../types'
import JsonViewer from './JsonViewer.vue'

defineProps<{
  mutations: MutationEntry[]
  isExpanded: (id: string) => boolean
}>()

const emit = defineEmits<{
  toggle: [id: string]
}>()

function getStateClass(state: string): string {
  if (state === 'success') return 'success'
  if (state === 'error') return 'error'
  if (state === 'optimistic') return 'optimistic'
  return 'pending'
}

function formatDuration(duration?: number): string {
  if (duration === undefined) return 'pending...'
  return `${duration}ms`
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString()
}
</script>

<template>
  <div class="timeline">
    <div v-if="mutations.length === 0" class="empty-state">
      <div class="empty-state-icon">M</div>
      <div>No mutations yet</div>
      <div style="font-size: 11px; margin-top: 4px;">Mutations will appear here when triggered</div>
    </div>
    <div
      v-for="m in mutations"
      v-else
      :key="m.id"
      class="timeline-item"
      :class="{ expanded: isExpanded(m.id) }"
      @click="emit('toggle', m.id)"
    >
      <div class="timeline-header">
        <span class="timeline-name">
          <template v-if="m.type === 'action'">[Action] </template>
          {{ m.name }}
        </span>
        <span class="timeline-time">{{ formatTime(m.startedAt) }}</span>
      </div>
      <div class="timeline-meta">
        <div class="timeline-state">
          <span v-if="m.hasOptimisticUpdate" class="badge optimistic">OPT</span>
          <span class="badge" :class="getStateClass(m.state)">{{ m.state }}</span>
        </div>
        <span>{{ formatDuration(m.duration) }}</span>
      </div>
      <div class="timeline-details">
        <div style="margin-bottom: 8px;">
          <div class="detail-title">Arguments</div>
          <JsonViewer :data="m.args" />
        </div>
        <div v-if="m.state === 'success'">
          <div class="detail-title">Result</div>
          <JsonViewer :data="m.result" />
        </div>
        <div v-if="m.state === 'error'">
          <div class="detail-title">Error</div>
          <div class="json-viewer">
            <span class="json-string">{{ m.error || 'Unknown error' }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
