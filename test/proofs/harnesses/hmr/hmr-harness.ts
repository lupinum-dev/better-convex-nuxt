/**
 * HMR harness (internal §17.3 / §20 Phase 0 "senior-owned spike").
 *
 * Boots a REAL Vite dev server (the same engine `nuxi dev` runs on) with a
 * headless browser attached, so an on-disk file edit triggers a genuine
 * client-side HMR update — not a simulation. A test can count resources
 * (listeners, clients, intervals) before and after an HMR cycle to prove a
 * plugin/composable does or does not leak across a hot reload.
 *
 * Why not `nuxi dev` directly? Confirmed broken in this sandbox (see
 * `proofs-harness.md` §"Design / quirks"): Nuxt 4.4.7's dev SSR pipeline
 * (Nitro 2.13.4 + vite-node) talks to its dev bundler over a Unix domain
 * socket and every HTTP request hangs / fails with `connect EINVAL`.
 * Independently re-confirmed here: a bare `nuxi dev` on a fresh port
 * accepts the TCP connection but never answers a single request (curl times
 * out; see the harness build session for the exact repro). A **plain Vite
 * dev server** in middleware mode (no Nitro, no vite-node SSR bridge) does
 * NOT have this problem — it serves requests and drives real client HMR
 * normally (verified: naive listener leaks 1 -> 2 entries across one HMR
 * cycle, well-behaved listener stays at 1 via `import.meta.hot.dispose`).
 * `nuxi dev`'s CLIENT bundle is itself plain Vite under the hood, so this
 * harness exercises the actual HMR engine Nuxt's dev server uses; only
 * Nitro's server-side request-serving layer (broken here) is bypassed.
 * Document this substitution when citing this harness: it proves Vite HMR
 * mechanics faithfully, but does not exercise Nuxt/Nitro's dev-SSR request
 * path (a separate, currently-blocked concern — see internal §20 SSR
 * request-cleanup proof).
 *
 * Usage:
 * ```ts
 * const harness = await createHmrHarness()
 * const before = await harness.page.evaluate(() => window.__hmrRegistry.length)
 * await harness.editFile('naive-plugin.js', (c) => c + `\n// bump ${Date.now()}`)
 * await harness.waitForHmrCycle()
 * const after = await harness.page.evaluate(() => window.__hmrRegistry.length)
 * await harness.dispose()
 * ```
 */
import { mkdtemp, cp, readFile, writeFile } from 'node:fs/promises'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Browser, Page } from 'playwright'

const FIXTURE_DIR = join(__dirname, 'fixture')

export interface HmrHarness {
  /** URL of the running Vite dev server. */
  url: string
  /** A live headless page already navigated to `url`, HMR client attached. */
  page: Page
  /** Overwrites a fixture-relative file on disk (in the harness's private tmp copy, never the tracked fixture) and returns once written. */
  editFile: (relativeFile: string, transform: (content: string) => string) => Promise<void>
  /**
   * Waits for the browser-side Vite HMR client to finish processing at
   * least one update after an `editFile` call. Polls `import.meta.hot`'s
   * effect (the fixture increments `window.__hmrEventCount` from a
   * `vite:afterUpdate` listener registered in `main.js`) rather than a
   * fixed sleep, with a bounded timeout.
   */
  waitForHmrCycle: (opts?: { timeoutMs?: number }) => Promise<void>
  /** Closes the browser, HTTP server, Vite dev server, and removes the tmp copy's watcher. */
  dispose: () => Promise<void>
}

export async function createHmrHarness(): Promise<HmrHarness> {
  const { createServer: createViteServer } = await import('vite')
  const { chromium } = await import('playwright')

  const workDir = await mkdtemp(join(tmpdir(), 'bcn-hmr-harness-'))
  await cp(FIXTURE_DIR, workDir, { recursive: true })

  const viteServer = await createViteServer({
    root: workDir,
    server: { middlewareMode: true, watch: {} },
    appType: 'spa',
    logLevel: 'silent',
  })

  const httpServer = http.createServer(viteServer.middlewares)
  const port = await new Promise<number>((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => {
      resolve((httpServer.address() as AddressInfo).port)
    })
  })
  const url = `http://127.0.0.1:${port}/`

  const browser: Browser = await chromium.launch()
  const page = await browser.newPage()
  await page.goto(url)
  await page.waitForFunction(() =>
    Array.isArray((window as unknown as { __hmrRegistry?: unknown[] }).__hmrRegistry),
  )

  return {
    url,
    page,
    editFile: async (relativeFile, transform) => {
      const filePath = join(workDir, relativeFile)
      const content = await readFile(filePath, 'utf-8')
      await writeFile(filePath, transform(content))
    },
    waitForHmrCycle: async (opts) => {
      const timeoutMs = opts?.timeoutMs ?? 5000
      // No fixed sleep: `fixture/main.js` registers a real
      // `import.meta.hot.on('vite:afterUpdate', ...)` listener once at page
      // load (it fires exactly once per completed HMR batch, after all
      // updated modules finish re-executing) and increments
      // `window.__hmrUpdateCount`. Poll on that counter advancing past its
      // current value rather than a fixed sleep or a re-registered listener
      // (which the injected `page.evaluate` callback couldn't do anyway —
      // it isn't a Vite-processed module, so it has no `import.meta.hot`).
      const baseline = await page.evaluate(
        () => (window as unknown as { __hmrUpdateCount: number }).__hmrUpdateCount,
      )
      await page.waitForFunction(
        (base) => (window as unknown as { __hmrUpdateCount: number }).__hmrUpdateCount > base,
        baseline,
        { timeout: timeoutMs },
      )
    },
    dispose: async () => {
      await page.close().catch(() => {})
      await browser.close().catch(() => {})
      await new Promise<void>((resolve) => httpServer.close(() => resolve()))
      await viteServer.close()
    },
  }
}
