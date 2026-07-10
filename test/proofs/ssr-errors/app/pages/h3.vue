<script setup lang="ts">
import { ConvexCallError } from '../proof-lib/convex-call-error'
import {
  PUBLIC_CODE,
  PUBLIC_MESSAGE,
  PUBLIC_STATUS,
  proofErrorData,
} from '../proof-lib/proof-constants'

// H3ERROR WRAPPING HAZARD (vNext §7 rationale): a useAsyncData handler that
// REJECTS has its rejection wrapped by Nuxt's createError() into an H3Error
// before any payload reducer can see the original class. Exposing this via
// asyncData.error therefore loses ConvexCallError identity — which is exactly
// why vNext forbids surfacing errors through asyncData.error.
const { error } = await useAsyncData('h3-hazard', () => {
  return Promise.reject(
    new ConvexCallError({
      kind: 'server',
      message: PUBLIC_MESSAGE,
      code: PUBLIC_CODE,
      status: PUBLIC_STATUS,
      data: proofErrorData,
    }),
  )
})

onMounted(() => {
  const e = error.value as unknown as Record<string, unknown> | null
  ;(window as unknown as Record<string, unknown>).__h3 = {
    present: e != null,
    isConvexCallError: e instanceof ConvexCallError,
    ctorName: e?.constructor?.name ?? null,
    // H3Error carries these; a ConvexCallError does not.
    hasStatusCode: e ? 'statusCode' in e : null,
    hasFatal: e ? 'fatal' in e : null,
    kind: (e as { kind?: unknown } | null)?.kind ?? null,
  }
})
</script>

<template>
  <div class="h3">
    <p class="h3-ctor">{{ error?.constructor?.name }}</p>
    <p class="h3-msg">{{ error?.message }}</p>
  </div>
</template>
