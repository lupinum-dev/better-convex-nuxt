<script setup lang="ts">
import { convexToJson, jsonToConvex } from 'convex/values'
import { computed } from 'vue'
import { api } from '~~/convex/_generated/api'

definePageMeta({
  layout: 'sidebar',
})

interface ConvexPayloadFixture {
  ok: boolean
  n: bigint
  b: ArrayBuffer
}

const { data, pending, status, error } = useConvexQuery<
  typeof api.testing.healthCheck,
  Record<string, never>,
  ConvexPayloadFixture
>(
  api.testing.healthCheck,
  {},
  {
    // Use a transform so the SSR payload path is exercised without adding a new Convex API endpoint.
    transform: () =>
      jsonToConvex(
        convexToJson({
          ok: true,
          n: BigInt(123),
          b: new Uint8Array([1, 2, 3]).buffer,
        }),
      ) as ConvexPayloadFixture,
  },
)

const bigintType = computed(() => typeof data.value?.n)
const bigintValue = computed(() => (data.value?.n != null ? String(data.value.n) : 'null'))
const bytesType = computed(() => {
  const bytes = data.value?.b
  return bytes instanceof ArrayBuffer ? 'ArrayBuffer' : bytes ? typeof bytes : 'null'
})
const bytesLength = computed(() =>
  data.value?.b instanceof ArrayBuffer ? data.value.b.byteLength : -1,
)
const bytesValues = computed(() => {
  const bytes = data.value?.b
  if (!(bytes instanceof ArrayBuffer)) return 'null'
  return Array.from(new Uint8Array(bytes)).join(',')
})
const convexJson = computed(() => {
  if (!data.value) return null
  try {
    return convexToJson(data.value)
  } catch {
    return null
  }
})
</script>

<template>
  <div data-testid="convex-payload-page" class="test-page">
    <h1>Convex Payload Round-Trip</h1>
    <p>Tests Nuxt SSR payload hydration for Convex special values (int64 + bytes).</p>

    <div class="row">
      <span>status:</span> <span data-testid="status">{{ status }}</span>
    </div>
    <div class="row">
      <span>pending:</span> <span data-testid="pending">{{ pending }}</span>
    </div>
    <div class="row">
      <span>error:</span> <span data-testid="error">{{ error?.message ?? 'null' }}</span>
    </div>
    <div class="row">
      <span>bigint type:</span> <span data-testid="bigint-type">{{ bigintType }}</span>
    </div>
    <div class="row">
      <span>bigint value:</span> <span data-testid="bigint-value">{{ bigintValue }}</span>
    </div>
    <div class="row">
      <span>bytes type:</span> <span data-testid="bytes-type">{{ bytesType }}</span>
    </div>
    <div class="row">
      <span>bytes length:</span> <span data-testid="bytes-length">{{ bytesLength }}</span>
    </div>
    <div class="row">
      <span>bytes values:</span> <span data-testid="bytes-values">{{ bytesValues }}</span>
    </div>
    <div class="row">
      <span>convex json integer:</span>
      <span data-testid="convex-json-integer">{{ convexJson?.n?.$integer ?? 'null' }}</span>
    </div>
    <div class="row">
      <span>convex json bytes:</span>
      <span data-testid="convex-json-bytes">{{ convexJson?.b?.$bytes ?? 'null' }}</span>
    </div>
  </div>
</template>

<style scoped>
.test-page {
  max-width: 700px;
}

.row {
  display: flex;
  gap: 8px;
  margin: 6px 0;
}

.row span:last-child {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
</style>
