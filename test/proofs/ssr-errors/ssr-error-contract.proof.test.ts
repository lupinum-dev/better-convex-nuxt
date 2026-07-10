import { appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { $fetch, createPage, setup, url } from '@nuxt/test-utils/e2e'
import { afterAll, describe, expect, it } from 'vitest'

import {
  PUBLIC_CODE,
  PUBLIC_DATA_MARKER,
  PUBLIC_MESSAGE,
  PUBLIC_STATUS,
  SENTINEL_SECRET,
} from './app/proof-lib/proof-constants'

const EVIDENCE_FILE = fileURLToPath(new URL('./evidence.jsonl', import.meta.url))
function evidence(tag: string, data: unknown) {
  appendFileSync(EVIDENCE_FILE, `${tag} ${JSON.stringify(data)}\n`)
}

// Count occurrences of a needle in a haystack (byte-scan primitive).
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

describe('SSR error contract (vNext §5.8 proof 3 mechanism)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./app', import.meta.url)),
    port: 4610,
    browser: true,
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

  it('(a)+(c) hydrated value is instanceof ConvexCallError with equal public fields; (b) sentinel absent from every byte the browser receives', async () => {
    // --- SSR byte-scan: raw HTML the server emits ---
    const ssrHtml = String(await $fetch('/proof', { responseType: 'text' }))
    const htmlSentinel = countOccurrences(ssrHtml, SENTINEL_SECRET)
    const htmlPublicData = countOccurrences(ssrHtml, PUBLIC_DATA_MARKER)

    // --- Payload channel byte-scan (_payload.json is fetched by the client) ---
    let payloadBody = ''
    try {
      payloadBody = String(await $fetch('/proof/_payload.json', { responseType: 'text' }))
    } catch {
      payloadBody = ''
    }
    const payloadSentinel = countOccurrences(payloadBody, SENTINEL_SECRET)
    const payloadPublicData = countOccurrences(payloadBody, PUBLIC_DATA_MARKER)

    // --- Real browser hydration + scan EVERY response body the browser loads ---
    const bodies: string[] = []
    const page = await createPage()
    pages.push(page)
    page.on('response', async (res) => {
      try {
        bodies.push(await res.text())
      } catch {
        // some responses (redirects, etc.) have no readable body
      }
    })
    await page.goto(url('/proof'), { waitUntil: 'networkidle' })
    // Wait for our onMounted hook to publish the revived client value.
    await page.waitForFunction(() => (window as unknown as { __proof?: unknown }).__proof != null, {
      timeout: 30000,
    })

    const proof = await page.evaluate(
      () => (window as unknown as { __proof: Record<string, unknown> }).__proof,
    )

    const allBrowserBytes = bodies.join('\n---\n')
    const browserSentinel = countOccurrences(allBrowserBytes, SENTINEL_SECRET)
    const browserPublicData = countOccurrences(allBrowserBytes, PUBLIC_DATA_MARKER)

    // Evidence dump (counts, not prose).
    evidence('[proof-3][a/c] revived', proof)
    evidence('[proof-3][b] byte-scan', {
      ssrHtmlBytes: ssrHtml.length,
      payloadBytes: payloadBody.length,
      browserBodies: bodies.length,
      browserTotalBytes: allBrowserBytes.length,
      htmlSentinel,
      payloadSentinel,
      browserSentinel,
      htmlPublicData,
      payloadPublicData,
      browserPublicData,
      jsonStringSentinel: proof.jsonString
        ? countOccurrences(String(proof.jsonString), SENTINEL_SECRET)
        : 0,
      toJSONSentinel: proof.toJSONString
        ? countOccurrences(String(proof.toJSONString), SENTINEL_SECRET)
        : 0,
    })

    // (a) revived instance identity + equal public fields
    expect(proof.present).toBe(true)
    // instanceof is the authoritative class-identity signal. NOTE: the prod
    // build minifies the class name, so constructor.name is a mangled token
    // (e.g. "Wh") — logged as evidence but not asserted. `name` is an explicit
    // instance property set in the constructor and is NOT minified.
    expect(proof.isConvexCallError).toBe(true)
    expect(proof.name).toBe('ConvexCallError')
    expect(proof.kind).toBe('server')
    expect(proof.message).toBe(PUBLIC_MESSAGE)
    expect(proof.code).toBe(PUBLIC_CODE)
    expect(proof.status).toBe(PUBLIC_STATUS)
    expect(proof.data).toEqual({ code: PUBLIC_CODE, detail: PUBLIC_DATA_MARKER })
    // cause never survives serialization
    expect(proof.causeIsUndefined).toBe(true)

    // (b) sentinel appears NOWHERE; public data DOES appear (positive control)
    expect(htmlSentinel).toBe(0)
    expect(payloadSentinel).toBe(0)
    expect(browserSentinel).toBe(0)
    expect(countOccurrences(String(proof.jsonString), SENTINEL_SECRET)).toBe(0)
    expect(countOccurrences(String(proof.toJSONString), SENTINEL_SECRET)).toBe(0)
    // positive control: the safe public data must be present somewhere the
    // browser received (proves the reducer ran and preserved public fields).
    expect(htmlPublicData + payloadPublicData + browserPublicData).toBeGreaterThan(0)
  })

  it('(d) fatal SSR path (bypasses payload reducer) still leaks no sentinel', async () => {
    // Throwing during SSR -> Nuxt error page. Fetch raw bytes (ignore 500).
    const res = await fetch(url('/fatal'))
    const status = res.status
    const fatalHtml = await res.text()

    // The error page also loads its own payload on the client; scan via browser.
    const bodies: string[] = []
    const page = await createPage()
    pages.push(page)
    page.on('response', async (r) => {
      try {
        bodies.push(await r.text())
      } catch {
        // ignore
      }
    })
    await page.goto(url('/fatal'), { waitUntil: 'networkidle' })
    // Capture EXACTLY how Nuxt 4 serialized the fatal error for the client, via
    // its real payload channel (useNuxtApp().payload.error). Documents cause
    // handling for the Phase 2 design.
    const errorState = await page.evaluate(() => {
      const g = globalThis as unknown as { useNuxtApp?: () => { payload?: { error?: unknown } } }
      let nuxtError: unknown = null
      try {
        nuxtError = g.useNuxtApp?.()?.payload?.error ?? null
      } catch {
        nuxtError = null
      }
      return {
        nuxtErrorKeys: nuxtError && typeof nuxtError === 'object' ? Object.keys(nuxtError) : null,
        nuxtErrorHasCause:
          nuxtError && typeof nuxtError === 'object' ? 'cause' in (nuxtError as object) : null,
        nuxtErrorHasStack:
          nuxtError && typeof nuxtError === 'object' ? 'stack' in (nuxtError as object) : null,
        nuxtErrorJson: (() => {
          try {
            return JSON.stringify(nuxtError)
          } catch {
            return null
          }
        })(),
      }
    })
    // Also record the raw fatal HTML (bounded) and whether the token 'cause'
    // appears anywhere in it, to fully characterize the fatal channel.
    evidence('[proof-3][d] fatal-html-raw', {
      fatalHtml,
      causeTokenInHtml: countOccurrences(fatalHtml, 'cause'),
    })

    const browserBytes = bodies.join('\n---\n')
    const fatalHtmlSentinel = countOccurrences(fatalHtml, SENTINEL_SECRET)
    const browserSentinel = countOccurrences(browserBytes, SENTINEL_SECRET)
    const errorStateSentinel = errorState.nuxtErrorJson
      ? countOccurrences(errorState.nuxtErrorJson, SENTINEL_SECRET)
      : 0

    evidence('[proof-3][d] fatal', {
      status,
      fatalHtmlBytes: fatalHtml.length,
      browserBodies: bodies.length,
      fatalHtmlSentinel,
      browserSentinel,
      errorStateSentinel,
      nuxtErrorKeys: errorState.nuxtErrorKeys,
      nuxtErrorHasCause: errorState.nuxtErrorHasCause,
      nuxtErrorHasStack: errorState.nuxtErrorHasStack,
      nuxtErrorJson: errorState.nuxtErrorJson,
    })

    expect(status).toBeGreaterThanOrEqual(500)
    expect(fatalHtmlSentinel).toBe(0)
    expect(browserSentinel).toBe(0)
    expect(errorStateSentinel).toBe(0)
  })

  it('(H3 hazard) useAsyncData rejection wraps into H3Error and loses ConvexCallError identity', async () => {
    const page = await createPage()
    pages.push(page)
    await page.goto(url('/h3'), { waitUntil: 'networkidle' })
    await page.waitForFunction(() => (window as unknown as { __h3?: unknown }).__h3 != null, {
      timeout: 30000,
    })
    const h3 = await page.evaluate(
      () => (window as unknown as { __h3: Record<string, unknown> }).__h3,
    )

    evidence('[proof-3][H3] asyncData-error', h3)

    expect(h3.present).toBe(true)
    // The whole point: identity is LOST.
    expect(h3.isConvexCallError).toBe(false)
    expect(h3.ctorName).not.toBe('ConvexCallError')
    // It is an H3Error-shaped object instead.
    expect(h3.hasStatusCode).toBe(true)
  })
})
