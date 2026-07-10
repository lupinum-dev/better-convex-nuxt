import ConvexModule from '../../../src/module'

// Real Nuxt fixture app driving the REAL library path (vNext §7 SSR golden
// fixture, W8 test authoring). `convex.url` points at a deterministic local
// HTTP mock (see ../../e2e/ssr-errors-consumer.e2e.test.ts) that always
// answers the query endpoint with an unexpected upstream HTTP response, so
// the REAL `executeQueryHttp` boundary constructs a `transport`
// `ConvexCallError` with a sentinel secret confined to `cause`.
export default defineNuxtConfig({
  modules: [ConvexModule],
  ssr: true,
  telemetry: false,
  devtools: { enabled: false },
  experimental: {
    payloadExtraction: true,
  },
  convex: {
    // Convex-only build: no Better Auth machinery, so an `optional`-mode
    // query never waits on auth settlement and the mocked HTTP boundary
    // failure surfaces as `transport`, not `authentication`.
    auth: false,
    url: process.env.SSR_ERRORS_MOCK_CONVEX_URL || 'http://127.0.0.1:4988',
  },
})
