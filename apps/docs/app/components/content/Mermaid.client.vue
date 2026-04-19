<script setup lang="ts">
import { onMounted, ref, useSlots, watch } from 'vue'

const props = defineProps<{
  chart?: string
}>()

const slots = useSlots()
const svg = ref('')
const error = ref('')
const id = `mermaid-${Math.random().toString(36).slice(2, 11)}`

function extractText(nodes: unknown): string {
  if (!nodes) return ''
  if (typeof nodes === 'string') return nodes
  if (Array.isArray(nodes)) return nodes.map(extractText).join('')
  const anyNode = nodes as { children?: unknown }
  if (anyNode.children) return extractText(anyNode.children)
  return ''
}

async function render() {
  try {
    const code = (props.chart ?? extractText(slots.default?.())).trim()
    if (!code) return
    const mermaid = (await import('mermaid')).default
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
      fontFamily: 'inherit',
    })
    const { svg: rendered } = await mermaid.render(id, code)
    svg.value = rendered
    error.value = ''
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to render diagram'
    error.value = message
  }
}

onMounted(render)
watch(() => props.chart, render)
</script>

<template>
  <div
    class="my-6 flex w-full justify-center overflow-x-auto rounded-lg border border-default bg-elevated/30 p-6"
  >
    <div v-if="svg" class="mermaid-diagram max-w-full" v-html="svg" />
    <div v-else-if="error" class="text-sm text-error">Diagram error: {{ error }}</div>
    <div v-else class="text-sm text-muted">Loading diagram…</div>
  </div>
</template>
