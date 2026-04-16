<template>
  <section v-if="boardId" class="stack">
    <h2>Archive board</h2>

    <div v-if="previewPending" class="meta">Loading preview…</div>

    <template v-else-if="preview">
      <p>{{ preview.summary }}</p>
      <p class="meta">{{ preview.warn }}</p>
      <p class="meta">Lists: {{ preview.affects.columns }} · Cards: {{ preview.affects.cards }}</p>
    </template>

    <div class="toolbar">
      <button type="button" :disabled="archivePending" @click="$emit('cancel')">Cancel</button>
      <button type="button" :disabled="archivePending" @click="$emit('confirm')">
        Confirm archive
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  boardId?: string
  previewPending: boolean
  archivePending: boolean
  preview?: {
    summary: string
    warn: string
    affects: { columns: number; cards: number }
  } | null
}>()

defineEmits<{
  cancel: []
  confirm: []
}>()
</script>
