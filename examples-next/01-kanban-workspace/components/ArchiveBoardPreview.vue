<template>
  <section class="stack">
    <header class="modal-header">
      <div class="stack-sm">
        <h2 id="archive-title" class="modal-title">Archive board</h2>
        <p class="meta">Preview the impact before you confirm.</p>
      </div>
      <button
        type="button"
        class="btn btn--ghost btn--icon"
        aria-label="Close"
        :disabled="archivePending"
        @click="$emit('cancel')"
      >
        ×
      </button>
    </header>

    <div v-if="previewPending" class="empty-state">
      <span>
        <span class="spinner spinner--inline" aria-hidden="true" />
        Loading preview…
      </span>
    </div>

    <template v-else-if="preview">
      <p>{{ preview.display.summary }}</p>

      <div class="banner banner--warning" role="note">
        <span class="banner__icon" aria-hidden="true">!</span>
        <div class="banner__body">{{ preview.display.warn }}</div>
      </div>

      <div class="summary-grid">
        <div class="summary-item">
          <span class="summary-item__label">Columns</span>
          <span class="summary-item__value">{{ preview.display.affects.columns }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-item__label">Cards</span>
          <span class="summary-item__value">{{ preview.display.affects.cards }}</span>
        </div>
      </div>
    </template>

    <div class="toolbar">
      <button
        type="button"
        class="btn btn--ghost"
        :disabled="archivePending"
        @click="$emit('cancel')"
      >
        Cancel
      </button>
      <button
        type="button"
        class="btn btn--danger-solid"
        :disabled="archivePending || !preview"
        @click="$emit('confirm')"
      >
        <span v-if="archivePending" class="spinner spinner--inline" aria-hidden="true" />
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
