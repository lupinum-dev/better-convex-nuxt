<script setup lang="ts">
/**
 * Why this file exists:
 * The admin page uses a few tiny metric cards so readers can see multiple live queries
 * composing on one page without adding a full charting library.
 */
defineProps<{
  label: string
  value: number | string | undefined
}>()
</script>

<template>
  <article class="stats-card">
    <p class="label">{{ label }}</p>
    <p class="value">{{ value ?? '—' }}</p>
  </article>
</template>

<style scoped>
.stats-card {
  border: 1px solid #dbe4ef;
  border-radius: 16px;
  padding: 1rem;
  background: linear-gradient(180deg, #ffffff, #f6fbff);
}

.label {
  margin: 0 0 0.25rem;
  color: #5b6472;
  font-size: 0.85rem;
}

.value {
  margin: 0;
  font-size: 1.8rem;
  font-weight: 700;
  color: #132238;
}
</style>
