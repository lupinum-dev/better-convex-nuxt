<script setup lang="ts">
import { ConvexCallError } from '../proof-lib/convex-call-error'
import {
  PUBLIC_CODE,
  PUBLIC_MESSAGE,
  PUBLIC_STATUS,
  SENTINEL_SECRET,
  proofErrorData,
} from '../proof-lib/proof-constants'

// SERVER-SIDE HANDLER: build the failure exactly as a query boundary would.
// The sentinel secret lives ONLY inside `cause`. Public fields carry the
// safe product data. The value is stored in Nuxt payload state (useState),
// the vNext-prescribed identity-partitioned channel.
const proofError = useState<ConvexCallError | undefined>('proofError', () => {
  if (import.meta.server) {
    return new ConvexCallError({
      kind: 'server',
      message: PUBLIC_MESSAGE,
      code: PUBLIC_CODE,
      status: PUBLIC_STATUS,
      data: proofErrorData,
      // Runtime-only debugging channel — must be redacted at serialization.
      cause: {
        secret: SENTINEL_SECRET,
        note: `internal cause carrying ${SENTINEL_SECRET}`,
      },
    })
  }
  return undefined
})

// Component-held error value: bind the PUBLIC fields into the DOM so we prove
// (i) the public data survives SSR and (ii) the cause/sentinel does not.
const view = computed(() => {
  const e = proofError.value
  if (!e) return null
  return {
    name: e.name,
    kind: e.kind,
    message: e.message,
    code: e.code,
    status: e.status,
    dataDetail: (e.data as { detail?: string } | undefined)?.detail,
  }
})

// After hydration, publish the REAL revived client value for the proof to read.
onMounted(() => {
  const e = proofError.value
  ;(window as unknown as Record<string, unknown>).__proof = {
    present: e != null,
    isConvexCallError: e instanceof ConvexCallError,
    ctorName: e?.constructor?.name ?? null,
    name: e?.name ?? null,
    kind: e?.kind ?? null,
    message: e?.message ?? null,
    code: e?.code ?? null,
    status: e?.status ?? null,
    data: e?.data ?? null,
    // Cause MUST be undefined after revival (never serialized/reconstructed).
    causeIsUndefined: e ? (e as ConvexCallError).cause === undefined : null,
    // JSON.stringify of the error must not leak the sentinel.
    jsonString: e ? JSON.stringify(e) : null,
    toJSONString: e ? JSON.stringify((e as ConvexCallError).toJSON()) : null,
  }
})
</script>

<template>
  <div class="proof">
    <h1>SSR error contract proof</h1>
    <div v-if="view" class="err">
      <p class="err-name">{{ view.name }}</p>
      <p class="err-kind">{{ view.kind }}</p>
      <p class="err-message">{{ view.message }}</p>
      <p class="err-code">{{ view.code }}</p>
      <p class="err-status">{{ view.status }}</p>
      <p class="err-data-detail">{{ view.dataDetail }}</p>
    </div>
    <div v-else class="no-err">no error</div>
  </div>
</template>
