<template>
  <section class="stack card">
    <h2>Archive board</h2>

    <div v-if="previewPending" class="meta">Loading preview…</div>

    <template v-else-if="preview">
      <p>{{ preview.display.summary }}</p>
      <p class="meta">{{ preview.display.warn }}</p>
      <p class="meta">
        Lists: {{ preview.display.affects.columns }} · Cards: {{ preview.display.affects.cards }}
      </p>
    </template>

    <div class="toolbar">
      <button type="button" :disabled="archivePending" @click="$emit('cancel')">Cancel</button>
      <button type="button" :disabled="archivePending || !preview" @click="$emit('confirm')">
        Confirm archive
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  previewPending: boolean
  archivePending: boolean
  preview?: {
    display: {
      summary: string
      warn: string
      affects: { columns: number; cards: number }
    }
    confirm: {
      operation: string
      targetId: string
      affectedCounts: { columns: number; cards: number }
    }
  } | null
}>()

defineEmits<{
  cancel: []
  confirm: []
}>()
</script>
