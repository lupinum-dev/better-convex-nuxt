<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  data: unknown
  maxHeight?: string
}>()

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const formattedJson = computed(() => {
  if (props.data === undefined) {
    return '<span class="json-null">undefined</span>'
  }
  if (props.data === null) {
    return '<span class="json-null">null</span>'
  }

  try {
    const json = JSON.stringify(
      props.data,
      (_, v) => (typeof v === 'bigint' ? v.toString() + 'n' : v),
      2
    )

    // Syntax highlight JSON
    return json.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
      (match) => {
        let cls = 'json-number'
        if (match.startsWith('"')) {
          if (match.endsWith(':')) {
            cls = 'json-key'
          } else {
            cls = 'json-string'
          }
        } else if (/true|false/.test(match)) {
          cls = 'json-boolean'
        } else if (/null/.test(match)) {
          cls = 'json-null'
        }
        return `<span class="${cls}">${escapeHtml(match)}</span>`
      }
    )
  } catch {
    return '<span class="json-null">[Circular]</span>'
  }
})
</script>

<template>
  <!-- eslint-disable vue/no-v-html -- Safe: all dynamic content is escaped via escapeHtml() -->
  <div
    class="json-viewer"
    :style="{ maxHeight: maxHeight || '200px' }"
    v-html="formattedJson"
  />
  <!-- eslint-enable vue/no-v-html -->
</template>
