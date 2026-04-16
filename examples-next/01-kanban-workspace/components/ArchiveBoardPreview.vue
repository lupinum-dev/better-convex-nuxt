<template>
  <section class="stack" v-if="boardId">
    <h2>Archive board</h2>

    <div v-if="previewPending" class="meta">Loading preview…</div>

    <template v-else-if="preview">
      <p>{{ preview.summary }}</p>
      <p class="meta">{{ preview.warn }}</p>
      <p class="meta">Lists: {{ preview.affects.columns }} · Cards: {{ preview.affects.cards }}</p>
    </template>

    <div class="toolbar">
      <button type="button" @click="$emit('cancel')" :disabled="archivePending">Cancel</button>
      <button type="button" @click="$emit('confirm')" :disabled="archivePending">
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

