// Minimal REAL SSR Nuxt 4.4.7 fixture for the vNext §5.8 proof 3 mechanism.
// No better-convex-nuxt module: this prototypes the ConvexCallError payload
// reducer/reviver + fatal-SSR redaction contract in isolation.
export default defineNuxtConfig({
  ssr: true,
  // Keep the build lean and deterministic.
  telemetry: false,
  devtools: { enabled: false },
  // Force payload extraction ON so the proof also scans the separate
  // _payload.json channel, not just the inlined HTML script.
  experimental: {
    payloadExtraction: true,
  },
})
