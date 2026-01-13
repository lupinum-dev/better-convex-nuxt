<script setup lang="ts">
import { computed } from 'vue'
import type { LogEvent } from '../../../utils/logger'

const props = defineProps<{
  events: LogEvent[]
  dashboardUrl: string | null
}>()

const emit = defineEmits<{
  clear: []
}>()

// Reverse events for display (newest first)
const reversedEvents = computed(() => [...props.events].reverse())

function formatTime(): string {
  return new Date().toLocaleTimeString()
}

function getEventDetails(event: LogEvent): string {
  switch (event.event) {
    case 'operation:complete':
      return `${event.name} ${event.outcome} ${event.duration_ms}ms`
    case 'auth:change':
      return `${event.from} -> ${event.to}`
    case 'subscription:change':
      return `${event.name} ${event.state}`
    case 'connection:change':
      return `${event.from} -> ${event.to}`
    case 'plugin:init':
      return `${event.outcome} ${event.duration_ms}ms`
    default:
      return ''
  }
}
</script>

<template>
  <div class="event-log">
    <div v-if="events.length === 0" class="empty-state">
      <div class="empty-state-icon">E</div>
      <div>No events yet</div>
    </div>
    <div
      v-for="(e, index) in reversedEvents"
      v-else
      :key="index"
      class="event-item"
    >
      <span class="event-time">{{ formatTime() }}</span>
      <span class="event-type">{{ e.event }}</span>
      <span class="event-details">{{ getEventDetails(e) }}</span>
    </div>
  </div>
  <div class="actions-bar">
    <button class="btn btn-secondary btn-small" @click="emit('clear')">
      Clear Events
    </button>
    <a
      v-if="dashboardUrl"
      :href="dashboardUrl"
      class="btn btn-small"
      target="_blank"
      rel="noopener"
      style="margin-left: auto;"
    >
      Open Dashboard
    </a>
  </div>
</template>
