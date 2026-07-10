<script setup lang="ts">
import { ConvexCallError } from '../proof-lib/convex-call-error'
import {
  PUBLIC_CODE,
  PUBLIC_MESSAGE,
  PUBLIC_STATUS,
  SENTINEL_SECRET,
  proofErrorData,
} from '../proof-lib/proof-constants'

// FATAL SSR PATH: throw during SSR setup so the render fails and Nuxt shows the
// error page. This deliberately BYPASSES the payload reducer/reviver. The
// sentinel lives only in `cause`. We assert the sentinel never reaches the
// error-page HTML or its payload.
if (import.meta.server) {
  throw new ConvexCallError({
    kind: 'server',
    message: PUBLIC_MESSAGE,
    code: PUBLIC_CODE,
    status: PUBLIC_STATUS,
    data: proofErrorData,
    cause: {
      secret: SENTINEL_SECRET,
      note: `internal cause carrying ${SENTINEL_SECRET}`,
    },
  })
}
</script>

<template>
  <div>fatal page (never renders)</div>
</template>
