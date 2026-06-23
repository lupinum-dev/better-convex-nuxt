<script setup lang="ts">
type AuditEvent = {
  _id: string
  action: string
  summary?: string
  createdAt: number
}

defineProps<{
  title: string
  events: AuditEvent[]
  status: string
  formatTime: (createdAt: number) => string
  onLoadMore: (numItems: number) => void
}>()
</script>

<template>
  <section class="activity">
    <h2>{{ title }}</h2>
    <ul v-if="events.length" class="items-list">
      <li v-for="event in events" :key="event._id">
        <span>{{ event.summary ?? event.action }}</span>
        <time>{{ formatTime(event.createdAt) }}</time>
      </li>
    </ul>
    <section v-else class="empty">No {{ title.toLowerCase() }} yet.</section>
    <button v-if="status === 'ready'" class="button" @click="onLoadMore(10)">Load more</button>
  </section>
</template>
