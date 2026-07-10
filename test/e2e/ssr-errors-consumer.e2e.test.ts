import { createServer, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'

import { $fetch, createPage, setup, url } from '@nuxt/test-utils/e2e'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * REAL SSR hydration test for the vNext §7 public error contract (golden
 * fixtures, last paragraph): "A real SSR query failure—not a synthetic
 * reducer call—must revive through the composable-owned error state as
 * `instanceof ConvexCallError` with equal `kind`, `message`, `code`, `status`,
 * and `data`, while a secret present only in `cause` is absent from rendered
 * HTML, payload JSON, logs, and `JSON.stringify(error)`."
 *
 * Modeled on the Phase 0 prototype at `test/proofs/ssr-errors/` (its
 * app-fixture approach and byte-scan technique), but this test drives the
 * REAL library path end to end:
 *   - the real `src/module.ts` (via `test/fixtures/ssr-errors-consumer`),
 *   - the real `useConvexQuery` composable (identity-partitioned, composable
 *     -owned error state, never `asyncData.error`),
 *   - the real universal payload plugin (`src/runtime/plugins/convex-call-
 *     error-payload.ts`, auto-registered by the module with `order: -50`),
 *   - the real `executeQueryHttp` HTTP boundary and `normalizeConvexError`.
 *
 * The "Convex backend" is a deterministic local HTTP mock (no live
 * credentials): it always answers `POST /api/query` with an unexpected 500
 * upstream response whose body carries a sentinel secret. That drives the
 * "unexpected upstream HTTP response" golden fixture (`kind: 'transport'`)
 * through the real boundary, which builds the `ConvexCallError` itself with a
 * FIXED public message/status and stores the raw rejection only as `cause`.
 */

const MOCK_PORT = 4988
const NUXT_PORT = 4611
const SENTINEL_SECRET = 'ssr-errors-consumer-sentinel-8f21c6ad'
const PUBLIC_TRANSPORT_MESSAGE =
  'The request to Convex failed before a usable response was received.'

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0
  let count = 0
  let idx = haystack.indexOf(needle)
  while (idx !== -1) {
    count += 1
    idx = haystack.indexOf(needle, idx + needle.length)
  }
  return count
}

describe('real SSR ConvexCallError revival + redaction (vNext §7 golden fixtures)', async () => {
  let mockServer: Server

  beforeAll(async () => {
    // Deterministic stand-in for Convex: always an unexpected 500 upstream
    // response. The sentinel lives only in the raw response body, which the
    // real `executeQueryHttp` boundary only ever attaches as `cause` — never
    // as a public field.
    mockServer = createServer((req, res) => {
      // The always-on client-core plugin (`src/runtime/plugin.client.ts`)
      // eagerly opens a WebSocket to `convex.url` for the app's primary
      // client, independent of this page's `subscribe: false` query option.
      // That connection attempt (a plain GET Upgrade request our HTTP mock
      // does not implement) is irrelevant background noise for THIS proof —
      // only the real query boundary's `POST /api/query` matters — so it must
      // never see the sentinel, or the browser's network monitor would flag a
      // spurious "leak" that has nothing to do with the boundary under test.
      if (req.method !== 'POST' || req.url !== '/api/query') {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ignored: true }))
        return
      }
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
      })
      req.on('end', () => {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            internalDebug: `unexpected failure, request body was: ${body}`,
            secret: SENTINEL_SECRET,
          }),
        )
      })
    })
    await new Promise<void>((resolve) => mockServer.listen(MOCK_PORT, '127.0.0.1', resolve))
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      mockServer.close((err) => (err ? reject(err) : resolve())),
    )
  })

  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/ssr-errors-consumer', import.meta.url)),
    port: NUXT_PORT,
    browser: true,
    env: {
      SSR_ERRORS_MOCK_CONVEX_URL: `http://127.0.0.1:${MOCK_PORT}`,
    },
  })

  const pages: Awaited<ReturnType<typeof createPage>>[] = []
  afterAll(async () => {
    for (const p of pages) {
      try {
        await p.close()
      } catch {
        // ignore
      }
    }
  })

  it('revives as instanceof ConvexCallError with equal public fields; sentinel absent everywhere', async () => {
    // --- Raw SSR HTML the server emits ---
    const ssrHtml = String(await $fetch('/', { responseType: 'text' }))

    // --- Separate payload channel (_payload.json, forced on via payloadExtraction) ---
    let payloadBody = ''
    try {
      payloadBody = String(await $fetch('/_payload.json', { responseType: 'text' }))
    } catch {
      payloadBody = ''
    }

    // --- Real browser hydration; scan EVERY response body the browser loads ---
    const responses: Array<{ url: string; text: string }> = []
    const page = await createPage()
    pages.push(page)
    page.on('response', async (res) => {
      try {
        const text = await res.text()
        responses.push({ url: res.url(), text })
      } catch {
        // some responses (redirects, etc.) have no readable body
      }
    })
    await page.goto(url('/'), { waitUntil: 'networkidle' })
    await page.waitForFunction(
      () => (window as unknown as { __ssrErrorsConsumer?: unknown }).__ssrErrorsConsumer != null,
      { timeout: 30000 },
    )

    const revived = await page.evaluate(
      () =>
        (window as unknown as { __ssrErrorsConsumer: Record<string, unknown> }).__ssrErrorsConsumer,
    )

    const allBrowserBytes = responses.map((r) => r.text).join('\n---\n')

    const htmlSentinel = countOccurrences(ssrHtml, SENTINEL_SECRET)
    const payloadSentinel = countOccurrences(payloadBody, SENTINEL_SECRET)
    const browserSentinel = countOccurrences(allBrowserBytes, SENTINEL_SECRET)
    const htmlPublicMessage = countOccurrences(ssrHtml, PUBLIC_TRANSPORT_MESSAGE)
    const payloadPublicMessage = countOccurrences(payloadBody, PUBLIC_TRANSPORT_MESSAGE)
    const browserPublicMessage = countOccurrences(allBrowserBytes, PUBLIC_TRANSPORT_MESSAGE)

    // (identity + equal public fields) revived through the composable-owned
    // error state as a real ConvexCallError instance.
    expect(revived.present).toBe(true)
    expect(revived.isConvexCallError).toBe(true)
    expect(revived.name).toBe('ConvexCallError')
    expect(revived.kind).toBe('transport')
    expect(revived.message).toBe(PUBLIC_TRANSPORT_MESSAGE)
    expect(revived.status).toBe(500)
    expect(revived.code).toBeNull()
    expect(revived.data).toBeNull()
    // cause never survives the payload round-trip
    expect(revived.causeIsUndefined).toBe(true)
    // JSON.stringify(error) on the REVIVED client instance is clean too.
    expect(String(revived.jsonString)).not.toContain(SENTINEL_SECRET)
    expect(String(revived.toJSONString)).not.toContain(SENTINEL_SECRET)

    // (redaction) the sentinel appears in NONE of the bytes the browser or
    // server ever emitted; the public message (positive control) DOES appear
    // somewhere, proving the reducer/reviver actually carried real content.
    expect(htmlSentinel).toBe(0)
    expect(payloadSentinel).toBe(0)
    expect(browserSentinel).toBe(0)
    expect(htmlPublicMessage + payloadPublicMessage + browserPublicMessage).toBeGreaterThan(0)
  })
})
